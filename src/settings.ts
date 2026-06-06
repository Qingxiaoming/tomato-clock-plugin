import { App, PluginSettingTab, Setting } from 'obsidian';
import type TomatoPlugin from './main';

export interface TomatoPluginSettings {
    workMinutes: number;
    shortBreakMinutes: number;
    longBreakMinutes: number;
    cycles: number;
    autoStartNextPhase: boolean;
    enableSound: boolean;
    enableOsNotification: boolean;
    logFile: string;
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

        new Setting(containerEl).setHeading().setName('Tomato Clock');

        // --- Durations ---
        new Setting(containerEl).setHeading().setName('Durations');

        new Setting(containerEl)
            .setName('Work duration (min)')
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
            .setName('Short break (min)')
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
            .setName('Long break (min)')
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
            .setName('Cycles per set')
            .setDesc('Number of work sessions before a long break')
            .addSlider(s => s
                .setLimits(2, 8, 1)
                .setValue(this.plugin.settings.cycles)
                .setDynamicTooltip()
                .onChange(async v => {
                    this.plugin.settings.cycles = v;
                    await this.plugin.saveSettings();
                    this.plugin.applySettings();
                }));

        // --- Behavior ---
        new Setting(containerEl).setHeading().setName('Behavior');

        new Setting(containerEl)
            .setName('Auto-start next phase')
            .setDesc('Automatically begin the next work or break session')
            .addToggle(t => t
                .setValue(this.plugin.settings.autoStartNextPhase)
                .onChange(async v => {
                    this.plugin.settings.autoStartNextPhase = v;
                    await this.plugin.saveSettings();
                    this.plugin.applySettings();
                }));

        new Setting(containerEl)
            .setName('Sound alert')
            .setDesc('Play a short beep when a phase ends')
            .addToggle(t => t
                .setValue(this.plugin.settings.enableSound)
                .onChange(async v => {
                    this.plugin.settings.enableSound = v;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('OS notification')
            .setDesc('Show a system notification when sessions complete — useful when Obsidian is in the background. Grant permission when prompted.')
            .addToggle(t => t
                .setValue(this.plugin.settings.enableOsNotification)
                .onChange(async v => {
                    this.plugin.settings.enableOsNotification = v;
                    await this.plugin.saveSettings();
                }));

        // --- Log ---
        new Setting(containerEl).setHeading().setName('Log');

        new Setting(containerEl)
            .setName('Log file path')
            .setDesc('Markdown file where completed Tomatos are appended. E.g. Tomato Log.md or Journal/Tomato Log.md')
            .addText(t => t
                .setPlaceholder('Tomato Log.md')
                .setValue(this.plugin.settings.logFile)
                .onChange(async v => {
                    this.plugin.settings.logFile = v.trim() || 'Tomato Log.md';
                    await this.plugin.saveSettings();
                }));
    }
}
