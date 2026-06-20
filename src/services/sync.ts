import { App, type EventRef, normalizePath } from 'obsidian';
import type TomatoPlugin from '../main';
import type { PhaseType, TimerMode, TomatoTimer } from '../timer';
import { SyncEngine } from '../sync';
import { ObsidianSyncAdapter, ObsidianLocalStore } from '../sync/adapter';
import type { ConflictResolution, RunningSession, SyncEngineState } from '../sync';

/** 外部调用使用的操作类型：业务语义上的动作，会映射为引擎底层的 op */
export type SyncOpType =
    | 'start'
    | 'stop'
    | 'skip'
    | 'set_mode'
    | 'set_project'
    | 'set_task'
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
 * 多端同步服务（Obsidian 版）
 *
 * 底层基于事件溯源引擎（SyncEngine）。
 * start/stop/skip/phase_complete 会映射为 start/end 操作；
 * set_mode/set_project/set_task 会同步为对应配置操作。
 */
export class SyncService {
    // Obsidian App 实例
    private app: App;
    // 插件实例
    private plugin: TomatoPlugin;
    // 同步引擎实例
    private engine: SyncEngine;
    // vault modify 事件注销引用
    private unregisterModify?: EventRef;
    // 轮询兜底定时器
    private pollIntervalId?: ReturnType<typeof setInterval>;
    // modify 事件防抖定时器
    private modifyDebounceTimer?: ReturnType<typeof setTimeout>;

    // 上一次 engine 状态，用于计算差量变化
    private previousState: SyncEngineState = { status: 'idle', runningSessions: [], mode: undefined, project: undefined, task: undefined };

    /** 保留旧属性，实际今日时长由各视图从日志文件重新计算 */
    todayMinutes = 0;

    constructor(plugin: TomatoPlugin) {
        this.app = plugin.app;
        this.plugin = plugin;
        // 兼容旧设置：若 settings 中没有 deviceId，生成并保存
        if (!this.plugin.settings.syncDeviceId) {
            this.plugin.settings.syncDeviceId = generateUUID();
            void this.plugin.saveSettings();
        }
        this.engine = this.createEngine();
    }

    /**
     * 内部方法：根据插件设置构造 SyncEngine 实例。
     */
    private createEngine(): SyncEngine {
        const syncDir = this.plugin.settings.syncDir;
        const adapter = new ObsidianSyncAdapter(this.app, syncDir);
        const localStore = new ObsidianLocalStore(this.plugin);

        return new SyncEngine({
            deviceId: this.plugin.settings.syncDeviceId,
            localStore,
            adapter,
            warn: (msg, meta) => console.warn(`[SyncService] ${msg}`, meta ?? {}),
            error: (msg, meta) => console.error(`[SyncService] ${msg}`, meta ?? {}),
        });
    }

    /**
     * 初始化同步服务：订阅引擎事件、执行首次同步、监听文件变化并启动轮询。
     */
    async init(): Promise<void> {
        this.engine.onStateChanged(state => this.handleStateChanged(state));
        this.engine.onConflict(event => this.handleConflict(event));

        await this.engine.init();
        this.previousState = this.engine.getState();

        // 监听同步目录下文件变化，防抖后触发 sync
        const syncDir = this.plugin.settings.syncDir;
        this.unregisterModify = this.app.vault.on('modify', file => {
            if (normalizePath(file.path).startsWith(normalizePath(`${syncDir}/`))) {
                if (this.modifyDebounceTimer) {
                    clearTimeout(this.modifyDebounceTimer);
                }
                this.modifyDebounceTimer = setTimeout(() => {
                    this.modifyDebounceTimer = undefined;
                    void this.engine.sync();
                }, 1000);
            }
        });

        // 轮询兜底：坚果云等外部同步工具修改文件时 Obsidian modify 事件可能不触发
        this.pollIntervalId = setInterval(() => {
            void this.engine.sync();
        }, 10000);
    }

