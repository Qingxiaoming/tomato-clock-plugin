import { App, PluginSettingTab, Setting, DropdownComponent } from 'obsidian';
import type { IWeekStartOption } from 'obsidian-calendar-ui';
import type TomatoPlugin from './main';
import type { Lang } from './i18n';
import {
    defaultSettings as calendarDefaultSettings,
    weekdays,
    appHasDailyNotesPluginLoaded,
    settings as calendarSettings,
} from './calendar-extended';

export interface ProjectConfig {
    name: string;
    color: string;
}

export interface CalendarExtendedSettings {
    shouldConfirmBeforeCreate: boolean;
    weekStart: IWeekStartOption;
    wordsPerDot: number;
    showWeeklyNote: boolean;
    weeklyNoteFormat: string;
    weeklyNoteTemplate: string;
    weeklyNoteFolder: string;
    monthlyNoteFormat: string;
    monthlyNoteTemplate: string;
    monthlyNoteFolder: string;
    quarterlyNoteFormat: string;
    quarterlyNoteTemplate: string;
    quarterlyNoteFolder: string;
    yearlyNoteFormat: string;
    yearlyNoteTemplate: string;
    yearlyNoteFolder: string;
    dayStartsAt4AM: boolean;
    language: string;
    localeOverride: string;
}

export type StatusBarMode = 'full' | 'simple' | 'none';

export interface TomatoPluginSettings {
    workMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    cycles: number;
    autoStartNextPhase: boolean;
    enableSound: boolean;
    enableOsNotification: boolean;
    logFolder: string;
    enableDailyNoteLink: boolean;
    countdownMinutes: number;
    language: Lang;
    projects: ProjectConfig[];
    showStatusBar: boolean;
    statusBarMode: StatusBarMode;
    openLogOnComplete: boolean;
    calendarSnapMinutes: number;
    compactCurrentTimeFontSize: number;
    compactTimerFontSize: number;
    compactCurrentTimeFontFamily: string;
    compactTimerFontFamily: string;
    compactDateFontFamilyCn: string;
    compactDateFontFamilyEn: string;
    calendarExtended: CalendarExtendedSettings;
    /** 同步目录路径（相对于 vault 根目录） */
    syncDir: string;
    syncDeviceId: string;
}

export const DEFAULT_SETTINGS: TomatoPluginSettings = {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cycles: 4,
    autoStartNextPhase: true,
    enableSound: true,
    enableOsNotification: true,
    logFolder: 'Tomato Logs',
    enableDailyNoteLink: true,
    countdownMinutes: 25,
    language: 'zh',
    projects: [],
    showStatusBar: true,
    statusBarMode: 'full',
    openLogOnComplete: true,
    calendarSnapMinutes: 5,
    compactCurrentTimeFontSize: 1.7,
    compactTimerFontSize: 1.8,
    compactCurrentTimeFontFamily: "'Courier New', Courier, monospace",
    compactTimerFontFamily: "'Courier New', Courier, monospace",
    compactDateFontFamilyCn: "system-ui, -apple-system, sans-serif",
    compactDateFontFamilyEn: "'Courier New', Courier, monospace",
    calendarExtended: { ...(calendarDefaultSettings as unknown as CalendarExtendedSettings) },
    /** 同步目录，留空则自动使用插件目录下的 timer-sync */
    syncDir: '',
    syncDeviceId: '',
};

export class TomatoSettingTab extends PluginSettingTab {
    plugin: TomatoPlugin;

