import { ItemView, WorkspaceLeaf, Menu, Notice, Modal, Setting, App, normalizePath } from 'obsidian';
import type TomatoPlugin from './main';
import type { TimerState, TimerMode } from './timer';
import { parseDayFile, todayString, timeToMinutes, writeDayEntries, type ParsedEntry } from './log';
import {
    weekDays,
    weekNumber,
    addDays,
    formatDateShort,
    dayNameShort,
    minutesToHM,
    projectColor,
    startOfWeek,
    daysInMonth,
} from './utils';

export const VIEW_TYPE_Tomato = 'Tomato-timer-view';

type TabType = 'calendar' | 'list' | 'timesheet' | 'stats';
type CalendarView = 'day' | 'week' | 'month';

type WeekEntry = ParsedEntry & { date: string; originalIndex: number };

interface PositionedEntry {
    entry: ParsedEntry;
    index: number;
    left: number;
    width: number;
}

export class TomatoTimerView extends ItemView {
    private plugin: TomatoPlugin;

    private weekViewEl!: HTMLElement;
    private weekTitleEl!: HTMLElement;
    private viewTabBtns!: Record<TabType, HTMLButtonElement>;
    private tabContentEl!: HTMLElement;

    private currentTab: TabType = 'calendar';
    private calendarView: CalendarView = 'week';
    private navDate: string = todayString();
    private get lang(): 'zh' | 'en' {
        return this.plugin.settings.language as 'zh' | 'en';
    }
    private uiBuilt = false;
    private calendarInterval?: number;
    private currentLineEl?: HTMLElement;
    private currentLineLabel?: HTMLElement;
    private ongoingBarEl?: HTMLElement;
    private ongoingBarLabel?: HTMLElement;
    private isDraggingOngoing = false;
    private todayBtn?: HTMLButtonElement;

    constructor(leaf: WorkspaceLeaf, plugin: TomatoPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return VIEW_TYPE_Tomato;
    }

    getDisplayText(): string {
        return this.plugin.t('panel.tab.timeline');
    }

    getIcon(): string {
        return 'timer';
    }

    async onOpen(): Promise<void> {
        this.buildUI();
        this.updateTimerUI(this.plugin.timer.getState());
        await this.refreshTabContent();
        this.calendarInterval = window.setInterval(() => this.updateCurrentTimeLine(), 10000);
    }

    async onClose(): Promise<void> {
        this.uiBuilt = false;
        if (this.calendarInterval) {
            clearInterval(this.calendarInterval);
            this.calendarInterval = undefined;
        }
        this.currentLineEl = undefined;
        this.currentLineLabel = undefined;
        this.ongoingBarEl = undefined;
        this.ongoingBarLabel = undefined;
    }

    // ========== BUILD UI ==========

    private buildUI(): void {
        if (this.uiBuilt) return;
        this.uiBuilt = true;
        const root = this.contentEl;
        root.empty();
        root.addClass('Tomato-container');

        this.weekViewEl = root.createDiv({ cls: 'Tomato-week-view' });

        // Week nav
        const navRow = this.weekViewEl.createDiv({ cls: 'Tomato-week-nav' });
        const navLeft = navRow.createDiv({ cls: 'Tomato-week-nav-left' });
        const prevBtn = navLeft.createEl('button', {
            cls: 'Tomato-week-nav-btn', text: '<'
        });
        this.weekTitleEl = navLeft.createEl('span', { cls: 'Tomato-week-title' });
        const nextBtn = navLeft.createEl('button', {
            cls: 'Tomato-week-nav-btn', text: '>'
        });
        this.todayBtn = navRow.createEl('button', { cls: 'Tomato-week-nav-btn Tomato-week-today-btn', text: this.plugin.t('panel.history.today') });
        const navRight = navRow.createDiv({ cls: 'Tomato-cal-view-switch' });
        const viewDayBtn = navRight.createEl('button', { cls: 'Tomato-cal-view-btn', text: this.plugin.t('panel.view.day') });
        const viewWeekBtn = navRight.createEl('button', { cls: 'Tomato-cal-view-btn active', text: this.plugin.t('panel.view.week') });
        const viewMonthBtn = navRight.createEl('button', { cls: 'Tomato-cal-view-btn', text: this.plugin.t('panel.view.month') });
        const viewBtns: Record<CalendarView, HTMLButtonElement> = { day: viewDayBtn, week: viewWeekBtn, month: viewMonthBtn };

        this.registerDomEvent(prevBtn, 'click', () => this.navigateDate(-1));
        this.registerDomEvent(nextBtn, 'click', () => this.navigateDate(1));
        this.registerDomEvent(this.todayBtn, 'click', () => { this.navDate = todayString(); void this.refreshTabContent(); });

        this.bindBtnGroup(viewBtns, (v) => { this.calendarView = v; void this.refreshTabContent(); });

        // View tabs
        const viewTabs = this.weekViewEl.createDiv({ cls: 'Tomato-view-tabs' });
        this.viewTabBtns = {
            calendar: viewTabs.createEl('button', { cls: 'Tomato-view-tab active', text: this.plugin.t('panel.tab.calendar') }),
            list: viewTabs.createEl('button', { cls: 'Tomato-view-tab', text: this.plugin.t('panel.tab.list') }),
            timesheet: viewTabs.createEl('button', { cls: 'Tomato-view-tab', text: this.plugin.t('panel.tab.timesheet') }),
            stats: viewTabs.createEl('button', { cls: 'Tomato-view-tab', text: this.plugin.t('panel.tab.stats') }),
        };
        this.bindBtnGroup(this.viewTabBtns, (tab) => { this.currentTab = tab; void this.refreshTabContent(); });

        // Tab content
        this.tabContentEl = this.weekViewEl.createDiv({ cls: 'Tomato-week-tab-content' });
    }

    updateTimerUI(state: TimerState): void {
        if (this.ongoingBarEl?.isConnected) {
            this.ongoingBarEl.style.backgroundColor = projectColor(this.plugin, state.currentProject);
            const title = state.taskName || state.currentProject || this.plugin.t('panel.timer.running');
            const titleEl = this.ongoingBarEl.querySelector('.Tomato-cal-bar-title') as HTMLElement | null;
            if (titleEl) titleEl.setText(title);
        }
    }

    // ========== WEEK VIEW ==========

