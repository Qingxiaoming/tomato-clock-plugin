// @ts-nocheck
import { App, TFile, TAbstractFile, FileView } from 'obsidian';
import { get } from 'svelte/store';
import {
    getDailyNoteSettings,
    getDailyNote,
} from 'obsidian-daily-notes-interface';
import Calendar from './src/ui/Calendar.svelte';
import {
    customTagsSource,
    streakSource,
    wordCountSource,
    tasksSource,
} from './src/ui/sources';
import {
    settings,
    dailyNotes,
    weeklyNotes,
    monthlyNotes,
    activeFile,
    getWeeklyNote,
} from './src/ui/stores';
import { showFileMenu } from './src/ui/fileMenu';
import { tryToCreateDailyNote } from './src/io/dailyNotes';
import { tryToCreateWeeklyNote } from './src/io/weeklyNotes';

export interface CalendarEmbedAPI {
    calendar: any;
    destroy(): void;
}

export function createCalendarEmbed(parent: HTMLElement, app: App): CalendarEmbedAPI {
    const calContainer = parent.createDiv({ cls: 'Tomato-compact-calendar-embed' });
    const sources = [customTagsSource, streakSource, wordCountSource, tasksSource];

    const onClickDay = async (date: any, inNewSplit: boolean) => {
        const { workspace } = app;
        const { format } = getDailyNoteSettings()!;
        const note = getDailyNote(date, get(dailyNotes));

        if (!note) {
            if (get(settings).shouldConfirmBeforeCreate) {
                const createFile = await new Promise<boolean>((res) => {
                    const { moment } = window as any;
                    const modal = new (require('obsidian').Modal)(app);
                    modal.contentEl.createEl('h3', { text: `Create note for ${moment(date).format('YYYY-MM-DD')}?` });
                    modal.contentEl.createEl('p', { text: 'This note does not exist yet.' });
                    const btnContainer = modal.contentEl.createDiv();
                    btnContainer.style.display = 'flex';
                    btnContainer.style.gap = '8px';
                    btnContainer.style.marginTop = '12px';
                    btnContainer.createEl('button', { text: 'Create' }).onclick = () => { modal.close(); res(true); };
                    btnContainer.createEl('button', { text: 'Cancel' }).onclick = () => { modal.close(); res(false); };
                    modal.open();
                });
                if (!createFile) return;
            }
            await tryToCreateDailyNote(date, inNewSplit, get(settings));
            return;
        }

        const mode = (app.vault as any).getConfig('defaultViewMode');
        const leaf = inNewSplit
            ? workspace.getLeaf('split')
            : workspace.getUnpinnedLeaf();
        await leaf.openFile(note, { active: true, mode } as any);
    };

    const onClickWeek = async (date: any, inNewSplit: boolean) => {
        const { workspace } = app;
        const existingFile = getWeeklyNote(date, get(weeklyNotes));

        if (!existingFile) {
            if (get(settings).shouldConfirmBeforeCreate) {
                const createFile = await new Promise<boolean>((res) => {
                    const { moment } = window as any;
                    const modal = new (require('obsidian').Modal)(app);
                    modal.contentEl.createEl('h3', { text: `Create weekly note for ${moment(date).format('gggg-[W]ww')}?` });
                    modal.contentEl.createEl('p', { text: 'This note does not exist yet.' });
                    const btnContainer = modal.contentEl.createDiv();
                    btnContainer.style.display = 'flex';
                    btnContainer.style.gap = '8px';
                    btnContainer.style.marginTop = '12px';
                    btnContainer.createEl('button', { text: 'Create' }).onclick = () => { modal.close(); res(true); };
                    btnContainer.createEl('button', { text: 'Cancel' }).onclick = () => { modal.close(); res(false); };
                    modal.open();
                });
                if (!createFile) return;
            }
            await tryToCreateWeeklyNote(date, inNewSplit, get(settings));
            return;
        }

        const mode = (app.vault as any).getConfig('defaultViewMode');
        const leaf = inNewSplit
            ? workspace.getLeaf('split')
            : workspace.getUnpinnedLeaf();
        await leaf.openFile(existingFile, { active: true, mode } as any);
    };

    const onHoverDay = (date: any, targetEl: HTMLElement) => {
        const note = getDailyNote(date, get(dailyNotes));
        if (note) {
            const { format } = getDailyNoteSettings()!;
            app.workspace.trigger('link-hover', null, targetEl, date.format(format), note?.path);
        }
    };

    const onHoverWeek = (date: any, targetEl: HTMLElement) => {
        const note = getWeeklyNote(date, get(weeklyNotes));
        if (note) {
            const format = get(settings).weeklyNoteFormat;
            app.workspace.trigger('link-hover', null, targetEl, date.format(format), note?.path);
        }
    };

    const onContextMenuDay = (date: any, event: MouseEvent) => {
        const note = getDailyNote(date, get(dailyNotes));
        if (note) {
            showFileMenu(app, note, { x: event.clientX, y: event.clientY });
        }
    };

    const onContextMenuWeek = (date: any, event: MouseEvent) => {
        const note = getWeeklyNote(date, get(weeklyNotes));
        if (note) {
            showFileMenu(app, note, { x: event.clientX, y: event.clientY });
        }
    };

    let calendar: Calendar;
    try {
        calendar = new Calendar({
            target: calContainer,
            props: {
                onClickDay,
                onClickWeek,
                onHoverDay,
                onHoverWeek,
                onContextMenuDay,
                onContextMenuWeek,
                sources,
            },
        });
    } catch (err) {
        console.error('[TomatoClock] Calendar embed init failed:', err);
        calContainer.createEl('div', { text: '日历加载失败', cls: 'Tomato-calendar-error' });
        return {
            calendar: null,
            destroy() { calContainer.empty(); },
        };
    }

    const vaultEvents: { evt: any; ref: any }[] = [];
    const wsEvents: { evt: any; ref: any }[] = [];

    function reindexNotes() {
        dailyNotes.reindex();
        weeklyNotes.reindex();
        monthlyNotes.reindex();
        calendar.tick();
    }

    vaultEvents.push({ evt: app.vault, ref: app.vault.on('create', reindexNotes) });
    vaultEvents.push({ evt: app.vault, ref: app.vault.on('delete', reindexNotes) });
    vaultEvents.push({ evt: app.vault, ref: app.vault.on('rename', reindexNotes) });

    const updateActiveFile = () => {
        const file = app.workspace.getActiveFile();
        if (file instanceof TFile) {
            activeFile.set(file);
        } else {
            activeFile.set(null);
        }
    };
    updateActiveFile();
    wsEvents.push({ evt: app.workspace, ref: app.workspace.on('file-open', updateActiveFile) });
    wsEvents.push({ evt: app.workspace, ref: app.workspace.on('active-leaf-change', updateActiveFile) });

    const onFileModified = (file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === 'md') {
            calendar.tick();
        }
    };
    vaultEvents.push({ evt: app.vault, ref: app.vault.on('modify', onFileModified) });

    wsEvents.push({ evt: app.workspace, ref: (app.workspace as any).on('obsidian-calendar-plugin:refresh', () => calendar.tick()) });
    wsEvents.push({ evt: app.workspace, ref: (app.workspace as any).on('obsidian-calendar-plugin:settings-updated', reindexNotes) });
    wsEvents.push({ evt: app.workspace, ref: (app.workspace as any).on('periodic-notes:settings-updated', reindexNotes) });

    return {
        calendar,
        destroy() {
            calendar.$destroy();
            vaultEvents.forEach(({ evt, ref }) => evt.offref(ref));
            wsEvents.forEach(({ evt, ref }) => evt.offref(ref));
        },
    };
}
