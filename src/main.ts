import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { TomatoTimer, PhaseType, TimerState, TimerMode } from './timer';
import { TomatoTimerView, VIEW_TYPE_Tomato } from './timerView';
import { TomatoTimerCompactView, VIEW_TYPE_Tomato_Compact } from './timerViewCompact';
import { DEFAULT_SETTINGS, TomatoPluginSettings, TomatoSettingTab } from './settings';
import { appendEntry, nowTimeString, todayString } from './log';
import { t, tf, type Lang } from './i18n';

export default class TomatoPlugin extends Plugin {
    settings!: TomatoPluginSettings;
    timer!: TomatoTimer;

    private statusBarEl!: HTMLElement;

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

        // Request OS notification permission on load (Electron / modern browsers)
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
                this.timer.reset();
                this.refreshAllViews();
            },
        });
        this.addCommand({
            id: 'mode-stopwatch',
            name: this.t('cmd.modeStopwatch'),
            callback: () => {
                this.timer.setMode('stopwatch');
                this.timer.reset();
                this.refreshAllViews();
            },
        });
        this.addCommand({
            id: 'mode-countdown',
            name: this.t('cmd.modeCountdown'),
            callback: () => {
                this.timer.setMode('countdown');
                this.timer.setCountdownMinutes(this.settings.countdownMinutes);
                this.timer.reset();
                this.refreshAllViews();
            },
        });

        // Watch log file changes → refresh history on full panel only
        this.registerEvent(this.app.vault.on('modify', file => {
            if (normalizePath(file.path) === normalizePath(this.settings.logFile)) {
                for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato)) {
                    if (leaf.view instanceof TomatoTimerView) void leaf.view.refreshHistory();
                }
            }
        }));

        this.addSettingTab(new TomatoSettingTab(this.app, this));
    }

    onunload(): void {
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

    /** Open full panel */
    async activateFullView(): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_Tomato);
        if (existing.length > 0) {
            void workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getRightLeaf(false);
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

        // Layer 3: OS system notification
        this.sendOsNotification(
            completed === 'work' ? this.t('notice.title.tomatoDone') : completed === 'stopwatch' ? this.t('notice.title.stopwatchStopped') : completed === 'countdown' ? this.t('notice.title.countdownFinished') : this.t('notice.title.breakOver'),
            completed === 'work' ? this.t('notice.body.rest') : completed === 'stopwatch' ? this.t('notice.body.sessionLogged') : completed === 'countdown' ? this.t('notice.body.timeUp') : this.t('notice.body.backToFocus'),
        );

        // Layer 4: audio beep
        this.playBeep();

        // Append entry to log and open file for editing
        if (completed === 'work' || completed === 'stopwatch' || completed === 'countdown') {
            await appendEntry(this.app, this.settings, {
                date: todayString(),
                time: nowTimeString(),
                duration: durationMinutes,
                taskName: this.timer.getTaskName(),
            });
            await this.openLogForEditing();
            for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato)) {
                if (leaf.view instanceof TomatoTimerView) void leaf.view.refreshHistory();
            }
        }
    }

    private async openLogForEditing(): Promise<void> {
        const path = normalizePath(this.settings.logFile);
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

    private sendOsNotification(title: string, body: string): void {
        if (!this.settings.enableOsNotification) return;
        if (typeof Notification === 'undefined') return;
        if (Notification.permission !== 'granted') return;
        new Notification(title, { body, silent: true });
    }

    private playBeep(): void {
        if (!this.settings.enableSound) return;
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        } catch {
            // AudioContext unavailable — silently skip
        }
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
