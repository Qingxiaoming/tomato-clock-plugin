import { ItemView, MarkdownRenderer, WorkspaceLeaf } from 'obsidian';
import type TomatoPlugin from './main';
import type { TimerState, PhaseType, TimerMode } from './timer';
import { parseLogs, totalTomatos, last7Days, todayString } from './log';

export const VIEW_TYPE_Tomato = 'Tomato-timer-view';

export class TomatoTimerView extends ItemView {
    private plugin: TomatoPlugin;

    private timerDisplayEl!: HTMLElement;
    private statusTextEl!: HTMLElement;
    private phaseDotEls: HTMLElement[] = [];
    private dotsEl!: HTMLElement;
    private startPauseBtn!: HTMLButtonElement;
    private skipBtn!: HTMLButtonElement;
    private resetBtn!: HTMLButtonElement;
    private historyEl!: HTMLElement;
    private completedCountEl!: HTMLElement;

    private modeBtns: Record<TimerMode, HTMLButtonElement> | null = null;
    private taskInput!: HTMLInputElement;
    private countdownWrap!: HTMLElement;
    private countdownInput!: HTMLInputElement;

    constructor(leaf: WorkspaceLeaf, plugin: TomatoPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return VIEW_TYPE_Tomato; }
    getDisplayText(): string { return this.plugin.t('panel.title'); }
    getIcon(): string { return 'timer'; }

    async onOpen(): Promise<void> {
        this.buildUI();
        this.updateTimerUI(this.plugin.timer.getState());
        await this.refreshHistory();
    }

    async onClose(): Promise<void> {
        // Timer keeps running; main.ts continues handling ticks
    }

    private buildUI(): void {
        const root = this.contentEl;
        root.empty();
        root.addClass('Tomato-container');

        // Header: icon + title + cumulative count
        const header = root.createDiv({ cls: 'Tomato-header' });
        header.createDiv({ cls: 'Tomato-icon', text: '🍅' });
        const titleRow = header.createDiv({ cls: 'Tomato-title-row' });
        titleRow.createSpan({ text: this.plugin.t('panel.title') });
        this.completedCountEl = titleRow.createSpan({ cls: 'Tomato-count' });

        // Mode switcher
        const modeSwitcher = root.createDiv({ cls: 'Tomato-mode-switcher' });
        this.modeBtns = {
            pomodoro: modeSwitcher.createEl('button', { cls: 'Tomato-mode-btn', text: this.plugin.t('panel.mode.pomodoro') }),
            stopwatch: modeSwitcher.createEl('button', { cls: 'Tomato-mode-btn', text: this.plugin.t('panel.mode.stopwatch') }),
            countdown: modeSwitcher.createEl('button', { cls: 'Tomato-mode-btn', text: this.plugin.t('panel.mode.countdown') }),
        };
        (Object.keys(this.modeBtns) as TimerMode[]).forEach(mode => {
            this.registerDomEvent(this.modeBtns![mode], 'click', () => this.setMode(mode));
        });

        // Task input
        const taskWrap = root.createDiv({ cls: 'Tomato-task-wrap' });
        this.taskInput = taskWrap.createEl('input', {
            cls: 'Tomato-task-input',
            attr: { placeholder: this.plugin.t('panel.taskPlaceholder') },
        });
        this.registerDomEvent(this.taskInput, 'input', () => {
            this.plugin.timer.setTaskName(this.taskInput.value);
        });

        // Countdown minutes input
        this.countdownWrap = root.createDiv({ cls: 'Tomato-countdown-wrap' });
        this.countdownWrap.createSpan({ text: this.plugin.t('panel.countdownLabel') });
        this.countdownInput = this.countdownWrap.createEl('input', {
            cls: 'Tomato-countdown-input',
            attr: { type: 'number', min: '1', value: String(this.plugin.settings.countdownMinutes) },
        });
        this.registerDomEvent(this.countdownInput, 'change', () => {
            const v = parseInt(this.countdownInput.value, 10);
            if (v > 0) this.plugin.timer.setCountdownMinutes(v);
        });

        // Progress dots (one per cycle slot)
        this.dotsEl = root.createDiv({ cls: 'Tomato-dots' });
        this.phaseDotEls = [];
        for (let i = 0; i < this.plugin.settings.cycles; i++) {
            this.phaseDotEls.push(this.dotsEl.createDiv({ cls: 'Tomato-dot' }));
        }

        // Timer display
        const timerArea = root.createDiv({ cls: 'Tomato-timer-area' });
        this.timerDisplayEl = timerArea.createDiv({ cls: 'Tomato-timer-display', text: '--' });
        this.statusTextEl = timerArea.createDiv({ cls: 'Tomato-status-text', text: this.plugin.t('panel.status.ready') });

        // Controls
        const controls = root.createDiv({ cls: 'Tomato-controls' });

        this.startPauseBtn = controls.createEl('button', {
            cls: 'Tomato-btn Tomato-btn-primary',
            text: this.plugin.t('panel.btn.start'),
        });
        this.registerDomEvent(this.startPauseBtn, 'click', () => this.onStartPause());

        this.skipBtn = controls.createEl('button', {
            cls: 'Tomato-btn Tomato-btn-secondary',
            text: this.plugin.t('panel.btn.skip'),
        });
        this.skipBtn.disabled = true;
        this.registerDomEvent(this.skipBtn, 'click', () => this.plugin.timer.skip());

        this.resetBtn = controls.createEl('button', {
            cls: 'Tomato-btn Tomato-btn-danger',
            text: this.plugin.t('panel.btn.reset'),
        });
        this.registerDomEvent(this.resetBtn, 'click', () => this.plugin.timer.reset());

        // History section
        this.historyEl = root.createDiv({ cls: 'Tomato-history' });
    }