    /**
     * 销毁同步服务：取消 modify 监听、清理防抖和轮询定时器。
     */
    destroy(): void {
        if (this.unregisterModify) {
            this.app.vault.offref(this.unregisterModify);
            this.unregisterModify = undefined;
        }
        if (this.modifyDebounceTimer) {
            clearTimeout(this.modifyDebounceTimer);
            this.modifyDebounceTimer = undefined;
        }
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = undefined;
        }
    }

    // ========== 对外 API：记录操作 ==========

    /**
     * 将业务操作映射为底层同步 op，并异步提交给引擎。
     */
    logOp(op: SyncOpType, payload: Record<string, unknown>): void {
        switch (op) {
            case 'start': {
                const tags: string[] = [];
                const project = (payload.project as string) || '';
                const taskName = (payload.taskName as string) || '';
                if (project) tags.push(`project:${project}`);
                if (taskName) tags.push(`task:${taskName}`);
                void this.engine.start({ tags: tags.length > 0 ? tags : undefined });
                break;
            }
            case 'stop':
            case 'skip':
                // stop/skip 均视为结束本机当前 running session
                void this.engine.end();
                break;
            case 'set_mode':
            case 'set_project':
            case 'set_task':
                // 将 set_mode/set_project/set_task 映射为 config 的 mode/project/task
                void this.engine.config({
                    [op === 'set_mode' ? 'mode' : op === 'set_project' ? 'project' : 'task']:
                        payload.value ?? payload[op.split('_')[1]] ?? payload.taskName,
                });
                break;
            default:
                break;
        }
    }

    /**
     * 阶段完成时调用：结束当前会话。
     */
    logPhaseComplete(_completed: PhaseType, _next: PhaseType, _durationMinutes: number, entryPayload: Record<string, unknown>): void {
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
        void this.engine.end(undefined, note ? { note } : undefined);
    }

    // ========== 状态变化处理 ==========

    /**
     * 内部方法：处理引擎状态变化，将远程状态同步应用到本地计时器。
     */
    private handleStateChanged(state: SyncEngineState): void {
        const localDeviceId = this.plugin.settings.syncDeviceId;
        const previous = this.previousState;
        this.previousState = {
            status: state.status,
            runningSessions: state.runningSessions.slice(),
            mode: state.mode,
            project: state.project,
            task: state.task,
        };

        // 判断本机是否在运行中，用于区分本地操作与远程操作
        const wasLocalRunning = previous.runningSessions.some(s => s.device === localDeviceId);
        const isLocalRunning = state.runningSessions.some(s => s.device === localDeviceId);

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
            this.plugin.timer.applySyncState(patch);
        }

        if (state.status === 'running' && state.runningSessions.length === 1) {
            const session = state.runningSessions[0];
            // 仅有远程会话在运行，且本机此前未在运行，才将远程开始同步到本地计时器
            if (session.device !== localDeviceId && !isLocalRunning && !wasLocalRunning) {
                this.applyRemoteStart(session, state.mode);
            }
        } else if (state.status === 'idle' && previous.status !== 'idle') {
            const hadRemoteRunning = previous.runningSessions.some(s => s.device !== localDeviceId);
            // 仅当此前有远程会话在运行且本机未在运行时，才同步为 idle
            if (hadRemoteRunning && !wasLocalRunning) {
                this.applyIdleState();
            }
        }
    }

    /**
     * 内部方法：处理冲突事件。当前默认保留本机会话。
     */
    private handleConflict(event: { runningSessions: RunningSession[]; resolve: (resolution: ConflictResolution) => Promise<void> }): void {
        // UI 层尚未实现冲突选择界面，为保持现有 UI 可用，
        // 默认保留本机会话，结束其他设备的会话。
        void event.resolve('keep_local');
    }

    /**
     * 内部方法：将单个远程 running session 应用到本地计时器，使其进入运行状态。
     */
    private applyRemoteStart(session: RunningSession, mode?: string): void {
        const ts = new Date(session.startTs).getTime();
        if (Number.isNaN(ts)) return;

        const timerMode = (mode as TimerMode) || this.plugin.timer.getMode();
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

        this.plugin.timer.applySyncState(patch);
    }

    /**
     * 内部方法：将本地计时器重置为空闲状态。
     */
    private applyIdleState(): void {
        this.plugin.timer.applySyncState({
            status: 'idle',
            phase: 'idle',
            cycleIndex: 0,
            accumulatedMs: 0,
            segmentStartMs: 0,
        });
    }
}
