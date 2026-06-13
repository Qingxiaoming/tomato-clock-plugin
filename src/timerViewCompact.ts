import { ItemView, WorkspaceLeaf, setIcon, Menu } from 'obsidian';
import type TomatoPlugin from './main';
import type { TimerState, PhaseType, TimerMode } from './timer';
import { getDayMinutes, todayString, parseDayFile, timeToMinutes } from './log';
import { projectColor } from './utils';

export const VIEW_TYPE_Tomato_Compact = 'Tomato-timer-compact-view';

export class TomatoTimerCompactView extends ItemView {
    private plugin: TomatoPlugin;

    private timerDisplayEl!: HTMLElement;
    private currentTimeEl!: HTMLElement;
    private timelineEl!: HTMLElement;
    private statusTextEl!: HTMLElement;
    private todayMinutesEl!: HTMLElement;
    private phaseDotEls: HTMLElement[] = [];
    private dotCol!: HTMLElement;
    private actionBtn!: HTMLButtonElement;
    private modeBtn!: HTMLButtonElement;
    private taskInput!: HTMLInputElement;
    private projectSelect!: HTMLSelectElement;
    private lastMinutesRefresh = 0;
    private uiBuilt = false;
    private currentTimeInterval?: number;
    private renderingTimeline = false;
    private cachedModeIcon = '';
    private cachedActionIcon = '';
    private cachedFontSizeVar = '';
    private cachedTimerFontSizeVar = '';
    private cachedCurrentFontFamily = '';
    private cachedTimerFontFamily = '';
    private cachedDataPhase = '';
    private cachedDotDisplay = '';
    private cachedTimelineHash = '';

