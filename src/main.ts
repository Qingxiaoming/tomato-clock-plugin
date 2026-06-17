import { Notice, Plugin, TFile, normalizePath } from 'obsidian';
import { TomatoTimer } from './timer';
import type { PhaseType, TimerState } from './timer';
import { TomatoTimerView, VIEW_TYPE_Tomato } from './timerView';
import { TomatoTimerCompactView, VIEW_TYPE_Tomato_Compact } from './timerViewCompact';
import { CalendarView, VIEW_TYPE_CALENDAR, settings as calendarSettings } from './calendar-extended';
import { DEFAULT_SETTINGS, TomatoSettingTab } from './settings';
import type { TomatoPluginSettings, StatusBarMode } from './settings';
import { appendEntry, timeFromDate, todayString } from './log';
import { t, tf } from './i18n';
import { NotificationService } from './services/notification';
import { RecoveryService } from './services/recovery';
import { SyncService } from './services/sync';

export default class TomatoPlugin extends Plugin {
    settings!: TomatoPluginSettings;
    timer!: TomatoTimer;

    private statusBarEl!: HTMLElement;
    private notificationService!: NotificationService;
    private recoveryService!: RecoveryService;
    syncService!: SyncService;

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

        // Sync service
        this.syncService = new SyncService(this);
        await this.syncService.init();

        // Save recovery on page unload without blocking Obsidian reload
        this.registerDomEvent(window, 'beforeunload', () => {
            if (this.timer.getState().status === 'running') {
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
        this.registerView(VIEW_TYPE_CALENDAR, leaf => new (CalendarView as any)(leaf));

        // Ribbon button — opens compact panel by default
        this.addRibbonIcon('timer', this.t('panel.title'), () => { void this.activateView(); });

        // Status bar
        this.statusBarEl = this.addStatusBarItem();
        this.statusBarEl.addClass('Tomato-statusbar');
        this.statusBarEl.addClass('Tomato-clickable');
        this.registerDomEvent(this.statusBarEl, 'click', () => this.activateView());
        this.refreshStatusBar(this.timer.getState());
        this.toggleStatusBar();

        // Command palette
        this.addCommand({
            id: 'start-pause',
            name: this.t('cmd.startPause'),
            callback: () => {
                const s = this.timer.getState();
                if (s.phase === 'idle') {
                    this.timer.start();
                    const ns = this.timer.getState();
                    this.syncService?.logOp('start', {
                        mode: ns.mode,
                        phase: ns.phase,
                        project: ns.currentProject,
                        taskName: ns.taskName,
                        countdownSec: ns.totalPhaseSeconds,
                        sessionDate: this.timer.getSessionStartDate(),
                        sessionTime: this.timer.getSessionStartTime(),
                    });
                } else if (s.status === 'running') {
                    this.timer.pause();
                    this.syncService?.logOp('pause', {});
                } else {
                    this.timer.resume();
                    this.syncService?.logOp('resume', {});
                }
            },
        });
        this.addCommand({
            id: 'reset',
            name: this.t('cmd.reset'),
            callback: () => {
                this.timer.reset();
                this.syncService?.logOp('stop', {});
            },
        });
        this.addCommand({ id: 'open', name: this.t('cmd.open'), callback: () => this.activateView() });
        this.addCommand({
            id: 'mode-pomodoro',
            name: this.t('cmd.modePomodoro'),
            callback: () => {
                this.timer.setMode('pomodoro');
                this.syncService?.logOp('set_mode', { mode: 'pomodoro' });
                this.refreshAllViews();
            },
        });
        this.addCommand({
            id: 'mode-stopwatch',
            name: this.t('cmd.modeStopwatch'),
            callback: () => {
                this.timer.setMode('stopwatch');
                this.syncService?.logOp('set_mode', { mode: 'stopwatch' });
                this.refreshAllViews();
            },
        });
        this.addCommand({
            id: 'mode-countdown',
            name: this.t('cmd.modeCountdown'),
            callback: () => {
                this.timer.setMode('countdown');
                this.timer.setCountdownMinutes(this.settings.countdownMinutes);
                this.syncService?.logOp('set_mode', { mode: 'countdown' });
                this.refreshAllViews();
            },
        });

        // Watch log folder changes → refresh all views that depend on log data
        this.registerEvent(this.app.vault.on('modify', file => {
            const folder = normalizePath(this.settings.logFolder);
            if (normalizePath(file.path).startsWith(folder + '/')) {
                this.refreshLogViews();
            }
        }));

        this.addSettingTab(new TomatoSettingTab(this.app, this));
    }

    onunload(): void {
        void this.recoveryService.save();
        this.recoveryService.stopAutoSave();
        this.syncService?.destroy();
        this.timer.destroy();
    }

    async loadSettings(): Promise<void> {
        const loaded = await this.loadData() as Partial<TomatoPluginSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);

        // Migrate calendar-extended settings if not yet merged
        if (!loaded?.calendarExtended) {
            try {
                const legacyPath = `${this.app.vault.configDir}/plugins/calendar-extended/data.json`;
                const legacyData = await this.app.vault.adapter.read(legacyPath);
                const legacyOptions = JSON.parse(legacyData);
                if (legacyOptions && typeof legacyOptions === 'object') {
                    this.settings.calendarExtended = Object.assign(
                        {},
                        DEFAULT_SETTINGS.calendarExtended,
                        legacyOptions
                    );
                    await this.saveSettings();
                }
            } catch {
                // ignore: file doesn't exist or parse error
            }
        }

        // Sync calendar settings into calendar-extended store
        calendarSettings.set(this.settings.calendarExtended);
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
        this.refreshAllViews();
        this.refreshStatusBar(this.timer.getState());
    }

    toggleStatusBar(): void {
        // 状态栏的显示/隐藏现在由 refreshStatusBar 统一管理
        // 这里只需要触发一次刷新即可
        this.refreshStatusBar(this.timer.getState());
    }

    private async ensureView(type: string, leafType: 'tab' | 'right'): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(type);
        if (existing.length > 0) {
            void this.app.workspace.revealLeaf(existing[0]);
            return;
        }
        const leaf = leafType === 'tab' ? this.app.workspace.getLeaf('tab') : this.app.workspace.getRightLeaf(false);
        if (leaf) {
            await leaf.setViewState({ type, active: true });
            void this.app.workspace.revealLeaf(leaf);
        }
    }

