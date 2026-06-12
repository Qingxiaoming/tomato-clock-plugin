import { App, TFile, normalizePath } from 'obsidian';
import type { TomatoPluginSettings } from './settings';

export interface TomatoEntry {
    date: string;     // YYYY-MM-DD
    time: string;     // HH:MM
    duration: number; // minutes (snapshot at time of completion)
    taskName?: string;
}

export interface ParsedEntry {
    time: string;
    duration: number;
    rest: string; // everything after "HH:MM (Nm) " — user's free text + [[links]]
}

export interface DayRecord {
    date: string;
    count: number;
    entries: ParsedEntry[];
}

// Matches "- HH:MM (Nm) optional rest text"
const ENTRY_RE = /^- (\d{2}:\d{2}) \((\d+)m\)(.*)/;
// Matches "## YYYY-MM-DD"
const DATE_RE = /^## (\d{4}-\d{2}-\d{2})$/;

export function todayString(): string {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

export function nowTimeString(): string {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

export async function appendEntry(
    app: App,
    settings: TomatoPluginSettings,
    entry: TomatoEntry,
): Promise<void> {
    const path = normalizePath(settings.logFile);
    const taskPart = entry.taskName ? `${entry.taskName} ` : '';
    const line = `- ${entry.time} (${entry.duration}m) ${taskPart}`;
    const dateHeader = `## ${entry.date}`;

    const existing = app.vault.getFileByPath(path);
    if (!(existing instanceof TFile)) {
        await app.vault.create(path, `# Tomato Log\n\n${dateHeader}\n${line}\n`);
        return;
    }

    await app.vault.process(existing, (content) => {
        const needle = `\n${dateHeader}\n`;
        const idx = content.indexOf(needle);
        if (idx === -1) {
            // Date section not found — append new section at end
            const sep = content.endsWith('\n') ? '' : '\n';
            return `${content}${sep}\n${dateHeader}\n${line}\n`;
        }

        // Find the next section header to locate the END of this day's section
        const sectionStart = idx + needle.length;
        const nextHeaderRe = /\n## /g;
        nextHeaderRe.lastIndex = sectionStart;
        const nextMatch = nextHeaderRe.exec(content);

        if (!nextMatch) {
            // This is the last section — append at end of file
            const sep = content.endsWith('\n') ? '' : '\n';
            return `${content}${sep}${line}\n`;
        }

        // Insert just before the blank line / newline leading into the next section
        return content.slice(0, nextMatch.index) + '\n' + line + '\n' + content.slice(nextMatch.index);
    });
}

export async function parseLogs(
    app: App,
    settings: TomatoPluginSettings,
): Promise<DayRecord[]> {
    const path = normalizePath(settings.logFile);
    const file = app.vault.getFileByPath(path);
    if (!(file instanceof TFile)) return [];

    const content = await app.vault.read(file);
    const lines = content.split('\n');
    const days: DayRecord[] = [];
    let currentDate = '';
    let currentEntries: ParsedEntry[] = [];

    for (const line of lines) {
        const dateMatch = DATE_RE.exec(line);
        if (dateMatch) {
            if (currentDate) {
                days.push({ date: currentDate, count: currentEntries.length, entries: currentEntries });
            }
            currentDate = dateMatch[1] ?? '';
            currentEntries = [];
            continue;
        }
        if (currentDate) {
            const entryMatch = ENTRY_RE.exec(line);
            if (entryMatch) {
                currentEntries.push({
                    time: entryMatch[1] ?? '',
                    duration: parseInt(entryMatch[2] ?? '0', 10),
                    rest: (entryMatch[3] ?? '').trim(),
                });
            }
        }
    }
    if (currentDate) {
        days.push({ date: currentDate, count: currentEntries.length, entries: currentEntries });
    }
    return days;
}

export function totalTomatos(days: DayRecord[]): number {
    return days.reduce((sum, d) => sum + d.count, 0);
}

export function last7Days(days: DayRecord[]): { date: string; count: number }[] {
    const result: { date: string; count: number }[] = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const found = days.find(r => r.date === dateStr);
        result.push({ date: dateStr, count: found?.count ?? 0 });
    }
    return result;
}
