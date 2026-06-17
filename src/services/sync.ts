import { App, TFile, normalizePath, Platform, type EventRef, Notice } from 'obsidian';
import type TomatoPlugin from '../main';
import type { TomatoPluginSettings } from '../settings';
import type { PhaseType, TimerMode, TimerStatus } from '../timer';
import { appendEntry, timeFromDate } from '../log';

export type SyncOpType =
    | 'start'
    | 'pause'
    | 'resume'
    | 'stop'
    | 'skip'
    | 'set_mode'
    | 'set_project'
    | 'set_task'
    | 'phase_complete';

export interface SyncOp {
    ts: number;
    uuid: string;
    device: string;
    op: SyncOpType;
    payload: Record<string, unknown>;
}

export interface SyncStateSnapshot {
    mode: TimerMode;
    phase: PhaseType;
    status: TimerStatus;
    cycleIndex: number;
    segmentStartMs: number;
    accumulatedMs: number;
    countdownSec: number;
    completedTomatos: number;
    sessionDate: string;
    sessionTime: string;
    sessionMode: TimerMode;
    taskName: string;
    currentProject: string;
    lastOpTs: number;
    lastOpId: string;
    todayMinutes: number;
}

const SYNC_VERSION = 1;
const STATE_MARKER = '# State';
const OPS_MARKER = '# Ops';

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/** 简单互斥锁，保证 flushPendingOps 和 onSyncFileChanged 不会并发执行 */
class Mutex {
    private promise: Promise<void> = Promise.resolve();
    async acquire(): Promise<() => void> {
        let release: () => void;
        const newPromise = new Promise<void>(resolve => { release = resolve; });
        const wait = this.promise.then(() => { });
        this.promise = wait.then(() => newPromise);
        await wait;
        return release!;
    }
}

export class SyncService {
    private app: App;
    private plugin: TomatoPlugin;
    private settings: TomatoPluginSettings;

    private syncFilePath: string;
    private deviceId: string;

    private pendingOps: SyncOp[] = [];
    private processedOpIds = new Set<string>();
    private lastKnownContent = '';
    private mutex = new Mutex();
    private unregisterModify?: EventRef;

    /** 当日已完成分钟数（从同步文件计算） */
    todayMinutes = 0;

    constructor(plugin: TomatoPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.settings = plugin.settings;
        this.syncFilePath = normalizePath(this.settings.syncFilePath || 'Tomato Sync.md');
        this.deviceId = this.settings.syncDeviceId || this.generateDeviceId();
        if (!this.settings.syncDeviceId) {
            this.settings.syncDeviceId = this.deviceId;
            void this.plugin.saveSettings();
        }
    }

    private generateDeviceId(): string {
        const platform = Platform.isMobile ? 'mobile' : Platform.isMacOS ? 'mac' : Platform.isWin ? 'win' : 'linux';
        return `${platform}-${Date.now().toString(36)}`;
    }

    async init(): Promise<void> {
        await this.ensureSyncFile();
        await this.loadFromSyncFile();
        this.unregisterModify = this.app.vault.on('modify', file => {
            if (file.path === this.syncFilePath) {
                void this.onSyncFileChanged();
            }
        });
        if (this.checkCatchUpNeeded()) {
            await this.handleCatchUp();
        }
    }

    destroy(): void {
        if (this.unregisterModify) {
            this.app.vault.offref(this.unregisterModify);
            this.unregisterModify = undefined;
        }
    }

    // ========== 对外 API：记录操作 ==========

    logOp(op: SyncOpType, payload: Record<string, unknown>): void {
        const syncOp: SyncOp = {
            ts: Date.now(),
            uuid: generateUUID(),
            device: this.deviceId,
            op,
            payload,
        };
        this.pendingOps.push(syncOp);
        void this.flushPendingOps();
    }

    logPhaseComplete(completed: PhaseType, next: PhaseType, durationMinutes: number, entryPayload: Record<string, unknown>): void {
        this.logOp('phase_complete', {
            completed,
            next,
            durationMinutes,
            segmentStartMs: this.plugin.timer.getSegmentStartMs(),
            entry: entryPayload,
        });
    }

    // ========== 文件读写 ==========

    private getSyncFile(): TFile | null {
        const main = this.app.vault.getAbstractFileByPath(this.syncFilePath) as TFile | null;
        if (main) return main;
        const conflictFiles = this.findConflictFiles();
        return conflictFiles.length > 0 ? conflictFiles[0] : null;
    }

