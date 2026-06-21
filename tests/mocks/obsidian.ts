import { vi } from 'vitest';

export type EventRef = { id: number };

export class App {}
export function normalizePath(p: string): string { return p.replace(/\\/g, '/'); }
export const Platform = { isMobile: false };
export class TFile {}
export class TAbstractFile {}
export class Vault {}
export class Component {}
export class MarkdownRenderer {}
export class Modal {
    contentEl = { createEl: vi.fn() };
    open = vi.fn();
    close = vi.fn();
}
export class Setting {
    constructor(public containerEl: any) {}
    setName = vi.fn().mockReturnValue(this);
    setDesc = vi.fn().mockReturnValue(this);
    addText = vi.fn().mockReturnValue(this);
    addDropdown = vi.fn().mockReturnValue(this);
    addToggle = vi.fn().mockReturnValue(this);
    addButton = vi.fn().mockReturnValue(this);
}
export class Plugin {
    app = {};
    manifest = {};
    addRibbonIcon = vi.fn();
    addStatusBarItem = vi.fn();
    addCommand = vi.fn();
    addSettingTab = vi.fn();
    registerView = vi.fn();
    registerHoverLinkSource = vi.fn();
    loadData = vi.fn().mockResolvedValue({});
    saveData = vi.fn().mockResolvedValue(undefined);
}
