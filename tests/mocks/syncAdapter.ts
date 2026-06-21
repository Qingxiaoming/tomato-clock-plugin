import type { SyncAdapter, LocalStore } from '../../packages/sync-engine/src/types';

class MemorySyncAdapter implements SyncAdapter {
    private files = new Map<string, string>();
    private stateCache: string | null = null;

    async ensureSyncDir(): Promise<void> {}
    async listOpsFiles(): Promise<string[]> {
        return Array.from(this.files.keys()).filter(n => n.startsWith('ops_'));
    }
    async readOpsFile(name: string): Promise<string> {
        return this.files.get(name) || '';
    }
    async appendOpsLine(name: string, line: string): Promise<void> {
        const cur = this.files.get(name) || '';
        this.files.set(name, cur + line + '\n');
    }
    async writeOpsFile(name: string, content: string): Promise<void> {
        this.files.set(name, content);
    }
    async deleteOpsFile(name: string): Promise<void> {
        this.files.delete(name);
    }
    async readStateCache(): Promise<string | null> {
        return this.stateCache;
    }
    async writeStateCache(content: string): Promise<void> {
        this.stateCache = content;
    }
    async deleteStateCache(): Promise<void> {
        this.stateCache = null;
    }

    getAllOps(): any[] {
        return Array.from(this.files.values())
            .flatMap(content => content.trim().split('\n').filter(Boolean))
            .map(line => JSON.parse(line));
    }
}

class MemoryLocalStore implements LocalStore {
    private deviceId: string | null = null;
    private seq = 0;
    async loadDeviceId(): Promise<string | null> { return this.deviceId; }
    async saveDeviceId(id: string): Promise<void> { this.deviceId = id; }
    async loadSeq(): Promise<number> { return this.seq; }
    async saveSeq(seq: number): Promise<void> { this.seq = seq; }
}

let sharedAdapter: MemorySyncAdapter | null = null;

export function setSharedAdapter(adapter: MemorySyncAdapter): void {
    sharedAdapter = adapter;
}

export { MemorySyncAdapter, MemoryLocalStore };

export class ObsidianSyncAdapter implements SyncAdapter {
    constructor(_app: unknown, _syncDir: string) {}
    ensureSyncDir(): Promise<void> { return sharedAdapter!.ensureSyncDir(); }
    listOpsFiles(): Promise<string[]> { return sharedAdapter!.listOpsFiles(); }
    readOpsFile(name: string): Promise<string> { return sharedAdapter!.readOpsFile(name); }
    appendOpsLine(name: string, line: string): Promise<void> { return sharedAdapter!.appendOpsLine(name, line); }
    writeOpsFile(name: string, content: string): Promise<void> { return sharedAdapter!.writeOpsFile(name, content); }
    deleteOpsFile(name: string): Promise<void> { return sharedAdapter!.deleteOpsFile(name); }
    readStateCache(): Promise<string | null> { return sharedAdapter!.readStateCache(); }
    writeStateCache(content: string): Promise<void> { return sharedAdapter!.writeStateCache(content); }
    deleteStateCache(): Promise<void> { return sharedAdapter!.deleteStateCache(); }
}

export class ObsidianLocalStore implements LocalStore {
    private deviceId: string | null = null;
    private seq = 0;
    loadDeviceId(): Promise<string | null> { return Promise.resolve(this.deviceId); }
    saveDeviceId(id: string): Promise<void> { this.deviceId = id; return Promise.resolve(); }
    loadSeq(): Promise<number> { return Promise.resolve(this.seq); }
    saveSeq(seq: number): Promise<void> { this.seq = seq; return Promise.resolve(); }
}