    constructor(app: App, plugin: TomatoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private static readonly FALLBACK_FONTS = [
        'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
        'Courier New', 'Consolas', 'Monaco',
        'JetBrains Mono', 'Fira Code', 'Inter', 'Roboto', 'system-ui',
    ];
    private static readonly CN_FONTS = [
        'Microsoft YaHei', '微软雅黑',
        'SimSun', '宋体',
        'SimHei', '黑体',
        'DengXian', '等线',
        'KaiTi', '楷体',
        'FangSong', '仿宋',
        'PingFang SC', '苹方',
        'Hiragino Sans GB', '冬青黑体',
        'Noto Sans CJK SC', '思源黑体',
        'Source Han Sans SC', '思源黑体 SC',
        'LXGW WenKai', '霞鹜文楷',
        'Smiley Sans', '得意黑',
        'HarmonyOS Sans', '鸿蒙字体',
    ];

    private async loadSystemFonts(dropdown: DropdownComponent, currentValue: string): Promise<void> {
        let fonts: string[] = [];
        try {
            if ('queryLocalFonts' in window) {
                // @ts-ignore
                const localFonts = await window.queryLocalFonts();
                const names = new Set<string>();
                for (const font of localFonts) names.add(font.family);
                fonts = Array.from(names).sort();
            }
        } catch {
            // Local font query not available, use fallback list
        }

        if (fonts.length === 0) fonts = [...TomatoSettingTab.FALLBACK_FONTS];

        for (const f of TomatoSettingTab.CN_FONTS) {
            if (!fonts.includes(f)) fonts.push(f);
        }

        if (!fonts.includes(currentValue)) fonts.unshift(currentValue);

        for (const font of fonts) dropdown.addOption(font, font);
        dropdown.setValue(currentValue);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // Tabs
        const tabBar = containerEl.createDiv({ cls: 'Tomato-settings-tabs' });
        const tomatoTabBtn = tabBar.createEl('button', { text: '番茄钟', cls: 'Tomato-settings-tab active' });
        const calendarTabBtn = tabBar.createEl('button', { text: '日历', cls: 'Tomato-settings-tab' });

        const tomatoContainer = containerEl.createDiv({ cls: 'Tomato-settings-tab-content' });
        const calendarContainer = containerEl.createDiv({ cls: 'Tomato-settings-tab-content', attr: { style: 'display:none' } });

        const switchTab = (tab: 'tomato' | 'calendar') => {
            if (tab === 'tomato') {
                tomatoTabBtn.addClass('active');
                calendarTabBtn.removeClass('active');
                tomatoContainer.style.display = '';
                calendarContainer.style.display = 'none';
            } else {
                tomatoTabBtn.removeClass('active');
                calendarTabBtn.addClass('active');
                tomatoContainer.style.display = 'none';
                calendarContainer.style.display = '';
            }
        };
        tomatoTabBtn.addEventListener('click', () => switchTab('tomato'));
        calendarTabBtn.addEventListener('click', () => switchTab('calendar'));

        this.renderTomatoSettings(tomatoContainer);
        this.renderCalendarSettings(calendarContainer);
    }

    private renderTomatoSettings(containerEl: HTMLElement): void {
        const _t = (k: string) => this.plugin.t(k);

        const addSlider = (name: string, desc: string | undefined, limits: [number, number, number], value: number, cb: (v: number) => Promise<void>) => {
            const s = new Setting(containerEl).setName(name);
            if (desc) s.setDesc(desc);
            s.addSlider(sl => sl.setLimits(...limits).setValue(value).setDynamicTooltip().onChange(cb));
        };
        const addToggle = (name: string, desc: string | undefined, value: boolean, cb: (v: boolean) => Promise<void>) => {
            const s = new Setting(containerEl).setName(name);
            if (desc) s.setDesc(desc);
            s.addToggle(t => t.setValue(value).onChange(cb));
        };
        const addDropdown = (name: string, desc: string | undefined, options: Record<string, string>, value: string, cb: (v: string) => Promise<void>) => {
            const s = new Setting(containerEl).setName(name);
            if (desc) s.setDesc(desc);
            s.addDropdown(d => {
                for (const [k, label] of Object.entries(options)) d.addOption(k, label);
                d.setValue(value).onChange(cb);
            });
        };
        const addFont = (name: string, desc: string, key: keyof TomatoPluginSettings) => {
            let dd: DropdownComponent;
            new Setting(containerEl).setName(name).setDesc(desc).addDropdown(d => { dd = d; d.onChange(async v => { (this.plugin.settings as any)[key] = v; await this.plugin.saveSettings(); this.plugin.refreshAllViews(); }); });
            void this.loadSystemFonts(dd!, this.plugin.settings[key] as string);
        };

        new Setting(containerEl).setHeading().setName(_t('settings.heading'));

        addDropdown(_t('settings.language'), undefined, { zh: '中文', en: 'English' }, this.plugin.settings.language, async v => {
            this.plugin.settings.language = v as Lang;
            await this.plugin.saveSettings();
            this.plugin.refreshAllViews();
            this.plugin.refreshLogViews();
            this.display();
        });

        // --- Durations ---
        new Setting(containerEl).setHeading().setName(_t('settings.durations'));
        addSlider(_t('settings.workDuration'), undefined, [1, 90, 1], this.plugin.settings.workMinutes, async v => { this.plugin.settings.workMinutes = v; await this.plugin.saveSettings(); this.plugin.applySettings(); });
        addSlider(_t('settings.shortBreak'), undefined, [1, 30, 1], this.plugin.settings.shortBreakMinutes, async v => { this.plugin.settings.shortBreakMinutes = v; await this.plugin.saveSettings(); this.plugin.applySettings(); });
        addSlider(_t('settings.longBreak'), undefined, [5, 60, 1], this.plugin.settings.longBreakMinutes, async v => { this.plugin.settings.longBreakMinutes = v; await this.plugin.saveSettings(); this.plugin.applySettings(); });
        addSlider(_t('settings.cycles'), _t('settings.cyclesDesc'), [2, 8, 1], this.plugin.settings.cycles, async v => { this.plugin.settings.cycles = v; await this.plugin.saveSettings(); this.plugin.applySettings(); });
        addSlider(_t('settings.countdownDuration'), _t('settings.countdownDurationDesc'), [1, 120, 1], this.plugin.settings.countdownMinutes, async v => { this.plugin.settings.countdownMinutes = v; await this.plugin.saveSettings(); this.plugin.applySettings(); });

        // --- Behavior ---
        new Setting(containerEl).setHeading().setName(_t('settings.behavior'));
        addToggle(_t('settings.autoStart'), _t('settings.autoStartDesc'), this.plugin.settings.autoStartNextPhase, async v => { this.plugin.settings.autoStartNextPhase = v; await this.plugin.saveSettings(); this.plugin.applySettings(); });
        addToggle(_t('settings.sound'), _t('settings.soundDesc'), this.plugin.settings.enableSound, async v => { this.plugin.settings.enableSound = v; await this.plugin.saveSettings(); });
        addToggle(_t('settings.osNotification'), _t('settings.osNotificationDesc'), this.plugin.settings.enableOsNotification, async v => { this.plugin.settings.enableOsNotification = v; await this.plugin.saveSettings(); });
        addDropdown(_t('settings.statusBarMode'), _t('settings.statusBarModeDesc'), { full: '完整模式（显示时间和状态）', simple: '简洁模式（只显示是否计时）', none: '隐藏' }, this.plugin.settings.statusBarMode, async v => { this.plugin.settings.statusBarMode = v as StatusBarMode; await this.plugin.saveSettings(); this.plugin.applySettings(); });
        addDropdown(_t('settings.calendarSnap'), _t('settings.calendarSnapDesc'), { '1': '1 min', '5': '5 min', '10': '10 min', '15': '15 min', '30': '30 min' }, String(this.plugin.settings.calendarSnapMinutes), async v => { this.plugin.settings.calendarSnapMinutes = parseInt(v, 10); await this.plugin.saveSettings(); });
        addSlider(_t('settings.compactCurrentTimeFontSize'), _t('settings.compactCurrentTimeFontSizeDesc'), [0.8, 2.5, 0.1], this.plugin.settings.compactCurrentTimeFontSize, async v => { this.plugin.settings.compactCurrentTimeFontSize = v; await this.plugin.saveSettings(); this.plugin.refreshAllViews(); });
        addSlider(_t('settings.compactTimerFontSize'), _t('settings.compactTimerFontSizeDesc'), [0.8, 2.5, 0.1], this.plugin.settings.compactTimerFontSize, async v => { this.plugin.settings.compactTimerFontSize = v; await this.plugin.saveSettings(); this.plugin.refreshAllViews(); });
        addFont(_t('settings.compactCurrentTimeFontFamily'), _t('settings.compactCurrentTimeFontFamilyDesc'), 'compactCurrentTimeFontFamily');
        addFont(_t('settings.compactTimerFontFamily'), _t('settings.compactTimerFontFamilyDesc'), 'compactTimerFontFamily');
        addFont('日期区域中文字体', '日期行中文内容（如星期几）使用的字体', 'compactDateFontFamilyCn');
        addFont('日期区域英文字体', '日期行英文/数字内容（如时间、年、月）使用的字体', 'compactDateFontFamilyEn');

        // --- Log ---
        new Setting(containerEl).setHeading().setName(_t('settings.log'));
        new Setting(containerEl)
            .setName(_t('settings.logFolder'))
            .setDesc(_t('settings.logFolderDesc'))
            .addText(t => t.setPlaceholder('Tomato Logs').setValue(this.plugin.settings.logFolder).onChange(async v => {
                this.plugin.settings.logFolder = v.trim() || 'Tomato Logs';
                await this.plugin.saveSettings();
            }));
        addToggle(_t('settings.enableDailyNoteLink'), _t('settings.enableDailyNoteLinkDesc'), this.plugin.settings.enableDailyNoteLink, async v => { this.plugin.settings.enableDailyNoteLink = v; await this.plugin.saveSettings(); });
        addToggle(_t('settings.openLogOnComplete'), _t('settings.openLogOnCompleteDesc'), this.plugin.settings.openLogOnComplete, async v => { this.plugin.settings.openLogOnComplete = v; await this.plugin.saveSettings(); });

        // --- Projects ---
        new Setting(containerEl).setHeading().setName(_t('settings.projects'));

        const projectListEl = containerEl.createDiv({ cls: 'Tomato-project-list' });
        const renderProjects = () => {
            projectListEl.empty();
            this.plugin.settings.projects.forEach((proj, idx) => {
                const row = projectListEl.createDiv({ cls: 'Tomato-project-row' });
                row.createEl('input', { type: 'text', value: proj.name, cls: 'Tomato-project-name' }, el => {
                    el.addEventListener('change', async () => {
                        this.plugin.settings.projects[idx].name = el.value.trim();
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                        this.plugin.refreshLogViews();
                    });
                });
                row.createEl('input', { type: 'color', value: proj.color || '#3b82f6', cls: 'Tomato-project-color' }, el => {
                    el.addEventListener('input', async () => {
                        this.plugin.settings.projects[idx].color = el.value;
                        await this.plugin.saveSettings();
                        this.plugin.refreshAllViews();
                        this.plugin.refreshLogViews();
                    });
                });
                row.createEl('button', { text: '🗑️', cls: 'Tomato-project-delete' }, el => {
                    el.addEventListener('click', async () => {
                        const deleted = this.plugin.settings.projects[idx].name;
                        this.plugin.settings.projects.splice(idx, 1);
                        await this.plugin.saveSettings();
                        if (this.plugin.timer.getCurrentProject() === deleted) {
                            this.plugin.timer.setCurrentProject('');
                            this.plugin.syncService?.logOp('set_project', { value: '' });
                        }
                        renderProjects();
                        this.plugin.refreshAllViews();
                        this.plugin.refreshLogViews();
                    });
                });
            });
        };
        renderProjects();

        new Setting(containerEl)
            .addButton(b => b
                .setButtonText(_t('settings.addProject'))
                .onClick(async () => {
                    this.plugin.settings.projects.push({ name: '', color: '#3b82f6' });
                    await this.plugin.saveSettings();
                    renderProjects();
                    this.plugin.refreshAllViews();
                    this.plugin.refreshLogViews();
                }));

        // --- Sync ---
        new Setting(containerEl).setHeading().setName('多端同步');
        const syncDir = this.plugin.settings.syncDir || `${(this.plugin.app.vault.configDir)}/plugins/${this.plugin.manifest.id}/timer-sync`;
        const absoluteSyncDir = (this.plugin.app.vault.adapter as unknown as { getFullPath?: (path: string) => string }).getFullPath?.(syncDir) ?? syncDir;
        new Setting(containerEl)
            .setName('同步目录')
            .setDesc(`用于多端状态同步的目录。请将该目录设置为坚果云等同步工具的同步文件夹，手机端 WebDAV 路径需指向同一目录。\n当前：${absoluteSyncDir}`);
        new Setting(containerEl)
            .setName('设备标识')
            .setDesc('本设备的唯一标识，自动生成，通常无需修改')
            .addText(t => t.setValue(this.plugin.settings.syncDeviceId).onChange(async v => {
                this.plugin.settings.syncDeviceId = v.trim();
                await this.plugin.saveSettings();
            }));
    }

    private renderCalendarSettings(containerEl: HTMLElement): void {
        containerEl.empty();
        const cal = this.plugin.settings.calendarExtended;
        const t = (key: string) => {
            const dict: Record<string, string> = {
                dailyNotesNotEnabled: '日记功能未启用',
                dailyNotesNotEnabledDesc: '你需要安装并启用 Obsidian 核心插件“日记”才能使用日历功能。',
                generalSettings: '通用设置',
                language: '语言',
                languageDesc: '选择日历显示语言。',
                wordsPerDot: '每点字数',
                wordsPerDotDesc: '日记中每多少字显示一个点。',
                startWeekOn: '每周开始于',
                startWeekOnDesc: '设置日历每周从哪一天开始。',
                confirmBeforeCreate: '创建前确认',
                confirmBeforeCreateDesc: '创建新日记前是否弹出确认对话框。',
                dayStartsAt4AM: '凌晨4点开始新的一天',
                dayStartsAt4AMDesc: '如果启用，日记的日期会在凌晨4点切换。',
                showWeekNumber: '显示周笔记',
                showWeekNumberDesc: '是否在日历中显示周笔记。',
                weeklyNoteSettings: '周笔记设置',
                weeklyNoteSettingsDesc: '配置周笔记的格式、模板和文件夹。',
                weeklyNoteFormat: '格式',
                weeklyNoteFormatDesc: '周笔记文件名格式。',
                weeklyNoteTemplate: '模板',
                weeklyNoteTemplateDesc: '周笔记模板文件路径。',
                weeklyNoteFolder: '文件夹',
                weeklyNoteFolderDesc: '周笔记存放的文件夹。',
                monthlyNoteSettings: '月笔记设置',
                monthlyNoteFormat: '格式',
                monthlyNoteFormatDesc: '月笔记文件名格式。',
                monthlyNoteTemplate: '模板',
                monthlyNoteTemplateDesc: '月笔记模板文件路径。',
                monthlyNoteFolder: '文件夹',
                monthlyNoteFolderDesc: '月笔记存放的文件夹。',
                quarterlyNoteSettings: '季笔记设置',
                quarterlyNoteFormat: '格式',
                quarterlyNoteFormatDesc: '季笔记文件名格式。',
                quarterlyNoteTemplate: '模板',
                quarterlyNoteTemplateDesc: '季笔记模板文件路径。',
                quarterlyNoteFolder: '文件夹',
                quarterlyNoteFolderDesc: '季笔记存放的文件夹。',
                yearlyNoteSettings: '年笔记设置',
                yearlyNoteFormat: '格式',
                yearlyNoteFormatDesc: '年笔记文件名格式。',
                yearlyNoteTemplate: '模板',
                yearlyNoteTemplateDesc: '年笔记模板文件路径。',
                yearlyNoteFolder: '文件夹',
                yearlyNoteFolderDesc: '年笔记存放的文件夹。',
                advancedSettings: '高级设置',
                localeOverride: '区域设置覆盖',
                localeOverrideDesc: '覆盖系统默认的区域设置。',
            };
            return dict[key] || key;
        };
        const updateCal = async (change: Partial<CalendarExtendedSettings>) => {
            Object.assign(cal, change);
            await this.plugin.saveSettings();
            calendarSettings.update((old: any) => ({ ...old, ...change }));
        };

        const addCalText = (name: string, desc: string, value: string | undefined, placeholder: string | undefined, key: keyof CalendarExtendedSettings) => {
            new Setting(containerEl)
                .setName(name)
                .setDesc(desc)
                .addText(tf => {
                    if (placeholder !== undefined) tf.setPlaceholder(placeholder);
                    tf.setValue(value || '');
                    tf.onChange(async (v) => {
                        await updateCal({ [key]: v } as Partial<CalendarExtendedSettings>);
                    });
                });
        };

        const addCalToggle = (name: string, desc: string, value: boolean, key: keyof CalendarExtendedSettings, redraw?: boolean) => {
            new Setting(containerEl)
                .setName(name)
                .setDesc(desc)
                .addToggle(toggle => {
                    toggle.setValue(value);
                    toggle.onChange(async (v) => {
                        await updateCal({ [key]: v } as Partial<CalendarExtendedSettings>);
                        if (redraw) this.renderCalendarSettings(containerEl);
                    });
                });
        };

        if (!appHasDailyNotesPluginLoaded()) {
            const banner = containerEl.createDiv('settings-banner');
            banner.createEl('h3', { text: t('dailyNotesNotEnabled') });
            banner.createEl('p', { cls: 'setting-item-description', text: t('dailyNotesNotEnabledDesc') });
        }

        containerEl.createEl('h3', { text: t('generalSettings') });

        new Setting(containerEl)
            .setName(t('language'))
            .setDesc(t('languageDesc'))
            .addDropdown(d => {
                d.addOption('en', 'English');
                d.addOption('zh', '中文');
                d.setValue(cal.language || 'en');
                d.onChange(async (v) => {
                    await updateCal({ language: v });
                    this.renderCalendarSettings(containerEl);
                });
            });

        new Setting(containerEl)
            .setName(t('wordsPerDot'))
            .setDesc(t('wordsPerDotDesc'))
            .addText(textfield => {
                textfield.setPlaceholder(String(250));
                textfield.inputEl.type = 'number';
                textfield.setValue(String(cal.wordsPerDot));
                textfield.onChange(async (value) => {
                    await updateCal({ wordsPerDot: value !== '' ? Number(value) : undefined as any });
                });
            });

        new Setting(containerEl)
            .setName(t('startWeekOn'))
            .setDesc(t('startWeekOnDesc'))
            .addDropdown(d => {
                const { moment } = window as any;
                const localizedWeekdays = moment.weekdays();
                const localeWeekStartNum = (window as any)._bundledLocaleWeekSpec?.dow ?? 0;
                const localeWeekStart = moment.weekdays()[localeWeekStartNum];
                d.addOption('locale', `Locale default (${localeWeekStart})`);
                localizedWeekdays.forEach((day: string, i: number) => {
                    d.addOption(weekdays[i], day);
                });
                d.setValue(cal.weekStart);
                d.onChange(async (v) => {
                    await updateCal({ weekStart: v as IWeekStartOption });
                });
            });

        addCalToggle(t('confirmBeforeCreate'), t('confirmBeforeCreateDesc'), cal.shouldConfirmBeforeCreate, 'shouldConfirmBeforeCreate');
        addCalToggle(t('dayStartsAt4AM'), t('dayStartsAt4AMDesc'), cal.dayStartsAt4AM || false, 'dayStartsAt4AM');
        addCalToggle(t('showWeekNumber'), t('showWeekNumberDesc'), cal.showWeeklyNote, 'showWeeklyNote', true);

        if (cal.showWeeklyNote) {
            containerEl.createEl('h3', { text: t('weeklyNoteSettings') });
            containerEl.createEl('p', { cls: 'setting-item-description', text: t('weeklyNoteSettingsDesc') });
            addCalText(t('weeklyNoteFormat'), t('weeklyNoteFormatDesc'), cal.weeklyNoteFormat, 'gggg-[W]ww', 'weeklyNoteFormat');
            addCalText(t('weeklyNoteTemplate'), t('weeklyNoteTemplateDesc'), cal.weeklyNoteTemplate, undefined, 'weeklyNoteTemplate');
            addCalText(t('weeklyNoteFolder'), t('weeklyNoteFolderDesc'), cal.weeklyNoteFolder, undefined, 'weeklyNoteFolder');
        }

        containerEl.createEl('h3', { text: t('monthlyNoteSettings') });
        addCalText(t('monthlyNoteFormat'), t('monthlyNoteFormatDesc'), cal.monthlyNoteFormat, 'YYYY-MM[m]', 'monthlyNoteFormat');
        addCalText(t('monthlyNoteTemplate'), t('monthlyNoteTemplateDesc'), cal.monthlyNoteTemplate, undefined, 'monthlyNoteTemplate');
        addCalText(t('monthlyNoteFolder'), t('monthlyNoteFolderDesc'), cal.monthlyNoteFolder, undefined, 'monthlyNoteFolder');

        containerEl.createEl('h3', { text: t('quarterlyNoteSettings') });
        addCalText(t('quarterlyNoteFormat'), t('quarterlyNoteFormatDesc'), cal.quarterlyNoteFormat, 'YYYY-[Q]Q', 'quarterlyNoteFormat');
        addCalText(t('quarterlyNoteTemplate'), t('quarterlyNoteTemplateDesc'), cal.quarterlyNoteTemplate, undefined, 'quarterlyNoteTemplate');
        addCalText(t('quarterlyNoteFolder'), t('quarterlyNoteFolderDesc'), cal.quarterlyNoteFolder, undefined, 'quarterlyNoteFolder');

        containerEl.createEl('h3', { text: t('yearlyNoteSettings') });
        addCalText(t('yearlyNoteFormat'), t('yearlyNoteFormatDesc'), cal.yearlyNoteFormat, 'YYYY[y]', 'yearlyNoteFormat');
        addCalText(t('yearlyNoteTemplate'), t('yearlyNoteTemplateDesc'), cal.yearlyNoteTemplate, undefined, 'yearlyNoteTemplate');
        addCalText(t('yearlyNoteFolder'), t('yearlyNoteFolderDesc'), cal.yearlyNoteFolder, undefined, 'yearlyNoteFolder');

        containerEl.createEl('h3', { text: t('advancedSettings') });
        addCalText(t('localeOverride'), t('localeOverrideDesc'), cal.localeOverride, 'system-default', 'localeOverride');
    }
}
