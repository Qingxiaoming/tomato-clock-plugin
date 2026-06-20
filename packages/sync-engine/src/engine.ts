import type {
    ConflictResolution,
    LocalStore,
    OpRecord,
    RunningSession,
    SyncAdapter,
    SyncConflictEvent,
    SyncEngineOptions,
    SyncEngineState,
    SyncOpType,
    TimerSyncStatus,
} from './types';

/**
 * 生成 UUID v4（与旧代码行为一致，避免引入外部依赖）
 */
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

// 解析后的单行 op 记录：包含解析出的结构化对象和原始字符串
interface ParsedLine {
    record: OpRecord;
    raw: string;
}

// 状态变化监听器类型
type StateListener = (state: SyncEngineState) => void;
// 冲突事件监听器类型
type ConflictListener = (event: SyncConflictEvent) => void;

/**
 * 计时同步引擎
 *
 * 基于事件溯源：每台设备拥有独立 Op-Log，所有设备执行相同的 merge+replay
 * 逻辑，最终状态一致。冲突检测后不自动结束计时，等待调用方解决。
 */
export class SyncEngine {
    // 本设备唯一标识，用于区分不同设备的 ops 文件和 running session
    private deviceId: string;
    // 本地持久化存储，用于保存当前序列号 seq
    private localStore: LocalStore;
    // 远程同步适配器，负责 ops 文件的读写、状态缓存和目录保证
    private adapter: SyncAdapter;
    // 自定义警告日志输出
    private warn: (msg: string, meta?: Record<string, unknown>) => void;
    // 自定义错误日志输出
    private error: (msg: string, meta?: Record<string, unknown>) => void;

    // 状态变化监听器列表
    private stateListeners: StateListener[] = [];
    // 冲突事件监听器列表
    private conflictListeners: ConflictListener[] = [];

    // 当前计算出的同步状态
    private currentState: SyncEngineState = { status: 'idle', runningSessions: [], mode: undefined, project: undefined, task: undefined };
    // 上一次写入的状态缓存 JSON，用于避免重复写入相同内容
    private lastCacheJson = '';
    // 是否已处于冲突状态，用于控制 conflict 事件只触发一次
    private inConflict = false;
    // 同步互斥锁，串行化 sync 和写操作，防止并发导致状态不一致
    private syncLock = Promise.resolve<void>(undefined);

    constructor(options: SyncEngineOptions) {
        this.deviceId = options.deviceId;
        this.localStore = options.localStore;
        this.adapter = options.adapter;
        // 未提供日志函数时回退到 console
        this.warn = options.warn || ((msg, meta) => console.warn(`[SyncEngine] ${msg}`, meta ?? {}));
        this.error = options.error || ((msg, meta) => console.error(`[SyncEngine] ${msg}`, meta ?? {}));
    }

    // ========== 事件订阅 ==========

    /**
     * 注册状态变化监听器，返回注销函数。
     */
    onStateChanged(listener: StateListener): () => void {
        this.stateListeners.push(listener);
        return () => {
            const idx = this.stateListeners.indexOf(listener);
            if (idx >= 0) this.stateListeners.splice(idx, 1);
        };
    }

    /**
     * 注册冲突事件监听器，返回注销函数。
     */
    onConflict(listener: ConflictListener): () => void {
        this.conflictListeners.push(listener);
        return () => {
            const idx = this.conflictListeners.indexOf(listener);
            if (idx >= 0) this.conflictListeners.splice(idx, 1);
        };
    }

    /**
     * 内部方法：安全地通知所有状态监听器，单个监听器异常不影响其他监听器。
     */
    private emitStateChanged(state: SyncEngineState): void {
        for (const listener of this.stateListeners) {
            try {
                listener(state);
            } catch (e) {
                this.error('stateChanged listener error', { error: String(e) });
            }
        }
    }

    /**
     * 内部方法：安全地通知所有冲突监听器，单个监听器异常不影响其他监听器。
     */
    private emitConflict(event: SyncConflictEvent): void {
        for (const listener of this.conflictListeners) {
            try {
                listener(event);
            } catch (e) {
                this.error('conflict listener error', { error: String(e) });
            }
        }
    }