    async refreshTabContent(): Promise<void> {
        if (!this.uiBuilt) return;
        this.currentLineEl = undefined;
        this.currentLineLabel = undefined;
        this.ongoingBarEl = undefined;
        this.ongoingBarLabel = undefined;
        this.renderWeekNavTitle();
        let days: string[];
        if (this.calendarView === 'day') {
            days = [this.navDate];
        } else if (this.calendarView === 'week') {
            days = weekDays(this.navDate);
        } else {
            days = daysInMonth(this.navDate);
        }

        const allEntries: WeekEntry[] = [];
        for (const date of days) {
            const dayRecord = await parseDayFile(this.plugin.app, this.plugin.settings, date);
            for (let i = 0; i < dayRecord.entries.length; i++) {
                allEntries.push({ ...dayRecord.entries[i], date, originalIndex: i });
            }
        }

        this.tabContentEl.empty();

        switch (this.currentTab) {
            case 'calendar':
                this.renderCalendar(allEntries, days);
                break;
            case 'list':
                this.renderList(allEntries);
                break;
            case 'timesheet':
                this.renderTimesheet(allEntries);
                break;
            case 'stats':
                this.renderStats(allEntries);
                break;
        }
    }

    private navigateDate(delta: number): void {
        if (this.calendarView === 'day') {
            this.navDate = addDays(this.navDate, delta);
        } else if (this.calendarView === 'week') {
            this.navDate = addDays(this.navDate, delta * 7);
        } else {
            const d = new Date(this.navDate + 'T00:00:00');
            d.setMonth(d.getMonth() + delta);
            this.navDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        void this.refreshTabContent();
    }

    private bindBtnGroup<T extends string>(btns: Record<T, HTMLButtonElement>, onActivate: (key: T) => void): void {
        (Object.keys(btns) as T[]).forEach(k => {
            this.registerDomEvent(btns[k], 'click', () => {
                onActivate(k);
                (Object.keys(btns) as T[]).forEach(t => btns[t].toggleClass('active', t === k));
            });
        });
    }

    private renderWeekNavTitle(): void {
        if (this.calendarView === 'day') {
            const isToday = this.navDate === todayString();
            const prefix = isToday ? this.plugin.t('panel.timeline.today') : '';
            this.weekTitleEl.setText(`${prefix ? prefix + ' · ' : ''}${this.navDate}`);
            this.todayBtn?.setText(this.plugin.t('panel.history.today'));
        } else if (this.calendarView === 'week') {
            const start = startOfWeek(this.navDate);
            const end = addDays(start, 6);
            const wn = weekNumber(this.navDate);
            const isCurrentWeek = start === startOfWeek(todayString());
            const prefix = isCurrentWeek ? this.plugin.t('panel.week.thisWeek') : '';
            this.weekTitleEl.setText(`${prefix ? prefix + ' · ' : ''}W${wn} (${formatDateShort(start)} ~ ${formatDateShort(end)})`);
            this.todayBtn?.setText(this.plugin.t('panel.week.thisWeek'));
        } else {
            const d = new Date(this.navDate + 'T00:00:00');
            const isCurrentMonth = d.getFullYear() === new Date().getFullYear() && d.getMonth() === new Date().getMonth();
            const prefix = isCurrentMonth ? this.plugin.t('panel.week.thisMonth') : '';
            const monthLabel = `${d.getFullYear()}年${d.getMonth() + 1}月`;
            this.weekTitleEl.setText(`${prefix ? prefix + ' · ' : ''}${monthLabel}`);
            this.todayBtn?.setText(this.plugin.t('panel.week.thisMonth'));
        }
    }

    // ========== CALENDAR VIEW ==========

    private renderProjectBar(entries: WeekEntry[], container: HTMLElement): void {
        const projectTotals = new Map<string, number>();
        let totalDuration = 0;
        for (const entry of entries) {
            const key = entry.project || this.plugin.t('panel.stats.noProject');
            projectTotals.set(key, (projectTotals.get(key) || 0) + entry.duration);
            totalDuration += entry.duration;
        }
        if (totalDuration > 0) {
            const barWrap = container.createDiv({ cls: 'Tomato-cal-project-bar' });
            for (const [project, duration] of projectTotals) {
                const pct = (duration / totalDuration) * 100;
                const seg = barWrap.createDiv({ cls: 'Tomato-cal-project-seg' });
                seg.style.width = `${pct}%`;
                seg.style.backgroundColor = projectColor(this.plugin, project);
                seg.setAttribute('aria-label', `${project}: ${minutesToHM(duration)}`);
            }
        }
    }

    private buildCalendarGrid(wrap: HTMLElement, days: string[]): { grid: HTMLElement; ruler: HTMLElement } {
        let grid: HTMLElement;
        let ruler: HTMLElement;

        if (this.calendarView === 'month') {
            grid = wrap.createDiv({ cls: 'Tomato-cal-grid' });
            grid.style.gridTemplateColumns = `44px repeat(${days.length}, minmax(16px, 1fr))`;

            ruler = grid.createDiv({ cls: 'Tomato-cal-ruler Tomato-cal-ruler-month' });
        } else {
            const headerRow = wrap.createDiv({ cls: 'Tomato-cal-header-row' });
            headerRow.style.gridTemplateColumns = `44px repeat(${days.length}, minmax(20px, 1fr))`;

            headerRow.createDiv({ cls: 'Tomato-cal-ruler-placeholder' });
            for (let i = 0; i < days.length; i++) {
                const date = days[i];
                const header = headerRow.createDiv({ cls: 'Tomato-cal-col-header' });
                if (i === 0) header.addClass('first-col');
                const isToday = date === todayString();
                header.toggleClass('today', isToday);
                header.createDiv({ cls: 'Tomato-cal-col-daynum', text: String(new Date(date + 'T00:00:00').getDate()) });
                header.createDiv({ cls: 'Tomato-cal-col-dayname', text: dayNameShort(date, this.lang) });

                header.addEventListener('contextmenu', (evt) => {
                    evt.preventDefault();
                    const menu = new Menu();
                    menu.addItem((item) => {
                        item.setTitle(this.plugin.t('panel.week.openLog'))
                            .setIcon('document')
                            .onClick(async () => {
                                const path = normalizePath(`${this.plugin.settings.logFolder}/${date}.md`);
                                const file = this.app.vault.getFileByPath(path);
                                if (file) {
                                    const leaf = this.app.workspace.getLeaf(false);
                                    await leaf.openFile(file);
                                }
                            });
                    });
                    menu.showAtMouseEvent(evt);
                });
            }

            grid = wrap.createDiv({ cls: 'Tomato-cal-grid' });
            grid.style.gridTemplateColumns = `44px repeat(${days.length}, minmax(20px, 1fr))`;

            ruler = grid.createDiv({ cls: 'Tomato-cal-ruler' });
        }

        for (let h = 0; h <= 24; h += 2) {
            const label = ruler.createDiv({ cls: 'Tomato-cal-ruler-label' });
            label.style.top = `${(h / 24) * 100}%`;
            label.setText(`${String(h).padStart(2, '0')}:00`);
        }

        if (this.calendarView !== 'month') {
            const today = todayString();
            if (days.includes(today)) {
                const now = new Date();
                const currentMin = now.getHours() * 60 + now.getMinutes();
                this.currentLineEl = grid.createDiv({ cls: 'Tomato-cal-current-line' });
                this.currentLineEl.style.top = `${(currentMin / 1440) * 100}%`;
                this.currentLineLabel = ruler.createDiv({ cls: 'Tomato-cal-current-label' });
                this.currentLineLabel.style.top = `${(currentMin / 1440) * 100}%`;
                this.currentLineLabel.style.left = '2px';
                this.currentLineLabel.setText(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
            }
        }

        return { grid, ruler };
    }

    private renderCalendar(entries: WeekEntry[], days: string[]): void {
        const el = this.tabContentEl;
        el.empty();
        this.renderProjectBar(entries, el);
        const wrap = el.createDiv({ cls: 'Tomato-cal-wrap' });
        const { grid, ruler } = this.buildCalendarGrid(wrap, days);

        // Day columns
        for (let i = 0; i < days.length; i++) {
            const date = days[i];
            const col = grid.createDiv({ cls: 'Tomato-cal-col' });
            if (i === 0) col.addClass('first-col');
            col.setAttribute('data-date', date);

            for (let h = 1; h < 24; h++) {
                const line = col.createDiv({ cls: 'Tomato-cal-hline' });
                line.style.top = `${(h / 24) * 100}%`;
            }

            const dayEntries = entries
                .filter(e => e.date === date)
                .map(e => ({ entry: e, index: e.originalIndex }))
                .sort((a, b) => timeToMinutes(a.entry.startTime) - timeToMinutes(b.entry.startTime));

            const positioned = this.positionEntries(dayEntries);

            for (const pe of positioned) {
                const bar = col.createDiv({ cls: 'Tomato-cal-bar' });
                const startMin = timeToMinutes(pe.entry.startTime);
                const top = (startMin / 1440) * 100;
                const height = (pe.entry.duration / 1440) * 100;
                bar.style.top = `${top}%`;
                bar.style.height = `${Math.max(height, 0.5)}%`;
                bar.style.left = `${pe.left}%`;
                bar.style.width = `${pe.width}%`;
                bar.style.backgroundColor = projectColor(this.plugin, pe.entry.project);

                const title = pe.entry.project || pe.entry.taskName || '';
                if (title && this.calendarView !== 'month') {
                    bar.createDiv({ cls: 'Tomato-cal-bar-title', text: title });
                }
                if (pe.entry.duration >= 15 && this.calendarView === 'day') {
                    bar.createDiv({ cls: 'Tomato-cal-bar-time', text: `${pe.entry.startTime} ~ ${pe.entry.endTime}` });
                }

                bar.addEventListener('contextmenu', (evt) => {
                    evt.preventDefault();
                    evt.stopPropagation();
                    this.editEntryDialog(date, pe.index, pe.entry);
                });

                if (this.calendarView !== 'month') {
                    // Move handle (middle)
                    bar.addEventListener('mousedown', (evt) => {
                        if (evt.button !== 0) return;
                        const target = evt.target as HTMLElement;
                        if (target.hasClass('Tomato-cal-bar-resize-handle')) return;
                        evt.preventDefault();
                        evt.stopPropagation();
                        const startY = evt.clientY;
                        const originalTop = bar.offsetTop;
                        const colEl = col;
                        const snapMin = this.plugin.settings.calendarSnapMinutes || 5;

                        let dragLabel = bar.querySelector('.Tomato-cal-bar-dragtime') as HTMLElement | null;
                        if (!dragLabel) {
                            dragLabel = bar.createDiv({ cls: 'Tomato-cal-bar-dragtime' });
                        }
                        dragLabel.style.display = 'block';
                        bar.addClass('Tomato-cal-bar-dragging');
                        document.body.style.cursor = 'grabbing';

                        const snapTop = (rawTop: number): { top: number; timeStr: string } => {
                            const centerY = rawTop + bar.clientHeight / 2;
                            const ratio = Math.max(0, Math.min(1, centerY / colEl.clientHeight));
                            const minute = Math.round(ratio * 1440);
                            const snappedMinute = Math.max(0, Math.min(1440, Math.round(minute / snapMin) * snapMin));
                            const snappedRatio = snappedMinute / 1440;
                            const snappedTop = snappedRatio * colEl.clientHeight - bar.clientHeight / 2;
                            const clampedTop = Math.max(0, Math.min(colEl.clientHeight - bar.clientHeight, snappedTop));
                            const h = Math.floor(snappedMinute / 60) % 24;
                            const m = snappedMinute % 60;
                            const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                            return { top: clampedTop, timeStr };
                        };

                        const onMove = (e: MouseEvent) => {
                            const dy = e.clientY - startY;
                            const rawTop = originalTop + dy;
                            const { top, timeStr } = snapTop(rawTop);
                            bar.style.top = `${top}px`;
                            dragLabel!.setText(timeStr);
                        };

                        const onUp = async (e: MouseEvent) => {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                            bar.removeClass('Tomato-cal-bar-dragging');
                            document.body.style.cursor = '';
                            if (dragLabel) dragLabel.style.display = 'none';

                            const rect = colEl.getBoundingClientRect();
                            const y = bar.getBoundingClientRect().top - rect.top;
                            const ratio = Math.max(0, Math.min(1, y / rect.height));
                            const minute = Math.round(ratio * 1440);
                            const snappedMinute = Math.max(0, Math.min(1440, Math.round(minute / snapMin) * snapMin));
                            const h = Math.floor(snappedMinute / 60) % 24;
                            const m = snappedMinute % 60;
                            const newStart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                            const newEndMin = snappedMinute + pe.entry.duration;
                            const eh = Math.floor(newEndMin / 60) % 24;
                            const em = newEndMin % 60;
                            const newEnd = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
                            await this.doEditEntry(date, pe.index, { startTime: newStart, endTime: newEnd });
                        };

                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                    });

                    // Resize handles
                    const resizeTop = bar.createDiv({ cls: 'Tomato-cal-bar-resize-handle Tomato-cal-bar-resize-top' });
                    const resizeBottom = bar.createDiv({ cls: 'Tomato-cal-bar-resize-handle Tomato-cal-bar-resize-bottom' });

                    // Top resize: adjust start time (duration changes, end time stays)
                    resizeTop.addEventListener('mousedown', (evt) => {
                        if (evt.button !== 0) return;
                        evt.preventDefault();
                        evt.stopPropagation();
                        const startY = evt.clientY;
                        const originalTop = bar.offsetTop;
                        const originalHeight = bar.clientHeight;
                        const originalEndMin = timeToMinutes(pe.entry.endTime);
                        const colEl = col;
                        const snapMin = this.plugin.settings.calendarSnapMinutes || 5;

                        bar.addClass('Tomato-cal-bar-dragging');
                        document.body.style.cursor = 'ns-resize';

                        let dragLabel = bar.querySelector('.Tomato-cal-bar-dragtime') as HTMLElement | null;
                        if (!dragLabel) {
                            dragLabel = bar.createDiv({ cls: 'Tomato-cal-bar-dragtime' });
                        }
                        dragLabel.style.display = 'block';

                        const onMove = (e: MouseEvent) => {
                            const dy = e.clientY - startY;
                            const newTop = originalTop + dy;
                            const newHeight = Math.max(4, originalHeight - dy);
                            bar.style.top = `${Math.max(0, newTop)}px`;
                            bar.style.height = `${newHeight}px`;
                            const ratio = Math.max(0, Math.min(1, newTop / colEl.clientHeight));
                            const minute = Math.round(ratio * 1440);
                            const snappedMinute = Math.max(0, Math.min(originalEndMin - snapMin, Math.round(minute / snapMin) * snapMin));
                            const h = Math.floor(snappedMinute / 60) % 24;
                            const m = snappedMinute % 60;
                            dragLabel!.setText(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                        };

                        const onUp = async (e: MouseEvent) => {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                            bar.removeClass('Tomato-cal-bar-dragging');
                            document.body.style.cursor = '';
                            if (dragLabel) dragLabel.style.display = 'none';

                            const rect = colEl.getBoundingClientRect();
                            const y = bar.getBoundingClientRect().top - rect.top;
                            const ratio = Math.max(0, Math.min(1, y / rect.height));
                            const minute = Math.round(ratio * 1440);
                            const snappedMinute = Math.max(0, Math.min(originalEndMin - snapMin, Math.round(minute / snapMin) * snapMin));
                            const h = Math.floor(snappedMinute / 60) % 24;
                            const m = snappedMinute % 60;
                            const newStart = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                            const newDuration = originalEndMin - snappedMinute;
                            await this.doEditEntry(date, pe.index, { startTime: newStart, duration: newDuration });
                        };

                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                    });

                    // Bottom resize: adjust end time (duration changes, start time stays)
                    resizeBottom.addEventListener('mousedown', (evt) => {
                        if (evt.button !== 0) return;
                        evt.preventDefault();
                        evt.stopPropagation();
                        const startY = evt.clientY;
                        const originalHeight = bar.clientHeight;
                        const originalStartMin = timeToMinutes(pe.entry.startTime);
                        const colEl = col;
                        const snapMin = this.plugin.settings.calendarSnapMinutes || 5;

                        bar.addClass('Tomato-cal-bar-dragging');
                        document.body.style.cursor = 'ns-resize';

                        let dragLabel = bar.querySelector('.Tomato-cal-bar-dragtime') as HTMLElement | null;
                        if (!dragLabel) {
                            dragLabel = bar.createDiv({ cls: 'Tomato-cal-bar-dragtime' });
                        }
                        dragLabel.style.display = 'block';

                        const onMove = (e: MouseEvent) => {
                            const dy = e.clientY - startY;
                            const newHeight = Math.max(4, originalHeight + dy);
                            bar.style.height = `${newHeight}px`;
                            const bottomY = bar.offsetTop + newHeight;
                            const ratio = Math.max(0, Math.min(1, bottomY / colEl.clientHeight));
                            const minute = Math.round(ratio * 1440);
                            const snappedMinute = Math.max(originalStartMin + snapMin, Math.round(minute / snapMin) * snapMin);
                            const h = Math.floor(snappedMinute / 60) % 24;
                            const m = snappedMinute % 60;
                            dragLabel!.setText(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
                        };

                        const onUp = async (e: MouseEvent) => {
                            document.removeEventListener('mousemove', onMove);
                            document.removeEventListener('mouseup', onUp);
                            bar.removeClass('Tomato-cal-bar-dragging');
                            document.body.style.cursor = '';
                            if (dragLabel) dragLabel.style.display = 'none';

                            const rect = colEl.getBoundingClientRect();
                            const bottomY = bar.getBoundingClientRect().bottom - rect.top;
                            const ratio = Math.max(0, Math.min(1, bottomY / rect.height));
                            const minute = Math.round(ratio * 1440);
                            const snappedMinute = Math.max(originalStartMin + snapMin, Math.round(minute / snapMin) * snapMin);
                            const h = Math.floor(snappedMinute / 60) % 24;
                            const m = snappedMinute % 60;
                            const newEnd = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                            const newDuration = snappedMinute - originalStartMin;
                            await this.doEditEntry(date, pe.index, { endTime: newEnd, duration: newDuration });
                        };

                        document.addEventListener('mousemove', onMove);
                        document.addEventListener('mouseup', onUp);
                    });
                }
            }

            if (this.calendarView !== 'month') {
                this.renderOngoingBar(col, date);
            }

            // Drag-to-create entry on day/week view
            if (this.calendarView !== 'month') {
                let dragSelectEl: HTMLElement | null = null;
                let dragStartY = 0;
                let isSelecting = false;

                const onSelectMove = (e: MouseEvent) => {
                    if (!isSelecting || !dragSelectEl) return;
                    const rect = col.getBoundingClientRect();
                    const currentY = e.clientY - rect.top;
                    const startYLocal = dragStartY - rect.top;
                    const top = Math.max(0, Math.min(startYLocal, currentY));
                    const height = Math.abs(currentY - startYLocal);
                    dragSelectEl.style.top = `${top}px`;
                    dragSelectEl.style.height = `${height}px`;
                };

                const onSelectUp = (e: MouseEvent) => {
                    if (!isSelecting || !dragSelectEl) return;
                    isSelecting = false;

                    const rect = col.getBoundingClientRect();
                    const startYLocal = dragStartY - rect.top;
                    const endYLocal = e.clientY - rect.top;
                    const topY = Math.min(startYLocal, endYLocal);
                    const bottomY = Math.max(startYLocal, endYLocal);

                    if (bottomY - topY < 5) {
                        dragSelectEl.remove();
                        dragSelectEl = null;
                        document.removeEventListener('mousemove', onSelectMove);
                        document.removeEventListener('mouseup', onSelectUp);
                        return;
                    }

                    const startRatio = Math.max(0, Math.min(1, topY / rect.height));
                    const endRatio = Math.max(0, Math.min(1, bottomY / rect.height));
                    const startMinute = Math.round(startRatio * 1440);
                    const endMinute = Math.max(startMinute + 1, Math.round(endRatio * 1440));
                    const sh = Math.floor(startMinute / 60);
                    const sm = startMinute % 60;
                    const eh = Math.floor(endMinute / 60);
                    const em = endMinute % 60;
                    const startTime = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
                    const endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;

                    dragSelectEl.remove();
                    dragSelectEl = null;
                    document.removeEventListener('mousemove', onSelectMove);
                    document.removeEventListener('mouseup', onSelectUp);

                    this.showAddEntryDialog(date, startTime, endTime);
                };

                col.addEventListener('mousedown', (evt) => {
                    if (evt.button !== 0) return;
                    if (evt.target !== col && !(evt.target as HTMLElement).hasClass('Tomato-cal-hline')) return;
                    evt.preventDefault();
                    isSelecting = true;
                    dragStartY = evt.clientY;

                    dragSelectEl = col.createDiv({ cls: 'Tomato-cal-select-range' });
                    const rect = col.getBoundingClientRect();
                    const y = evt.clientY - rect.top;
                    dragSelectEl.style.top = `${y}px`;
                    dragSelectEl.style.height = '0px';

                    document.addEventListener('mousemove', onSelectMove);
                    document.addEventListener('mouseup', onSelectUp);
                });
            }
        }
    }

    private renderOngoingBar(col: HTMLElement, date: string): void {
        if (this.plugin.timer.getState().status !== 'running' || date !== this.plugin.timer.getSessionStartDate()) return;

        const sessionTime = this.plugin.timer.getSessionStartTime();
        const startMin = timeToMinutes(sessionTime);
        const now = new Date();
        const currentMin = now.getHours() * 60 + now.getMinutes();
        let duration: number;
        if (currentMin >= startMin) {
            duration = currentMin - startMin;
        } else {
            duration = (1440 - startMin) + currentMin;
        }
        const top = (startMin / 1440) * 100;
        const height = (duration / 1440) * 100;
        this.ongoingBarEl = col.createDiv({ cls: 'Tomato-cal-bar Tomato-cal-bar-ongoing' });
        this.ongoingBarEl.style.top = `${top}%`;
        this.ongoingBarEl.style.height = `${Math.max(height, 0.5)}%`;
        this.ongoingBarEl.style.left = '0%';
        this.ongoingBarEl.style.width = '100%';
        this.ongoingBarEl.style.backgroundColor = projectColor(this.plugin, this.plugin.timer.getCurrentProject());
        const title = this.plugin.timer.getTaskName() || this.plugin.timer.getCurrentProject() || this.plugin.t('panel.timer.running');
        this.ongoingBarEl.createDiv({ cls: 'Tomato-cal-bar-title', text: title });
        this.ongoingBarLabel = this.ongoingBarEl.createDiv({ cls: 'Tomato-cal-bar-time', text: minutesToHM(duration) });

        // Top resize: adjust start time
        const resizeTop = this.ongoingBarEl.createDiv({ cls: 'Tomato-cal-bar-resize-handle Tomato-cal-bar-resize-top' });
        resizeTop.addEventListener('mousedown', (evt) => {
            if (evt.button !== 0) return;
            evt.preventDefault();
            evt.stopPropagation();
            const startY = evt.clientY;
            const originalTop = this.ongoingBarEl!.offsetTop;
            const originalStartMin = startMin;
            const colEl = col;
            const snapMin = this.plugin.settings.calendarSnapMinutes || 5;
            this.isDraggingOngoing = true;
            this.ongoingBarEl!.addClass('Tomato-cal-bar-dragging');
            document.body.style.cursor = 'ns-resize';

            let dragLabel = this.ongoingBarEl!.querySelector('.Tomato-cal-bar-dragtime') as HTMLElement | null;
            if (!dragLabel) {
                dragLabel = this.ongoingBarEl!.createDiv({ cls: 'Tomato-cal-bar-dragtime' });
            }
            dragLabel.style.display = 'block';

            const onMove = (e: MouseEvent) => {
                const dy = e.clientY - startY;
                const newTop = Math.max(0, originalTop + dy);
                this.ongoingBarEl!.style.top = `${newTop}px`;
                const ratio = Math.max(0, Math.min(1, newTop / colEl.clientHeight));
                const minute = Math.round(ratio * 1440);
                const snappedMinute = Math.max(0, Math.min(currentMin - snapMin, Math.round(minute / snapMin) * snapMin));
                const h = Math.floor(snappedMinute / 60) % 24;
                const m = snappedMinute % 60;
                dragLabel!.setText(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            };

            const onUp = async (e: MouseEvent) => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                this.ongoingBarEl!.removeClass('Tomato-cal-bar-dragging');
                document.body.style.cursor = '';
                if (dragLabel) dragLabel.style.display = 'none';
                this.isDraggingOngoing = false;

                const rect = colEl.getBoundingClientRect();
                const y = this.ongoingBarEl!.getBoundingClientRect().top - rect.top;
                const ratio = Math.max(0, Math.min(1, y / rect.height));
                const minute = Math.round(ratio * 1440);
                const snappedMinute = Math.max(0, Math.min(currentMin - snapMin, Math.round(minute / snapMin) * snapMin));
                const deltaMin = snappedMinute - originalStartMin;
                if (deltaMin !== 0) {
                    this.plugin.timer.adjustSessionStart(deltaMin);
                    await this.refreshTabContent();
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        // Drag block: adjust start time (duration changes because end = now)
        this.ongoingBarEl.addEventListener('mousedown', (evt) => {
            if (evt.button !== 0) return;
            if ((evt.target as HTMLElement).hasClass('Tomato-cal-bar-resize-handle')) return;
            evt.preventDefault();
            const startY = evt.clientY;
            const originalTop = this.ongoingBarEl!.offsetTop;
            const originalStartMin = startMin;
            const colEl = col;
            const snapMin = this.plugin.settings.calendarSnapMinutes || 5;
            this.isDraggingOngoing = true;
            this.ongoingBarEl!.addClass('Tomato-cal-bar-dragging');
            document.body.style.cursor = 'grabbing';

            let dragLabel = this.ongoingBarEl!.querySelector('.Tomato-cal-bar-dragtime') as HTMLElement | null;
            if (!dragLabel) {
                dragLabel = this.ongoingBarEl!.createDiv({ cls: 'Tomato-cal-bar-dragtime' });
            }
            dragLabel.style.display = 'block';

            const onMove = (e: MouseEvent) => {
                const dy = e.clientY - startY;
                const newTop = Math.max(0, originalTop + dy);
                this.ongoingBarEl!.style.top = `${newTop}px`;
                const ratio = Math.max(0, Math.min(1, newTop / colEl.clientHeight));
                const minute = Math.round(ratio * 1440);
                const snappedMinute = Math.max(0, Math.min(currentMin - snapMin, Math.round(minute / snapMin) * snapMin));
                const h = Math.floor(snappedMinute / 60) % 24;
                const m = snappedMinute % 60;
                dragLabel!.setText(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
            };

            const onUp = async (e: MouseEvent) => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                this.ongoingBarEl!.removeClass('Tomato-cal-bar-dragging');
                document.body.style.cursor = '';
                if (dragLabel) dragLabel.style.display = 'none';
                this.isDraggingOngoing = false;

                const rect = colEl.getBoundingClientRect();
                const y = this.ongoingBarEl!.getBoundingClientRect().top - rect.top;
                const ratio = Math.max(0, Math.min(1, y / rect.height));
                const minute = Math.round(ratio * 1440);
                const snappedMinute = Math.max(0, Math.min(currentMin - snapMin, Math.round(minute / snapMin) * snapMin));
                const deltaMin = snappedMinute - originalStartMin;
                if (deltaMin !== 0) {
                    this.plugin.timer.adjustSessionStart(deltaMin);
                    await this.refreshTabContent();
                }
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    }

    private updateCurrentTimeLine(): void {
        const n = new Date();
        const min = n.getHours() * 60 + n.getMinutes();
        if (this.currentLineEl?.isConnected) {
            this.currentLineEl.style.top = `${(min / 1440) * 100}%`;
        }
        if (this.currentLineLabel?.isConnected) {
            this.currentLineLabel.style.top = `${(min / 1440) * 100}%`;
            this.currentLineLabel.setText(`${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`);
        }
        if (this.ongoingBarEl?.isConnected && this.plugin.timer.getState().status === 'running' && !this.isDraggingOngoing) {
            const startMin = timeToMinutes(this.plugin.timer.getSessionStartTime());
            let duration: number;
            if (min >= startMin) {
                duration = min - startMin;
            } else {
                duration = (1440 - startMin) + min;
            }
            const top = (startMin / 1440) * 100;
            const height = (duration / 1440) * 100;
            this.ongoingBarEl.style.top = `${top}%`;
            this.ongoingBarEl.style.height = `${Math.max(height, 0.5)}%`;
            this.ongoingBarLabel?.setText(minutesToHM(duration));
        }
    }

    private positionEntries(dayEntries: { entry: ParsedEntry; index: number }[]): PositionedEntry[] {
        const result: PositionedEntry[] = [];
        for (let i = 0; i < dayEntries.length; i++) {
            const { entry, index } = dayEntries[i];
            const start = timeToMinutes(entry.startTime);
            const end = start + entry.duration;

            const overlaps: number[] = [i];
            for (let j = 0; j < dayEntries.length; j++) {
                if (i === j) continue;
                const oStart = timeToMinutes(dayEntries[j].entry.startTime);
                const oEnd = oStart + dayEntries[j].entry.duration;
                if (start < oEnd && end > oStart) {
                    overlaps.push(j);
                }
            }

            overlaps.sort((a, b) => a - b);
            const pos = overlaps.indexOf(i);
            const count = overlaps.length;
            const gap = count > 1 ? 1 : 0;

            result.push({
                entry,
                index,
                left: (pos / count) * 100,
                width: (100 / count) - gap,
            });
        }
        return result;
    }

    // ========== LIST VIEW ==========

    private renderList(entries: WeekEntry[]): void {
        const el = this.tabContentEl;
        el.empty();

        const days = weekDays(this.navDate);
        const total = entries.reduce((s, e) => s + e.duration, 0);
        const totalEl = el.createDiv({ cls: 'Tomato-list-total' });
        totalEl.setText(`${this.plugin.t('panel.week.total')} ${minutesToHM(total)}`);

        for (const date of days.slice().reverse()) {
            const dayEntries = entries.filter(e => e.date === date);
            if (dayEntries.length === 0) continue;

            const section = el.createDiv({ cls: 'Tomato-list-day' });
            const header = section.createDiv({ cls: 'Tomato-list-day-header' });
            const isToday = date === todayString();
            header.toggleClass('today', isToday);
            header.createSpan({ text: `${dayNameShort(date, this.lang)} ${formatDateShort(date)}` });

            const dayTotal = dayEntries.reduce((s, e) => s + e.duration, 0);
            header.createSpan({ cls: 'Tomato-list-day-total', text: minutesToHM(dayTotal) });

            for (const entry of dayEntries.slice().reverse()) {
                const row = section.createDiv({ cls: 'Tomato-list-row' });
                row.addEventListener('contextmenu', (evt) => {
                    evt.preventDefault();
                    this.editEntryDialog(date, entry.originalIndex, entry);
                });

                const dot = row.createDiv({ cls: 'Tomato-list-dot' });
                dot.style.backgroundColor = projectColor(this.plugin, entry.project);

                const meta = row.createDiv({ cls: 'Tomato-list-meta' });
                const rawTask = (entry.taskName || '').replace(/^tomato_project：\s*\S+\s*/, '').trim();
                const taskName = rawTask || entry.project || this.plugin.t('panel.stats.noProject');
                meta.createDiv({ cls: 'Tomato-list-task', text: taskName });
                meta.createDiv({ cls: 'Tomato-list-time', text: `${entry.startTime} ~ ${entry.endTime}` });

                row.createDiv({ cls: 'Tomato-list-duration', text: minutesToHM(entry.duration) });
            }
        }

        if (entries.length === 0) {
            el.createDiv({ cls: 'Tomato-empty', text: this.plugin.t('panel.history.noTomatos') });
        }
    }

    // ========== TIMESHEET VIEW ==========

    private renderTimesheet(entries: WeekEntry[]): void {
        const el = this.tabContentEl;
        el.empty();

        const days = weekDays(this.navDate);
        const projects = Array.from(new Set(entries.map(e => e.project || this.plugin.t('panel.stats.noProject')))).sort();
        const noProjectLabel = this.plugin.t('panel.stats.noProject');

        const table = el.createDiv({ cls: 'Tomato-ts-table' });

        // Header row
        const headerRow = table.createDiv({ cls: 'Tomato-ts-row Tomato-ts-header' });
        headerRow.createDiv({ cls: 'Tomato-ts-cell Tomato-ts-project', text: this.plugin.t('panel.entry.project') });
        for (const date of days) {
            const cell = headerRow.createDiv({ cls: 'Tomato-ts-cell' });
            cell.createDiv({ text: dayNameShort(date, this.lang).toUpperCase() });
            cell.createDiv({ cls: 'Tomato-ts-date', text: formatDateShort(date) });
        }
        headerRow.createDiv({ cls: 'Tomato-ts-cell Tomato-ts-total', text: this.plugin.t('panel.week.total') });

        // Data rows
        const dailyTotals = new Map<string, number>();
        for (const date of days) dailyTotals.set(date, 0);

        for (const proj of projects) {
            const row = table.createDiv({ cls: 'Tomato-ts-row' });
            const projCell = row.createDiv({ cls: 'Tomato-ts-cell Tomato-ts-project' });
            const dot = projCell.createDiv({ cls: 'Tomato-ts-dot' });
            dot.style.backgroundColor = projectColor(this.plugin, proj === noProjectLabel ? '' : proj);
            projCell.createSpan({ text: proj });

            let projTotal = 0;
            for (const date of days) {
                const mins = entries
                    .filter(e => e.date === date && (e.project || noProjectLabel) === proj)
                    .reduce((s, e) => s + e.duration, 0);
                projTotal += mins;
                dailyTotals.set(date, (dailyTotals.get(date) || 0) + mins);

                const cell = row.createDiv({ cls: 'Tomato-ts-cell' });
                if (mins > 0) {
                    cell.setText(minutesToHM(mins));
                }
            }
            row.createDiv({ cls: 'Tomato-ts-cell Tomato-ts-total', text: minutesToHM(projTotal) });
        }

        // Total row
        const totalRow = table.createDiv({ cls: 'Tomato-ts-row Tomato-ts-total-row' });
        totalRow.createDiv({ cls: 'Tomato-ts-cell Tomato-ts-project', text: this.plugin.t('panel.week.total') });
        let grandTotal = 0;
        for (const date of days) {
            const t = dailyTotals.get(date) || 0;
            grandTotal += t;
            const cell = totalRow.createDiv({ cls: 'Tomato-ts-cell' });
            if (t > 0) cell.setText(minutesToHM(t));
        }
        totalRow.createDiv({ cls: 'Tomato-ts-cell Tomato-ts-total', text: minutesToHM(grandTotal) });

        if (entries.length === 0) {
            el.createDiv({ cls: 'Tomato-empty', text: this.plugin.t('panel.history.noTomatos') });
        }
    }

    // ========== STATS VIEW (Pie Chart) ==========

    private renderStats(entries: WeekEntry[]): void {
        const el = this.tabContentEl;
        el.empty();

        const total = entries.reduce((sum, e) => sum + e.duration, 0);
        if (total === 0) {
            el.createDiv({ cls: 'Tomato-empty', text: this.plugin.t('panel.history.noTomatos') });
            return;
        }

        const noProjectLabel = this.plugin.t('panel.stats.noProject');
        const projMap = new Map<string, number>();
        for (const e of entries) {
            const p = e.project || noProjectLabel;
            projMap.set(p, (projMap.get(p) || 0) + e.duration);
        }

        const projList = Array.from(projMap.entries()).sort((a, b) => b[1] - a[1]);

        // Pie chart SVG
        const size = 200;
        const radius = 80;
        const cx = size / 2;
        const cy = size / 2;
        let currentAngle = -Math.PI / 2;

        const chartWrap = el.createDiv({ cls: 'Tomato-stats-chart' });
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.addClass('Tomato-pie-svg');
        chartWrap.appendChild(svg);

        for (const [proj, mins] of projList) {
            const sliceAngle = (mins / total) * 2 * Math.PI;
            const x1 = cx + radius * Math.cos(currentAngle);
            const y1 = cy + radius * Math.sin(currentAngle);
            const x2 = cx + radius * Math.cos(currentAngle + sliceAngle);
            const y2 = cy + radius * Math.sin(currentAngle + sliceAngle);
            const largeArc = sliceAngle > Math.PI ? 1 : 0;

            const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('fill', projectColor(this.plugin, proj === noProjectLabel ? '' : proj));
            path.setAttribute('stroke', 'var(--background-primary)');
            path.setAttribute('stroke-width', '2');
            path.setAttribute('title', `${proj}: ${minutesToHM(mins)}`);
            path.addClass('Tomato-pie-slice');
            svg.appendChild(path);

            currentAngle += sliceAngle;
        }

        // Hole for donut look
        const hole = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hole.setAttribute('cx', String(cx));
        hole.setAttribute('cy', String(cy));
        hole.setAttribute('r', '40');
        hole.setAttribute('fill', 'var(--background-primary)');
        svg.appendChild(hole);

        // Labels
        const labelsWrap = el.createDiv({ cls: 'Tomato-stats-labels' });
        for (const [proj, mins] of projList) {
            const label = labelsWrap.createDiv({ cls: 'Tomato-stats-label' });
            const dot = label.createDiv({ cls: 'Tomato-stats-dot' });
            dot.style.backgroundColor = projectColor(this.plugin, proj === noProjectLabel ? '' : proj);
            const pct = Math.round((mins / total) * 100);
            label.createSpan({ text: `${proj} ${minutesToHM(mins)} (${pct}%)` });
        }

        // Total center text
        const totalText = chartWrap.createDiv({ cls: 'Tomato-pie-total' });
        totalText.setText(minutesToHM(total));
    }

    // ========== CONTEXT MENU & EDITING ==========

    private showEntryMenu(evt: MouseEvent, date: string, entry: ParsedEntry, index: number): void {
        const menu = new Menu();
        menu.addItem(item => {
            item.setTitle(this.plugin.t('panel.entry.edit'));
            item.setIcon('pencil');
            item.onClick(() => this.editEntryDialog(date, index, entry));
        });
        menu.addItem(item => {
            item.setTitle(this.plugin.t('panel.entry.delete'));
            item.setIcon('trash');
            item.onClick(() => this.deleteEntry(date, index));
        });
        menu.showAtMouseEvent(evt);
    }

    private async deleteEntry(date: string, index: number): Promise<void> {
        const { entries } = await parseDayFile(this.plugin.app, this.plugin.settings, date);
        entries.splice(index, 1);
        await writeDayEntries(this.plugin.app, this.plugin.settings, date, entries);
        new Notice(this.plugin.t('panel.entry.delete'));
        await this.refreshTabContent();
    }

    private editEntryDialog(date: string, index: number, entry: ParsedEntry): void {
        const rawTask = entry.taskName.replace(/^tomato_project：\s*\S+\s*/, '').trim();
        new EntryModal(this.app, this.plugin, this.plugin.t('panel.entry.edit'), {
            startTime: entry.startTime,
            endTime: entry.endTime,
            duration: String(entry.duration),
            project: entry.project || '',
            task: rawTask,
        }, (result) => {
            const startMin = timeToMinutes(result.startTime || entry.startTime);
            const endMin = timeToMinutes(result.endTime || entry.endTime);
            if (isNaN(startMin) || isNaN(endMin)) {
                new Notice(this.plugin.t('notice.invalidTimeFormat'));
                return;
            }
            void this.doEditEntry(date, index, {
                startTime: result.startTime,
                endTime: result.endTime,
                duration: Math.max(0, endMin - startMin),
                project: result.project || undefined,
                taskName: result.task || undefined,
            });
        }, () => {
            void this.deleteEntry(date, index);
        }).open();
    }

    private async doEditEntry(date: string, index: number, updates: Partial<ParsedEntry>): Promise<void> {
        const { entries } = await parseDayFile(this.plugin.app, this.plugin.settings, date);
        if (index >= 0 && index < entries.length) {
            const updated = { ...entries[index], ...updates };
            this.encodeProjectIntoTaskName(updated);
            entries[index] = updated;
            await writeDayEntries(this.plugin.app, this.plugin.settings, date, entries);
            new Notice(this.plugin.t('panel.entry.edit'));
            this.plugin.refreshLogViews();
        }
    }

    private encodeProjectIntoTaskName(entry: ParsedEntry): void {
        if (entry.project) {
            const rawTask = (entry.taskName || '').replace(/^tomato_project：\s*\S+\s*/, '').trim();
            entry.taskName = `tomato_project：${entry.project}${rawTask ? ' ' + rawTask : ''}`;
            entry.rest = entry.taskName;
        }
    }

    private showAddEntryDialog(date: string, startTime: string, endTime?: string): void {
        const durationMin = endTime ? Math.max(1, timeToMinutes(endTime) - timeToMinutes(startTime)) : 60;
        new EntryModal(this.app, this.plugin, this.plugin.t('panel.entry.add'), {
            startTime,
            endTime: endTime || '',
            duration: String(durationMin),
            project: this.plugin.timer.getCurrentProject() || '',
            task: this.plugin.timer.getTaskName() || '',
        }, (result) => {
            const duration = parseInt(result.duration || '60', 10);
            if (isNaN(duration) || duration <= 0) {
                new Notice(this.plugin.t('notice.invalidDuration'));
                return;
            }
            const st = result.startTime || startTime;
            const startMin = timeToMinutes(st);
            const endMin = startMin + duration;
            const h = Math.floor(endMin / 60) % 24;
            const m = endMin % 60;
            const endTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            void this.doAddEntry(date, {
                startTime: st,
                endTime,
                duration,
                mode: this.plugin.timer.getMode(),
                project: result.project || undefined,
                taskName: result.task || '',
                rest: result.task || '',
            });
        }).open();
    }

    private async doAddEntry(date: string, entry: ParsedEntry): Promise<void> {
        this.encodeProjectIntoTaskName(entry);
        const { entries } = await parseDayFile(this.plugin.app, this.plugin.settings, date);
        entries.push(entry);
        entries.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
        await writeDayEntries(this.plugin.app, this.plugin.settings, date, entries);
        new Notice(this.plugin.t('panel.entry.add'));
        this.plugin.refreshLogViews();
    }
}

// ========== MODAL ==========

interface EntryForm {
    startTime: string;
    endTime: string;
    duration: string;
    project: string;
    task: string;
}

class EntryModal extends Modal {
    private result: EntryForm;
    private onSave: (result: EntryForm) => void;
    private onDelete?: () => void;
    private plugin: TomatoPlugin;

    constructor(app: App, plugin: TomatoPlugin, title: string, initial: EntryForm, onSave: (result: EntryForm) => void, onDelete?: () => void) {
        super(app);
        this.plugin = plugin;
        this.titleEl.setText(title);
        this.result = { ...initial };
        this.onSave = onSave;
        this.onDelete = onDelete;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('Tomato-modal');

        new Setting(contentEl)
            .setName(this.plugin.t('panel.entry.startTime'))
            .addText(text => {
                text.setValue(this.result.startTime);
                text.onChange(v => { this.result.startTime = v; });
            });

        new Setting(contentEl)
            .setName(this.plugin.t('panel.entry.endTime'))
            .addText(text => {
                text.setValue(this.result.endTime);
                text.onChange(v => { this.result.endTime = v; });
            });

        new Setting(contentEl)
            .setName(this.plugin.t('panel.entry.duration'))
            .addText(text => {
                text.setValue(this.result.duration);
                text.onChange(v => { this.result.duration = v; });
            });

        new Setting(contentEl)
            .setName(this.plugin.t('panel.entry.project'))
            .addText(text => {
                text.setValue(this.result.project);
                text.onChange(v => { this.result.project = v; });
            });

        new Setting(contentEl)
            .setName(this.plugin.t('panel.entry.task'))
            .addText(text => {
                text.setValue(this.result.task);
                text.onChange(v => { this.result.task = v; });
            });

        const btnSetting = new Setting(contentEl)
            .addButton(btn => {
                btn.setButtonText(this.plugin.t('panel.btn.save'));
                btn.onClick(() => {
                    this.onSave(this.result);
                    this.close();
                });
            });

        if (this.onDelete) {
            btnSetting.addButton(btn => {
                btn.setButtonText(this.plugin.t('panel.entry.delete'));
                btn.buttonEl.addClass('mod-warning');
                btn.onClick(() => {
                    this.onDelete!();
                    this.close();
                });
            });
        }
    }
}
