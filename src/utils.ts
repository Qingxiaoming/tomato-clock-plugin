import type TomatoPlugin from './main';

export function startOfWeek(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekDays(dateStr: string): string[] {
    const start = startOfWeek(dateStr);
    const result: string[] = [start];
    let cur = start;
    for (let i = 0; i < 6; i++) {
        const d = new Date(cur + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        result.push(cur);
    }
    return result;
}

export function weekNumber(dateStr: string): number {
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

export function addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDateShort(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function dayNameShort(dateStr: string, lang: 'zh' | 'en' = 'zh'): string {
    const d = new Date(dateStr + 'T00:00:00');
    const names = lang === 'zh'
        ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return names[d.getDay()];
}

export function daysInMonth(dateStr: string): string[] {
    const d = new Date(dateStr + 'T00:00:00');
    const year = d.getFullYear();
    const month = d.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    const result: string[] = [];
    for (let i = 1; i <= count; i++) {
        result.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`);
    }
    return result;
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
