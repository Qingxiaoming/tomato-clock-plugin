import { App, PluginSettingTab, Setting } from 'obsidian';
import type TomatoPlugin from './main';
import type { Lang } from './i18n';

export interface ProjectConfig {
    name: string;
    color: string;
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
};

export class TomatoSettingTab extends PluginSettingTab {
    plugin: TomatoPlugin;

    constructor(app: App, plugin: TomatoPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
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
}