    private findConflictFiles(): TFile[] {
        const normalized = normalizePath(this.syncFilePath);
        const lastSlash = normalized.lastIndexOf('/');
        const folder = lastSlash >= 0 ? normalized.substring(0, lastSlash) : '';
        const baseName = normalized.substring(lastSlash + 1).replace(/\.md$/, '');
        return this.app.vault.getFiles().filter(f => {
            const fp = normalizePath(f.path);
            const ls = fp.lastIndexOf('/');
            const fDir = ls >= 0 ? fp.substring(0, ls) : '';
            const fName = fp.substring(ls + 1);
            return fDir === folder && fName.startsWith(baseName) && fName.endsWith('.md') && fName !== `${baseName}.md`;
        });
    }

    private async ensureSyncFile(): Promise<void> {
        const existing = this.getSyncFile();
        if (existing) return;

        const normalized = normalizePath(this.syncFilePath);
        const lastSlash = normalized.lastIndexOf('/');
        const folder = lastSlash >= 0 ? normalized.substring(0, lastSlash) : '';

        if (folder) {
            const existingFolder = this.app.vault.getAbstractFileByPath(folder);
            if (!existingFolder) {
                try {
                    await this.app.vault.createFolder(folder);
                } catch (e: any) {
                    if (!e?.message?.includes('already exists')) throw e;
                }
            }
        }

        const content = this.buildSyncFileContent(null, []);
        try {
            await this.app.vault.create(this.syncFilePath, content);
        } catch (e: any) {
            if (!e?.message?.includes('already exists')) throw e;
        }
    }

    private async readSyncFile(): Promise<{ state: SyncStateSnapshot | null; ops: SyncOp[] }> {
        const file = this.getSyncFile();
        if (!file) return { state: null, ops: [] };
        const content = await this.app.vault.read(file);
        this.lastKnownContent = content;
        return this.parseSyncContent(content);
    }

    private parseSyncContent(content: string): { state: SyncStateSnapshot | null; ops: SyncOp[] } {
        const lines = content.split('\n');
        let inState = false;
        let inOps = false;
        let stateJson = '';
        const ops: SyncOp[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === STATE_MARKER) {
                inState = true;
                inOps = false;
                continue;
            }
            if (trimmed === OPS_MARKER) {
                inState = false;
                inOps = true;
                continue;
            }
            if (inState) {
                stateJson += line;
            } else if (inOps && trimmed) {
                const op = this.parseOpLine(trimmed);
                if (op) ops.push(op);
            }
        }

