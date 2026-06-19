
# 计时同步模块重构提示词

## 重要前提（必读）
- 现有同步相关代码是屎山，存在bug，**不要参考、不要复用、不要修复旧代码**
- 从零重新实现同步模块，但**必须保持对外接口兼容**，不影响已做好的UI层、业务层、设置面板等其他模块

## 项目背景
- 多端设备（约4台）通过坚果云同步同一个文件夹
- 旧实现：单文件追加时间戳，LWW（最后写入胜），离线冲突严重
- 新架构：事件溯源（Event Sourcing），各设备独立Op-Log，冲突时用户手动选择

## 范围限定
- **只重构同步引擎**，计时UI、会话列表、统计面板、设置页面均保持不动
- 同步目录继续放在坚果云同步文件夹内
- 继续用文件系统读写（坚果云负责文件同步），不引入网络同步协议

## 核心机制

### 1. 状态定义（极简）
计时器只有两种状态：
- `idle`：没有进行中的计时
- `running`：有进行中的计时
- 没有 `pause` 概念

### 2. 操作日志（Op-Log）
每台设备拥有独立的操作日志文件：
- 路径：`{syncDir}/ops/ops_{deviceId}.jsonl`
- 每条记录是单行JSON，追加写入
- 操作类型只有三种：`start`、`end`、`proxy_end`

操作记录格式：
```
{"op":"start","ts":"2026-06-19T15:30:00.123Z","device":"a-pc","session":"uuid","seq":1,"payload":{"tags":["工作"]}}
{"op":"end","ts":"...","device":"a-pc","session":"uuid","seq":2,"payload":{"note":"完成了"}}
{"op":"proxy_end","ts":"...","device":"a-pc","session":"uuid","seq":3,"payload":{"targetDevice":"b-phone","targetSession":"uuid-b"}}
```

字段说明：
- `op`：操作类型
- `ts`：ISO 8601 时间戳，仅用于排序展示
- `device`：设备ID（固定不变）
- `session`：计时会话UUID，`start`时生成，后续操作复用
- `seq`：设备本地单调递增序列号，持久化到本地存储，崩溃可恢复
- `payload`：可选附加数据
  - `start` 可带 `tags`
  - `end` 可带 `note`
  - `proxy_end` 必须带 `targetDevice` 和 `targetSession`

### 3. 设备ID与序列号
- 设备ID：首次启动生成UUID，写入本地存储（不同步到坚果云），永不改变
- 序列号：每次写操作前+1，持久化到本地 `seq-counter.json`（不同步）
- 如果本地存储丢失：重新生成新设备ID，旧日志视为其他设备的历史数据

### 4. 合并与重放（Merge & Replay）
所有设备执行完全相同的逻辑：
1. 读取 `{syncDir}/ops/` 下所有 `ops_*.jsonl` 文件
2. 逐行解析JSON，解析失败的行跳过并记录warn
3. 去重：相同 `(device, seq)` 视为重复，保留ts较早的
4. 排序：`(ts, device_id字典序, seq)`，确保确定性
5. 重放状态机：
   - `start`：为该设备创建running session。如果该设备已有running，自动用新start的ts结束旧的（异常兜底）
   - `end`：结束该设备对应session的running状态
   - `proxy_end`：结束 `targetDevice` 的对应session（用于冲突解决）
6. 重放结束后，检查running session数量：
   - 0个 → `idle`
   - 1个 → `running`
   - 2个及以上 → `conflict`（冲突）

### 5. 冲突解决（核心）
- 冲突时**不自动结束任何计时**，各设备继续按本地时间运行
- 触发UI层弹出选择界面，列出所有进行中的session（设备、开始时间、已运行时长）
- 用户选择保留哪些session，可选：
  - 保留部分，结束其他的 → 对未保留的session写入 `proxy_end`
  - 全部保留 → 所有session继续running
  - 全部结束 → 对所有session写入 `proxy_end`
- `proxy_end` 写入**本机**的 `ops_{deviceId}.jsonl`，由 `device` 字段标识是谁发起的，由 `payload.targetDevice` 标识结束谁的session
- 写入后重新执行 sync()，所有设备重放后状态一致

### 6. 离线同步策略
- 离线时正常 `start`/`end`，只追加本机ops文件
- 恢复网络后坚果云同步各设备独立日志文件（天然无文件级冲突）
- 各设备执行相同的 merge+replay，最终状态一致
- 提供 `sync()` 接口供调用

### 7. 派生状态缓存
- `state.json` 放在同步目录内，是ops的派生缓存（可删除重建）
- 启动时从ops重建state，写入 `state.json` 加速下次启动
- 可选做hash校验，不一致则重建

## 边界情况处理

| 场景 | 行为 |
|------|------|
| A离线start→离线end，B在线start→end | 两个已完成session，自动合并，无冲突 |
| A离线start，B也start，恢复同步 | 检测到两个running，进入conflict状态，等用户选择 |
| A和B同时start（ts相同） | device_id字典序决定replay顺序，先start的成为running，后start的自动结束前一个（异常兜底） |
| 用户选择保留A，放弃B | 本机ops追加 `proxy_end` 结束B的session，A继续running |
| 用户长时间不选择 | 各设备继续按本地时钟计时，选择后写入proxy_end的ts为选择时刻，时长计算以实际时间为准 |
| 设备时钟漂移 | 按ts排序，超出合理范围（如1小时）标记warn但不阻塞 |
| seq不连续 | 标记gap但不阻塞，后续补上了自动修复 |
| 相同(device,seq)内容不同 | 保留ts较早的，记录error |
| 找不到对应session的end/proxy_end | 忽略并记录warn |
| 文件损坏/半写 | 原子写入（先tmp再rename），解析失败跳过该行 |

## 事件通知
引擎内部用EventEmitter，UI层已监听以下事件：
- `stateChanged`：状态变化时触发，参数为 `TimerState`
- `conflict`：检测到冲突时触发，参数包含 `runningSessions` 列表和 `resolve` 回调

## 平台差异
- Obsidian插件：通过 `vault.adapter` 读写文件，可用 `vault.on('modify')` 监听文件变化触发sync
- 手机App：通过文件系统API读写，可轮询或监听目录变化触发sync
- 核心逻辑（merge、replay、状态机）与平台无关，纯JS/TS
- 平台适配层只需实现文件读写、目录列表、文件存在性检查

## 文件目录结构
```
{坚果云同步目录}/
  timer-sync/
    ops/
      ops_a-pc.jsonl
      ops_b-phone.jsonl
      ...
    state.json

  （以下文件在本地存储，不同步）
  device-id.json
  seq-counter.json
```

## 输出要求
1. 提供同步模块的完整实现
2. 包含：类型定义、核心引擎、平台适配抽象接口
3. 不要改任何UI调用代码
4. 不要参考旧同步代码，从零实现
5. 附简短说明：哪些文件放在同步目录，哪些放在本地存储
```

