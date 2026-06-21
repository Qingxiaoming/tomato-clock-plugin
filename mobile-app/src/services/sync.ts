import { Paths } from 'expo-file-system';
import { SyncEngine } from '@tomato/sync-engine';
import type { SyncAdapter, ConflictResolution, RunningSession, StartPayload, SyncEngineState } from '@tomato/sync-engine';
import type { TomatoTimer, PhaseType, TimerMode } from './timer';
import { MobileLocalSyncAdapter } from './syncAdapter';
import { AsyncStorageLocalStore } from './localStore';

/** 外部调用使用的操作类型：业务语义上的动作，会映射为引擎底层的 op */
export type SyncOpType =
    | 'start'
    | 'stop'
    | 'skip'
    | 'set_mode'
    | 'set_project'
    | 'set_task'
    | 'set_config'
    | 'phase_complete';

/**
 * 生成 UUID v4（与 sync/engine.ts 保持一致，避免引入外部依赖）
 */
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * 多端同步服务
 *
 * 底层基于事件溯源引擎（SyncEngine）。
 * start/stop/skip/phase_complete 会映射为 start/end 操作；
 * set_mode/set_project/set_task 会同步为对应配置操作。
 */
export class SyncService {
    // 本地计时器实例，用于应用远程同步过来的状态
    private timer: TomatoTimer;
    // 本设备唯一标识
    private deviceId: string;
    // 本地持久化：deviceId 和 seq
    private localStore = new AsyncStorageLocalStore();
    // 同步适配器，负责实际文件读写
    private adapter: SyncAdapter;
    // 同步引擎实例，懒加载于 init()
    private engine?: SyncEngine;
    // 文件轮询定时器：手机端没有文件系统事件，需要定时触发 sync
    private fileWatcherInterval: ReturnType<typeof setInterval> | null = null;

    // 上一次 engine 状态，用于计算差量变化
    private previousState: SyncEngineState = { status: 'idle', runningSessions: [], mode: undefined, project: undefined, task: undefined };

    // 今日累计分钟数（用于本地统计展示）
    todayMinutes = 0;
    // 阶段完成时的回调：通知外部追加日志条目
    onLogAppend?: (entry: { date: string; startTime: string; endTime: string; duration: number; mode: string; taskName: string }) => void;

    constructor(timer: TomatoTimer, deviceId?: string) {
        this.timer = timer;
        this.deviceId = deviceId || '';

        // 默认使用本地文件系统适配器，目录位于应用文档目录下的 timer-sync
        const dir = Paths.document.uri.replace(/\/?$/, '/');
        this.adapter = new MobileLocalSyncAdapter(dir + 'timer-sync');
    }

    /**
     * 运行时切换同步适配器。若引擎已初始化，则重建引擎并重新同步。
     */
    setAdapter(adapter: SyncAdapter): void {
        this.adapter = adapter;
        if (this.engine) {
            // 运行时切换同步目录：重建引擎并重新初始化
            void this.rebuildEngine();
        }
    }

    /**
     * 初始化同步服务：生成/读取 deviceId、创建引擎、首次同步、启动轮询。
     */
    async init(): Promise<void> {
        if (!this.deviceId) {
            const stored = await this.localStore.loadDeviceId();
            this.deviceId = stored || generateUUID();
            if (!stored) {
                await this.localStore.saveDeviceId(this.deviceId);
            }
        }

        this.engine = this.createEngine();
        await this.engine.init();
        this.previousState = this.engine.getState();

        // 轮询触发 sync（手机端没有 vault.modify 事件）
        this.fileWatcherInterval = setInterval(() => {
            void this.engine?.sync();
        }, 30000);
    }

    /**
     * 内部方法：构造并配置 SyncEngine 实例。
     */
    private createEngine(): SyncEngine {
        const engine = new SyncEngine({
            deviceId: this.deviceId,
            localStore: this.localStore,
            adapter: this.adapter,
            warn: (msg, meta) => console.warn(`[SyncService] ${msg}`, meta ?? {}),
            error: (msg, meta) => console.error(`[SyncService] ${msg}`, meta ?? {}),
        });
        engine.onStateChanged(state => this.handleStateChanged(state));
        engine.onConflict(event => this.handleConflict(event));
        return engine;
    }

    /**
     * 内部方法：重建引擎并恢复上一次状态快照。
     */
    private async rebuildEngine(): Promise<void> {
        this.engine = this.createEngine();
        await this.engine.init();
        this.previousState = this.engine.getState();
    }