    // ========== 状态查询 ==========

    /**
     * 获取当前同步状态的深拷贝快照，避免外部直接修改内部状态。
     */
    getState(): SyncEngineState {
        return {
            status: this.currentState.status,
            runningSessions: this.currentState.runningSessions.slice(),
            mode: this.currentState.mode,
            project: this.currentState.project,
            task: this.currentState.task,
        };
    }

    /**
     * 获取本设备当前正在运行的会话，没有则返回 null。
     */
    getLocalRunningSession(): RunningSession | null {
        return this.currentState.runningSessions.find(s => s.device === this.deviceId) || null;
    }

    // ========== 初始化 ==========

    /**
     * 初始化同步引擎：确保同步目录存在并执行一次完整同步。
     */
    async init(): Promise<void> {
        await this.adapter.ensureSyncDir();
        await this.sync();
    }

    // ========== 写操作 ==========

    /**
     * 开始一个新的计时会话，写入本机 ops 文件并触发 sync。
     * @returns 新会话 ID
     */
    async start(payload?: { tags?: string[] }): Promise<string> {
        const session = generateUUID();
        await this.writeOp('start', session, payload ?? {});
        await this.sync();
        return session;
    }

    /**
     * 结束指定会话。未指定时结束本机当前进行中的会话。
     */
    async end(session?: string, payload?: { note?: string }): Promise<void> {
        const target = session || this.getLocalRunningSession()?.session;
        if (!target) {
            this.warn('end called but no local running session');
            return;
        }
        await this.writeOp('end', target, payload ?? {});
        await this.sync();
    }

    /**
     * 代理结束其他设备的会话（冲突解决用）。
     */
    async proxyEnd(targetDevice: string, targetSession: string): Promise<void> {
        await this.writeOp('proxy_end', generateUUID(), {
            targetDevice,
            targetSession,
        });
        await this.sync();
    }

    /**
     * 写入配置变更操作（mode / project / task）。
     */
    async config(payload: { mode?: string; project?: string; task?: string }): Promise<void> {
        const hasValue = Object.values(payload).some(v => v !== undefined);
        if (!hasValue) return;
        await this.writeOp('config', generateUUID(), payload);
        await this.sync();
    }

    /**
     * 内部方法：构造一条 OpRecord 并追加到本设备的 ops 文件中。
     */
    private async writeOp(op: SyncOpType, session: string, payload: Record<string, unknown>): Promise<void> {
        const seq = await this.advanceSeq();
        const record: OpRecord = {
            op,
            ts: new Date().toISOString(),
            device: this.deviceId,
            session,
            seq,
            payload: Object.keys(payload).length > 0 ? payload : undefined,
        };
        const line = JSON.stringify(record);
        const filename = `ops_${this.deviceId}.jsonl`;
        await this.adapter.appendOpsLine(filename, line);
    }

    /**
     * 内部方法：将本地 seq 加 1 并持久化，保证本设备每条 op 的 seq 唯一递增。
     */
    private async advanceSeq(): Promise<number> {
        const current = await this.localStore.loadSeq();
        const next = current + 1;
        await this.localStore.saveSeq(next);
        return next;
    }

    // ========== 核心：合并与重放 ==========

    /**
     * 读取所有设备 ops 文件，合并、去重、排序、重放状态机。
     * 若检测到冲突则发出 conflict 事件；否则发出 stateChanged。
     */
    async sync(): Promise<void> {
        // 用 Promise 链实现简单互斥，避免并发 sync/写操作导致状态不一致
        const next = this.syncLock.then(() => this.doSync());
        this.syncLock = next.catch(() => undefined);
        await next;
    }

