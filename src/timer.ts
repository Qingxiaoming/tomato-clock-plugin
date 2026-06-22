export type PhaseType = 'work' | 'shortBreak' | 'longBreak' | 'idle' | 'stopwatch' | 'countdown';
export type TimerMode = 'pomodoro' | 'stopwatch' | 'countdown';
export type TimerStatus = 'idle' | 'running';

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
    status: TimerStatus;
    remainingSeconds: number;
    elapsedSeconds: number;
    completedTomatos: number;
    taskName: string;
    currentProject: string;
    totalPhaseSeconds: number;
}

export interface RecoveryData {
    mode: TimerMode;
    phase: PhaseType;
    /** 旧版 recovery 可能包含 paused，新版不再支持 */
    status: TimerStatus | 'paused';
    accumulatedMs: number;
    cycleIndex: number;
    taskName: string;
    currentProject: string;
    lastUpdated: number;
    sessionDate: string;
    sessionTime: string;
    countdownSeconds: number;
    completedTomatos: number;
    sessionStartMode: TimerMode;
}

export type TimerTickCallback = (state: TimerState) => void;
export type PhaseCompleteCallback = (completed: PhaseType, next: PhaseType, durationMinutes: number) => void;
export type DayCrossCallback = (payload: {
    date: string;
    startTime: string;
    endTime: string;
    duration: number;
    mode: TimerMode;
    taskName: string;
    currentProject: string;
}) => void;

/**
 * 计时器核心状态
 */
interface CoreState {
    mode: TimerMode;
    status: TimerStatus;
    phase: PhaseType;
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

/**
 * 纯函数：根据 cycleIndex 和 cycles 计算当前 phase
 */
function calcPhase(mode: TimerMode, cycleIndex: number, cycles: number): PhaseType {
    if (cycleIndex === 0) return 'idle';
    if (mode === 'stopwatch') return 'stopwatch';
    if (mode === 'countdown') return 'countdown';
    // 番茄钟: 1=work, 2=shortBreak, 3=work, 4=shortBreak, ..., 6=longBreak (cycles=3)
    if (cycleIndex % 2 === 1) return 'work';
    if (cycleIndex % (cycles * 2) === 0) return 'longBreak';
    return 'shortBreak';
}

/**
 * 纯函数：计算 phase 的总时长（秒）
 */
function calcPhaseDuration(phase: PhaseType, settings: TomatoTimerSettings, countdownSec: number): number {
    switch (phase) {
        case 'work': return settings.workMinutes * 60;
        case 'shortBreak': return settings.shortBreakMinutes * 60;
        case 'longBreak': return settings.longBreakMinutes * 60;
        case 'countdown': return countdownSec;
        case 'idle':
            // 就绪时显示默认时长
            return 0;
        default: return 0;
    }
}



export class TomatoTimer {
    private settings: TomatoTimerSettings;
    private intervalId: number | null = null;

    private onTickCb: TimerTickCallback | null = null;
    private onPhaseCb: PhaseCompleteCallback | null = null;
    private onDayCrossCb: DayCrossCallback | null = null;

    // 核心状态
    private state: CoreState;

    constructor(settings: TomatoTimerSettings) {
        this.settings = settings;
        this.state = this.createIdleState('pomodoro');
    }

