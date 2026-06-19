import { Directory, File } from 'expo-file-system';
import { createClient, type WebDAVClient } from 'webdav/react-native';
import type { SyncAdapter } from '../sync/types';

function ensureTrailingSlash(uri: string): string {
    return uri.replace(/\/?$/, '/');
}

async function withRetry<T>(label: string, fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            lastError = e;
            const message = String(e);
            const is503 = message.includes('503');
            if (!is503) throw e;
            console.warn(`[MobileWebDAVSyncAdapter] ${label} got 503, retry ${i + 1}/${retries}`);
            await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        }
    }
    throw lastError;
}

/**
 * 本地文件系统适配器（基于 expo-file-system File / Directory）
 */
export class MobileLocalSyncAdapter implements SyncAdapter {
    private syncDir: Directory;

    constructor(syncDir: string) {
        this.syncDir = new Directory(syncDir);
    }

    private opsDir(): Directory {
        return new Directory(this.syncDir, 'ops');
    }

    async ensureSyncDir(): Promise<void> {
        this.syncDir.create({ idempotent: true });
        this.opsDir().create({ idempotent: true });
    }

    async listOpsFiles(): Promise<string[]> {
        try {
            const entries = this.opsDir().list();
            return entries
                .filter((item): item is File => item instanceof File)
                .map(file => file.name)
                .filter(name => name.startsWith('ops_') && name.endsWith('.jsonl'));
        } catch {
            return [];
        }
    }

    async readOpsFile(name: string): Promise<string> {
        const file = new File(this.opsDir(), name);
        try {
            return await file.text();
        } catch {
            return '';
        }
    }

    async appendOpsLine(name: string, line: string): Promise<void> {
        const file = new File(this.opsDir(), name);
        let content = '';
        try {
            content = await file.text();
            if (content.length > 0 && !content.endsWith('\n')) {
                content += '\n';
            }
        } catch {
            // 文件不存在，从空内容开始
        }
        content += line + '\n';
        file.write(content);
    }

    async readStateCache(): Promise<string | null> {
        const file = new File(this.syncDir, 'state.json');
        try {
            return await file.text();
        } catch {
            return null;
        }
    }

    async writeStateCache(content: string): Promise<void> {
        const file = new File(this.syncDir, 'state.json');
        file.write(content);
    }
}

/**
 * WebDAV 目录适配器（基于 webdav 库）
 */
export class MobileWebDAVSyncAdapter implements SyncAdapter {
    private client: WebDAVClient;
    private syncDir: string;

    constructor(url: string, username: string, password: string, syncDir: string) {
        // 坚果云使用 Basic Auth（password），指定后可避免 Digest 协商多一次请求
        this.client = createClient(url, { username, password, authType: 'password' });
        this.syncDir = syncDir.replace(/\/?$/, '');
    }

    private opsDir(): string {
        return this.syncDir + '/ops';
    }

    private normalizePath(path: string): string {
        return path.replace(/\/?$/, '');
    }

    async ensureSyncDir(): Promise<void> {
        await withRetry('ensureSyncDir', async () => {
            console.log('[MobileWebDAVSyncAdapter] ensureSyncDir', { syncDir: this.syncDir });
            await this.client.createDirectory(this.normalizePath(this.syncDir), { recursive: true });
            await this.client.createDirectory(this.normalizePath(this.opsDir()), { recursive: true });
        });
    }

    async listOpsFiles(): Promise<string[]> {
        const path = this.normalizePath(this.opsDir());
        try {
            console.log('[MobileWebDAVSyncAdapter] listOpsFiles', { path });
            const items = (await this.client.getDirectoryContents(path)) as Array<{
                filename?: string;
                type?: string;
            }>;
            return items
                .filter(item => item.type === 'file')
                .map(item => {
                    const parts = (item.filename || '').split('/');
                    return parts[parts.length - 1] || '';
                })
                .filter(name => name.startsWith('ops_') && name.endsWith('.jsonl'));
        } catch (e) {
            console.warn('[MobileWebDAVSyncAdapter] listOpsFiles failed', { path, error: String(e) });
            return [];
        }
    }

    async readOpsFile(name: string): Promise<string> {
        const path = `${this.normalizePath(this.opsDir())}/${name}`;
        try {
            return (await this.client.getFileContents(path, { format: 'text' })) as string;
        } catch {
            return '';
        }
    }

    async appendOpsLine(name: string, line: string): Promise<void> {
        const path = `${this.normalizePath(this.opsDir())}/${name}`;
        await withRetry(`appendOpsLine ${name}`, async () => {
            let content = '';
            try {
                content = (await this.client.getFileContents(path, { format: 'text' })) as string;
                if (content.length > 0 && !content.endsWith('\n')) {
                    content += '\n';
                }
            } catch {
                // 文件不存在
            }
            content += line + '\n';
            await this.client.putFileContents(path, content, { overwrite: true });
        });
    }

    async readStateCache(): Promise<string | null> {
        const path = `${this.normalizePath(this.syncDir)}/state.json`;
        try {
            return (await this.client.getFileContents(path, { format: 'text' })) as string;
        } catch {
            return null;
        }
    }

    async writeStateCache(content: string): Promise<void> {
        const path = `${this.normalizePath(this.syncDir)}/state.json`;
        await withRetry('writeStateCache', async () => {
            await this.client.putFileContents(path, content, { overwrite: true });
        });
    }
}