    /**
     * 销毁同步服务：停止轮询定时器。
     */
    destroy(): void {
        if (this.fileWatcherInterval) {
            clearInterval(this.fileWatcherInterval);
            this.fileWatcherInterval = null;
        }
    }

    // ========== 对外 API：记录操作 ==========

    /**
     * 将业务操作映射为底层同步 op，并异步提交给引擎。
     */
    async logOp(op: SyncOpType, payload: Record<string, unknown>): Promise<void> {
        if (!this.engine) return;
        switch (op) {
            case 'start': {
                const tags: string[] = [];
                const project = (payload.project as string) || '';
                const taskName = (payload.taskName as string) || '';
                if (project) tags.push(`project:${project}`);
                if (taskName) tags.push(`task:${taskName}`);
                const startPayload: StartPayload = {
                    tags: tags.length > 0 ? tags : undefined,
                    mode: payload.mode as string | undefined,
                    countdownSec: typeof payload.countdownSec === 'number' ? payload.countdownSec : undefined,
                    sessionDate: payload.sessionDate as string | undefined,
                    sessionTime: payload.sessionTime as string | undefined,
                };
                return this.engine.start(startPayload).then(() => undefined);
            }
            case 'stop':
            case 'skip': {
                // 结束本机会话；若本机没有运行中的会话但存在单个远程会话，则代理结束远程会话
                let engineState = this.engine.getState();
                let localRunning = engineState.runningSessions.find(s => s.device === this.deviceId);
                if (localRunning) {
                    return this.engine.end(localRunning.session);
                }
                // 没有本地会话且当前状态为空时，先强制同步一次，避免远程 start 还没同步到本地就点击停止
                if (engineState.runningSessions.length === 0) {
                    await this.engine.sync();
                    engineState = this.engine.getState();
                    localRunning = engineState.runningSessions.find(s => s.device === this.deviceId);
                    if (localRunning) {
                        return this.engine.end(localRunning.session);
                    }
                }
                if (engineState.runningSessions.length === 1) {
                    const remote = engineState.runningSessions[0];
                    return this.engine.proxyEnd(remote.device, remote.session);
                }
                return Promise.resolve();
            }
            case 'set_mode':
            case 'set_project':
            case 'set_task':
                // 将 set_mode/set_project/set_task 映射为 config 的 mode/project/task
                return this.engine.config({
                    [op === 'set_mode' ? 'mode' : op === 'set_project' ? 'project' : 'task']:
                        payload.value ?? payload[op.split('_')[1]] ?? payload.taskName,
                });
            case 'set_config':
                // 一次性设置多个配置字段，避免分多次写 ops
                return this.engine.config({
                    mode: typeof payload.mode === 'string' ? payload.mode : undefined,
                    project: typeof payload.project === 'string' ? payload.project : undefined,
                    task: typeof payload.task === 'string' ? payload.task : undefined,
                });
            default:
                return Promise.resolve();
        }
    }

    /**
     * 阶段完成时调用：结束当前会话并触发日志追加回调。
     */
    async logPhaseComplete(_completed: PhaseType, _next: PhaseType, _durationMinutes: number, entryPayload: Record<string, unknown>): Promise<void> {
        if (!this.engine) return;
        const entry = entryPayload as {
            date?: string;
            startTime?: string;
            endTime?: string;
            duration?: number;
            mode?: string;
            taskName?: string;
        };
        // 将 mode/task 组合为结束备注
        const note = entry.taskName || entry.mode ? `${entry.mode || ''} ${entry.taskName || ''}`.trim() : undefined;

        // 结束本机会话；若本机没有运行中的会话但存在单个远程会话，则代理结束远程会话
        let engineState = this.engine.getState();
        let localRunning = engineState.runningSessions.find(s => s.device === this.deviceId);
        if (localRunning) {
            await this.engine.end(localRunning.session, note ? { note } : undefined);
        } else if (engineState.runningSessions.length === 0) {
            // 没有本地会话且当前状态为空时，先强制同步一次，避免远程 start 还没同步到本地就结束
            await this.engine.sync();
            engineState = this.engine.getState();
            localRunning = engineState.runningSessions.find(s => s.device === this.deviceId);
            if (localRunning) {
                await this.engine.end(localRunning.session, note ? { note } : undefined);
            } else if (engineState.runningSessions.length === 1) {
                const remote = engineState.runningSessions[0];
                await this.engine.proxyEnd(remote.device, remote.session);
            }
        } else if (engineState.runningSessions.length === 1) {
            const remote = engineState.runningSessions[0];
            await this.engine.proxyEnd(remote.device, remote.session);
        }

        // 通知外部追加日志条目，并累加今日分钟数
        if (entry.date && entry.duration !== undefined) {
            this.onLogAppend?.({
                date: entry.date,
                startTime: entry.startTime || '',
                endTime: entry.endTime || '',
                duration: entry.duration,
                mode: entry.mode || 'pomodoro',
                taskName: entry.taskName || '',
            });
            this.todayMinutes += entry.duration || 0;
        }
    }

