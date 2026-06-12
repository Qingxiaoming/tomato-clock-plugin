import { App, PluginSettingTab, Setting } from 'obsidian';
import type TomatoPlugin from './main';
import type { Lang } from './i18n';

export interface TomatoPluginSettings {
    workMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    cycles: number;
    autoStartNextPhase: boolean;
    enableSound: boolean;
    enableOsNotification: boolean;
    logFile: string;
    countdownMinutes: number;
    language: Lang;
}

export const DEFAULT_SETTINGS: TomatoPluginSettings = {
    workMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cycles: 4,
    autoStartNextPhase: true,
    enableSound: true,
    enableOsNotification: true,
    logFile: 'Tomato Log.md',
    countdownMinutes: 25,
    language: 'zh',
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
                    for (const leaf of this.app.workspace.getLeavesOfType('Tomato-timer-view')) {
                        const view = (leaf as any).view as any;
                        if (view?.updateTimerUI) view.updateTimerUI(this.plugin.timer.getState());
                        if (view?.refreshHistory) void view.refreshHistory();
                    }
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

        // --- Log ---
        new Setting(containerEl).setHeading().setName(_t('settings.log'));

        new Setting(containerEl)
            .setName(_t('settings.logFile'))
            .setDesc(_t('settings.logFileDesc'))
            .addText(t => t
                .setPlaceholder('Tomato Log.md')
                .setValue(this.plugin.settings.logFile)
                .onChange(async v => {
                    this.plugin.settings.logFile = v.trim() || 'Tomato Log.md';
                    await this.plugin.saveSettings();
                }));
    }
}
