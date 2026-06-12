export type PhaseType = 'work' | 'shortBreak' | 'longBreak' | 'idle' | 'stopwatch' | 'countdown';
export type TimerMode = 'pomodoro' | 'stopwatch' | 'countdown';

export interface TomatoTimerSettings {
    workMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    cycles: number;
    autoStartNextPhase: boolean;
    countdownMinutes: number;
}

export interface TimerState {
    phase: PhaseType;
    mode: TimerMode;
    reps: number;
    remainingSeconds: number;
    elapsedSeconds: number;
    isRunning: boolean;
    completedTomatos: number;
    taskName: string;
    currentProject: string;
}

export interface RecoveryData {
    mode: TimerMode;
    phase: PhaseType;
    isRunning: boolean;
    startTime: number;
    accumulatedMs: number;
    taskName: string;
    currentProject: string;
    lastUpdated: number;
    sessionStartDate: string;
    sessionStartTime: string;
    countdownSeconds: number;
    reps: number;
    completedTomatos: number;
    sessionStartMode: TimerMode;
}

export type TimerTickCallback = (state: TimerState) => void;
export type PhaseCompleteCallback = (completed: PhaseType, next: PhaseType, durationMinutes: number) => void;

export class TomatoTimer {
    private settings: TomatoTimerSettings;
    private reps = 0;
    private isRunning = false;
    private intervalId: number | null = null;
    private completedTomatos = 0;
    private startTime: number = 0;
    private accumulatedMs: number = 0;

    private mode: TimerMode = 'pomodoro';
    private countdownSeconds: number = 0;
    private taskName: string = '';
    private currentProject: string = '';
    private sessionStartDate: string = '';
    private sessionStartTime: string = '';
    private sessionStartMode: TimerMode = 'pomodoro';

    private onTickCb: TimerTickCallback | null = null;
    private onPhaseCb: PhaseCompleteCallback | null = null;

    constructor(settings: TomatoTimerSettings) {
        this.settings = settings;
        this.countdownSeconds = settings.countdownMinutes * 60;
    }

    updateSettings(settings: TomatoTimerSettings): void {
        this.settings = settings;
        if (this.mode === 'countdown' && this.reps === 0) {
            this.countdownSeconds = settings.countdownMinutes * 60;
        }
    }

    onTick(cb: TimerTickCallback): void { this.onTickCb = cb; }
    onPhaseComplete(cb: PhaseCompleteCallback): void { this.onPhaseCb = cb; }

    setMode(mode: TimerMode): void {
        this.mode = mode;
        if (mode === 'countdown') {
            this.countdownSeconds = this.settings.countdownMinutes * 60;
        }
    }

    getMode(): TimerMode {
        return this.mode;
    }

    setCountdownMinutes(minutes: number): void {
        this.countdownSeconds = minutes * 60;
    }

    setTaskName(name: string): void {
        this.taskName = name;
    }

    getTaskName(): string {
        return this.taskName;
    }

    setCurrentProject(project: string): void {
        this.currentProject = project;
    }

    getCurrentProject(): string {
        return this.currentProject;
    }

    getSessionStartDate(): string {
        return this.sessionStartDate;
    }

    getSessionStartTime(): string {
        return this.sessionStartTime;
    }

    getSessionStartMode(): TimerMode {
        return this.sessionStartMode;
    }

    start(): void {
        if (this.isRunning) return;
        if (this.mode === 'pomodoro') {
            this.reps += 1;
        } else {
            this.reps = 1;
        }
        this.isRunning = true;
        this.accumulatedMs = 0;
        this.startTime = Date.now();
        const now = new Date();
        this.sessionStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        this.sessionStartTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        this.sessionStartMode = this.mode;
        this.startInterval();
        this.notifyTick();
    }

    pause(): void {
        if (!this.isRunning) return;
        this.accumulatedMs += Date.now() - this.startTime;
        this.isRunning = false;
        this.stopInterval();
        this.notifyTick();
    }

    resume(): void {
        if (this.isRunning) return;
        if (this.reps === 0) return;
        if (this.mode !== 'stopwatch' && this.getRemainingMs() <= 0) return;
        this.isRunning = true;
        this.startTime = Date.now();
        this.startInterval();
        this.notifyTick();
    }

    reset(): void {
        this.stopInterval();
        this.reps = 0;
        this.isRunning = false;
        this.accumulatedMs = 0;
        this.startTime = 0;
        this.sessionStartDate = '';
        this.sessionStartTime = '';
        this.sessionStartMode = this.mode;
        this.notifyTick();
    }

    destroy(): void {
        this.stopInterval();
        this.onTickCb = null;
        this.onPhaseCb = null;
    }

    getRecoveryData(): RecoveryData {
        return {
            mode: this.mode,
            phase: this.currentPhase(),
            isRunning: this.isRunning,
            startTime: this.startTime,
            accumulatedMs: this.isRunning
                ? this.accumulatedMs + (Date.now() - this.startTime)
                : this.accumulatedMs,
            taskName: this.taskName,
            currentProject: this.currentProject,
            lastUpdated: Date.now(),
            sessionStartDate: this.sessionStartDate,
            sessionStartTime: this.sessionStartTime,
            countdownSeconds: this.countdownSeconds,
            reps: this.reps,
            completedTomatos: this.completedTomatos,
            sessionStartMode: this.sessionStartMode,
        };
    }