    /** Open compact panel (default) */
    async activateView(): Promise<void> {
        await this.ensureView(VIEW_TYPE_Tomato_Compact, 'right');
    }

    /** Open full panel in the main tab area */
    async activateFullView(): Promise<void> {
        await this.ensureView(VIEW_TYPE_Tomato, 'tab');
    }

    private forEachView<T, R>(type: string, ViewClass: new (...args: any[]) => T, fn: (view: T) => R): void {
        for (const leaf of this.app.workspace.getLeavesOfType(type)) {
            if (leaf.view instanceof ViewClass) fn(leaf.view as T);
        }
    }

    refreshAllViews(): void {
        const state = this.timer.getState();
        this.forEachView(VIEW_TYPE_Tomato, TomatoTimerView, v => v.updateTimerUI(state));
        this.forEachView(VIEW_TYPE_Tomato_Compact, TomatoTimerCompactView, v => v.updateTimerUI(state));
    }

    refreshLogViews(): void {
        this.forEachView(VIEW_TYPE_Tomato, TomatoTimerView, v => void v.refreshTabContent());
        this.forEachView(VIEW_TYPE_Tomato_Compact, TomatoTimerCompactView, v => void v.refreshTodayMinutes());
    }

    private onTick(state: TimerState): void {
        this.refreshStatusBar(state);
        this.refreshAllViews();
    }

