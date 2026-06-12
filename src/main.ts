import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { TomatoTimer, PhaseType, TimerState, TimerMode } from './timer';
import { TomatoTimerView, VIEW_TYPE_Tomato } from './timerView';
import { TomatoTimerCompactView, VIEW_TYPE_Tomato_Compact } from './timerViewCompact';
import { DEFAULT_SETTINGS, TomatoPluginSettings, TomatoSettingTab } from './settings';
import { appendEntry, nowTimeString, todayString, parseDayFile } from './log';
import { t, tf } from './i18n';
import { NotificationService } from './services/notification';
import { RecoveryService } from './services/recovery';

export default class TomatoPlugin extends Plugin {
    settings!: TomatoPluginSettings;
    timer!: TomatoTimer;

    private statusBarEl!: HTMLElement;
    private notificationService!: NotificationService;
    private recoveryService!: RecoveryService;

    t(key: string): string { return t(key, this.settings.language); }
    tf(key: string, vars: Record<string, string | number>): string { return tf(key, this.settings.language, vars); }

    async onload(): Promise<void> {
        await this.loadSettings();

        this.timer = new TomatoTimer({
            workMinutes: this.settings.workMinutes,
            shortBreakMinutes: this.settings.shortBreakMinutes,
            longBreakMinutes: this.settings.longBreakMinutes,
            cycles: this.settings.cycles,
            autoStartNextPhase: this.settings.autoStartNextPhase,
            countdownMinutes: this.settings.countdownMinutes,
        });

        this.timer.onTick(s => this.onTick(s));
        this.timer.onPhaseComplete((c, n, d) => { void this.onPhaseComplete(c, n, d); });

        this.notificationService = new NotificationService(this);
        this.recoveryService = new RecoveryService(this);

        // Restore previous session if any
        await this.recoveryService.load();

        // Auto-save recovery every 10s
        this.recoveryService.startAutoSave();

        // Save recovery on page unload without blocking Obsidian reload
        this.registerDomEvent(window, 'beforeunload', () => {
            if (this.timer.getState().isRunning) {
                void this.recoveryService.save();
            }
        });

        // Request OS notification permission on load
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            void Notification.requestPermission();
        }

        // Register views
        this.registerView(VIEW_TYPE_Tomato, leaf => new TomatoTimerView(leaf, this));
        this.registerView(VIEW_TYPE_Tomato_Compact, leaf => new TomatoTimerCompactView(leaf, this));

        // Ribbon button — opens compact panel by default
        this.addRibbonIcon('timer', this.t('panel.title'), () => { void this.activateView(); });

        // Status bar
        this.statusBarEl = this.addStatusBarItem();
        this.statusBarEl.addClass('Tomato-statusbar');
        this.statusBarEl.addClass('Tomato-clickable');
        this.registerDomEvent(this.statusBarEl, 'click', () => this.activateView());
        this.refreshStatusBar({ phase: 'idle', remainingSeconds: 0, elapsedSeconds: 0, isRunning: false, mode: 'pomodoro' });
        this.toggleStatusBar();

        // Command palette
        this.addCommand({
            id: 'start-pause',
            name: this.t('cmd.startPause'),
            callback: () => {
                const s = this.timer.getState();
                if (s.phase === 'idle') this.timer.start();
                else if (s.isRunning) this.timer.pause();
                else this.timer.resume();
            },
        });
        this.addCommand({ id: 'reset', name: this.t('cmd.reset'), callback: () => this.timer.reset() });
        this.addCommand({ id: 'open', name: this.t('cmd.open'), callback: () => this.activateView() });
        this.addCommand({
            id: 'mode-pomodoro',
            name: this.t('cmd.modePomodoro'),
            callback: () => {
                this.timer.setMode('pomodoro');
                this.refreshAllViews();
            },
        });
        this.addCommand({
            id: 'mode-stopwatch',
            name: this.t('cmd.modeStopwatch'),
            callback: () => {
                this.timer.setMode('stopwatch');
                this.refreshAllViews();
            },
        });
        this.addCommand({
            id: 'mode-countdown',
            name: this.t('cmd.modeCountdown'),
            callback: () => {
                this.timer.setMode('countdown');
                this.timer.setCountdownMinutes(this.settings.countdownMinutes);
                this.refreshAllViews();
            },
        });