    /**
     * 内部方法：执行一次完整的同步流程。
     */
    private async doSync(): Promise<void> {
        // 1. 加载所有设备的 ops 记录
        const ops = await this.loadAllOps();
        // 2. 合并去重并排序，得到确定性的操作序列
        const sorted = this.mergeAndSort(ops);
        // 3. 重放状态机，得到新的同步状态
        const newState = this.replay(sorted);

        const previous = this.currentState;
        this.currentState = newState;

        // 4. 判断状态是否真正发生变化，避免无意义通知
        const stateChanged =
            previous.status !== newState.status ||
            previous.mode !== newState.mode ||
            previous.project !== newState.project ||
            previous.task !== newState.task ||
            previous.runningSessions.length !== newState.runningSessions.length ||
            previous.runningSessions.some(
                (s, i) =>
                    s.device !== newState.runningSessions[i]?.device ||
                    s.session !== newState.runningSessions[i]?.session,
            );

        if (stateChanged) {
            this.emitStateChanged(newState);
        }

        // 5. 将派生状态写入缓存，供外部快速读取
        await this.writeStateCache(newState, sorted);

        // 6. 冲突状态检测：只在首次进入冲突时触发 conflict 事件
        if (newState.status === 'conflict' && !this.inConflict) {
            this.inConflict = true;
            this.emitConflict({
                runningSessions: newState.runningSessions,
                resolve: resolution => this.resolveConflict(resolution),
            });
        } else if (newState.status !== 'conflict') {
            this.inConflict = false;
        }
    }

    /**
     * 内部方法：列出所有 ops 文件并逐行解析，跳过空行和非法记录。
     */
    private async loadAllOps(): Promise<ParsedLine[]> {
        const filenames = await this.adapter.listOpsFiles();
        const result: ParsedLine[] = [];
        for (const name of filenames) {
            const content = await this.adapter.readOpsFile(name);
            const lines = content.split('\n');
            for (const raw of lines) {
                const trimmed = raw.trim();
                if (!trimmed) continue;
                try {
                    const record = JSON.parse(trimmed) as OpRecord;
                    if (this.isValidRecord(record)) {
                        result.push({ record, raw: trimmed });
                    } else {
                        this.warn('invalid op record skipped', { file: name, line: trimmed });
                    }
                } catch {
                    this.warn('failed to parse op line', { file: name, line: trimmed });
                }
            }
        }
        return result;
    }

    /**
     * 内部方法：校验单条 op 记录是否包含必需字段且字段类型正确。
     */
    private isValidRecord(record: unknown): record is OpRecord {
        if (!record || typeof record !== 'object') return false;
        const r = record as Partial<OpRecord>;
        if (!['start', 'end', 'proxy_end', 'config'].includes(r.op ?? '')) return false;
        if (typeof r.ts !== 'string' || !r.ts) return false;
        if (typeof r.device !== 'string' || !r.device) return false;
        if (typeof r.session !== 'string' || !r.session) return false;
        if (typeof r.seq !== 'number' || r.seq < 1) return false;
        return true;
    }

    /**
     * 内部方法：对所有 ops 进行去重、排序，并检测 seq 断层。
     */
    private mergeAndSort(ops: ParsedLine[]): OpRecord[] {
        // 去重：相同 (device, seq) 保留 ts 较早的
        const byKey = new Map<string, { record: OpRecord; raw: string }>();
        for (const { record, raw } of ops) {
            const key = `${record.device}:${record.seq}`;
            const existing = byKey.get(key);
            if (!existing) {
                byKey.set(key, { record, raw });
            } else if (record.ts < existing.record.ts) {
                this.error('duplicate (device, seq) with different content', {
                    key,
                    kept: existing.raw,
                    dropped: raw,
                });
                byKey.set(key, { record, raw });
            } else {
                this.error('duplicate (device, seq) with different content', {
                    key,
                    kept: existing.raw,
                    dropped: raw,
                });
            }
        }

        const records = Array.from(byKey.values()).map(v => v.record);

        // 排序：ts → device 字典序 → seq，确保确定性
        records.sort((a, b) => {
            if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
            if (a.device !== b.device) return a.device < b.device ? -1 : 1;
            return a.seq - b.seq;
        });

        // seq gap 警告：按设备检查序列号是否连续，发现断层则记录警告
        const byDevice = new Map<string, number[]>();
        for (const r of records) {
            const arr = byDevice.get(r.device) || [];
            arr.push(r.seq);
            byDevice.set(r.device, arr);
        }
        for (const [device, seqs] of byDevice) {
            seqs.sort((x, y) => x - y);
            for (let i = 1; i < seqs.length; i++) {
                if (seqs[i] - seqs[i - 1] > 1) {
                    this.warn('seq gap detected', { device, from: seqs[i - 1], to: seqs[i] });
                }
            }
        }

        return records;
    }

