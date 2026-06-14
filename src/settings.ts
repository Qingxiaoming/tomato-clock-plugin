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
    openLogOnComplete: boolean;
    calendarSnapMinutes: number;
    compactCurrentTimeFontSize: number;
    compactTimerFontSize: number;
    compactCurrentTimeFontFamily: string;
    compactTimerFontFamily: string;
    compactDateFontFamilyCn: string;
    compactDateFontFamilyEn: string;
    calendarExtended: CalendarExtendedSettings;
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
    openLogOnComplete: true,
    calendarSnapMinutes: 5,
    compactCurrentTimeFontSize: 1.7,
    compactTimerFontSize: 1.8,
    compactCurrentTimeFontFamily: "'Courier New', Courier, monospace",
    compactTimerFontFamily: "'Courier New', Courier, monospace",
    compactDateFontFamilyCn: "system-ui, -apple-system, sans-serif",
    compactDateFontFamilyEn: "'Courier New', Courier, monospace",
    calendarExtended: { ...(calendarDefaultSettings as unknown as CalendarExtendedSettings) },
};

export class TomatoSettingTab extends PluginSettingTab {
    plugin: TomatoPlugin;

    constructor(app: App, plugin: TomatoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private async loadSystemFonts(dropdown: DropdownComponent, currentValue: string): Promise<void> {
        let fonts: string[] = [];
        try {
            if ('queryLocalFonts' in window) {
                // @ts-ignore
                const localFonts = await window.queryLocalFonts();
                const names = new Set<string>();
                for (const font of localFonts) {
                    names.add(font.family);
                }
                fonts = Array.from(names).sort();
            }
        } catch {
            // Local font query not available, use fallback list
        }

        if (fonts.length === 0) {
            fonts = [
                'Arial', 'Helvetica', 'Times New Roman', 'Georgia',
                'Courier New', 'Consolas', 'Monaco',
                'JetBrains Mono', 'Fira Code', 'Inter', 'Roboto', 'system-ui',
            ];
        }

        // Always include common Chinese fonts
        const cnFonts = [
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
        for (const f of cnFonts) {
            if (!fonts.includes(f)) {
                fonts.push(f);
            }
        }

        if (!fonts.includes(currentValue)) {
            fonts.unshift(currentValue);
        }

        for (const font of fonts) {
            dropdown.addOption(font, font);
        }
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

        new Setting(containerEl).setHeading().setName(_t('settings.heading'));

        // Language
        new Setting(containerEl)
            .setName(_t('settings.language'))
            .addDropdown(d => d
                .addOption('zh', '中文')
                .addOption('en', 'English')
                .setValue(this.plugin.settings.language)
                .onChange(async v => {
                    this.plugin.settings.language = v as Lang;
                    await this.plugin.saveSettings();
                    this.plugin.refreshAllViews();
                    this.plugin.refreshLogViews();
                    this.display();
                }));

        // --- Durations ---
        new Setting(containerEl).setHeading().setName(_t('settings.durations'));

        new Setting(containerEl)
            .setName(_t('settings.workDuration'))
            .addSlider(s => s
                .setLimits(1, 90, 1)
                .setValue(this.plugin.settings.workMinutes)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.workMinutes = v;
                    await this.plugin.saveSettings();
                    this.plugin.applySettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.shortBreak'))
            .addSlider(s => s
                .setLimits(1, 30, 1)
                .setValue(this.plugin.settings.shortBreakMinutes)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.shortBreakMinutes = v;
                    await this.plugin.saveSettings();
                    this.plugin.applySettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.longBreak'))
            .addSlider(s => s
                .setLimits(5, 60, 1)
                .setValue(this.plugin.settings.longBreakMinutes)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.longBreakMinutes = v;
                    await this.plugin.saveSettings();
                    this.plugin.applySettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.cycles'))
            .setDesc(_t('settings.cyclesDesc'))
            .addSlider(s => s
                .setLimits(2, 8, 1)
                .setValue(this.plugin.settings.cycles)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.cycles = v;
                    await this.plugin.saveSettings();
                    this.plugin.applySettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.countdownDuration'))
            .setDesc(_t('settings.countdownDurationDesc'))
            .addSlider(s => s
                .setLimits(1, 120, 1)
                .setValue(this.plugin.settings.countdownMinutes)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.countdownMinutes = v;
                    await this.plugin.saveSettings();
                    this.plugin.applySettings();
                }));

        // --- Behavior ---
        new Setting(containerEl).setHeading().setName(_t('settings.behavior'));

        new Setting(containerEl)
            .setName(_t('settings.autoStart'))
            .setDesc(_t('settings.autoStartDesc'))
            .addToggle(t => t
                .setValue(this.plugin.settings.autoStartNextPhase)
                .onChange(async v => {
                    this.plugin.settings.autoStartNextPhase = v;
                    await this.plugin.saveSettings();
                    this.plugin.applySettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.sound'))
            .setDesc(_t('settings.soundDesc'))
            .addToggle(t => t
                .setValue(this.plugin.settings.enableSound)
                .onChange(async v => {
                    this.plugin.settings.enableSound = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.osNotification'))
            .setDesc(_t('settings.osNotificationDesc'))
            .addToggle(t => t
                .setValue(this.plugin.settings.enableOsNotification)
                .onChange(async v => {
                    this.plugin.settings.enableOsNotification = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.showStatusBar'))
            .setDesc(_t('settings.showStatusBarDesc'))
            .addToggle(t => t
                .setValue(this.plugin.settings.showStatusBar)
                .onChange(async v => {
                    this.plugin.settings.showStatusBar = v;
                    await this.plugin.saveSettings();
                    this.plugin.applySettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.calendarSnap'))
            .setDesc(_t('settings.calendarSnapDesc'))
            .addDropdown(d => d
                .addOption('1', '1 min')
                .addOption('5', '5 min')
                .addOption('10', '10 min')
                .addOption('15', '15 min')
                .addOption('30', '30 min')
                .setValue(String(this.plugin.settings.calendarSnapMinutes))
                .onChange(async v => {
                    this.plugin.settings.calendarSnapMinutes = parseInt(v, 10);
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.compactCurrentTimeFontSize'))
            .setDesc(_t('settings.compactCurrentTimeFontSizeDesc'))
            .addSlider(s => s
                .setLimits(0.8, 2.5, 0.1)
                .setValue(this.plugin.settings.compactCurrentTimeFontSize)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.compactCurrentTimeFontSize = v;
                    await this.plugin.saveSettings();
                    this.plugin.refreshAllViews();
                }));

        new Setting(containerEl)
            .setName(_t('settings.compactTimerFontSize'))
            .setDesc(_t('settings.compactTimerFontSizeDesc'))
            .addSlider(s => s
                .setLimits(0.8, 2.5, 0.1)
                .setValue(this.plugin.settings.compactTimerFontSize)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.compactTimerFontSize = v;
                    await this.plugin.saveSettings();
                    this.plugin.refreshAllViews();
                }));

        const currentTimeFontSetting = new Setting(containerEl)
            .setName(_t('settings.compactCurrentTimeFontFamily'))
            .setDesc(_t('settings.compactCurrentTimeFontFamilyDesc'));
        let currentTimeFontDropdown: DropdownComponent;
        currentTimeFontSetting.addDropdown(d => {
            currentTimeFontDropdown = d;
            d.onChange(async v => {
                this.plugin.settings.compactCurrentTimeFontFamily = v;
                await this.plugin.saveSettings();
                this.plugin.refreshAllViews();
            });
        });
        void this.loadSystemFonts(currentTimeFontDropdown!, this.plugin.settings.compactCurrentTimeFontFamily);

        const timerFontSetting = new Setting(containerEl)
            .setName(_t('settings.compactTimerFontFamily'))
            .setDesc(_t('settings.compactTimerFontFamilyDesc'));
        let timerFontDropdown: DropdownComponent;
        timerFontSetting.addDropdown(d => {
            timerFontDropdown = d;
            d.onChange(async v => {
                this.plugin.settings.compactTimerFontFamily = v;
                await this.plugin.saveSettings();
                this.plugin.refreshAllViews();
            });
        });
        void this.loadSystemFonts(timerFontDropdown!, this.plugin.settings.compactTimerFontFamily);

        // Date area: separate Chinese / English fonts
        const dateCnFontSetting = new Setting(containerEl)
            .setName('日期区域中文字体')
            .setDesc('日期行中文内容（如星期几）使用的字体');
        let dateCnFontDropdown: DropdownComponent;
        dateCnFontSetting.addDropdown(d => {
            dateCnFontDropdown = d;
            d.onChange(async v => {
                this.plugin.settings.compactDateFontFamilyCn = v;
                await this.plugin.saveSettings();
                this.plugin.refreshAllViews();
            });
        });
        void this.loadSystemFonts(dateCnFontDropdown!, this.plugin.settings.compactDateFontFamilyCn);

        const dateEnFontSetting = new Setting(containerEl)
            .setName('日期区域英文字体')
            .setDesc('日期行英文/数字内容（如时间、年、月）使用的字体');
        let dateEnFontDropdown: DropdownComponent;
        dateEnFontSetting.addDropdown(d => {
            dateEnFontDropdown = d;
            d.onChange(async v => {
                this.plugin.settings.compactDateFontFamilyEn = v;
                await this.plugin.saveSettings();
                this.plugin.refreshAllViews();
            });
        });
        void this.loadSystemFonts(dateEnFontDropdown!, this.plugin.settings.compactDateFontFamilyEn);

        // --- Log ---
        new Setting(containerEl).setHeading().setName(_t('settings.log'));

        new Setting(containerEl)
            .setName(_t('settings.logFolder'))
            .setDesc(_t('settings.logFolderDesc'))
            .addText(t => t
                .setPlaceholder('Tomato Logs')
                .setValue(this.plugin.settings.logFolder)
                .onChange(async v => {
                    this.plugin.settings.logFolder = v.trim() || 'Tomato Logs';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.enableDailyNoteLink'))
            .setDesc(_t('settings.enableDailyNoteLinkDesc'))
            .addToggle(t => t
                .setValue(this.plugin.settings.enableDailyNoteLink)
                .onChange(async v => {
                    this.plugin.settings.enableDailyNoteLink = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(_t('settings.openLogOnComplete'))
            .setDesc(_t('settings.openLogOnCompleteDesc'))
            .addToggle(t => t
                .setValue(this.plugin.settings.openLogOnComplete)
                .onChange(async v => {
                    this.plugin.settings.openLogOnComplete = v;
                    await this.plugin.saveSettings();
                }));

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

        new Setting(containerEl)
            .setName(t('confirmBeforeCreate'))
            .setDesc(t('confirmBeforeCreateDesc'))
            .addToggle(toggle => {
                toggle.setValue(cal.shouldConfirmBeforeCreate);
                toggle.onChange(async (v) => {
                    await updateCal({ shouldConfirmBeforeCreate: v });
                });
            });

        new Setting(containerEl)
            .setName(t('dayStartsAt4AM'))
            .setDesc(t('dayStartsAt4AMDesc'))
            .addToggle(toggle => {
                toggle.setValue(cal.dayStartsAt4AM || false);
                toggle.onChange(async (v) => {
                    await updateCal({ dayStartsAt4AM: v });
                });
            });

        new Setting(containerEl)
            .setName(t('showWeekNumber'))
            .setDesc(t('showWeekNumberDesc'))
            .addToggle(toggle => {
                toggle.setValue(cal.showWeeklyNote);
                toggle.onChange(async (v) => {
                    await updateCal({ showWeeklyNote: v });
                    this.renderCalendarSettings(containerEl);
                });
            });

        if (cal.showWeeklyNote) {
            containerEl.createEl('h3', { text: t('weeklyNoteSettings') });
            containerEl.createEl('p', { cls: 'setting-item-description', text: t('weeklyNoteSettingsDesc') });

            new Setting(containerEl)
                .setName(t('weeklyNoteFormat'))
                .setDesc(t('weeklyNoteFormatDesc'))
                .addText(textfield => {
                    textfield.setValue(cal.weeklyNoteFormat);
                    textfield.setPlaceholder('gggg-[W]ww');
                    textfield.onChange(async (v) => {
                        await updateCal({ weeklyNoteFormat: v });
                    });
                });

            new Setting(containerEl)
                .setName(t('weeklyNoteTemplate'))
                .setDesc(t('weeklyNoteTemplateDesc'))
                .addText(textfield => {
                    textfield.setValue(cal.weeklyNoteTemplate);
                    textfield.onChange(async (v) => {
                        await updateCal({ weeklyNoteTemplate: v });
                    });
                });

            new Setting(containerEl)
                .setName(t('weeklyNoteFolder'))
                .setDesc(t('weeklyNoteFolderDesc'))
                .addText(textfield => {
                    textfield.setValue(cal.weeklyNoteFolder);
                    textfield.onChange(async (v) => {
                        await updateCal({ weeklyNoteFolder: v });
                    });
                });
        }

        containerEl.createEl('h3', { text: t('monthlyNoteSettings') });

        new Setting(containerEl)
            .setName(t('monthlyNoteFormat'))
            .setDesc(t('monthlyNoteFormatDesc'))
            .addText(textfield => {
                textfield.setValue(cal.monthlyNoteFormat || 'YYYY-MM[m]');
                textfield.setPlaceholder('YYYY-MM[m]');
                textfield.onChange(async (v) => {
                    await updateCal({ monthlyNoteFormat: v });
                });
            });

        new Setting(containerEl)
            .setName(t('monthlyNoteTemplate'))
            .setDesc(t('monthlyNoteTemplateDesc'))
            .addText(textfield => {
                textfield.setValue(cal.monthlyNoteTemplate || '');
                textfield.onChange(async (v) => {
                    await updateCal({ monthlyNoteTemplate: v });
                });
            });

        new Setting(containerEl)
            .setName(t('monthlyNoteFolder'))
            .setDesc(t('monthlyNoteFolderDesc'))
            .addText(textfield => {
                textfield.setValue(cal.monthlyNoteFolder || '');
                textfield.onChange(async (v) => {
                    await updateCal({ monthlyNoteFolder: v });
                });
            });

        containerEl.createEl('h3', { text: t('quarterlyNoteSettings') });

        new Setting(containerEl)
            .setName(t('quarterlyNoteFormat'))
            .setDesc(t('quarterlyNoteFormatDesc'))
            .addText(textfield => {
                textfield.setValue(cal.quarterlyNoteFormat || 'YYYY-[Q]Q');
                textfield.setPlaceholder('YYYY-[Q]Q');
                textfield.onChange(async (v) => {
                    await updateCal({ quarterlyNoteFormat: v });
                });
            });

        new Setting(containerEl)
            .setName(t('quarterlyNoteTemplate'))
            .setDesc(t('quarterlyNoteTemplateDesc'))
            .addText(textfield => {
                textfield.setValue(cal.quarterlyNoteTemplate || '');
                textfield.onChange(async (v) => {
                    await updateCal({ quarterlyNoteTemplate: v });
                });
            });

        new Setting(containerEl)
            .setName(t('quarterlyNoteFolder'))
            .setDesc(t('quarterlyNoteFolderDesc'))
            .addText(textfield => {
                textfield.setValue(cal.quarterlyNoteFolder || '');
                textfield.onChange(async (v) => {
                    await updateCal({ quarterlyNoteFolder: v });
                });
            });

        containerEl.createEl('h3', { text: t('yearlyNoteSettings') });

        new Setting(containerEl)
            .setName(t('yearlyNoteFormat'))
            .setDesc(t('yearlyNoteFormatDesc'))
            .addText(textfield => {
                textfield.setValue(cal.yearlyNoteFormat || 'YYYY[y]');
                textfield.setPlaceholder('YYYY[y]');
                textfield.onChange(async (v) => {
                    await updateCal({ yearlyNoteFormat: v });
                });
            });

        new Setting(containerEl)
            .setName(t('yearlyNoteTemplate'))
            .setDesc(t('yearlyNoteTemplateDesc'))
            .addText(textfield => {
                textfield.setValue(cal.yearlyNoteTemplate || '');
                textfield.onChange(async (v) => {
                    await updateCal({ yearlyNoteTemplate: v });
                });
            });

        new Setting(containerEl)
            .setName(t('yearlyNoteFolder'))
            .setDesc(t('yearlyNoteFolderDesc'))
            .addText(textfield => {
                textfield.setValue(cal.yearlyNoteFolder || '');
                textfield.onChange(async (v) => {
                    await updateCal({ yearlyNoteFolder: v });
                });
            });

        containerEl.createEl('h3', { text: t('advancedSettings') });

        new Setting(containerEl)
            .setName(t('localeOverride'))
            .setDesc(t('localeOverrideDesc'))
            .addText(textfield => {
                textfield.setValue(cal.localeOverride || 'system-default');
                textfield.setPlaceholder('system-default');
                textfield.onChange(async (v) => {
                    await updateCal({ localeOverride: v });
                });
            });
    }
}
