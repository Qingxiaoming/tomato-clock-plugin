import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TomatoPlugin from './main';
import type { TimerState, PhaseType, TimerMode } from './timer';
import { getDayMinutes, todayString } from './log';

export const VIEW_TYPE_Tomato_Compact = 'Tomato-timer-compact-view';

export class TomatoTimerCompactView extends ItemView {
    private plugin: TomatoPlugin;

    private timerDisplayEl!: HTMLElement;
    private statusTextEl!: HTMLElement;
    private todayMinutesEl!: HTMLElement;
    private phaseDotEls: HTMLElement[] = [];
    private dotCol!: HTMLElement;
    private startPauseBtn!: HTMLButtonElement;
    private skipBtn!: HTMLButtonElement;
    private resetBtn!: HTMLButtonElement;
    private taskInput!: HTMLInputElement;
    private projectSelect!: HTMLSelectElement;
    private modeBtns!: Record<TimerMode, HTMLButtonElement>;
    private lastMinutesRefresh = 0;
    private uiBuilt = false;

    constructor(leaf: WorkspaceLeaf, plugin: TomatoPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_Tomato_Compact; }
    getDisplayText(): string { return this.plugin.t('panel.title'); }
    getIcon(): string { return 'timer'; }

    async onOpen(): Promise<void> {
        this.buildUI();
        this.updateTimerUI(this.plugin.timer.getState());
        void this.refreshTodayMinutes();
        // Allow this sidebar leaf to shrink below Obsidian's default min-height
        const leafEl = this.containerEl.closest('.workspace-leaf');
        if (leafEl) leafEl.addClass('Tomato-compact-leaf');
    }

    async onClose(): Promise<void> {
        this.uiBuilt = false;
        const leafEl = this.containerEl.closest('.workspace-leaf');
        if (leafEl) leafEl.removeClass('Tomato-compact-leaf');
    }

    private buildUI(): void {
        if (this.uiBuilt) return;
        this.uiBuilt = true;
        const root = this.contentEl;
        root.empty();
        root.addClass('Tomato-compact-container');

        /* ── Top: project select + task input ── */
        const topRow = root.createDiv({ cls: 'Tomato-compact-top-row' });
        this.projectSelect = topRow.createEl('select', { cls: 'Tomato-compact-project-select' });
        this.registerDomEvent(this.projectSelect, 'change', () => {
            this.plugin.timer.setCurrentProject(this.projectSelect.value);
        });
        this.renderProjectSelect();

        this.taskInput = topRow.createEl('input', {
            cls: 'Tomato-compact-task-input',
            attr: { placeholder: this.plugin.t('panel.taskPlaceholder') },
        });
        this.registerDomEvent(this.taskInput, 'input', () => {
            this.plugin.timer.setTaskName(this.taskInput.value);
        });

        /* ── Main row: dots | clock | buttons | modes ── */
        const mainRow = root.createDiv({ cls: 'Tomato-compact-row' });

        // Left: vertical dots
        this.dotCol = mainRow.createDiv({ cls: 'Tomato-compact-dot-col' });
        this.phaseDotEls = [];
        for (let i = 0; i < this.plugin.settings.cycles; i++) {
            this.phaseDotEls.push(this.dotCol.createDiv({ cls: 'Tomato-compact-dot' }));
        }

        // Center: clock (dblclick opens full panel)
        const timeCol = mainRow.createDiv({ cls: 'Tomato-compact-time-col' });
        this.timerDisplayEl = timeCol.createDiv({ cls: 'Tomato-compact-display', text: '--' });
        timeCol.addEventListener('dblclick', () => {
            void this.plugin.activateFullView();
        });

        // Right: vertical control buttons
        const btnCol = mainRow.createDiv({ cls: 'Tomato-compact-btn-col' });
        this.startPauseBtn = btnCol.createEl('button', {
            cls: 'Tomato-compact-icon-btn Tomato-compact-btn-primary',
            text: '▶',
        });
        this.registerDomEvent(this.startPauseBtn, 'click', () => this.onStartPause());

        this.skipBtn = btnCol.createEl('button', {
            cls: 'Tomato-compact-icon-btn Tomato-compact-btn-secondary',
            text: '⏹',
        });
        this.skipBtn.disabled = true;
        this.registerDomEvent(this.skipBtn, 'click', () => this.plugin.timer.skip());

        this.resetBtn = btnCol.createEl('button', {
            cls: 'Tomato-compact-icon-btn Tomato-compact-btn-danger',
            text: '🔄',
        });
        this.registerDomEvent(this.resetBtn, 'click', () => this.plugin.timer.reset());

        // Far right: vertical mode buttons
        const modeCol = mainRow.createDiv({ cls: 'Tomato-compact-mode-col' });
        const modes: { mode: TimerMode; icon: string }[] = [
            { mode: 'pomodoro', icon: '🍅' },
            { mode: 'stopwatch', icon: '⏱️' },
            { mode: 'countdown', icon: '⏳' },
        ];
        this.modeBtns = { pomodoro: undefined!, stopwatch: undefined!, countdown: undefined! };
        for (const { mode, icon } of modes) {
            const btn = modeCol.createEl('button', {
                cls: 'Tomato-compact-mode-btn',
                text: icon,
            });
            this.registerDomEvent(btn, 'click', () => {
                this.plugin.timer.setMode(mode);
                this.plugin.timer.reset();
                this.plugin.refreshAllViews?.();
            });
            this.modeBtns[mode] = btn;
        }

        /* ── Info row: status (left) | today minutes (right) ── */
        const infoRow = root.createDiv({ cls: 'Tomato-compact-info-row' });
        this.statusTextEl = infoRow.createDiv({ cls: 'Tomato-compact-status', text: this.plugin.t('panel.status.ready') });
        this.todayMinutesEl = infoRow.createDiv({ cls: 'Tomato-compact-today', text: '' });
    }