    private setMode(mode: TimerMode): void {
        this.plugin.timer.setMode(mode);
        if (mode === 'countdown') {
            const v = parseInt(this.countdownInput.value, 10);
            this.plugin.timer.setCountdownMinutes(v > 0 ? v : this.plugin.settings.countdownMinutes);
        }
        this.plugin.timer.reset();
        this.updateTimerUI(this.plugin.timer.getState());
    }

    private onStartPause(): void {
        const s = this.plugin.timer.getState();
        if (s.phase === 'idle') this.plugin.timer.start();
        else if (s.isRunning) this.plugin.timer.pause();
        else this.plugin.timer.resume();
    }

    updateTimerUI(state: TimerState): void {
        // Mode buttons
        if (this.modeBtns) {
            (Object.keys(this.modeBtns) as TimerMode[]).forEach(mode => {
                this.modeBtns![mode].toggleClass('active', state.mode === mode);
            });
        }

        // Show/hide countdown input
        this.countdownWrap.style.display = state.mode === 'countdown' ? 'flex' : 'none';
        // Show/hide dots
        this.dotsEl.style.display = state.mode === 'pomodoro' ? 'flex' : 'none';

        const displaySeconds = state.mode === 'stopwatch' ? state.elapsedSeconds : state.remainingSeconds;
        this.timerDisplayEl.setText(this.fmtTime(displaySeconds));
        this.statusTextEl.setText(this.phaseLabel(state));
        this.contentEl.setAttribute('data-phase', state.phase);

        const stopLabel = state.mode === 'stopwatch' || state.mode === 'countdown'
            ? this.plugin.t('panel.btn.stop')
            : this.plugin.t('panel.btn.skip');

        if (state.phase === 'idle') {
            this.startPauseBtn.setText(this.plugin.t('panel.btn.start'));
            this.skipBtn.setText(stopLabel);
            this.skipBtn.disabled = true;
        } else if (state.isRunning) {
            this.startPauseBtn.setText(this.plugin.t('panel.btn.pause'));
            this.skipBtn.setText(stopLabel);
            this.skipBtn.disabled = false;
        } else {
            this.startPauseBtn.setText(this.plugin.t('panel.btn.resume'));
            this.skipBtn.setText(stopLabel);
            this.skipBtn.disabled = false;
        }

        this.resetBtn.disabled = state.isRunning;

        // Dot states: completed = filled, active = current work slot
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

        this.completedCountEl.setText(state.completedTomatos > 0 ? ` ×${state.completedTomatos}` : '');
    }

    async refreshHistory(): Promise<void> {
        const days = await parseLogs(this.app, this.plugin.settings);
        const total = totalTomatos(days);
        const week = last7Days(days);
        const todayStr = todayString();
        const todayRecord = days.find(d => d.date === todayStr);

        const el = this.historyEl;
        el.empty();

        // --- Today ---
        const todaySection = el.createDiv({ cls: 'Tomato-history-section' });
        const todayHeader = todaySection.createDiv({ cls: 'Tomato-history-heading' });
        const todayCount = todayRecord?.count ?? 0;
        const todayMinutes = todayRecord?.entries.reduce((s, e) => s + e.duration, 0) ?? 0;
        todayHeader.createSpan({ text: this.plugin.t('panel.history.today') });
        const summary = todayCount > 0
            ? `${todayCount} 🍅 · ${Math.floor(todayMinutes / 60)}h ${todayMinutes % 60}m`
            : this.plugin.t('panel.history.noTomatos');
        todayHeader.createSpan({ cls: 'Tomato-today-summary', text: summary });

        if (todayRecord && todayRecord.entries.length > 0) {
            const list = todaySection.createDiv({ cls: 'Tomato-today-list' });
            for (const entry of todayRecord.entries) {
                const item = list.createDiv({ cls: 'Tomato-today-item' });
                item.createSpan({ cls: 'Tomato-entry-time', text: entry.time });
                if (entry.rest) {
                    const noteEl = item.createSpan({ cls: 'Tomato-entry-note' });
                    // Render markdown so [[wikilinks]] become clickable
                    await MarkdownRenderer.render(this.app, entry.rest, noteEl, '', this);
                }
            }
        }

        // --- This week ---
        const weekSection = el.createDiv({ cls: 'Tomato-history-section' });
        const weekHeader = weekSection.createDiv({ cls: 'Tomato-history-heading' });
        weekHeader.createSpan({ text: this.plugin.t('panel.history.thisWeek') });
        if (total > 0) {
            weekHeader.createSpan({ cls: 'Tomato-total', text: this.plugin.tf('panel.history.total', { n: total }) });
        }

        const maxCount = Math.max(...week.map(d => d.count), 1);
        const barEl = weekSection.createDiv({ cls: 'Tomato-week-bar' });

        for (const day of week) {
            const col = barEl.createDiv({ cls: 'Tomato-bar-col' });
            if (day.count > 0) {
                col.createDiv({ cls: 'Tomato-bar-count', text: String(day.count) });
            }
            const fill = col.createDiv({ cls: 'Tomato-bar-fill' + (day.date === todayStr ? ' today' : '') });
            fill.style.height = `${Math.round((day.count / maxCount) * 100)}%`;
            col.createDiv({ cls: 'Tomato-bar-label', text: day.date.slice(5).replace('-', '/') });
        }
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