    private async onPhaseComplete(completed: PhaseType, _next: PhaseType, durationMinutes: number): Promise<void> {
        const noticeMap: Record<string, { msg: string; title: string; body: string }> = {
            work: { msg: 'notice.tomatoDone', title: 'notice.title.tomatoDone', body: 'notice.body.rest' },
            stopwatch: { msg: 'notice.stopwatchStopped', title: 'notice.title.stopwatchStopped', body: 'notice.body.sessionLogged' },
            countdown: { msg: 'notice.countdownFinished', title: 'notice.title.countdownFinished', body: 'notice.body.timeUp' },
            shortBreak: { msg: 'notice.breakOver', title: 'notice.title.breakOver', body: 'notice.body.backToFocus' },
            longBreak: { msg: 'notice.breakOver', title: 'notice.title.breakOver', body: 'notice.body.backToFocus' },
        };
        const n = noticeMap[completed] ?? noticeMap.shortBreak;
        new Notice(this.t(n.msg), 4000);
        this.notificationService.send(this.t(n.title), this.t(n.body));

        this.notificationService.beep();

        if (completed === 'work' || completed === 'stopwatch' || completed === 'countdown') {
            const entry = {
                date: this.timer.getSessionStartDate(),
                startTime: this.timer.getSessionStartTime(),
                endTime: timeFromDate(new Date()),
                duration: durationMinutes,
                mode: this.timer.getSessionStartMode(),
                taskName: this.buildLogTaskName(),
            };
            try {
                await appendEntry(this.app, this.settings, entry);
            } catch (e) {
                new Notice(`${this.t('notice.logWriteFailed')}: ${e instanceof Error ? e.message : String(e)}`, 6000);
            }
            const actualNext = this.timer.getState().phase === 'idle' ? 'idle' : _next;
            this.syncService?.logPhaseComplete(completed, actualNext as PhaseType, durationMinutes, {
                date: entry.date,
                startTime: entry.startTime,
                endTime: entry.endTime,
                duration: entry.duration,
                mode: entry.mode,
                taskName: entry.taskName,
            });
            if (this.settings.openLogOnComplete) {
                await this.openLogForEditing();
            }
            this.refreshLogViews();
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

    buildLogTaskName(): string {
        const project = this.timer.getCurrentProject();
        const task = this.timer.getTaskName();
        if (project) {
            return `tomato_project：${project} ${task}`;
        }
        return task;
    }

    private cachedStatusBarText: string = '';
    private cachedStatusBarDisplay: string = '';

    private refreshStatusBar(state: TimerState): void {
        const mode = this.settings.statusBarMode;

        // 隐藏模式：确保状态栏不显示
        if (mode === 'none') {
            if (this.cachedStatusBarDisplay !== 'none') {
                this.statusBarEl.style.display = 'none';
                this.cachedStatusBarDisplay = 'none';
            }
            return;
        }

        // 确保状态栏可见（非隐藏模式）
        if (this.cachedStatusBarDisplay !== '') {
            this.statusBarEl.style.display = '';
            this.cachedStatusBarDisplay = '';
        }

        // 简洁模式：只显示暂停/播放图标
        if (mode === 'simple') {
            // 计时中显示 ⏸ (暂停图标)，未计时显示 ▶ (播放图标)
            const newText = state.status === 'running' ? '⏸' : '▶';
            if (this.cachedStatusBarText !== newText) {
                this.statusBarEl.setText(newText);
                this.cachedStatusBarText = newText;
            }
            return;
        }

        // 完整模式：显示时间和状态
        const emoji = phaseEmoji(state.phase);
        let newText: string;
        if (state.phase === 'idle') {
            newText = `${emoji} --`;
        } else {
            const displaySec = state.mode === 'stopwatch' ? state.elapsedSeconds : state.remainingSeconds;
            const m = String(Math.floor(displaySec / 60)).padStart(2, '0');
            const s = String(displaySec % 60).padStart(2, '0');
            newText = `${emoji} ${m}:${s}${state.status === 'running' ? '' : ' ⏸'}`;
        }

        if (this.cachedStatusBarText !== newText) {
            this.statusBarEl.setText(newText);
            this.cachedStatusBarText = newText;
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
