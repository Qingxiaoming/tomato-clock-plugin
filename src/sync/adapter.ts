import { App, normalizePath } from 'obsidian';
import type { LocalStore, SyncAdapter } from '@tomato/sync-engine';
import type TomatoPlugin from '../main';

/**
 * Obsidian 平台同步适配器
 *
 * 负责在 vault 内读写同步目录：`{syncDir}/ops/ops_{deviceId}.jsonl`
 * 以及派生缓存 `{syncDir}/state.json`。
 */
export class ObsidianSyncAdapter implements SyncAdapter {
    // Obsidian App 实例，用于访问 vault 文件系统
    private app: App;
    // 同步目录在 vault 内的路径
    private syncDir: string;

    constructor(app: App, syncDir: string) {
        this.app = app;
        this.syncDir = normalizePath(syncDir);
    }

    /**
     * 内部方法：返回 ops 子目录路径。
     */
    private opsDir(): string {
        return normalizePath(`${this.syncDir}/ops`);
    }

    /**
     * 确保 ops 目录存在。
     */
    async ensureSyncDir(): Promise<void> {
        await this.ensureDir(this.opsDir());
    }

    /**
     * 内部方法：若目录不存在则创建。
     */
    private async ensureDir(dir: string): Promise<void> {
        if (!(await this.app.vault.adapter.exists(dir))) {
            await this.app.vault.adapter.mkdir(dir);
        }
    }

    /**
     * 列出 ops 目录下所有 `ops_*.jsonl` 文件名。
     */
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

    /**
     * 读取指定 ops 文件内容，不存在返回空字符串。
     */
    async readOpsFile(name: string): Promise<string> {
        const path = normalizePath(`${this.opsDir()}/${name}`);
        if (!(await this.app.vault.adapter.exists(path))) return '';
        return await this.app.vault.adapter.read(path);
    }

    /**
     * 向指定 ops 文件原子追加一行。先读取原内容追加后再写入 .tmp 并重命名。
     */
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

    /**
     * 读取 state.json 缓存内容，不存在返回 null。
     */
    async readStateCache(): Promise<string | null> {
        const path = normalizePath(`${this.syncDir}/state.json`);
        if (!(await this.app.vault.adapter.exists(path))) return null;
        return await this.app.vault.adapter.read(path);
    }

    /**
     * 原子写入 state.json 缓存。
     */
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
    // 插件实例，用于通过 Obsidian API 读写 data.json
    private plugin: TomatoPlugin;

    constructor(plugin: TomatoPlugin) {
        this.plugin = plugin;
    }

    /**
     * 内部方法：读取 data.json 中 syncLocal 段原始数据。
     */
    private async loadRaw(): Promise<{ deviceId?: string; seq?: number }> {
        const data = (await this.plugin.loadData()) || {};
        return (data.syncLocal as { deviceId?: string; seq?: number }) || {};
    }

    /**
     * 内部方法：合并并保存 syncLocal 段数据到 data.json。
     */
    private async saveRaw(patch: Partial<{ deviceId: string; seq: number }>): Promise<void> {
        const data = (await this.plugin.loadData()) || {};
        data.syncLocal = { ...(data.syncLocal || {}), ...patch };
        await this.plugin.saveData(data);
    }

    /**
     * 读取已保存的 deviceId。
     */
    async loadDeviceId(): Promise<string | null> {
        const raw = await this.loadRaw();
        return raw.deviceId || null;
    }

    /**
     * 保存 deviceId。
     */
    async saveDeviceId(id: string): Promise<void> {
        await this.saveRaw({ deviceId: id });
    }

    /**
     * 读取下一个可用的 seq 起始值，默认 0。
     */
    async loadSeq(): Promise<number> {
        const raw = await this.loadRaw();
        return typeof raw.seq === 'number' && raw.seq >= 0 ? raw.seq : 0;
    }

    /**
     * 保存下一个可用的 seq 起始值。
     */
    async saveSeq(seq: number): Promise<void> {
        await this.saveRaw({ seq });
    }
}