    /**
     * 触发一次 engine.sync()。
     */
    async loadFromSyncFile(): Promise<void> {
        await this.engine?.sync();
    }

    /**
     * 重置所有同步数据：删除 ops 文件和状态缓存，清空本地计时器状态。
     */
    async reset(): Promise<void> {
        await this.engine?.reset();
        this.previousState = { status: 'idle', runningSessions: [], mode: undefined, project: undefined, task: undefined };
        this.applyIdleState();
    }

    /**
     * 清理过期同步记录：保留最近指定天数的 ops，同时保留当前运行中 session 和最新配置。
     */
    async cleanup(retentionDays: number): Promise<void> {
        await this.engine?.cleanup(retentionDays);
    }

    // ========== 状态变化处理 ==========

    /**
     * 内部方法：处理引擎状态变化，将远程状态同步应用到本地计时器。
     */
    private handleStateChanged(state: SyncEngineState): void {
        if (!this.engine) return;
        const previous = this.previousState;
        this.previousState = {
            status: state.status,
            runningSessions: state.runningSessions.slice(),
            mode: state.mode,
            project: state.project,
            task: state.task,
        };

        // 判断本机是否在运行中，用于区分本地操作与远程操作
        const wasLocalRunning = previous.runningSessions.some(s => s.device === this.deviceId);
        const isLocalRunning = state.runningSessions.some(s => s.device === this.deviceId);

        // 同步配置变更（mode / project / task）
        const patch: Record<string, unknown> = {};
        if (state.mode !== undefined && state.mode !== previous.mode) {
            patch.mode = state.mode;
        }
        if (state.project !== undefined && state.project !== previous.project) {
            patch.currentProject = state.project;
        }
        if (state.task !== undefined && state.task !== previous.task) {
            patch.taskName = state.task;
        }
        if (Object.keys(patch).length > 0) {
            this.timer.applySyncState(patch);
        }

        if (state.status === 'running' && state.runningSessions.length === 1) {
            const session = state.runningSessions[0];
            // 仅有远程会话在运行，且本机此前未在运行，才将远程开始同步到本地计时器
            if (session.device !== this.deviceId && !isLocalRunning && !wasLocalRunning) {
                this.applyRemoteStart(session, session.mode ?? state.mode);
            }
        } else if (state.status === 'idle' && previous.status !== 'idle') {
            // 引擎已进入 idle，但本地计时器仍在运行，说明是远程操作结束了本会话
            if (this.timer.getState().status === 'running') {
                this.applyIdleState();
            }
        }
    }

    /**
     * 内部方法：处理冲突事件。当前默认保留本机会话。
     */
    private handleConflict(event: { runningSessions: RunningSession[]; resolve: (resolution: ConflictResolution) => Promise<void> }): void {
        // UI 层尚未实现冲突选择界面，默认保留本机会话
        void event.resolve('keep_local');
    }

    /**
     * 内部方法：将单个远程 running session 应用到本地计时器，使其进入运行状态。
     */
    private applyRemoteStart(session: RunningSession, mode?: string): void {
        const ts = new Date(session.startTs).getTime();
        if (Number.isNaN(ts)) return;

        const timerMode = (mode as TimerMode) || this.timer.getMode();
        const d = new Date(ts);
        const sessionDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const sessionTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

        const patch: Parameters<TomatoTimer['applySyncState']>[0] = {
            status: 'running',
            segmentStartMs: ts,
            accumulatedMs: 0,
            sessionDate,
            sessionTime,
            sessionMode: timerMode,
        };

        if (timerMode === 'pomodoro') {
            patch.phase = 'work';
            patch.cycleIndex = 1;
        } else if (timerMode === 'stopwatch') {
            patch.phase = 'stopwatch';
        } else {
            patch.phase = 'countdown';
        }

        this.timer.applySyncState(patch);
    }

    /**
     * 内部方法：将本地计时器重置为空闲状态。
     */
    private applyIdleState(): void {
        this.timer.applySyncState({
            status: 'idle',
            phase: 'idle',
            cycleIndex: 0,
            accumulatedMs: 0,
            segmentStartMs: 0,
        });
    }
}