    private static readonly MODE_ICONS: Record<TimerMode, string> = {
        pomodoro: 'target',
        stopwatch: 'timer',
        countdown: 'hourglass',
    };
    private static readonly MODE_CYCLE: TimerMode[] = ['pomodoro', 'stopwatch', 'countdown'];
    private phaseLabels: Record<PhaseType, string> | null = null;

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
        this.updateCurrentTime();
        this.currentTimeInterval = window.setInterval(() => {
            this.updateCurrentTime();
            void this.renderTodayTimeline();
        }, 30000);
    }

    async onClose(): Promise<void> {
        this.uiBuilt = false;
        if (this.currentTimeInterval) {
            clearInterval(this.currentTimeInterval);
            this.currentTimeInterval = undefined;
        }
    }

    private buildUI(): void {
        if (this.uiBuilt) return;
        this.uiBuilt = true;
        const root = this.contentEl;
        root.empty();
        root.addClass('Tomato-compact-container');
        root.style.setProperty('--tomato-compact-current-time-font-size', `${this.plugin.settings.compactCurrentTimeFontSize}rem`);
        root.style.setProperty('--tomato-compact-timer-font-size', `${this.plugin.settings.compactTimerFontSize}rem`);
        root.style.setProperty('--tomato-compact-current-time-font-family', this.plugin.settings.compactCurrentTimeFontFamily);
        root.style.setProperty('--tomato-compact-timer-font-family', this.plugin.settings.compactTimerFontFamily);

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

        /* ── Current time row: time | mode switch ── */
        const currentRow = root.createDiv({ cls: 'Tomato-compact-current-row' });
        this.currentTimeEl = currentRow.createDiv({ cls: 'Tomato-compact-current-time', text: '--:--' });

        this.modeBtn = currentRow.createEl('button', {
            cls: 'Tomato-compact-mode-btn Tomato-compact-mode-toggle',
        });
        setIcon(this.modeBtn, TomatoTimerCompactView.MODE_ICONS['pomodoro']);
        this.registerDomEvent(this.modeBtn, 'click', () => {
            const current = this.plugin.timer.getMode();
            const cycle = TomatoTimerCompactView.MODE_CYCLE;
            const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
            this.plugin.timer.setMode(next);
            this.plugin.refreshAllViews?.();
        });

        /* ── Today timeline ── */
        this.timelineEl = root.createDiv({ cls: 'Tomato-compact-timeline' });

        /* ── Timer row: dots | clock | action button ── */
        const timerRow = root.createDiv({ cls: 'Tomato-compact-timer-row' });

        // Left: vertical dots
        this.dotCol = timerRow.createDiv({ cls: 'Tomato-compact-dot-col' });
        this.phaseDotEls = [];
        for (let i = 0; i < this.plugin.settings.cycles; i++) {
            this.phaseDotEls.push(this.dotCol.createDiv({ cls: 'Tomato-compact-dot' }));
        }

        // Center: clock (dblclick opens full panel, contextmenu for mode actions)
        const timerCol = timerRow.createDiv({ cls: 'Tomato-compact-timer-col' });
        this.timerDisplayEl = timerCol.createDiv({ cls: 'Tomato-compact-display', text: '--' });
        this.timerDisplayEl.addEventListener('dblclick', () => {
            void this.plugin.activateFullView();
        });
        this.timerDisplayEl.addEventListener('contextmenu', (evt) => {
            evt.preventDefault();
            this.onTimerContextMenu(evt);
        });

        // Right: single action button (start / skip|reset|stop)
        const btnCol = timerRow.createDiv({ cls: 'Tomato-compact-action-col' });
        this.actionBtn = btnCol.createEl('button', {
            cls: 'Tomato-compact-icon-btn Tomato-compact-btn-primary',
        });
        setIcon(this.actionBtn, 'play');
        this.registerDomEvent(this.actionBtn, 'click', () => this.onAction());

        /* ── Info row: status (left) | today minutes (right) ── */
        const infoRow = root.createDiv({ cls: 'Tomato-compact-info-row' });
        this.statusTextEl = infoRow.createDiv({ cls: 'Tomato-compact-status', text: this.plugin.t('panel.status.ready') });
        this.todayMinutesEl = infoRow.createDiv({ cls: 'Tomato-compact-today', text: '' });
    }

    private updateCurrentTime(): void {
        const now = new Date();
        this.currentTimeEl.setText(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    }

    private onTimerContextMenu(evt: MouseEvent): void {
        const state = this.plugin.timer.getState();
        const mode = state.mode;

        if (mode === 'stopwatch') return;

        if (mode === 'pomodoro') {
            if (state.phase === 'idle') return;
            const menu = new Menu();
            menu.addItem((item) => {
                item.setTitle(this.plugin.t('panel.btn.stop'))
                    .setIcon('square')
                    .onClick(() => this.plugin.timer.skip());
            });
            menu.showAtMouseEvent(evt);
            return;
        }

        if (mode === 'countdown') {
            evt.preventDefault();
            this.showCountdownInlineEdit();
            return;
        }
    }

    private parseCountdownInput(value: string): number {
        const cleaned = value.replace(/[：]/g, ':').replace(/[^0-9:]/g, '');
        const parts = cleaned.split(':').filter(p => p !== '').map(p => parseInt(p, 10)).filter(n => !isNaN(n));
        if (parts.length === 0) return 0;
        if (parts.length === 1) return parts[0] * 60;
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    private showCountdownInlineEdit(): void {
        const curSec = this.plugin.timer.getState().remainingSeconds;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = curSec > 0 ? String(Math.floor(curSec / 60)) : String(this.plugin.settings.countdownMinutes);
        input.className = 'Tomato-compact-inline-input';
        input.style.cssText = `
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 100px;
            text-align: center;
            font-size: inherit;
            font-family: inherit;
            font-weight: inherit;
            background: var(--background-primary);
            color: var(--text-normal);
            border: 1px solid var(--interactive-accent);
            border-radius: 4px;
            padding: 2px 4px;
            z-index: 10;
            outline: none;
        `;

        const container = this.timerDisplayEl.parentElement!;
        container.style.position = 'relative';
        container.appendChild(input);
        input.focus();
        input.select();

        let done = false;

        const finish = (save: boolean) => {
            if (done) return;
            done = true;
            if (save) {
                const seconds = this.parseCountdownInput(input.value);
                if (seconds > 0) {
                    this.plugin.timer.setCountdownSeconds(seconds);
                    this.plugin.timer.reset();
                    this.timerDisplayEl.setText(this.fmtTime(seconds));
                }
            }
            if (input.parentElement) input.remove();
            this.plugin.refreshAllViews?.();
        };

        input.addEventListener('keyup', (e) => {
            if (e.key === 'Enter' || e.keyCode === 13 || e.code === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                finish(true);
            } else if (e.key === 'Escape' || e.keyCode === 27) {
                finish(false);
            }
        });

        input.addEventListener('blur', () => {
            finish(true);
        });

        input.addEventListener('input', () => {
            const seconds = this.parseCountdownInput(input.value);
            if (seconds > 0) {
                this.timerDisplayEl.setText(this.fmtTime(seconds));
            }
        });
    }

    private onAction(): void {
        const s = this.plugin.timer.getState();
        if (s.phase === 'idle') {
            this.plugin.timer.start();
            return;
        }
        const mode = this.plugin.timer.getMode();
        if (mode === 'pomodoro') {
            this.plugin.timer.skip();
        } else if (mode === 'countdown') {
            this.plugin.timer.reset();
        } else if (mode === 'stopwatch') {
            this.plugin.timer.skip();
        }
    }

    updateTimerUI(state: TimerState): void {
        // Cached CSS variables — only set when changed
        const fontSize = `${this.plugin.settings.compactCurrentTimeFontSize}rem`;
        const timerFontSize = `${this.plugin.settings.compactTimerFontSize}rem`;
        if (this.cachedFontSizeVar !== fontSize) {
            this.cachedFontSizeVar = fontSize;
            this.contentEl.style.setProperty('--tomato-compact-current-time-font-size', fontSize);
        }
        if (this.cachedTimerFontSizeVar !== timerFontSize) {
            this.cachedTimerFontSizeVar = timerFontSize;
            this.contentEl.style.setProperty('--tomato-compact-timer-font-size', timerFontSize);
        }
        if (this.cachedCurrentFontFamily !== this.plugin.settings.compactCurrentTimeFontFamily) {
            this.cachedCurrentFontFamily = this.plugin.settings.compactCurrentTimeFontFamily;
            this.contentEl.style.setProperty('--tomato-compact-current-time-font-family', this.plugin.settings.compactCurrentTimeFontFamily);
        }
        if (this.cachedTimerFontFamily !== this.plugin.settings.compactTimerFontFamily) {
            this.cachedTimerFontFamily = this.plugin.settings.compactTimerFontFamily;
            this.contentEl.style.setProperty('--tomato-compact-timer-font-family', this.plugin.settings.compactTimerFontFamily);
        }

        const displaySeconds = state.mode === 'stopwatch' ? state.elapsedSeconds : state.remainingSeconds;
        const timeText = this.fmtTime(displaySeconds);
        if (this.timerDisplayEl.getText() !== timeText) {
            this.timerDisplayEl.setText(timeText);
        }

        const statusText = this.formatPhaseLabel(state);
        if (this.statusTextEl.getText() !== statusText) {
            this.statusTextEl.setText(statusText);
        }

        if (this.cachedDataPhase !== state.phase) {
            this.cachedDataPhase = state.phase;
            this.contentEl.setAttribute('data-phase', state.phase);
        }

        // Font size adaptation: shrink when hours or many dots
        const hasManyDots = state.mode === 'pomodoro' && this.plugin.settings.cycles >= 4;
        const hasHours = displaySeconds >= 3600;
        const targetClass = hasHours && hasManyDots ? 'ultra-compact' : hasHours || hasManyDots ? 'compact' : '';
        this.timerDisplayEl.removeClass('compact', 'ultra-compact');
        if (targetClass) {
            this.timerDisplayEl.addClass(targetClass);
        }

        // Mode toggle button — only rebuild icon when changed
        const modeIcon = TomatoTimerCompactView.MODE_ICONS[state.mode];
        if (this.cachedModeIcon !== modeIcon) {
            this.cachedModeIcon = modeIcon;
            setIcon(this.modeBtn, modeIcon);
        }

        // Single action button — only rebuild icon when changed
        let actionIcon: string;
        if (state.phase === 'idle') {
            actionIcon = 'play';
        } else if (state.mode === 'pomodoro') {
            actionIcon = 'skip-forward';
        } else if (state.mode === 'countdown') {
            actionIcon = 'rotate-ccw';
        } else {
            actionIcon = 'square';
        }
        if (this.cachedActionIcon !== actionIcon) {
            this.cachedActionIcon = actionIcon;
            setIcon(this.actionBtn, actionIcon);
        }
        this.actionBtn.disabled = false;

        // Dots only for pomodoro
        const dotDisplay = state.mode === 'pomodoro' ? 'flex' : 'none';
        if (this.cachedDotDisplay !== dotDisplay) {
            this.cachedDotDisplay = dotDisplay;
            this.dotCol.style.display = dotDisplay;
        }
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

        // Sync project select options if projects changed
        if (this.projectSelect.options.length !== this.plugin.settings.projects.length + 1) {
            this.renderProjectSelect();
        }
        // Sync inputs
        if (this.projectSelect.value !== state.currentProject) {
            this.projectSelect.value = state.currentProject;
        }
        if (this.taskInput.value !== state.taskName) {
            this.taskInput.value = state.taskName;
        }

        // Refresh today minutes & timeline (throttled)
        const now = Date.now();
        if (now - this.lastMinutesRefresh > 10000) {
            this.lastMinutesRefresh = now;
            void this.refreshTodayMinutes();
            void this.renderTodayTimeline();
        }
    }

    async renderTodayTimeline(): Promise<void> {
        if (!this.uiBuilt || !this.timelineEl || this.renderingTimeline) return;
        this.renderingTimeline = true;
        try {
            const date = todayString();
            const dayRecord = await parseDayFile(this.app, this.plugin.settings, date);

            // Compute a hash of the timeline data; skip full rebuild if unchanged
            const hashParts: string[] = [];
            for (const entry of dayRecord.entries) {
                hashParts.push(`${entry.startTime}-${entry.duration}-${entry.project}`);
            }
            const newHash = hashParts.join('|');
            const dataChanged = this.cachedTimelineHash !== newHash;

            if (dataChanged) {
                this.cachedTimelineHash = newHash;
                this.timelineEl.empty();

                const track = this.timelineEl.createDiv({ cls: 'Tomato-compact-timeline-track' });

                if (dayRecord.entries.length > 0) {
                    const totalDayMinutes = 1440;
                    for (const entry of dayRecord.entries) {
                        const startMin = timeToMinutes(entry.startTime);
                        const left = (startMin / totalDayMinutes) * 100;
                        const width = (entry.duration / totalDayMinutes) * 100;
                        const seg = track.createDiv({ cls: 'Tomato-compact-timeline-seg' });
                        seg.style.left = `${left}%`;
                        seg.style.width = `${Math.max(width, 0.3)}%`;
                        seg.style.backgroundColor = projectColor(this.plugin, entry.project);
                    }
                }

                const currentLine = this.timelineEl.createDiv({ cls: 'Tomato-compact-timeline-current' });
                const currentMin = new Date().getHours() * 60 + new Date().getMinutes();
                currentLine.style.left = `${(currentMin / 1440) * 100}%`;
            } else {
                // Only update the current time line position
                const currentLine = this.timelineEl.querySelector('.Tomato-compact-timeline-current') as HTMLElement | null;
                if (currentLine) {
                    const currentMin = new Date().getHours() * 60 + new Date().getMinutes();
                    currentLine.style.left = `${(currentMin / 1440) * 100}%`;
                }
            }
        } finally {
            this.renderingTimeline = false;
        }
    }

    async refreshTodayMinutes(): Promise<void> {
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
        const current = this.plugin.timer?.getCurrentProject() ?? '';
        this.projectSelect.empty();
        this.projectSelect.createEl('option', { text: this.plugin.t('panel.projectPlaceholder'), value: '' });
        for (const proj of this.plugin.settings.projects) {
            this.projectSelect.createEl('option', { text: proj.name, value: proj.name });
        }
        this.projectSelect.value = current;
    }

    private fmtTime(s: number): string {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        if (h > 0) {
            return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    private formatPhaseLabel(state: TimerState): string {
        if (!this.phaseLabels) {
            this.phaseLabels = {
                work: this.plugin.t('panel.status.focus'),
                shortBreak: this.plugin.t('panel.status.shortBreak'),
                longBreak: this.plugin.t('panel.status.longBreak'),
                idle: this.plugin.t('panel.status.ready'),
                stopwatch: this.plugin.t('panel.status.stopwatch'),
                countdown: this.plugin.t('panel.status.countdown'),
            };
        }
        return this.phaseLabels[state.phase];
    }
}
