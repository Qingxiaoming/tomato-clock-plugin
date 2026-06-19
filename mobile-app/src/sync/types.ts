/**
 * 计时同步模块类型定义
 *
 * 基于事件溯源（Event Sourcing）的多端同步。
 * 每台设备拥有独立的 Op-Log，冲突时通过 proxy_end 人工或自动解决。
 */

/** 操作类型 */
export type SyncOpType = 'start' | 'end' | 'proxy_end' | 'config';

/** 单条操作记录 */
export interface OpRecord {
    op: SyncOpType;
    /** ISO 8601 时间戳，仅用于排序展示 */
    ts: string;
    /** 产生该操作的设备 ID */
    device: string;
    /** 计时会话 UUID；config 操作可为空 */
    session: string;
    /** 设备本地单调递增序列号 */
    seq: number;
    /** 可选附加数据 */
    payload?: Record<string, unknown>;
}

/** start 操作的 payload */
export interface StartPayload {
    tags?: string[];
}

/** end 操作的 payload */
export interface EndPayload {
    note?: string;
}

/** proxy_end 操作的 payload */
export interface ProxyEndPayload {
    targetDevice: string;
    targetSession: string;
}

/** config 操作的 payload */
export interface ConfigPayload {
    mode?: string;
    project?: string;
    task?: string;
}

/** 进行中的会话 */
export interface RunningSession {
    device: string;
    session: string;
    startTs: string;
    tags?: string[];
}

/** 同步后的计时器状态 */
export type TimerSyncStatus = 'idle' | 'running' | 'conflict';

/** 引擎状态 */
export interface SyncEngineState {
    status: TimerSyncStatus;
    runningSessions: RunningSession[];
    mode?: string;
    project?: string;
    task?: string;
}

/** 冲突解决方式 */
export type ConflictResolution =
    | 'keep_all'
    | 'keep_local'
    | 'keep_none'
    | { keep: RunningSession[] };

/** 冲突事件 */
export interface SyncConflictEvent {
    runningSessions: RunningSession[];
    resolve(resolution: ConflictResolution): Promise<void>;
}

/** 平台适配器：负责同步目录的文件读写 */
export interface SyncAdapter {
    /** 确保同步目录存在 */
    ensureSyncDir(): Promise<void>;
    /** 列出 ops 目录下所有 ops_*.jsonl 文件名 */
    listOpsFiles(): Promise<string[]>;
    /** 读取某个 ops 文件完整内容 */
    readOpsFile(name: string): Promise<string>;
    /** 原子地向某个 ops 文件追加一行（末尾自动补换行） */
    appendOpsLine(name: string, line: string): Promise<void>;
    /** 读取 state.json 缓存，不存在返回 null */
    readStateCache(): Promise<string | null>;
    /** 写入 state.json 缓存 */
    writeStateCache(content: string): Promise<void>;
}

/** 本地存储：deviceId 与 seq 计数器（不同步到坚果云） */
export interface LocalStore {
    loadDeviceId(): Promise<string | null>;
    saveDeviceId(id: string): Promise<void>;
    loadSeq(): Promise<number>;
    saveSeq(seq: number): Promise<void>;
}

/** 引擎构造选项 */
export interface SyncEngineOptions {
    /** 本机设备 ID */
    deviceId: string;
    /** 本地序列号持久化 */
    localStore: LocalStore;
    /** 平台适配器 */
    adapter: SyncAdapter;
    /** 警告日志回调 */
    warn?: (msg: string, meta?: Record<string, unknown>) => void;
    /** 错误日志回调 */
    error?: (msg: string, meta?: Record<string, unknown>) => void;
}