    /**
     * 内部方法：按顺序重放 ops，计算当前 running session、配置和同步状态。
     */
    private replay(ops: OpRecord[]): SyncEngineState {
        // 当前仍在运行的会话集合，键为 device:session
        const running = new Map<string, RunningSession>();
        // 当前配置快照
        let mode: string | undefined;
        let project: string | undefined;
        let task: string | undefined;

        for (const op of ops) {
            // 辅助函数：生成 running map 的键
            const key = (d: string, s: string) => `${d}:${s}`;

            switch (op.op) {
                case 'start': {
                    // 同一设备已有 running session，用新 start 的 ts 结束旧的（异常兜底）
                    for (const [k, s] of running) {
                        if (s.device === op.device) {
                            running.delete(k);
                        }
                    }
                    const tags = Array.isArray(op.payload?.tags) ? (op.payload.tags as string[]) : undefined;
                    running.set(key(op.device, op.session), {
                        device: op.device,
                        session: op.session,
                        startTs: op.ts,
                        tags,
                    });
                    break;
                }
                case 'end': {
                    const k = key(op.device, op.session);
                    if (!running.has(k)) {
                        this.warn('end op references unknown session', { op });
                    } else {
                        running.delete(k);
                    }
                    break;
                }
                case 'proxy_end': {
                    const payload = op.payload as { targetDevice?: unknown; targetSession?: unknown } | undefined;
                    const td = payload?.targetDevice;
                    const ts = payload?.targetSession;
                    if (typeof td !== 'string' || typeof ts !== 'string') {
                        this.warn('proxy_end missing target', { op });
                        break;
                    }
                    const k = key(td, ts);
                    if (!running.has(k)) {
                        this.warn('proxy_end references unknown session', { op });
                    } else {
                        running.delete(k);
                    }
                    break;
                }
                case 'config': {
                    const payload = op.payload as { mode?: unknown; project?: unknown; task?: unknown } | undefined;
                    if (typeof payload?.mode === 'string') mode = payload.mode;
                    if (typeof payload?.project === 'string') project = payload.project;
                    if (typeof payload?.task === 'string') task = payload.task;
                    break;
                }
            }
        }

        // 将 running session 排序，保证状态输出的确定性
        const runningSessions = Array.from(running.values()).sort((a, b) => {
            if (a.startTs !== b.startTs) return a.startTs < b.startTs ? -1 : 1;
            if (a.device !== b.device) return a.device < b.device ? -1 : 1;
            return a.session < b.session ? -1 : 1;
        });

        // 根据 running session 数量确定同步状态
        let status: TimerSyncStatus;
        if (runningSessions.length === 0) status = 'idle';
        else if (runningSessions.length === 1) status = 'running';
        else status = 'conflict';

        return { status, runningSessions, mode, project, task };
    }

    // ========== 冲突解决 ==========

    /**
     * 内部方法：根据调用方决策，将不需要保留的会话通过 proxy_end 结束。
     */
    private async resolveConflict(resolution: ConflictResolution): Promise<void> {
        if (this.currentState.status !== 'conflict') return;

        const sessions = this.currentState.runningSessions;
        let toKeep: RunningSession[];

        if (resolution === 'keep_all') {
            toKeep = sessions;
        } else if (resolution === 'keep_local') {
            toKeep = sessions.filter(s => s.device === this.deviceId);
        } else if (resolution === 'keep_none') {
            toKeep = [];
        } else {
            toKeep = resolution.keep;
        }

        const keepSet = new Set(toKeep.map(s => `${s.device}:${s.session}`));
        for (const s of sessions) {
            if (!keepSet.has(`${s.device}:${s.session}`)) {
                await this.proxyEnd(s.device, s.session);
            }
        }
    }

    // ========== 重置与清理 ==========

