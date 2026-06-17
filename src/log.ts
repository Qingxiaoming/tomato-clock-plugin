import { App, TFile, normalizePath } from 'obsidian';
import type { TomatoPluginSettings } from './settings';
import type { TimerMode } from './timer';
import { addDays } from './utils';

export interface TomatoEntry {
    date: string;     // YYYY-MM-DD (start date)
    startTime: string; // HH:MM
    endTime: string;   // HH:MM
    duration: number;  // minutes
    mode: TimerMode;
    taskName: string;
}

export interface ParsedEntry {
    startTime: string;
    endTime: string;
    duration: number;
    mode: TimerMode;
    taskName: string;
    project?: string;
    rest: string;
    date?: string;
}

export interface DayRecord {
    date: string;
    entries: ParsedEntry[];
}

// Matches "- 14:30 ~ 14:55 (25m) [pomodoro] rest text"
const ENTRY_RE = /^- (\d{2}:\d{2}) ~ (\d{2}:\d{2}) \((\d+)m\) \[([^\]]+)\](.*)/;

export function todayString(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function timeFromDate(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function parseProject(taskName: string): string | undefined {
    const m = taskName.match(/tomato_project[：:]\s*(\S+)/);
    return m?.[1];
}

/** Get daily note path via Obsidian core daily-notes plugin (internal API) */
export function getDailyNotePath(app: App, dateStr: string): string | null {
    // @ts-ignore
    const internalPlugins = app.internalPlugins;
    let dailyNotes = null;
    if (internalPlugins?.getPluginById) {
        dailyNotes = internalPlugins.getPluginById('daily-notes');
    } else {
        // Fallback for older Obsidian versions
        // @ts-ignore
        dailyNotes = app.internal?.plugins?.getPlugin?.('daily-notes') ?? null;
    }
    if (!dailyNotes) return null;

    // New API: plugin.instance.options; Old API: plugin.options
    const options = dailyNotes.instance?.options ?? dailyNotes.options;
    if (!options) return null;

    const folder = options.folder ?? '';
    const format = options.format ?? 'YYYY-MM-DD';
    // @ts-ignore
    const moment = window.moment;
    if (!moment) return null;
    const m = moment(dateStr, 'YYYY-MM-DD');
    const fileName = m.format(format);
    return folder ? `${folder}/${fileName}` : fileName;
}

function logFilePath(settings: TomatoPluginSettings, dateStr: string): string {
    const folder = normalizePath(settings.logFolder);
    return `${folder}/${dateStr}.md`;
}

export async function appendEntry(
    app: App,
    settings: TomatoPluginSettings,
    entry: TomatoEntry,
): Promise<void> {
    const folder = normalizePath(settings.logFolder);
    const path = normalizePath(logFilePath(settings, entry.date));
    const taskPart = entry.taskName ? ` ${entry.taskName}` : '';
    const line = `- ${entry.startTime} ~ ${entry.endTime} (${entry.duration}m) [${entry.mode}]${taskPart}`;

    // Ensure log folder exists
    const folderExists = await app.vault.adapter.exists(folder);
    if (!folderExists) {
        await app.vault.adapter.mkdir(folder);
    }

    // 先尝试用 adapter 读取已有内容，绕过 TFile 缓存延迟
    let content = '';
    let exists = false;
    try {
        content = await app.vault.adapter.read(path);
        exists = true;
    } catch {
        exists = false;
    }

    if (exists) {
        // 去重：如果最后一行或任意一行已经包含相同记录，直接跳过
        const lines = content.split('\n').map(l => l.trim());
        if (lines.includes(line.trim())) {
            return;
        }
        const sep = content.endsWith('\n') ? '' : '\n';
        await app.vault.adapter.write(path, `${content}${sep}${line}\n`);
        return;
    }

    // 文件不存在，尝试 vault.create（这会正确建立 Obsidian 索引）
    let header = '';
    if (settings.enableDailyNoteLink) {
        const dailyPath = getDailyNotePath(app, entry.date);
        if (dailyPath) {
            header = `[[${dailyPath}]]\n\n`;
        }
    }

    try {
        await app.vault.create(path, `${header}${line}\n`);
    } catch (e: any) {
        // Obsidian Sync 可能在 getFileByPath 和 create 之间把文件建好了
        if (e?.message?.includes('already exists')) {
            // 等待索引刷新
            await new Promise(r => setTimeout(r, 300));
            let existingContent = '';
            try {
                existingContent = await app.vault.adapter.read(path);
            } catch {
                // adapter 也读不到，再试一次 create（可能是别的路径冲突）
                await app.vault.create(path, `${header}${line}\n`);
                return;
            }
            const lines = existingContent.split('\n').map(l => l.trim());
            if (lines.includes(line.trim())) {
                return;
            }
            const sep = existingContent.endsWith('\n') ? '' : '\n';
            await app.vault.adapter.write(path, `${existingContent}${sep}${line}\n`);
            return;
        }
        throw e;
    }
}

export async function parseDayFile(
    app: App,
    settings: TomatoPluginSettings,
    dateStr: string,
): Promise<DayRecord> {
    const path = normalizePath(logFilePath(settings, dateStr));
    const file = app.vault.getFileByPath(path);
    if (!(file instanceof TFile)) return { date: dateStr, entries: [] };

    const content = await app.vault.read(file);
    const lines = content.split('\n');
    const entries: ParsedEntry[] = [];

    for (const line of lines) {
        const match = ENTRY_RE.exec(line);
        if (!match) continue;
        const rest = (match[5] ?? '').trim();
        entries.push({
            startTime: match[1] ?? '',
            endTime: match[2] ?? '',
            duration: parseInt(match[3] ?? '0', 10),
            mode: (match[4] ?? 'pomodoro') as TimerMode,
            taskName: rest,
            project: parseProject(rest),
            rest,
        });
    }
    return { date: dateStr, entries };
}

/** Total minutes for a specific day, handling cross-day splits correctly. */
export async function getDayMinutes(
    app: App,
    settings: TomatoPluginSettings,
    dateStr: string,
): Promise<number> {
    let total = 0;
    const today = await parseDayFile(app, settings, dateStr);
    for (const e of today.entries) {
        if (isCrossDay(e.startTime, e.endTime)) {
            // Only count the portion that belongs to today (startTime -> 24:00)
            total += 1440 - timeToMinutes(e.startTime);
        } else {
            total += e.duration;
        }
    }

    const prevDate = addDays(dateStr, -1);
    const prev = await parseDayFile(app, settings, prevDate);
    for (const e of prev.entries) {
        if (isCrossDay(e.startTime, e.endTime)) {
            // Count the tail portion that belongs to today (00:00 -> endTime)
            total += timeToMinutes(e.endTime);
        }
    }
    return total;
}

export function isCrossDay(startTime: string, endTime: string): boolean {
    return timeToMinutes(endTime) < timeToMinutes(startTime);
}

export function timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

export async function writeDayEntries(
    app: App,
    settings: TomatoPluginSettings,
    dateStr: string,
    entries: ParsedEntry[],
): Promise<void> {
    const path = normalizePath(logFilePath(settings, dateStr));
    const file = app.vault.getFileByPath(path);

    let header = '';
    if (settings.enableDailyNoteLink) {
        const dailyPath = getDailyNotePath(app, dateStr);
        if (dailyPath) {
            header = `[[${dailyPath}]]\n\n`;
        }
    }

    const lines = entries.map(e => {
        const taskPart = e.taskName ? ` ${e.taskName}` : '';
        return `- ${e.startTime} ~ ${e.endTime} (${e.duration}m) [${e.mode}]${taskPart}`;
    });
    const content = header + lines.join('\n') + (lines.length > 0 ? '\n' : '');

    if (file instanceof TFile) {
        await app.vault.modify(file, content);
    } else {
        const folder = normalizePath(settings.logFolder);
        const folderExists = await app.vault.adapter.exists(folder);
        if (!folderExists) {
            await app.vault.adapter.mkdir(folder);
        }
        await app.vault.create(path, content);
    }
}
