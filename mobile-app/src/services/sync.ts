import type { TomatoTimer, TimerMode, PhaseType, TimerStatus } from './timer';
import type { SyncAdapter } from './syncAdapter';
import { LocalFileAdapter } from './syncAdapter';
import { documentDirectory } from 'expo-file-system';

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
const DEFAULT_SYNC_FILE_NAME = 'Tomato Sync.md';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class SyncService {
  private timer: TomatoTimer;
  private deviceId: string;
  private adapter: SyncAdapter;

  private pendingOps: SyncOp[] = [];
  private processedOpIds = new Set<string>();
  private lastKnownContent = '';
  private syncing = false;
  private fileWatcherInterval: ReturnType<typeof setInterval> | null = null;

  todayMinutes = 0;
  onLogAppend?: (entry: { date: string; startTime: string; endTime: string; duration: number; mode: TimerMode; taskName: string }) => void;

  constructor(timer: TomatoTimer, deviceId?: string) {
    this.timer = timer;
    this.deviceId = deviceId || `mobile-${Date.now().toString(36)}`;
    const dir = (documentDirectory || '').replace(/\/?$/, '/');
    const defaultUri = dir + encodeURIComponent(DEFAULT_SYNC_FILE_NAME);
    this.adapter = new LocalFileAdapter(defaultUri);
  }

  setAdapter(adapter: SyncAdapter): void {
    this.adapter = adapter;
  }

  async init(): Promise<void> {
    await this.loadFromSyncFile();
    this.fileWatcherInterval = setInterval(() => {
      void this.checkFileChanged();
    }, 3000);
  }

  destroy(): void {
    if (this.fileWatcherInterval) {
      clearInterval(this.fileWatcherInterval);
      this.fileWatcherInterval = null;
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
      segmentStartMs: this.timer.getSegmentStartMs(),
      entry: entryPayload,
    });
  }

  // ========== 文件读写 ==========

  private async readSyncFile(): Promise<{ state: SyncStateSnapshot | null; ops: SyncOp[] }> {
    try {
      const content = await this.adapter.read();
      this.lastKnownContent = content;
      return this.parseSyncContent(content);
    } catch {
      return { state: null, ops: [] };
    }
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
    if (this.syncing) return;
    if (this.pendingOps.length === 0) return;

    this.syncing = true;
    try {
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
      await this.adapter.write(content);
      this.lastKnownContent = content;

      for (const op of newOps) {
        this.processedOpIds.add(op.uuid);
      }
      this.pendingOps = [];
    } finally {
      this.syncing = false;
    }
  }

  private async checkFileChanged(): Promise<void> {
    try {
      const content = await this.adapter.read();
      if (content === this.lastKnownContent) return;
      this.lastKnownContent = content;

      const { state, ops } = this.parseSyncContent(content);
      const newOps = ops.filter(o => !this.processedOpIds.has(o.uuid));

      if (newOps.length > 0) {
        await this.applyRemoteOps(newOps, state);
        for (const op of newOps) {
          this.processedOpIds.add(op.uuid);
        }
      }

      const allIds = new Set(ops.map(o => o.uuid));
      const lostOps = this.pendingOps.filter(o => !allIds.has(o.uuid));
      if (lostOps.length > 0) {
        this.pendingOps = lostOps;
        void this.flushPendingOps();
      }
    } catch {
      // ignore read errors
    }
  }

  private async applyRemoteOps(ops: SyncOp[], fileState: SyncStateSnapshot | null): Promise<void> {
    for (const op of ops) {
      switch (op.op) {
        case 'start': {
          const { mode, phase, project, taskName, countdownSec, sessionDate, sessionTime } = op.payload as any;
          this.timer.applySyncState({
            mode,
            phase,
            status: 'running',
            segmentStartMs: op.ts,
            accumulatedMs: 0,
            countdownSec,
            totalPhaseSeconds: countdownSec,
            sessionDate,
            sessionTime,
            currentProject: project || '',
            taskName: taskName || '',
          });
          break;
        }
        case 'pause': {
          const segmentStart = this.timer.getSegmentStartMs() || op.ts;
          const accumulated = this.timer.getAccumulatedMs() || 0;
          this.timer.applySyncState({
            status: 'paused',
            accumulatedMs: accumulated + (op.ts - segmentStart),
          });
          break;
        }
        case 'resume': {
          this.timer.applySyncState({
            status: 'running',
            segmentStartMs: op.ts,
          });
          break;
        }
        case 'stop':
          this.timer.applySyncState({
            status: 'idle',
            phase: 'idle',
            cycleIndex: 0,
            accumulatedMs: 0,
            segmentStartMs: 0,
          });
          break;
        case 'set_mode':
          this.timer.applySyncState({
            mode: op.payload.mode as TimerMode,
            phase: 'idle',
            status: 'idle',
          });
          break;
        case 'set_project':
          this.timer.setCurrentProject((op.payload.project as string) || '');
          break;
        case 'set_task':
          this.timer.setTaskName((op.payload.taskName as string) || '');
          break;
        case 'phase_complete': {
          const { entry } = op.payload as any;
          if (entry) {
            this.onLogAppend?.(entry);
            this.todayMinutes += entry.duration || 0;
          }
          break;
        }
      }
    }

    if (fileState) {
      this.timer.applySyncState({
        mode: fileState.mode,
        phase: fileState.phase,
        status: fileState.status,
        cycleIndex: fileState.cycleIndex,
        segmentStartMs: fileState.segmentStartMs,
        accumulatedMs: fileState.accumulatedMs,
        countdownSec: fileState.countdownSec,
        completedTomatos: fileState.completedTomatos,
        sessionDate: fileState.sessionDate,
        sessionTime: fileState.sessionTime,
        sessionMode: fileState.sessionMode,
        taskName: fileState.taskName,
        currentProject: fileState.currentProject,
      });
      this.todayMinutes = fileState.todayMinutes;
    }

    this.catchUpTime();
  }

  private catchUpTime(): void {
    const state = this.timer.getState();
    if (state.status !== 'running' || state.mode === 'stopwatch') return;

    const elapsedMs = this.timer.getElapsedMs();
    const totalSec = state.totalPhaseSeconds;
    if (totalSec <= 0) return;

    if (elapsedMs >= totalSec * 1000) {
      const durationMin = Math.max(1, Math.round(totalSec / 60));
      const donePhase = state.phase;
      const now = new Date();
      const startDate = this.timer.getSessionStartDate();
      const startTime = this.timer.getSessionStartTime();
      const endTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      this.logPhaseComplete(donePhase, 'idle', durationMin, {
        date: startDate,
        startTime,
        endTime,
        duration: durationMin,
        mode: this.timer.getSessionStartMode(),
        taskName: this.timer.getTaskName(),
      });
    }
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

    const allOps = ops.filter(o => !this.processedOpIds.has(o.uuid));
    if (allOps.length > 0) {
      await this.applyRemoteOps(allOps, state);
      for (const op of allOps) {
        this.processedOpIds.add(op.uuid);
      }
    } else if (state) {
      this.timer.applySyncState({
        mode: state.mode,
        phase: state.phase,
        status: state.status,
        cycleIndex: state.cycleIndex,
        segmentStartMs: state.segmentStartMs,
        accumulatedMs: state.accumulatedMs,
        countdownSec: state.countdownSec,
        totalPhaseSeconds: state.countdownSec,
        completedTomatos: state.completedTomatos,
        sessionDate: state.sessionDate,
        sessionTime: state.sessionTime,
        sessionMode: state.sessionMode,
        taskName: state.taskName,
        currentProject: state.currentProject,
      });
      this.todayMinutes = state.todayMinutes;
      this.catchUpTime();
    }
  }
}