        let state: SyncStateSnapshot | null = null;
        if (stateJson) {
            try {
                state = JSON.parse(stateJson) as SyncStateSnapshot;
            } catch {
                state = null;
            }
        }
        return { state, ops };
    }

    private parseOpLine(line: string): SyncOp | null {
        const parts = line.split('|');
        if (parts.length < 5) return null;
        try {
            return {
                ts: parseInt(parts[0], 10),
                uuid: parts[1],
                device: parts[2],
                op: parts[3] as SyncOpType,
                payload: JSON.parse(parts.slice(4).join('|')),
            };
        } catch {
            return null;
        }
    }

    private buildSyncFileContent(state: SyncStateSnapshot | null, ops: SyncOp[]): string {
        const stateStr = state ? JSON.stringify(state) : '{}';
        const opsStr = ops.map(o => `${o.ts}|${o.uuid}|${o.device}|${o.op}|${JSON.stringify(o.payload)}`).join('\n');
        return `---\nsync_version: ${SYNC_VERSION}\n---\n\n${STATE_MARKER}\n${stateStr}\n\n${OPS_MARKER}\n${opsStr}`;
    }

    // ========== 核心同步逻辑 ==========

    private async flushPendingOps(): Promise<void> {
        if (this.pendingOps.length === 0) return;
        const release = await this.mutex.acquire();
        try {
            let file = this.getSyncFile();
            if (!file) {
                await this.ensureSyncFile();
                file = this.app.vault.getAbstractFileByPath(this.syncFilePath) as TFile | null;
            }
            if (!file) {
                console.error('[SyncService] Cannot get sync file after ensure');
                return;
            }

            const { state, ops } = await this.readSyncFile();
            const existingIds = new Set(ops.map(o => o.uuid));
            const newOps = this.pendingOps.filter(o => !existingIds.has(o.uuid));

            if (newOps.length === 0) {
                this.pendingOps = [];
                return;
            }

            const mergedOps = [...ops, ...newOps].sort((a, b) => a.ts - b.ts);
            const newState = this.rebuildState(mergedOps, state);

            const content = this.buildSyncFileContent(newState, mergedOps);
            await this.app.vault.modify(file, content);
            this.lastKnownContent = content;

            for (const op of newOps) {
                this.processedOpIds.add(op.uuid);
            }
            this.pendingOps = [];
        } catch (e) {
            console.error('[SyncService] flushPendingOps error:', e);
        } finally {
            release();
        }
    }

    private async onSyncFileChanged(): Promise<void> {
        // 等待一小段时间，确保文件内容已稳定
        await new Promise(r => setTimeout(r, 300));
        const release = await this.mutex.acquire();
        let needFlush = false;
        let catchUpNeeded = false;
        try {
            const file = this.getSyncFile();
            if (!file) return;

            const content = await this.app.vault.read(file);
            if (content === this.lastKnownContent) return;
            this.lastKnownContent = content;

            let { state, ops } = this.parseSyncContent(content);
            const conflictResult = await this.mergeConflictFiles(ops, state);
            ops = conflictResult.mergedOps;
            state = conflictResult.mergedState;

            if (conflictResult.hasConflict) {
                ops.sort((a, b) => a.ts - b.ts);
                const mainFile = this.app.vault.getAbstractFileByPath(this.syncFilePath) as TFile | null;
                if (mainFile) {
                    const mergedContent = this.buildSyncFileContent(state, ops);
                    await this.app.vault.modify(mainFile, mergedContent);
                    this.lastKnownContent = mergedContent;
                }
            }

            const newOps = ops.filter(o => !this.processedOpIds.has(o.uuid));

            if (newOps.length > 0) {
                const succeededIds = await this.applyRemoteOps(newOps, state);
                for (const op of newOps) {
                    if (succeededIds.has(op.uuid)) {
                        this.processedOpIds.add(op.uuid);
                    }
                }
            } else if (state) {
                this.applyStateSnapshot(state);
            }

            // 检查是否有 pendingOps 丢失（被其他设备覆盖）
            const allIds = new Set(ops.map(o => o.uuid));
            const lostOps = this.pendingOps.filter(o => !allIds.has(o.uuid));
            if (lostOps.length > 0) {
                this.pendingOps = lostOps;
                needFlush = true;
            }

            catchUpNeeded = this.checkCatchUpNeeded();
        } catch (e) {
            console.error('[SyncService] onSyncFileChanged error:', e);
        } finally {
            release();
        }

        if (catchUpNeeded) {
            await this.handleCatchUp();
        }
        if (needFlush) {
            await this.flushPendingOps();
        }
    }

    private async mergeConflictFiles(ops: SyncOp[], state: SyncStateSnapshot | null): Promise<{ mergedOps: SyncOp[]; mergedState: SyncStateSnapshot | null; hasConflict: boolean }> {
        const conflictFiles = this.findConflictFiles();
        let hasConflict = false;
        for (const cf of conflictFiles) {
            try {
                const cContent = await this.app.vault.read(cf);
                const cParsed = this.parseSyncContent(cContent);
                for (const op of cParsed.ops) {
                    if (!ops.some(o => o.uuid === op.uuid)) {
                        ops.push(op);
                        hasConflict = true;
                    }
                }
                if (cParsed.state && (!state || cParsed.state.lastOpTs > state.lastOpTs)) {
                    state = cParsed.state;
                    hasConflict = true;
                }
                await this.app.vault.delete(cf);
            } catch (e) {
                console.error('[SyncService] Failed to merge conflict file:', cf.path, e);
            }
        }
        return { mergedOps: ops, mergedState: state, hasConflict };
    }

    private async applyRemoteOps(ops: SyncOp[], fileState: SyncStateSnapshot | null): Promise<Set<string>> {
        const succeeded = new Set<string>();
        for (const op of ops) {
            switch (op.op) {
                case 'start': {
                    const { mode, phase, project, taskName, countdownSec, sessionDate, sessionTime } = op.payload as any;
                    this.plugin.timer.applySyncState({
                        mode,
                        phase,
                        status: 'running',
                        segmentStartMs: op.ts,
                        accumulatedMs: 0,
                        countdownSec,
                        sessionDate,
                        sessionTime,
                        currentProject: project || '',
                        taskName: taskName || '',
                    });
                    succeeded.add(op.uuid);
                    break;
                }
                case 'pause': {
                    const current = this.plugin.timer.getState();
                    const accumulated = (current as any).accumulatedMs || 0;
                    const segmentStart = (current as any).segmentStartMs || op.ts;
                    this.plugin.timer.applySyncState({
                        status: 'paused',
                        accumulatedMs: accumulated + (op.ts - segmentStart),
                    });
                    succeeded.add(op.uuid);
                    break;
                }
                case 'resume': {
                    this.plugin.timer.applySyncState({
                        status: 'running',
                        segmentStartMs: op.ts,
                    });
                    succeeded.add(op.uuid);
                    break;
                }
                case 'stop':
                    this.plugin.timer.applySyncState({
                        status: 'idle',
                        phase: 'idle',
                        cycleIndex: 0,
                        accumulatedMs: 0,
                        segmentStartMs: 0,
                    });
                    succeeded.add(op.uuid);
                    break;
                case 'set_mode':
                    this.plugin.timer.applySyncState({
                        mode: op.payload.mode as TimerMode,
                        phase: 'idle',
                        status: 'idle',
                    });
                    succeeded.add(op.uuid);
                    break;
                case 'set_project':
                    this.plugin.timer.setCurrentProject((op.payload.project as string) || '');
                    succeeded.add(op.uuid);
                    break;
                case 'set_task':
                    this.plugin.timer.setTaskName((op.payload.taskName as string) || '');
                    succeeded.add(op.uuid);
                    break;
                case 'phase_complete': {
                    const { entry } = op.payload as any;
                    if (entry) {
                        try {
                            await appendEntry(this.app, this.settings, {
                                date: entry.date,
                                startTime: entry.startTime,
                                endTime: entry.endTime,
                                duration: entry.duration,
                                mode: entry.mode,
                                taskName: entry.taskName,
                            });
                            new Notice(`日志已写入: ${entry.date} ${entry.startTime}~${entry.endTime} (${entry.duration}m)`);
                            succeeded.add(op.uuid);
                        } catch (e) {
                            console.error('[SyncService] appendEntry failed:', e);
                            new Notice(`日志写入失败: ${e instanceof Error ? e.message : String(e)}`);
                            // 不加入 succeeded，下次文件变更时重试
                        }
                        this.todayMinutes += entry.duration || 0;
                        this.plugin.refreshLogViews();
                    } else {
                        new Notice('收到 phase_complete 但 entry 为空');
                        succeeded.add(op.uuid); // entry 为空是永久错误，直接标记
                    }
                    break;
                }
            }
        }

        // 应用 State 快照（覆盖由操作重放可能产生的微小偏差）
        if (fileState) {
            this.applyStateSnapshot(fileState);
        }

        return succeeded;
    }

    private applyStateSnapshot(state: SyncStateSnapshot): void {
        this.plugin.timer.applySyncState({
            mode: state.mode,
            phase: state.phase,
            status: state.status,
            cycleIndex: state.cycleIndex,
            segmentStartMs: state.segmentStartMs,
            accumulatedMs: state.accumulatedMs,
            countdownSec: state.countdownSec,
            completedTomatos: state.completedTomatos,
            sessionDate: state.sessionDate,
            sessionTime: state.sessionTime,
            sessionMode: state.sessionMode,
            taskName: state.taskName,
            currentProject: state.currentProject,
        });
        this.todayMinutes = state.todayMinutes;
    }

    private checkCatchUpNeeded(): boolean {
        const timer = this.plugin.timer;
        const state = timer.getState();
        if (state.status !== 'running' || state.mode === 'stopwatch') return false;
        const elapsedMs = (timer as any).getElapsedMs?.() || 0;
        const totalSec = state.totalPhaseSeconds;
        if (totalSec <= 0) return false;
        return elapsedMs >= totalSec * 1000;
    }

    private async handleCatchUp(): Promise<void> {
        const timer = this.plugin.timer;
        const state = timer.getState();
        if (state.status !== 'running' || state.mode === 'stopwatch') return;

        const elapsedMs = (timer as any).getElapsedMs?.() || 0;
        const totalSec = state.totalPhaseSeconds;
        if (totalSec <= 0 || elapsedMs < totalSec * 1000) return;

        const durationMin = Math.max(1, Math.round(totalSec / 60));
        const donePhase = state.phase;
        const now = new Date();
        const startDate = timer.getSessionStartDate();
        const startTime = timer.getSessionStartTime();
        const endTime = timeFromDate(now);

        const entry = {
            date: startDate,
            startTime,
            endTime,
            duration: durationMin,
            mode: timer.getSessionStartMode(),
            taskName: this.plugin.buildLogTaskName?.() || timer.getTaskName(),
        };

        try {
            await appendEntry(this.app, this.settings, entry);
            new Notice(`日志已写入: ${entry.date} ${entry.startTime}~${entry.endTime} (${entry.duration}m)`);
        } catch (e) {
            console.error('[SyncService] catchUp appendEntry failed:', e);
            new Notice(`日志写入失败: ${e instanceof Error ? e.message : String(e)}`);
        }

        this.logPhaseComplete(donePhase, 'idle', durationMin, entry);
    }

    // ========== 状态重建 ==========

    private rebuildState(ops: SyncOp[], baseState: SyncStateSnapshot | null): SyncStateSnapshot {
        const state: SyncStateSnapshot = baseState || {
            mode: 'pomodoro',
            phase: 'idle',
            status: 'idle',
            cycleIndex: 0,
            segmentStartMs: 0,
            accumulatedMs: 0,
            countdownSec: 0,
            completedTomatos: 0,
            sessionDate: '',
            sessionTime: '',
            sessionMode: 'pomodoro',
            taskName: '',
            currentProject: '',
            lastOpTs: 0,
            lastOpId: '',
            todayMinutes: 0,
        };

        const sorted = [...ops].sort((a, b) => a.ts - b.ts);

        for (const op of sorted) {
            switch (op.op) {
                case 'start': {
                    const p = op.payload as any;
                    state.mode = p.mode || state.mode;
                    state.phase = p.phase || 'work';
                    state.status = 'running';
                    state.segmentStartMs = op.ts;
                    state.accumulatedMs = 0;
                    if (p.countdownSec !== undefined) state.countdownSec = p.countdownSec;
                    if (p.sessionDate) state.sessionDate = p.sessionDate;
                    if (p.sessionTime) state.sessionTime = p.sessionTime;
                    state.currentProject = p.project || state.currentProject;
                    state.taskName = p.taskName || state.taskName;
                    state.sessionMode = p.mode || state.mode;
                    break;
                }
                case 'pause': {
                    if (state.status === 'running') {
                        state.accumulatedMs += op.ts - state.segmentStartMs;
                        state.status = 'paused';
                    }
                    break;
                }
                case 'resume': {
                    state.status = 'running';
                    state.segmentStartMs = op.ts;
                    break;
                }
                case 'stop': {
                    state.status = 'idle';
                    state.phase = 'idle';
                    state.cycleIndex = 0;
                    state.accumulatedMs = 0;
                    state.segmentStartMs = 0;
                    break;
                }
                case 'skip': {
                    state.status = 'idle';
                    state.phase = 'idle';
                    state.accumulatedMs = 0;
                    state.segmentStartMs = 0;
                    break;
                }
                case 'set_mode': {
                    state.mode = op.payload.mode as TimerMode;
                    state.phase = 'idle';
                    state.status = 'idle';
                    break;
                }
                case 'set_project':
                    state.currentProject = (op.payload.project as string) || '';
                    break;
                case 'set_task':
                    state.taskName = (op.payload.taskName as string) || '';
                    break;
                case 'phase_complete': {
                    const p = op.payload as any;
                    if (p.entry?.duration) {
                        state.todayMinutes += p.entry.duration;
                    }
                    if (state.mode === 'pomodoro' && p.next) {
                        state.phase = p.next;
                        if (p.next !== 'idle') {
                            state.status = 'running';
                            state.segmentStartMs = op.ts;
                            state.accumulatedMs = 0;
                        } else {
                            state.status = 'idle';
                            state.phase = 'idle';
                        }
                    } else {
                        state.status = 'idle';
                        state.phase = 'idle';
                    }
                    if (p.completed === 'work') {
                        state.completedTomatos += 1;
                    }
                    break;
                }
            }
            state.lastOpTs = op.ts;
            state.lastOpId = op.uuid;
        }

        return state;
    }

    // ========== 启动加载 ==========

    async loadFromSyncFile(): Promise<void> {
        const { state, ops } = await this.readSyncFile();
        if (ops.length === 0 && !state) return;

        const newOps = ops.filter(o => !this.processedOpIds.has(o.uuid));
        if (newOps.length > 0) {
            const succeededIds = await this.applyRemoteOps(newOps, state);
            for (const op of newOps) {
                if (succeededIds.has(op.uuid)) {
                    this.processedOpIds.add(op.uuid);
                }
            }
        } else if (state) {
            this.applyStateSnapshot(state);
        }
    }
}
