import { ItemView, MarkdownRenderer, WorkspaceLeaf, normalizePath, TFile } from 'obsidian';
import type TomatoPlugin from './main';
import type { TimerState, PhaseType, TimerMode } from './timer';
import { parseDayFile, todayString, parseProject, type DayRecord, timeToMinutes } from './log';
import {
    dateRangeDays,
    readEntriesInRange,
    startOfWeek,
    startOfMonth,
    startOfYear,
    minutesToHM,
    projectColor,
    type StatsPeriod,
} from './utils';

export const VIEW_TYPE_Tomato = 'Tomato-timer-view';

type TabType = 'timeline' | 'stats' | 'history';

export class TomatoTimerView extends ItemView {
    private plugin: TomatoPlugin;

    private timerDisplayEl!: HTMLElement;
    private statusTextEl!: HTMLElement;
    private phaseDotEls: HTMLElement[] = [];
    private dotsEl!: HTMLElement;
    private startPauseBtn!: HTMLButtonElement;
    private skipBtn!: HTMLButtonElement;
    private resetBtn!: HTMLButtonElement;
    private completedCountEl!: HTMLElement;

    private modeBtns: Record<TimerMode, HTMLButtonElement> | null = null;
    private taskInput!: HTMLInputElement;
    private projectSelect!: HTMLSelectElement;
    private countdownWrap!: HTMLElement;
    private countdownInput!: HTMLInputElement;