    private createIdleState(mode: TimerMode): CoreState {
        return {
            mode,
            status: 'idle',
            phase: 'idle',
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

    // ========== 公共 API ==========

    onTick(cb: TimerTickCallback): void { this.onTickCb = cb; }
    onPhaseComplete(cb: PhaseCompleteCallback): void { this.onPhaseCb = cb; }
    onDayCross(cb: DayCrossCallback): void { this.onDayCrossCb = cb; }

    updateSettings(settings: TomatoTimerSettings): void {
        this.settings = settings;
        if (this.state.status === 'idle' && this.state.mode === 'countdown') {
            this.state.countdownSec = settings.countdownMinutes * 60;
        }
        this.notifyTick();
    }

    setMode(mode: TimerMode): void {
        if (this.state.status === 'running') return;
        this.state = this.createIdleState(mode);
        this.stopInterval();
        this.notifyTick();
    }

    getMode(): TimerMode { return this.state.mode; }

    setCountdownMinutes(minutes: number): void {
        this.setCountdownSeconds(minutes * 60);
    }

    setCountdownSeconds(seconds: number): void {
        this.state.countdownSec = seconds;
        if (this.state.status === 'idle') {
            this.notifyTick();
        }
    }

    setTaskName(name: string): void { this.state.taskName = name; }
    getTaskName(): string { return this.state.taskName; }
    setCurrentProject(project: string): void { this.state.currentProject = project; }
    getCurrentProject(): string { return this.state.currentProject; }
    getSessionStartDate(): string { return this.state.sessionDate; }
    getSessionStartTime(): string { return this.state.sessionTime; }
    getSessionStartMode(): TimerMode { return this.state.sessionMode; }
    getSegmentStartMs(): number { return this.state.segmentStartMs; }
    getAccumulatedMs(): number { return this.state.accumulatedMs; }

    adjustSessionStart(minuteDelta: number): void {
        const [h, m] = this.state.sessionTime.split(':').map(Number);
        let totalMin = h * 60 + m + minuteDelta;
        const d = new Date(this.state.sessionDate + 'T00:00:00');
        while (totalMin < 0) {
            d.setDate(d.getDate() - 1);
            totalMin += 1440;
        }
        while (totalMin >= 1440) {
            d.setDate(d.getDate() + 1);
            totalMin -= 1440;
        }
        this.state.sessionDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        this.state.sessionTime = `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;

        if (this.state.status === 'running') {
            this.state.segmentStartMs += minuteDelta * 60000;
        }
        this.notifyTick();
    }

    // ========== 核心操作 ==========

    start(): void {
        if (this.state.status === 'running') return;

        const now = Date.now();

        if (this.state.mode === 'pomodoro') {
            this.state.cycleIndex += 1;
            this.state.phase = calcPhase('pomodoro', this.state.cycleIndex, this.settings.cycles);
        } else {
            this.state.cycleIndex = 1;
            this.state.phase = this.state.mode === 'stopwatch' ? 'stopwatch' : 'countdown';
        }

        this.state.status = 'running';
        this.state.segmentStartMs = now;
        this.state.accumulatedMs = 0;
        const n = new Date();
        this.state.sessionDate = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
        this.state.sessionTime = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
        this.state.sessionMode = this.state.mode;

        this.startInterval();
        this.notifyTick();
    }

    stop(): void {
        if (this.state.status === 'idle') return;

        this.stopInterval();

        const donePhase = this.state.phase;
        const elapsedSec = this.getElapsedSec();
        const durationMin = Math.max(1, Math.round(elapsedSec / 60));

        // 保留需要继承的字段
        const savedCompleted = this.state.completedTomatos;
        const savedTask = this.state.taskName;
        const savedProject = this.state.currentProject;

        // 重置为 idle
        this.state = this.createIdleState(this.state.mode);
        this.state.completedTomatos = savedCompleted;
        this.state.taskName = savedTask;
        this.state.currentProject = savedProject;

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
        const donePhase = this.state.phase;
        const durationMin = Math.max(1, Math.round(this.getElapsedSec() / 60));

        this.handlePhaseComplete(donePhase, durationMin);
    }

    destroy(): void {
        this.stopInterval();
        this.onTickCb = null;
        this.onPhaseCb = null;
    }

    // ========== 状态查询 ==========

    getState(): TimerState {
        const elapsedSec = this.getElapsedSec();
        const remainingMs = this.getRemainingMs();
        let totalSec = calcPhaseDuration(this.state.phase, this.settings, this.state.countdownSec);

        // 就绪时显示默认时长
        if (this.state.status === 'idle') {
            if (this.state.mode === 'pomodoro') totalSec = this.settings.workMinutes * 60;
            else if (this.state.mode === 'countdown') totalSec = this.state.countdownSec;
        }

        return {
            phase: this.state.phase,
            mode: this.state.mode,
            status: this.state.status,
            remainingSeconds: this.state.mode === 'stopwatch' ? 0 : Math.floor(remainingMs / 1000),
            elapsedSeconds: elapsedSec,
            completedTomatos: this.state.completedTomatos,
            taskName: this.state.taskName,
            currentProject: this.state.currentProject,
            totalPhaseSeconds: totalSec,
        };
    }

    // ========== 恢复数据 ==========

    getRecoveryData(): RecoveryData {
        return {
            mode: this.state.mode,
            phase: this.state.phase,
            status: this.state.status,
            accumulatedMs: this.state.accumulatedMs + (this.state.status === 'running' ? Date.now() - this.state.segmentStartMs : 0),
            cycleIndex: this.state.cycleIndex,
            taskName: this.state.taskName,
            currentProject: this.state.currentProject,
            lastUpdated: Date.now(),
            sessionDate: this.state.sessionDate,
            sessionTime: this.state.sessionTime,
            countdownSeconds: this.state.countdownSec,
            completedTomatos: this.state.completedTomatos,
            sessionStartMode: this.state.sessionMode,
        };
    }

    restoreFromRecovery(data: RecoveryData): void {
        this.state.mode = data.mode;
        this.state.phase = data.phase;
        // 旧版 recovery 可能保存 paused 状态，新版不再支持暂停，统一视为 idle
        this.state.status = data.status === 'paused' ? 'idle' : data.status;
        this.state.cycleIndex = data.cycleIndex;
        this.state.taskName = data.taskName;
        this.state.currentProject = data.currentProject ?? '';
        this.state.sessionDate = data.sessionDate;
        this.state.sessionTime = data.sessionTime;
        this.state.sessionMode = data.sessionStartMode ?? data.mode;
        this.state.countdownSec = (typeof data.countdownSeconds === 'number' && data.countdownSeconds > 0)
            ? data.countdownSeconds
            : this.settings.countdownMinutes * 60;
        this.state.completedTomatos = data.completedTomatos;
        this.state.accumulatedMs = data.accumulatedMs;

        if (data.status === 'running') {
            const now = Date.now();
            const delta = now - data.lastUpdated;
            this.state.accumulatedMs += delta;
            this.state.segmentStartMs = now;

            // 检查是否已超时（正计时永不过期）
            if (this.state.mode !== 'stopwatch') {
                const total = calcPhaseDuration(this.state.phase, this.settings, this.state.countdownSec) * 1000;
                if (this.state.accumulatedMs >= total) {
                    if (data.phase === 'work') this.state.completedTomatos += 1;
                    this.resetToIdle();
                    this.notifyTick();
                    return;
                }
            }

            // 恢复后若已跨天，立即结束前一天并开始新一天
            if (this.checkDayCross()) {
                this.handleDayCross();
                return;
            }

            this.startInterval();
        } else {
            this.state.segmentStartMs = 0;
        }

        this.notifyTick();
    }

    // ========== 私有方法 ==========

    getElapsedMs(): number {
        if (this.state.status === 'idle') return 0;
        return this.state.accumulatedMs + (Date.now() - this.state.segmentStartMs);
    }

    private getElapsedSec(): number {
        return Math.floor(this.getElapsedMs() / 1000);
    }

    private getRemainingMs(): number {
        if (this.state.mode === 'stopwatch') return 0;
        const total = calcPhaseDuration(this.state.phase, this.settings, this.state.countdownSec) * 1000;
        return Math.max(0, total - this.getElapsedMs());
    }

    private startInterval(): void {
        this.stopInterval();
        this.intervalId = -1;
        this.scheduleTick();
    }

    private stopInterval(): void {
        if (this.intervalId !== null && this.intervalId !== -1) {
            window.clearTimeout(this.intervalId);
        }
        this.intervalId = null;
    }

    private scheduleTick(): void {
        if (this.intervalId === null) return;
        const drift = Date.now() % 1000;
        this.intervalId = window.setTimeout(() => this.tick(), Math.max(16, 1000 - drift));
    }

    private tick(): void {
        if (this.checkSpecialEvents()) return;

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

    private todayString(): string {
        const n = new Date();
        return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    }

    private timeToMinutes(time: string): number {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    }

    /** 检查闹钟、跨天等特殊事件；返回 true 表示已处理并中断当前 tick */
    private checkSpecialEvents(): boolean {
        return this.checkDayCross();
    }

    private checkDayCross(): boolean {
        return this.state.status === 'running' && this.state.sessionDate !== '' && this.state.sessionDate !== this.todayString();
    }

    /** 跨天处理：结束前一天 phase 并立即开始新一天同一 mode */
    private handleDayCross(): void {
        this.stopInterval();

        this.onDayCrossCb?.({
            date: this.state.sessionDate,
            startTime: this.state.sessionTime,
            endTime: '23:59',
            duration: 1440 - this.timeToMinutes(this.state.sessionTime),
            mode: this.state.mode,
            taskName: this.state.taskName,
            currentProject: this.state.currentProject,
        });

        // 保留必要字段，模拟 stop 后立刻 start
        const savedMode = this.state.mode;
        const savedCompleted = this.state.completedTomatos;
        const savedTask = this.state.taskName;
        const savedProject = this.state.currentProject;

        this.state = this.createIdleState(savedMode);
        this.state.completedTomatos = savedCompleted;
        this.state.taskName = savedTask;
        this.state.currentProject = savedProject;

        this.start();
    }

    /**
     * 从同步状态直接应用状态，不触发 onPhaseCb。
     * 用于多端同步时接收远程状态更新。
     */
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

        // 同步状态后校正 interval
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