    private onStartPause(): void {
        const s = this.plugin.timer.getState();
        if (s.phase === 'idle') this.plugin.timer.start();
        else if (s.isRunning) this.plugin.timer.pause();
        else this.plugin.timer.resume();
    }

    updateTimerUI(state: TimerState): void {
        const displaySeconds = state.mode === 'stopwatch' ? state.elapsedSeconds : state.remainingSeconds;
        this.timerDisplayEl.setText(this.fmtTime(displaySeconds));
        this.statusTextEl.setText(this.phaseLabel(state));
        this.contentEl.setAttribute('data-phase', state.phase);

        // Mode buttons highlight
        (Object.keys(this.modeBtns) as TimerMode[]).forEach(mode => {
            this.modeBtns[mode].toggleClass('active', state.mode === mode);
        });

        // Icon buttons
        if (state.phase === 'idle') {
            this.startPauseBtn.setText('▶');
            this.skipBtn.disabled = true;
        } else if (state.isRunning) {
            this.startPauseBtn.setText('⏸');
            this.skipBtn.disabled = false;
        } else {
            this.startPauseBtn.setText('▶');
            this.skipBtn.disabled = false;
        }
        this.resetBtn.disabled = state.isRunning;

        // Dots only for pomodoro
        this.dotCol.style.display = state.mode === 'pomodoro' ? 'flex' : 'none';
        if (state.mode === 'pomodoro') {
            const doneInCycle = state.completedTomatos % this.plugin.settings.cycles;
            this.phaseDotEls.forEach((dot, i) => {
                dot.toggleClass('completed', i < doneInCycle);
                dot.toggleClass('active', state.phase === 'work' && state.isRunning && i === doneInCycle);
            });
        } else {
            this.phaseDotEls.forEach(dot => {
                dot.removeClass('completed', 'active');
            });
        }

        // Refresh today minutes (throttled)
        const now = Date.now();
        if (now - this.lastMinutesRefresh > 10000) {
            this.lastMinutesRefresh = now;
            void this.refreshTodayMinutes();
        }
    }

    private async refreshTodayMinutes(): Promise<void> {
        try {
            const minutes = await getDayMinutes(this.app, this.plugin.settings, todayString());
            if (minutes > 0) {
                this.todayMinutesEl.setText(`${this.plugin.t('panel.todayTotal')} ${minutes}min`);
            } else {
                this.todayMinutesEl.setText('');
            }
        } catch {
            this.todayMinutesEl.setText('');
        }
    }

    renderProjectSelect(): void {
        const current = this.projectSelect?.value ?? '';
        this.projectSelect.empty();
        this.projectSelect.createEl('option', { text: this.plugin.t('panel.projectPlaceholder'), value: '' });
        for (const proj of this.plugin.settings.projects) {
            this.projectSelect.createEl('option', { text: proj.name, value: proj.name });
        }
        this.projectSelect.value = current;
    }

    private fmtTime(s: number): string {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    private phaseLabel(state: TimerState): string {
        if (!state.isRunning && state.phase !== 'idle') return this.plugin.t('panel.status.paused');
        const labels: Record<PhaseType, string> = {
            work: this.plugin.t('panel.status.focus'),
            shortBreak: this.plugin.t('panel.status.shortBreak'),
            longBreak: this.plugin.t('panel.status.longBreak'),
            idle: this.plugin.t('panel.status.ready'),
            stopwatch: this.plugin.t('panel.status.stopwatch'),
            countdown: this.plugin.t('panel.status.countdown'),
        };
        return labels[state.phase];
    }
}