    restoreFromRecovery(data: RecoveryData): void {
        this.mode = data.mode;
        this.reps = data.reps;
        this.completedTomatos = data.completedTomatos;
        this.taskName = data.taskName;
        this.currentProject = data.currentProject ?? '';
        this.sessionStartDate = data.sessionStartDate;
        this.sessionStartTime = data.sessionStartTime;
        this.sessionStartMode = data.sessionStartMode ?? data.mode;
        this.countdownSeconds = data.countdownSeconds;
        this.accumulatedMs = data.accumulatedMs;

        if (data.isRunning) {
            const now = Date.now();
            const delta = now - data.lastUpdated;
            this.accumulatedMs += delta;
            this.startTime = now;

            // Check if already timed out (skip stopwatch which never times out)
            if (this.mode !== 'stopwatch') {
                const total = this.phaseDuration(this.currentPhase()) * 1000;
                if (this.accumulatedMs >= total) {
                    // Auto-end: treat as natural completion
                    this.isRunning = false;
                    const done = this.currentPhase();
                    if (done === 'work') this.completedTomatos += 1;
                    const durationMin = Math.round(this.phaseDuration(done) / 60);
                    this.handleEnd(done, durationMin);
                    return;
                }
            }

            this.isRunning = true;
            this.startInterval();
        } else {
            this.isRunning = false;
            this.startTime = 0;
        }
        this.notifyTick();
    }

    skip(): void {
        if (this.reps === 0) return;
        this.stopInterval();
        const done = this.currentPhase();
        this.isRunning = false;
        const elapsedSec = Math.floor((this.accumulatedMs + (Date.now() - this.startTime)) / 1000);
        const durationMin = Math.max(1, Math.round(elapsedSec / 60));
        this.notifyTick();
        this.handleEnd(done, durationMin);
    }

    getState(): TimerState {
        const elapsed = Math.floor((this.accumulatedMs + (this.isRunning ? Date.now() - this.startTime : 0)) / 1000);
        return {
            phase: this.currentPhase(),
            mode: this.mode,
            reps: this.reps,
            remainingSeconds: this.mode === 'stopwatch' ? 0 : Math.floor(this.getRemainingMs() / 1000),
            elapsedSeconds: elapsed,
            isRunning: this.isRunning,
            completedTomatos: this.completedTomatos,
            taskName: this.taskName,
            currentProject: this.currentProject,
        };
    }

    private getRemainingMs(): number {
        const elapsed = this.isRunning ? (Date.now() - this.startTime) : 0;
        const total = this.phaseDuration(this.currentPhase()) * 1000;
        return Math.max(0, total - this.accumulatedMs - elapsed);
    }

    private currentPhase(): PhaseType {
        if (this.reps === 0) return 'idle';
        if (this.mode === 'stopwatch') return 'stopwatch';
        if (this.mode === 'countdown') return 'countdown';
        if (this.reps % (this.settings.cycles * 2) === 0) return 'longBreak';
        if (this.reps % 2 === 0) return 'shortBreak';
        return 'work';
    }

    private nextPhase(): PhaseType {
        if (this.mode !== 'pomodoro') return 'idle';
        const n = this.reps + 1;
        if (n % (this.settings.cycles * 2) === 0) return 'longBreak';
        if (n % 2 === 0) return 'shortBreak';
        return 'work';
    }

    private phaseDuration(phase: PhaseType): number {
        switch (phase) {
            case 'work': return this.settings.workMinutes * 60;
            case 'shortBreak': return this.settings.shortBreakMinutes * 60;
            case 'longBreak': return this.settings.longBreakMinutes * 60;
            case 'countdown': return this.countdownSeconds;
            default: return 0;
        }
    }

    private startInterval(): void {
        this.stopInterval();
        this.intervalId = window.setInterval(() => this.tick(), 1000);
    }

    private stopInterval(): void {
        if (this.intervalId !== null) {
            window.clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    private tick(): void {
        if (this.mode === 'stopwatch') {
            this.notifyTick();
            return;
        }
        if (this.getRemainingMs() <= 0) {
            const done = this.currentPhase();
            this.stopInterval();
            this.isRunning = false;
            if (done === 'work') this.completedTomatos += 1;
            const durationMin = Math.round(this.phaseDuration(done) / 60);
            this.notifyTick();
            this.handleEnd(done, durationMin);
        } else {
            this.notifyTick();
        }
    }

    private handleEnd(done: PhaseType, durationMinutes: number): void {
        if (this.mode === 'stopwatch') {
            this.onPhaseCb?.(done, 'idle', durationMinutes);
            this.reps = 0;
            return;
        }
        const next = this.nextPhase();
        this.onPhaseCb?.(done, next, durationMinutes);
        if (this.settings.autoStartNextPhase && this.mode === 'pomodoro') {
            this.start();
        }
    }

    private notifyTick(): void {
        this.onTickCb?.(this.getState());
    }
}