    /**
     * 重置所有同步数据：删除 ops 文件、状态缓存，重置序列号，并通知状态变为 idle。
     */
    async reset(): Promise<void> {
        const next = this.syncLock.then(() => this.doReset());
        this.syncLock = next.catch(() => undefined);
        await next;
    }

    /**
     * 内部方法：执行重置。
     */
    private async doReset(): Promise<void> {
        const files = await this.adapter.listOpsFiles();
        for (const file of files) {
            await this.adapter.deleteOpsFile(file);
        }
        await this.adapter.deleteStateCache();
        await this.localStore.saveSeq(0);
        this.currentState = { status: 'idle', runningSessions: [], mode: undefined, project: undefined, task: undefined };
        this.lastCacheJson = '';
        this.inConflict = false;
        this.emitStateChanged(this.currentState);
    }

    /**
     * 清理过期 ops：保留最近 retentionDays 天的记录，同时保留当前进行中的 session
     * 和每个设备最新的 config op，确保当前状态可重建。
     */
    async cleanup(retentionDays: number): Promise<void> {
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
        const next = this.syncLock.then(() => this.doCleanup(cutoff));
        this.syncLock = next.catch(() => undefined);
        await next;
    }

    /**
     * 内部方法：执行清理。
     */
    private async doCleanup(cutoff: string): Promise<void> {
        const parsed = await this.loadAllOps();
        const allRecords = this.mergeAndSort(parsed);
        const state = this.replay(allRecords);

        const runningKeys = new Set(state.runningSessions.map(s => `${s.device}:${s.session}`));

        const latestConfig = new Map<string, OpRecord>();
        for (const op of allRecords) {
            if (op.op === 'config') {
                const existing = latestConfig.get(op.device);
                if (!existing || op.seq > existing.seq) {
                    latestConfig.set(op.device, op);
                }
            }
        }

        const files = await this.adapter.listOpsFiles();
        for (const file of files) {
            const content = await this.adapter.readOpsFile(file);
            const lines = content.split('\n');
            const kept: string[] = [];

            for (const raw of lines) {
                const trimmed = raw.trim();
                if (!trimmed) continue;
                try {
                    const record = JSON.parse(trimmed) as OpRecord;
                    const key = `${record.device}:${record.session}`;
                    const isRunningStart = record.op === 'start' && runningKeys.has(key);
                    const config = latestConfig.get(record.device);
                    const isLatestConfig = record.op === 'config' && config && config.seq === record.seq;
                    if (record.ts >= cutoff || isRunningStart || isLatestConfig) {
                        kept.push(raw);
                    }
                } catch {
                    // 解析失败的行直接丢弃
                }
            }

            if (kept.length === 0) {
                await this.adapter.deleteOpsFile(file);
            } else {
                const newContent = kept.join('\n') + '\n';
                if (newContent !== content) {
                    await this.adapter.writeOpsFile(file, newContent);
                }
            }
        }

        // 清理后缓存已失效，删除以便下次 sync() 重建
        await this.adapter.deleteStateCache();
        this.lastCacheJson = '';
    }

    // ========== 派生状态缓存 ==========

    /**
     * 内部方法：将派生状态写入缓存文件，内容未变化时跳过写入。
     */
    private async writeStateCache(state: SyncEngineState, ops: OpRecord[]): Promise<void> {
        try {
            const cache = {
                status: state.status,
                runningSessions: state.runningSessions,
                hash: this.computeOpsHash(ops),
            };
            const json = JSON.stringify(cache, null, 2);
            if (json === this.lastCacheJson) {
                return;
            }
            await this.adapter.writeStateCache(json);
            this.lastCacheJson = json;
        } catch (e) {
            this.warn('failed to write state cache', { error: String(e) });
        }
    }

    /**
     * 内部方法：计算 ops 序列的简单 hash，用于缓存变更检测。
     */
    private computeOpsHash(ops: OpRecord[]): string {
        // 简单 hash：所有 (device,seq,ts) 拼接后取前 16 位
        const str = ops.map(o => `${o.device}:${o.seq}:${o.ts}`).join('|');
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i);
            hash = (hash << 5) - hash + c;
            hash |= 0;
        }
        return Math.abs(hash).toString(16).padStart(8, '0');
    }
}
