import type TomatoPlugin from './main';
import { parseDayFile, todayString, nextDayString, type ParsedEntry } from './log';

export type StatsPeriod = 'day' | 'week' | 'month' | 'year';

export function dateRangeDays(endStr: string, days: number): string[] {
    const result: string[] = [];
    const end = new Date(endStr + 'T00:00:00');
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        result.push(
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        );
    }
    return result;
}

export async function readEntriesInRange(
    app: any,
    settings: any,
    start: string,
    end: string
): Promise<(ParsedEntry & { date: string })[]> {
    const entries: (ParsedEntry & { date: string })[] = [];
    let cur = start;
    while (cur <= end) {
        const day = await parseDayFile(app, settings, cur);
        for (const e of day.entries) {
            entries.push({ ...e, date: cur });
        }
        cur = nextDayString(cur);
    }
    return entries;
}

export function startOfWeek(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function startOfMonth(dateStr: string): string {
    return dateStr.slice(0, 8) + '01';
}

export function startOfYear(dateStr: string): string {
    return dateStr.slice(0, 5) + '01-01';
}

export function minutesToHM(m: number): string {
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h > 0) return `${h}h ${min}m`;
    return `${min}m`;
}

export function projectColor(plugin: TomatoPlugin, projectName?: string): string {
    if (!projectName) return '#9ca3af';
    const proj = plugin.settings.projects.find(p => p.name === projectName);
    return proj?.color ?? '#9ca3af';
}