    private tabContentEl!: HTMLElement;
    private currentTab: TabType = 'timeline';
    private timelineDate: string = todayString();
    private statsPeriod: StatsPeriod = 'day';
    private tabBtns!: Record<TabType, HTMLButtonElement>;
    private refreshing = false;
    private uiBuilt = false;

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
        await this.refreshTabContent();
    }

    async onClose(): Promise<void> {
        this.uiBuilt = false;
    }

    private buildUI(): void {
        if (this.uiBuilt) return;
        this.uiBuilt = true;
        const root = this.contentEl;
        root.empty();
        root.addClass('Tomato-container');

        // Header
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

        // Project + Task row
        const taskRow = root.createDiv({ cls: 'Tomato-task-row' });
        this.projectSelect = taskRow.createEl('select', { cls: 'Tomato-project-select' });
        this.registerDomEvent(this.projectSelect, 'change', () => {
            this.plugin.timer.setCurrentProject(this.projectSelect.value);
        });
        this.renderProjectSelect();

        this.taskInput = taskRow.createEl('input', {
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

        // Progress dots
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

        // Tabs
        const tabs = root.createDiv({ cls: 'Tomato-tabs' });
        this.tabBtns = {
            timeline: tabs.createEl('button', { cls: 'Tomato-tab-btn active', text: this.plugin.t('panel.tab.timeline') }),
            stats: tabs.createEl('button', { cls: 'Tomato-tab-btn', text: this.plugin.t('panel.tab.stats') }),
            history: tabs.createEl('button', { cls: 'Tomato-tab-btn', text: this.plugin.t('panel.tab.history') }),
        };
        (Object.keys(this.tabBtns) as TabType[]).forEach(tab => {
            this.registerDomEvent(this.tabBtns[tab], 'click', () => {
                this.currentTab = tab;
                (Object.keys(this.tabBtns) as TabType[]).forEach(t => this.tabBtns[t].toggleClass('active', t === tab));
                void this.refreshTabContent();
            });
        });

        this.tabContentEl = root.createDiv({ cls: 'Tomato-tab-content' });
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
        if (this.modeBtns) {
            (Object.keys(this.modeBtns) as TimerMode[]).forEach(mode => {
                this.modeBtns![mode].toggleClass('active', state.mode === mode);
            });
        }

        this.countdownWrap.style.display = state.mode === 'countdown' ? 'flex' : 'none';
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

        if (this.projectSelect.value !== state.currentProject) {
            this.projectSelect.value = state.currentProject;
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

    async refreshTabContent(): Promise<void> {
        if (this.refreshing) return;
        this.refreshing = true;
        try {
            this.tabContentEl.empty();
            if (this.currentTab === 'timeline') {
                await this.renderTimeline();
            } else if (this.currentTab === 'stats') {
                await this.renderStats();
            } else {
                await this.renderHistory();
            }
        } finally {
            this.refreshing = false;
        }
    }

    // ===== Timeline =====
    async renderTimeline(): Promise<void> {
        const el = this.tabContentEl;

        // Date navigator
        const nav = el.createDiv({ cls: 'Tomato-tl-nav' });
        nav.createEl('button', { text: '◀', cls: 'Tomato-tl-nav-btn' }, btn => {
            btn.addEventListener('click', () => {
                const d = new Date(this.timelineDate + 'T00:00:00');
                d.setDate(d.getDate() - 1);
                this.timelineDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                void this.refreshTabContent();
            });
        });
        nav.createSpan({ cls: 'Tomato-tl-date', text: this.timelineDate });
        nav.createEl('button', { text: '▶', cls: 'Tomato-tl-nav-btn' }, btn => {
            btn.addEventListener('click', () => {
                const d = new Date(this.timelineDate + 'T00:00:00');
                d.setDate(d.getDate() + 1);
                this.timelineDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                void this.refreshTabContent();
            });
        });
        nav.createEl('button', { text: this.plugin.t('panel.timeline.today'), cls: 'Tomato-tl-nav-btn' }, btn => {
            btn.addEventListener('click', () => {
                this.timelineDate = todayString();
                void this.refreshTabContent();
            });
        });

        const day = await parseDayFile(this.app, this.plugin.settings, this.timelineDate);

        // Track
        const trackWrap = el.createDiv({ cls: 'Tomato-tl-track-wrap' });
        // Hour labels (every 4h)
        const hourLabels = trackWrap.createDiv({ cls: 'Tomato-tl-hours' });
        for (let h = 0; h <= 24; h += 4) {
            const left = (h / 24) * 100;
            const label = hourLabels.createDiv({ cls: 'Tomato-tl-hour-label' });
            label.style.left = `${left}%`;
            label.setText(`${String(h).padStart(2, '0')}:00`);
        }

        const track = trackWrap.createDiv({ cls: 'Tomato-tl-track' });
        for (const entry of day.entries) {
            const startMin = timeToMinutes(entry.startTime);
            const left = (startMin / 1440) * 100;
            const width = (entry.duration / 1440) * 100;
            const bar = track.createDiv({ cls: 'Tomato-tl-bar' });
            bar.style.left = `${left}%`;
            bar.style.width = `${Math.max(width, 0.3)}%`;
            bar.style.backgroundColor = projectColor(this.plugin, entry.project);
            bar.setAttribute('title', `${entry.startTime} ~ ${entry.endTime} (${entry.duration}m) ${entry.project ?? ''} ${entry.rest}`);
        }

        // Legend
        if (this.plugin.settings.projects.length > 0) {
            const legend = el.createDiv({ cls: 'Tomato-tl-legend' });
            for (const proj of this.plugin.settings.projects) {
                const item = legend.createDiv({ cls: 'Tomato-tl-legend-item' });
                item.createDiv({ cls: 'Tomato-tl-legend-dot' }).style.backgroundColor = proj.color;
                item.createSpan({ text: proj.name });
            }
        }

        // Summary
        const totalMin = day.entries.reduce((s, e) => s + e.duration, 0);
        const pomos = day.entries.filter(e => e.mode === 'pomodoro').length;
        el.createDiv({
            cls: 'Tomato-tl-summary',
            text: this.plugin.tf('panel.timeline.total', { duration: minutesToHM(totalMin), n: String(pomos) }),
        });
    }

    // ===== Stats =====
    async renderStats(): Promise<void> {
        const el = this.tabContentEl;

        // Period switcher
        const periodBar = el.createDiv({ cls: 'Tomato-stats-periods' });
        const periods: { key: StatsPeriod; labelKey: string }[] = [
            { key: 'day', labelKey: 'panel.stats.period.day' },
            { key: 'week', labelKey: 'panel.stats.period.week' },
            { key: 'month', labelKey: 'panel.stats.period.month' },
            { key: 'year', labelKey: 'panel.stats.period.year' },
        ];
        for (const p of periods) {
            periodBar.createEl('button', {
                cls: 'Tomato-stats-period-btn' + (this.statsPeriod === p.key ? ' active' : ''),
                text: this.plugin.t(p.labelKey),
            }, btn => {
                btn.addEventListener('click', () => {
                    this.statsPeriod = p.key;
                    void this.refreshTabContent();
                });
            });
        }

        // Export button for week/month/year
        if (this.statsPeriod !== 'day') {
            const exportBar = el.createDiv({ cls: 'Tomato-stats-export' });
            const periodLabel = this.plugin.t(`panel.stats.period.${this.statsPeriod}` as `panel.stats.period.${StatsPeriod}`);
            exportBar.createEl('button', {
                cls: 'Tomato-btn Tomato-btn-secondary',
                text: this.plugin.tf('panel.stats.export', { period: periodLabel }),
            }, btn => {
                btn.addEventListener('click', () => void this.generateReport(this.statsPeriod));
            });
        }

        const today = todayString();
        let start = today;
        let end = today;
        let dayLabels: string[] = [];

        if (this.statsPeriod === 'day') {
            start = today; end = today; dayLabels = [today];
        } else if (this.statsPeriod === 'week') {
            start = startOfWeek(today);
            end = today;
            dayLabels = dateRangeDays(end, Math.min(7, Math.ceil((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000) + 1));
        } else if (this.statsPeriod === 'month') {
            start = startOfMonth(today);
            end = today;
            dayLabels = dateRangeDays(end, Math.min(31, Math.ceil((new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()) / 86400000) + 1));
        } else if (this.statsPeriod === 'year') {
            start = startOfYear(today);
            end = today;
            // For year view, show monthly bars instead of daily
            dayLabels = [];
        }

        const entries = await readEntriesInRange(this.app, this.plugin.settings, start, end);
        const totalMin = entries.reduce((s, e) => s + e.duration, 0);
        const pomoCount = entries.filter(e => e.mode === 'pomodoro').length;

        // Summary cards
        const cards = el.createDiv({ cls: 'Tomato-stats-cards' });
        cards.createDiv({ cls: 'Tomato-stats-card', text: this.plugin.tf('panel.stats.totalDuration', { duration: minutesToHM(totalMin) }) });
        cards.createDiv({ cls: 'Tomato-stats-card', text: this.plugin.tf('panel.stats.tomatos', { n: String(pomoCount) }) });

        // Project distribution
        const projMap = new Map<string, number>();
        for (const e of entries) {
            const key = e.project ?? this.plugin.t('panel.stats.noProject');
            projMap.set(key, (projMap.get(key) ?? 0) + e.duration);
        }
        if (projMap.size > 0) {
            const projEl = el.createDiv({ cls: 'Tomato-stats-section' });
            projEl.createDiv({ cls: 'Tomato-stats-heading', text: this.plugin.t('panel.stats.projectDist') });
            const distBar = projEl.createDiv({ cls: 'Tomato-stats-dist' });
            const noProjectLabel = this.plugin.t('panel.stats.noProject');
            for (const [name, min] of projMap) {
                const pct = totalMin > 0 ? (min / totalMin) * 100 : 0;
                const row = distBar.createDiv({ cls: 'Tomato-stats-dist-row' });
                row.createSpan({ cls: 'Tomato-stats-dist-name', text: name });
                const barWrap = row.createDiv({ cls: 'Tomato-stats-dist-bar-wrap' });
                const bar = barWrap.createDiv({ cls: 'Tomato-stats-dist-bar' });
                bar.style.width = `${pct}%`;
                bar.style.backgroundColor = projectColor(this.plugin, name === noProjectLabel ? undefined : name);
                row.createSpan({ cls: 'Tomato-stats-dist-val', text: minutesToHM(min) });
            }
        }

        // Daily / monthly trend bars
        if (this.statsPeriod !== 'year') {
            const trendEl = el.createDiv({ cls: 'Tomato-stats-section' });
            trendEl.createDiv({ cls: 'Tomato-stats-heading', text: this.plugin.t('panel.stats.trend') });
            const chart = trendEl.createDiv({ cls: 'Tomato-stats-chart' });
            const dayMap = new Map<string, number>();
            for (const e of entries) {
                dayMap.set(e.date, (dayMap.get(e.date) ?? 0) + e.duration);
            }
            const maxMin = Math.max(...dayMap.values(), 1);
            for (const d of dayLabels) {
                const min = dayMap.get(d) ?? 0;
                const col = chart.createDiv({ cls: 'Tomato-stats-chart-col' });
                if (min > 0) {
                    col.createDiv({ cls: 'Tomato-stats-chart-val', text: String(min) });
                }
                const fill = col.createDiv({ cls: 'Tomato-stats-chart-fill' + (d === today ? ' today' : '') });
                fill.style.height = `${(min / maxMin) * 100}%`;
                col.createDiv({ cls: 'Tomato-stats-chart-label', text: d.slice(5).replace('-', '/') });
            }
        } else {
            // Year view: monthly bars
            const trendEl = el.createDiv({ cls: 'Tomato-stats-section' });
            trendEl.createDiv({ cls: 'Tomato-stats-heading', text: this.plugin.t('panel.stats.monthlyTrend') });
            const chart = trendEl.createDiv({ cls: 'Tomato-stats-chart' });
            const monthMap = new Map<number, number>();
            for (const e of entries) {
                const m = parseInt(e.date.slice(5, 7), 10);
                monthMap.set(m, (monthMap.get(m) ?? 0) + e.duration);
            }
            const maxMin = Math.max(...monthMap.values(), 1);
            for (let m = 1; m <= 12; m++) {
                const min = monthMap.get(m) ?? 0;
                const col = chart.createDiv({ cls: 'Tomato-stats-chart-col' });
                if (min > 0) {
                    col.createDiv({ cls: 'Tomato-stats-chart-val', text: String(min) });
                }
                const fill = col.createDiv({ cls: 'Tomato-stats-chart-fill' + (m === new Date().getMonth() + 1 ? ' today' : '') });
                fill.style.height = `${(min / maxMin) * 100}%`;
                col.createDiv({ cls: 'Tomato-stats-chart-label', text: `${m}月` });
            }
        }
    }

    // ===== History List =====
    async renderHistory(): Promise<void> {
        const el = this.tabContentEl;
        const todayStr = todayString();
        const day = await parseDayFile(this.app, this.plugin.settings, todayStr);

        const todaySection = el.createDiv({ cls: 'Tomato-history-section' });
        const todayHeader = todaySection.createDiv({ cls: 'Tomato-history-heading' });
        const todayCount = day.entries.filter(e => e.mode === 'pomodoro').length;
        const todayMinutes = day.entries.reduce((s, e) => s + e.duration, 0);
        todayHeader.createSpan({ text: this.plugin.t('panel.history.today') });
        const summary = todayCount > 0
            ? `${todayCount} 🍅 · ${minutesToHM(todayMinutes)}`
            : this.plugin.t('panel.history.noTomatos');
        todayHeader.createSpan({ cls: 'Tomato-today-summary', text: summary });

        if (day.entries.length > 0) {
            const list = todaySection.createDiv({ cls: 'Tomato-today-list' });
            for (const entry of day.entries) {
                const item = list.createDiv({ cls: 'Tomato-today-item' });
                const dot = item.createDiv({ cls: 'Tomato-entry-dot' });
                dot.style.backgroundColor = projectColor(this.plugin, entry.project);
                item.createSpan({ cls: 'Tomato-entry-time', text: `${entry.startTime} ~ ${entry.endTime}` });
                if (entry.rest) {
                    const noteEl = item.createSpan({ cls: 'Tomato-entry-note' });
                    await MarkdownRenderer.render(this.app, entry.rest, noteEl, '', this);
                }
            }
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

    private async generateReport(period: StatsPeriod): Promise<void> {
        const today = todayString();
        let start = today;
        let end = today;
        let title = '';

        if (period === 'week') {
            start = startOfWeek(today);
            end = today;
            title = this.plugin.tf('panel.report.weekTitle', { start, end });
        } else if (period === 'month') {
            start = startOfMonth(today);
            end = today;
            title = this.plugin.tf('panel.report.monthTitle', { month: today.slice(0, 7) });
        } else if (period === 'year') {
            start = startOfYear(today);
            end = today;
            title = this.plugin.tf('panel.report.yearTitle', { year: today.slice(0, 4) });
        } else {
            return;
        }

        const entries = await readEntriesInRange(this.app, this.plugin.settings, start, end);
        const totalMin = entries.reduce((s, e) => s + e.duration, 0);
        const pomoCount = entries.filter(e => e.mode === 'pomodoro').length;

        const projMap = new Map<string, number>();
        for (const e of entries) {
            const key = e.project ?? this.plugin.t('panel.stats.noProject');
            projMap.set(key, (projMap.get(key) ?? 0) + e.duration);
        }

        let md = `# ${title}\n\n`;
        md += `**${this.plugin.t('panel.report.totalDuration')}**: ${minutesToHM(totalMin)}  \n`;
        md += `**${this.plugin.t('panel.report.tomatoCount')}**: ${pomoCount}  \n\n`;

        md += `## ${this.plugin.t('panel.report.projectDist')}\n\n`;
        for (const [name, min] of projMap) {
            const pct = totalMin > 0 ? ((min / totalMin) * 100).toFixed(1) : '0';
            md += `- ${name}: ${minutesToHM(min)} (${pct}%)\n`;
        }
        md += `\n`;

        if (period === 'year') {
            md += `## ${this.plugin.t('panel.report.monthlyDetails')}\n\n`;
            const monthMap = new Map<number, number>();
            for (const e of entries) {
                const m = parseInt(e.date.slice(5, 7), 10);
                monthMap.set(m, (monthMap.get(m) ?? 0) + e.duration);
            }
            for (let m = 1; m <= 12; m++) {
                const min = monthMap.get(m) ?? 0;
                if (min > 0) {
                    md += `- ${this.plugin.tf('panel.report.monthSuffix', { n: String(m) })}: ${minutesToHM(min)}\n`;
                }
            }
        } else {
            md += `## ${this.plugin.t('panel.report.dailyDetails')}\n\n`;
            const dayMap = new Map<string, number>();
            for (const e of entries) {
                dayMap.set(e.date, (dayMap.get(e.date) ?? 0) + e.duration);
            }
            const sortedDays = Array.from(dayMap.keys()).sort();
            for (const d of sortedDays) {
                const min = dayMap.get(d) ?? 0;
                md += `- ${d}: ${minutesToHM(min)}\n`;
            }
        }

        const folder = normalizePath(`${this.plugin.settings.logFolder}/Reports`);
        const fileName = `${title}.md`;
        const filePath = `${folder}/${fileName}`;

        await this.app.vault.adapter.mkdir(folder);
        const existing = this.app.vault.getFileByPath(filePath);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, md);
        } else {
            await this.app.vault.create(filePath, md);
        }
        const file = this.app.vault.getFileByPath(filePath);
        if (file) {
            await this.app.workspace.getLeaf().openFile(file);
        }
    }
}
