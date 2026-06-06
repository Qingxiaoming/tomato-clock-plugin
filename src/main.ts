import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { TomatoTimer, PhaseType, TimerState } from './timer';
import { TomatoTimerView, VIEW_TYPE_Tomato } from './timerView';
import { DEFAULT_SETTINGS, TomatoPluginSettings, TomatoSettingTab } from './settings';
import { appendEntry, nowTimeString, todayString } from './log';

export default class TomatoPlugin extends Plugin {
    settings!: TomatoPluginSettings;
    timer!: TomatoTimer;

    private statusBarEl!: HTMLElement;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.timer = new TomatoTimer({
            workMinutes: this.settings.workMinutes,
            shortBreakMinutes: this.settings.shortBreakMinutes,
            longBreakMinutes: this.settings.longBreakMinutes,
            cycles: this.settings.cycles,
            autoStartNextPhase: this.settings.autoStartNextPhase,
        });

        this.timer.onTick(s => this.onTick(s));
        this.timer.onPhaseComplete((c, n) => { void this.onPhaseComplete(c, n); });

        // Request OS notification permission on load (Electron / modern browsers)
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            void Notification.requestPermission();
        }

        // Register sidebar view
        this.registerView(VIEW_TYPE_Tomato, leaf => new TomatoTimerView(leaf, this));

        // Ribbon button
        this.addRibbonIcon('timer', 'Tomato', () => { void this.activateView(); });

        // Status bar — always visible, zero-distraction time indicator
        this.statusBarEl = this.addStatusBarItem();
        this.statusBarEl.addClass('Tomato-statusbar');
        this.statusBarEl.addClass('Tomato-clickable');
        this.registerDomEvent(this.statusBarEl, 'click', () => this.activateView());
        this.refreshStatusBar({ phase: 'idle', remainingSeconds: 0, isRunning: false });

        // Command palette
        this.addCommand({
            id: 'start-pause',
            name: 'Tomato: Start / Pause',
            callback: () => {
                const s = this.timer.getState();
                if (s.phase === 'idle') this.timer.start();
                else if (s.isRunning) this.timer.pause();
                else this.timer.resume();
            },
        });
        this.addCommand({ id: 'reset', name: 'Tomato: Reset', callback: () => this.timer.reset() });
        this.addCommand({ id: 'open', name: 'Tomato: Open panel', callback: () => this.activateView() });

        // Watch log file changes → refresh history panel
        this.registerEvent(this.app.vault.on('modify', file => {
            if (normalizePath(file.path) === normalizePath(this.settings.logFile)) {
                this.forEachView(v => { void v.refreshHistory(); });
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
        });
    }

    async activateView(): Promise<void> {
        const { workspace } = this.app;
        const existing = workspace.getLeavesOfType(VIEW_TYPE_Tomato);
        if (existing.length > 0) {
            workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type: VIEW_TYPE_Tomato, active: true });
            workspace.revealLeaf(leaf);
        }
    }

    private onTick(state: TimerState): void {
        this.refreshStatusBar(state);
        this.forEachView(v => v.updateTimerUI(state));
    }

    private async onPhaseComplete(completed: PhaseType, _next: PhaseType): Promise<void> {
        // Layer 2: in-app Notice
        const msg = completed === 'work'
            ? '🍅 Tomato done! Time to rest.'
            : '☀️ Break over. Back to focus!';
        new Notice(msg, 4000);

        // Layer 3: OS system notification (works when Obsidian is in the background)
        this.sendOsNotification(
            completed === 'work' ? '🍅 Tomato done!' : '☀️ Break over!',
            completed === 'work' ? 'Time to take a break.' : 'Back to focus!',
        );

        // Layer 4: audio beep (no external files needed)
        this.playBeep();

        // Append entry to log and open file for editing on work completion
        if (completed === 'work') {
            await appendEntry(this.app, this.settings, {
                date: todayString(),
                time: nowTimeString(),
                duration: this.settings.workMinutes,
            });
            await this.openLogForEditing();
            this.forEachView(v => { void v.refreshHistory(); });
        }
    }

    private async openLogForEditing(): Promise<void> {
        const path = normalizePath(this.settings.logFile);
        const file = this.app.vault.getFileByPath(path);
        if (!(file instanceof TFile)) return;

        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);

        // Place cursor at the end of the newly appended line
        const editor = this.app.workspace.activeEditor?.editor;
        if (editor) {
            const lastLine = editor.lastLine();
            editor.setCursor({ line: lastLine, ch: editor.getLine(lastLine).length });
            editor.focus();
        }
    }

    private refreshStatusBar(state: Pick<TimerState, 'phase' | 'remainingSeconds' | 'isRunning'>): void {
        const emoji = phaseEmoji(state.phase);
        if (state.phase === 'idle') {
            this.statusBarEl.setText(`${emoji} --`);
            return;
        }
        const m = String(Math.floor(state.remainingSeconds / 60)).padStart(2, '0');
        this.statusBarEl.setText(`${emoji} ${m}${state.isRunning ? '' : ' ⏸'}`);
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

    private forEachView(fn: (v: TomatoTimerView) => void): void {
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato)) {
            if (leaf.view instanceof TomatoTimerView) fn(leaf.view);
        }
    }
}

function phaseEmoji(phase: string): string {
    switch (phase) {
        case 'work':       return '🍅';
        case 'shortBreak': return '☕';
        case 'longBreak':  return '🛌';
        default:           return '⏱️';
    }
}
