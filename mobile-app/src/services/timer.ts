export type TimerMode = 'pomodoro' | 'stopwatch' | 'countdown';
export type PhaseType = 'idle' | 'work' | 'shortBreak' | 'longBreak' | 'countdown' | 'stopwatch';
export type TimerStatus = 'idle' | 'running';

export interface TimerSettings {
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cycles: number;
  autoStartNextPhase: boolean;
  countdownMinutes: number;
}

export interface TimerState {
  mode: TimerMode;
  phase: PhaseType;
  status: TimerStatus;
  remainingSeconds: number;
  totalPhaseSeconds: number;
  completedTomatos: number;
  cycleIndex: number;
  taskName: string;
  currentProject: string;
}

interface CoreState {
  mode: TimerMode;
  phase: PhaseType;
  status: TimerStatus;
  cycleIndex: number;
  segmentStartMs: number;
  accumulatedMs: number;
  countdownSec: number;
  totalPhaseSeconds: number;
  completedTomatos: number;
  sessionDate: string;
  sessionTime: string;
  sessionMode: TimerMode;
  taskName: string;
  currentProject: string;
}

export type TimerTickCallback = (state: TimerState) => void;
export type PhaseCompleteCallback = (completed: PhaseType, next: PhaseType, durationMinutes: number) => void;

function timeFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function calcPhaseDuration(phase: PhaseType, settings: TimerSettings, countdownSec: number): number {
  switch (phase) {
    case 'work': return settings.workMinutes * 60;
    case 'shortBreak': return settings.shortBreakMinutes * 60;
    case 'longBreak': return settings.longBreakMinutes * 60;
    case 'countdown': return countdownSec;
    case 'stopwatch': return 0;
    default: return settings.workMinutes * 60;
  }
}

function calcPhase(mode: TimerMode, cycleIndex: number, cycles: number): PhaseType {
  if (mode !== 'pomodoro') return mode === 'stopwatch' ? 'stopwatch' : 'countdown';
  if (cycleIndex === 0) return 'idle';
  const pos = ((cycleIndex - 1) % (cycles * 2 - 1)) + 1;
  if (pos % 2 === 1) return 'work';
  if (pos === cycles * 2 - 1) return 'longBreak';
  return 'shortBreak';
}

export class TomatoTimer {
  private settings: TimerSettings;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  private onTickCb: TimerTickCallback | null = null;
  private onPhaseCb: PhaseCompleteCallback | null = null;

  private state: CoreState;

  constructor(settings: TimerSettings) {
    this.settings = settings;
    this.state = this.createIdleState('pomodoro');
  }

  private createIdleState(mode: TimerMode): CoreState {
    return {
      mode,
      phase: 'idle',
      status: 'idle',
      cycleIndex: 0,
      segmentStartMs: 0,
      accumulatedMs: 0,
      countdownSec: mode === 'countdown' ? this.settings.countdownMinutes * 60 : 0,
      totalPhaseSeconds: 0,
      completedTomatos: 0,
      sessionDate: '',
      sessionTime: '',
      sessionMode: mode,
      taskName: '',
      currentProject: '',
    };
  }

  onTick(cb: TimerTickCallback): void { this.onTickCb = cb; }
  onPhaseComplete(cb: PhaseCompleteCallback): void { this.onPhaseCb = cb; }

  getState(): TimerState {
    const total = calcPhaseDuration(this.state.phase, this.settings, this.state.countdownSec);
    const elapsedSec = Math.floor(this.getElapsedMs() / 1000);
    return {
      mode: this.state.mode,
      phase: this.state.phase,
      status: this.state.status,
      remainingSeconds: this.state.mode === 'stopwatch' ? elapsedSec : Math.max(0, Math.round(total - this.getElapsedMs() / 1000)),
      totalPhaseSeconds: total,
      completedTomatos: this.state.completedTomatos,
      cycleIndex: this.state.cycleIndex,
      taskName: this.state.taskName,
      currentProject: this.state.currentProject,
    };
  }

  getMode(): TimerMode { return this.state.mode; }
  getTaskName(): string { return this.state.taskName; }
  getCurrentProject(): string { return this.state.currentProject; }
  getSessionStartDate(): string { return this.state.sessionDate; }
  getSessionStartTime(): string { return this.state.sessionTime; }
  getSessionStartMode(): TimerMode { return this.state.sessionMode; }
  getSegmentStartMs(): number { return this.state.segmentStartMs; }
  getAccumulatedMs(): number { return this.state.accumulatedMs; }

  setCurrentProject(project: string): void {
    this.state.currentProject = project;
    this.notifyTick();
  }

  setTaskName(name: string): void {
    this.state.taskName = name;
    this.notifyTick();
  }

  setMode(mode: TimerMode): void {
    this.state = this.createIdleState(mode);
    this.notifyTick();
  }

  setCountdownMinutes(minutes: number): void {
    this.state.countdownSec = minutes * 60;
    this.notifyTick();
  }

  setCountdownSeconds(seconds: number): void {
    this.state.countdownSec = seconds;
    this.notifyTick();
  }

  start(): void {
    if (this.state.status === 'running') return;
    const now = new Date();
    if (this.state.status === 'idle') {
      this.state.sessionDate = todayString();
      this.state.sessionTime = timeFromDate(now);
      this.state.sessionMode = this.state.mode;
      if (this.state.mode === 'pomodoro') {
        this.state.cycleIndex = 1;
        this.state.phase = calcPhase('pomodoro', 1, this.settings.cycles);
      } else {
        this.state.phase = this.state.mode === 'stopwatch' ? 'stopwatch' : 'countdown';
      }
    }
    this.state.segmentStartMs = Date.now();
    this.state.status = 'running';
    this.startInterval();
    this.notifyTick();
  }

