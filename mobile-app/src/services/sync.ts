import { Paths } from 'expo-file-system';
import type { TomatoTimer, PhaseType } from './timer';
import { SyncEngine } from '../sync';
import type { SyncAdapter, ConflictResolution, RunningSession, SyncEngineState } from '../sync';
import { MobileLocalSyncAdapter } from './syncAdapter';
import { AsyncStorageLocalStore } from './localStore';

/** 外部调用使用的操作类型 */
export type SyncOpType =
    | 'start'
    | 'stop'
    | 'skip'
    | 'set_mode'
    | 'set_project'
    | 'set_task'
    | 'phase_complete';

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
    private timer: TomatoTimer;
    private deviceId: string;
    private localStore = new AsyncStorageLocalStore();
    private adapter: SyncAdapter;
    private engine?: SyncEngine;
    private fileWatcherInterval: ReturnType<typeof setInterval> | null = null;

    private previousState: SyncEngineState = { status: 'idle', runningSessions: [], mode: undefined, project: undefined, task: undefined };

    todayMinutes = 0;
    onLogAppend?: (entry: { date: string; startTime: string; endTime: string; duration: number; mode: string; taskName: string }) => void;

    constructor(timer: TomatoTimer, deviceId?: string) {
        this.timer = timer;
        this.deviceId = deviceId || '';

        // 默认本地适配器
        const dir = Paths.document.uri.replace(/\/?$/, '/');
        this.adapter = new MobileLocalSyncAdapter(dir + 'timer-sync');
    }

    setAdapter(adapter: SyncAdapter): void {
        this.adapter = adapter;
        if (this.engine) {
            // 运行时切换同步目录：重建引擎并重新初始化
            void this.rebuildEngine();
        }
    }

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

    private async rebuildEngine(): Promise<void> {
        this.engine = this.createEngine();
        await this.engine.init();
        this.previousState = this.engine.getState();
    }

    destroy(): void {
        if (this.fileWatcherInterval) {
            clearInterval(this.fileWatcherInterval);
            this.fileWatcherInterval = null;
        }
    }

    // ========== 对外 API：记录操作 ==========

    logOp(op: SyncOpType, payload: Record<string, unknown>): void {
        if (!this.engine) return;
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
                void this.engine.end();
                break;
            case 'set_mode':
            case 'set_project':
            case 'set_task':
                void this.engine.config({
                    [op === 'set_mode' ? 'mode' : op === 'set_project' ? 'project' : 'task']:
                        payload.value ?? payload[op.split('_')[1]],
                });
                break;
            default:
                break;
        }
    }

    logPhaseComplete(_completed: PhaseType, _next: PhaseType, _durationMinutes: number, entryPayload: Record<string, unknown>): void {
        if (!this.engine) return;
        const entry = entryPayload as {
            date?: string;
            startTime?: string;
            endTime?: string;
            duration?: number;
            mode?: string;
            taskName?: string;
        };
        const note = entry.taskName || entry.mode ? `${entry.mode || ''} ${entry.taskName || ''}`.trim() : undefined;
        void this.engine.end(undefined, note ? { note } : undefined);

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

    // ========== 状态变化处理 ==========

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
                this.applyRemoteStart(session);
            }
        } else if (state.status === 'idle' && previous.status !== 'idle') {
            const hadRemoteRunning = previous.runningSessions.some(s => s.device !== this.deviceId);
            // 仅当此前有远程会话在运行且本机未在运行时，才同步为 idle
            if (hadRemoteRunning && !wasLocalRunning) {
                this.applyIdleState();
            }
        }
    }

    private handleConflict(event: { runningSessions: RunningSession[]; resolve: (resolution: ConflictResolution) => Promise<void> }): void {
        // UI 层尚未实现冲突选择界面，默认保留本机会话
        void event.resolve('keep_local');
    }

    private applyRemoteStart(session: RunningSession): void {
        const ts = new Date(session.startTs).getTime();
        if (Number.isNaN(ts)) return;

        this.timer.applySyncState({
            status: 'running',
            segmentStartMs: ts,
            accumulatedMs: 0,
        });
    }

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
