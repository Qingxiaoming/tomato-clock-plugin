import { App, normalizePath } from 'obsidian';
import type { LocalStore, SyncAdapter } from './types';
import type TomatoPlugin from '../main';

/**
 * Obsidian 平台同步适配器
 *
 * 负责在 vault 内读写同步目录：`{syncDir}/ops/ops_{deviceId}.jsonl`
 * 以及派生缓存 `{syncDir}/state.json`。
 */
export class ObsidianSyncAdapter implements SyncAdapter {
    private app: App;
    private syncDir: string;

    constructor(app: App, syncDir: string) {
        this.app = app;
        this.syncDir = normalizePath(syncDir);
    }

    private opsDir(): string {
        return normalizePath(`${this.syncDir}/ops`);
    }

    async ensureSyncDir(): Promise<void> {
        await this.ensureDir(this.opsDir());
    }

    private async ensureDir(dir: string): Promise<void> {
        if (!(await this.app.vault.adapter.exists(dir))) {
            await this.app.vault.adapter.mkdir(dir);
        }
    }

    async listOpsFiles(): Promise<string[]> {
        const dir = this.opsDir();
        const exists = await this.app.vault.adapter.exists(dir);
        if (!exists) return [];
        const listed = await this.app.vault.adapter.list(dir);
        return listed.files
            .map(f => {
                const parts = f.split('/');
                return parts[parts.length - 1] || '';
            })
            .filter(name => name.startsWith('ops_') && name.endsWith('.jsonl'));
    }

    async readOpsFile(name: string): Promise<string> {
        const path = normalizePath(`${this.opsDir()}/${name}`);
        if (!(await this.app.vault.adapter.exists(path))) return '';
        return await this.app.vault.adapter.read(path);
    }

    async appendOpsLine(name: string, line: string): Promise<void> {
        const path = normalizePath(`${this.opsDir()}/${name}`);
        await this.ensureDir(this.opsDir());

        let content = '';
        if (await this.app.vault.adapter.exists(path)) {
            content = await this.app.vault.adapter.read(path);
            if (content.length > 0 && !content.endsWith('\n')) {
                content += '\n';
            }
        }
        content += line + '\n';

        // 原子写入：先写 .tmp 再 rename
        const tmpPath = path + '.tmp';
        await this.app.vault.adapter.write(tmpPath, content);
        try {
            await this.app.vault.adapter.rename(tmpPath, path);
        } catch (e) {
            // 若 rename 失败，尝试直接覆盖
            await this.app.vault.adapter.write(path, content);
        }
    }

    async readStateCache(): Promise<string | null> {
        const path = normalizePath(`${this.syncDir}/state.json`);
        if (!(await this.app.vault.adapter.exists(path))) return null;
        return await this.app.vault.adapter.read(path);
    }

    async writeStateCache(content: string): Promise<void> {
        const path = normalizePath(`${this.syncDir}/state.json`);
        await this.ensureDir(this.syncDir);
        const tmpPath = path + '.tmp';
        await this.app.vault.adapter.write(tmpPath, content);
        try {
            await this.app.vault.adapter.rename(tmpPath, path);
        } catch {
            await this.app.vault.adapter.write(path, content);
        }
    }
}

/**
 * Obsidian 本地存储实现
 *
 * deviceId 与 seq 计数器保存在插件私有 data.json 中，
 * 位于 `.obsidian/plugins/tomato-clock/data.json`，不同步到坚果云。
 */
export class ObsidianLocalStore implements LocalStore {
    private plugin: TomatoPlugin;

    constructor(plugin: TomatoPlugin) {
        this.plugin = plugin;
    }

    private async loadRaw(): Promise<{ deviceId?: string; seq?: number }> {
        const data = (await this.plugin.loadData()) || {};
        return (data.syncLocal as { deviceId?: string; seq?: number }) || {};
    }

    private async saveRaw(patch: Partial<{ deviceId: string; seq: number }>): Promise<void> {
        const data = (await this.plugin.loadData()) || {};
        data.syncLocal = { ...(data.syncLocal || {}), ...patch };
        await this.plugin.saveData(data);
    }

    async loadDeviceId(): Promise<string | null> {
        const raw = await this.loadRaw();
        return raw.deviceId || null;
    }

    async saveDeviceId(id: string): Promise<void> {
        await this.saveRaw({ deviceId: id });
    }

    async loadSeq(): Promise<number> {
        const raw = await this.loadRaw();
        return typeof raw.seq === 'number' && raw.seq >= 0 ? raw.seq : 0;
    }

    async saveSeq(seq: number): Promise<void> {
        await this.saveRaw({ seq });
    }
}