        // Watch log folder changes → refresh history on full panel only
        this.registerEvent(this.app.vault.on('modify', file => {
            const folder = normalizePath(this.settings.logFolder);
            if (normalizePath(file.path).startsWith(folder + '/')) {
                for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato)) {
                    if (leaf.view instanceof TomatoTimerView) void leaf.view.refreshTabContent();
                }
            }
        }));

        this.addSettingTab(new TomatoSettingTab(this.app, this));
    }

    onunload(): void {
        void this.recoveryService.save();
        this.recoveryService.stopAutoSave();
        this.timer.destroy();
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TomatoPluginSettings>);
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    applySettings(): void {
        this.timer.updateSettings({
            workMinutes: this.settings.workMinutes,
            shortBreakMinutes: this.settings.shortBreakMinutes,
            longBreakMinutes: this.settings.longBreakMinutes,
            cycles: this.settings.cycles,
            autoStartNextPhase: this.settings.autoStartNextPhase,
            countdownMinutes: this.settings.countdownMinutes,
        });
        this.toggleStatusBar();
    }

    toggleStatusBar(): void {
        this.statusBarEl.style.display = this.settings.showStatusBar ? '' : 'none';
    }

    /** Open compact panel (default) */
    async activateView(): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_Tomato_Compact);
        if (existing.length > 0) {
            void workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_Tomato_Compact, active: true });
            void workspace.revealLeaf(leaf);
        }
    }

    /** Open full panel in the main tab area */
    async activateFullView(): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_Tomato);
        if (existing.length > 0) {
            void workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getLeaf('tab');
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_Tomato, active: true });
            void workspace.revealLeaf(leaf);
        }
    }

    refreshAllViews(): void {
        const state = this.timer.getState();
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato)) {
            if (leaf.view instanceof TomatoTimerView) leaf.view.updateTimerUI(state);
        }
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato_Compact)) {
            if (leaf.view instanceof TomatoTimerCompactView) leaf.view.updateTimerUI(state);
        }
    }

    private onTick(state: TimerState): void {
        this.refreshStatusBar(state);
        this.refreshAllViews();
    }

    private async onPhaseComplete(completed: PhaseType, _next: PhaseType, durationMinutes: number): Promise<void> {
        let msg: string;
        if (completed === 'work') msg = this.t('notice.tomatoDone');
        else if (completed === 'stopwatch') msg = this.t('notice.stopwatchStopped');
        else if (completed === 'countdown') msg = this.t('notice.countdownFinished');
        else msg = this.t('notice.breakOver');
        new Notice(msg, 4000);

        this.notificationService.send(
            completed === 'work' ? this.t('notice.title.tomatoDone') : completed === 'stopwatch' ? this.t('notice.title.stopwatchStopped') : completed === 'countdown' ? this.t('notice.title.countdownFinished') : this.t('notice.title.breakOver'),
            completed === 'work' ? this.t('notice.body.rest') : completed === 'stopwatch' ? this.t('notice.body.sessionLogged') : completed === 'countdown' ? this.t('notice.body.timeUp') : this.t('notice.body.backToFocus'),
        );

        this.notificationService.beep();

        if (completed === 'work' || completed === 'stopwatch' || completed === 'countdown') {
            try {
                await appendEntry(this.app, this.settings, {
                    date: this.timer.getSessionStartDate(),
                    startTime: this.timer.getSessionStartTime(),
                    endTime: nowTimeString(),
                    duration: durationMinutes,
                    mode: this.timer.getSessionStartMode(),
                    taskName: this.buildLogTaskName(),
                });
            } catch (e) {
                new Notice(`${this.t('notice.logWriteFailed')}: ${e instanceof Error ? e.message : String(e)}`, 6000);
            }
            if (this.settings.openLogOnComplete) {
                await this.openLogForEditing();
            }
            for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato)) {
                if (leaf.view instanceof TomatoTimerView) void leaf.view.refreshTabContent();
            }
            // Auto-reset for stopwatch/countdown and clear task/project
            if (completed === 'stopwatch' || completed === 'countdown') {
                this.timer.reset();
                this.timer.setTaskName('');
                this.timer.setCurrentProject('');
                this.refreshAllViews();
            }
        }
    }

    private async openLogForEditing(): Promise<void> {
        const path = normalizePath(`${this.settings.logFolder}/${todayString()}.md`);
        const file = this.app.vault.getFileByPath(path);
        if (!(file instanceof TFile)) return;

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);

        const editor = this.app.workspace.activeEditor?.editor;
        if (editor) {
            const lastLine = editor.lastLine();
            editor.setCursor({ line: lastLine, ch: editor.getLine(lastLine).length });
            editor.focus();
        }
    }

    private buildLogTaskName(): string {
        const project = this.timer.getCurrentProject();
        const task = this.timer.getTaskName();
        if (project) {
            return `tomato_project：${project} ${task}`;
        }
        return task;
    }

    private refreshStatusBar(state: Pick<TimerState, 'phase' | 'remainingSeconds' | 'elapsedSeconds' | 'isRunning' | 'mode'>): void {
        const emoji = phaseEmoji(state.phase);
        if (state.phase === 'idle') {
            this.statusBarEl.setText(`${emoji} --`);
            return;
        }
        const displaySec = state.mode === 'stopwatch' ? state.elapsedSeconds : state.remainingSeconds;
        const m = String(Math.floor(displaySec / 60)).padStart(2, '0');
        const s = String(displaySec % 60).padStart(2, '0');
        this.statusBarEl.setText(`${emoji} ${m}:${s}${state.isRunning ? '' : ' ⏸'}`);
    }

}

function phaseEmoji(phase: string): string {
    switch (phase) {
        case 'work': return '🍅';
        case 'shortBreak': return '☕';
        case 'longBreak': return '🛌';
        case 'stopwatch': return '⏱️';
        case 'countdown': return '⏳';
        default: return '⏱️';
    }
}
