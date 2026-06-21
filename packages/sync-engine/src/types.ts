/**
 * 计时同步模块类型定义
 *
 * 基于事件溯源（Event Sourcing）的多端同步。
 * 每台设备拥有独立的 Op-Log，冲突时通过 proxy_end 人工或自动解决。
 */

/** 操作类型 */
export type SyncOpType = 'start' | 'end' | 'proxy_end' | 'config';

/** 单条操作记录：所有设备最终都会重放相同顺序的 OpRecord 以得到一致状态 */
export interface OpRecord {
    /** 操作类型：开始、结束、代理结束、配置 */
    op: SyncOpType;
    /** ISO 8601 时间戳，用于全局排序 */
    ts: string;
    /** 产生该操作的设备 ID */
    device: string;
    /** 计时会话 UUID；config 操作也需要占位 */
    session: string;
    /** 设备本地单调递增序列号，保证同一设备内 op 有序 */
    seq: number;
    /** 可选附加数据，根据 op 类型承载不同内容 */
    payload?: Record<string, unknown>;
}

/** start 操作的 payload：携带会话标签及开始时的计时模式等信息 */
export interface StartPayload {
    tags?: string[];
    mode?: string;
    countdownSec?: number;
    sessionDate?: string;
    sessionTime?: string;
}

/** end 操作的 payload：携带结束备注 */
export interface EndPayload {
    note?: string;
}

/** proxy_end 操作的 payload：指定要代为结束的目标会话 */
export interface ProxyEndPayload {
    targetDevice: string;
    targetSession: string;
}

/** config 操作的 payload：应用当前计时配置 */
export interface ConfigPayload {
    mode?: string;
    project?: string;
    task?: string;
}

/** 进行中的会话：由 start 操作生成，直到 end/proxy_end 才移除 */
export interface RunningSession {
    /** 所属设备 */
    device: string;
    /** 会话唯一 ID */
    session: string;
    /** 开始时间戳 */
    startTs: string;
    /** 会话标签 */
    tags?: string[];
    /** 计时模式 */
    mode?: string;
    /** 倒计时秒数 */
    countdownSec?: number;
    /** 会话日期 */
    sessionDate?: string;
    /** 会话时间 */
    sessionTime?: string;
}

/** 同步后的计时器状态分类 */
export type TimerSyncStatus = 'idle' | 'running' | 'conflict';

/** 引擎状态：重放所有 ops 后得到的派生视图 */
export interface SyncEngineState {
    /** 当前同步状态：空闲 / 运行中 / 冲突 */
    status: TimerSyncStatus;
    /** 当前所有正在运行的会话列表 */
    runningSessions: RunningSession[];
    /** 当前计时模式 */
    mode?: string;
    /** 当前项目 */
    project?: string;
    /** 当前任务 */
    task?: string;
}

/** 冲突解决方式：保留全部、仅保留本地、全部不保留、或自定义保留列表 */
export type ConflictResolution =
    | 'keep_all'
    | 'keep_local'
    | 'keep_none'
    | { keep: RunningSession[] };

/** 冲突事件：当存在多个 running session 时触发 */
export interface SyncConflictEvent {
    /** 冲突中涉及的所有 running session */
    runningSessions: RunningSession[];
    /** 调用方选择解决策略后异步应用 */
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
    /** 覆盖写入某个 ops 文件完整内容（用于清理历史） */
    writeOpsFile(name: string, content: string): Promise<void>;
    /** 删除某个 ops 文件 */
    deleteOpsFile(name: string): Promise<void>;
    /** 读取 state.json 缓存，不存在返回 null */
    readStateCache(): Promise<string | null>;
    /** 写入 state.json 缓存 */
    writeStateCache(content: string): Promise<void>;
    /** 删除 state.json 缓存 */
    deleteStateCache(): Promise<void>;
}

/** 本地存储：deviceId 与 seq 计数器（不同步到云端，仅本机保存） */
export interface LocalStore {
    /** 读取已保存的本机 deviceId */
    loadDeviceId(): Promise<string | null>;
    /** 保存本机 deviceId */
    saveDeviceId(id: string): Promise<void>;
    /** 读取本机下一个可用的 seq 起始值 */
    loadSeq(): Promise<number>;
    /** 保存本机下一个可用的 seq 起始值 */
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