  stop(): void {
    if (this.state.status === 'idle') return;
    this.stopInterval();
    const donePhase = this.state.phase;
    const durationMin = Math.max(1, Math.round(this.getElapsedMs() / 1000 / 60));

    // 保存需要在 reset 后保留的字段
    const savedCompleted = this.state.completedTomatos;
    const savedTask = this.state.taskName;
    const savedProject = this.state.currentProject;
    const savedMode = this.state.mode;

    this.resetToIdle();
    this.state.completedTomatos = savedCompleted;
    this.state.taskName = savedTask;
    this.state.currentProject = savedProject;
    this.state.mode = savedMode;

    this.notifyTick();
    this.onPhaseCb?.(donePhase, 'idle', durationMin);
  }

  reset(): void {
    this.stopInterval();
    this.state = this.createIdleState(this.state.mode);
    this.notifyTick();
  }

  skip(): void {
    if (this.state.status === 'idle') return;
    this.stopInterval();
    this.resetToIdle();
    this.notifyTick();
  }

  destroy(): void {
    this.stopInterval();
    this.onTickCb = null;
    this.onPhaseCb = null;
  }

  updateSettings(settings: Partial<TimerSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.notifyTick();
  }

  getElapsedMs(): number {
    if (this.state.status === 'idle') return 0;
    return this.state.accumulatedMs + (Date.now() - this.state.segmentStartMs);
  }

  private startInterval(): void {
    this.stopInterval();
    this.intervalId = -1;
    this.scheduleTick();
  }

  private stopInterval(): void {
    if (this.intervalId !== null && this.intervalId !== -1) {
      clearTimeout(this.intervalId);
    }
    this.intervalId = null;
  }

  private scheduleTick(): void {
    if (this.intervalId === null) return;
    const drift = Date.now() % 1000;
    this.intervalId = setTimeout(() => this.tick(), Math.max(16, 1000 - drift));
  }

  private tick(): void {
    if (this.state.mode === 'stopwatch') {
      this.notifyTick();
      this.scheduleTick();
      return;
    }
    if (this.getRemainingMs() <= 0) {
      const donePhase = this.state.phase;
      this.stopInterval();
      const durationMin = Math.round(calcPhaseDuration(donePhase, this.settings, this.state.countdownSec) / 60);
      this.handlePhaseComplete(donePhase, durationMin);
    } else {
      this.notifyTick();
      this.scheduleTick();
    }
  }

  private getRemainingMs(): number {
    const total = calcPhaseDuration(this.state.phase, this.settings, this.state.countdownSec) * 1000;
    return total - this.getElapsedMs();
  }

  private handlePhaseComplete(donePhase: PhaseType, durationMinutes: number): void {
    if (this.state.mode === 'stopwatch') {
      this.resetToIdle();
      this.onPhaseCb?.(donePhase, 'idle', durationMinutes);
      this.notifyTick();
      return;
    }
    if (donePhase === 'work') {
      this.state.completedTomatos += 1;
    }
    const nextPhase = calcPhase('pomodoro', this.state.cycleIndex + 1, this.settings.cycles);
    this.onPhaseCb?.(donePhase, nextPhase, durationMinutes);
    if (this.settings.autoStartNextPhase && this.state.mode === 'pomodoro') {
      this.state.cycleIndex += 1;
      this.state.phase = calcPhase('pomodoro', this.state.cycleIndex, this.settings.cycles);
      this.state.status = 'running';
      this.state.segmentStartMs = Date.now();
      this.state.accumulatedMs = 0;
      this.startInterval();
      this.notifyTick();
    } else {
      this.resetToIdle();
      this.notifyTick();
    }
  }

  private resetToIdle(): void {
    this.state.status = 'idle';
    this.state.phase = 'idle';
    this.state.cycleIndex = 0;
    this.state.accumulatedMs = 0;
    this.state.segmentStartMs = 0;
  }

  applySyncState(patch: Partial<CoreState>): void {
    if (patch.mode !== undefined) this.state.mode = patch.mode;
    if (patch.phase !== undefined) this.state.phase = patch.phase;
    if (patch.status !== undefined) this.state.status = patch.status;
    if (patch.cycleIndex !== undefined) this.state.cycleIndex = patch.cycleIndex;
    if (patch.segmentStartMs !== undefined) this.state.segmentStartMs = patch.segmentStartMs;
    if (patch.accumulatedMs !== undefined) this.state.accumulatedMs = patch.accumulatedMs;
    if (patch.countdownSec !== undefined) this.state.countdownSec = patch.countdownSec;
    if (patch.totalPhaseSeconds !== undefined) this.state.totalPhaseSeconds = patch.totalPhaseSeconds;
    if (patch.completedTomatos !== undefined) this.state.completedTomatos = patch.completedTomatos;
    if (patch.sessionDate !== undefined) this.state.sessionDate = patch.sessionDate;
    if (patch.sessionTime !== undefined) this.state.sessionTime = patch.sessionTime;
    if (patch.sessionMode !== undefined) this.state.sessionMode = patch.sessionMode;
    if (patch.taskName !== undefined) this.state.taskName = patch.taskName;
    if (patch.currentProject !== undefined) this.state.currentProject = patch.currentProject;

    if (this.state.status === 'running' && this.intervalId === null) {
      this.startInterval();
    } else if (this.state.status !== 'running' && this.intervalId !== null) {
      this.stopInterval();
    }

    this.notifyTick();
  }

  private notifyTick(): void {
    this.onTickCb?.(this.getState());
  }
}
