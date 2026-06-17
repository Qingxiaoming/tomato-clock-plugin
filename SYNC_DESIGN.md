# Tomato Clock 多端同步设计方案

## 设计目标

- **单文件同步**：所有跨设备状态只通过一个文件同步。
- **实时联动**：多设备同时在线时，任意一端操作，其余端秒级响应。
- **离线恢复**：某设备离线期间，其他设备产生的操作在它上线后能正确合并。
- **日志一致**：Obsidian 插件端的每日日志文件最终与同步记录一致。
- **不破坏恢复服务**：现有的 `recovery.json` 机制继续保留，作为本地快速恢复手段。

## 核心概念：事件溯源（Event Sourcing）

同步文件不保存"当前状态"本身作为唯一真相，而是保存**操作日志（Ops）**。每个设备在本地维护一个状态机，通过按时间顺序重放所有操作日志来重建当前状态。

同步文件同时包含一个**State 快照**，用于新上线设备的快速恢复（不必从头重放所有历史）。但冲突解决仍以 Ops 为准。

## 同步文件格式

文件路径可配置，默认放在 vault 根目录：`Tomato Sync.md`

```markdown
---
sync_version: 1
---

# State
{"mode":"pomodoro","phase":"work","status":"running","segmentStartMs":1710000000000,"accumulatedMs":0,"completedTomatos":2,"cycleIndex":1,"project":"工作","taskName":"写文档","todayMinutes":50,"lastOpTs":1710000002000,"lastOpId":"uuid-2"}

# Ops
1710000000000|uuid-1|device-a|start|{"mode":"pomodoro","phase":"work","project":"工作","taskName":"写文档"}
1710000001000|uuid-2|device-b|pause|{}
1710000002000|uuid-3|device-b|resume|{}
1710003000000|uuid-4|device-a|phase_complete|{"completed":"work","next":"shortBreak","duration":25,"entry":{"date":"2024-03-10","startTime":"09:00","endTime":"09:25","duration":25,"mode":"pomodoro","taskName":"写文档 tomato_project: 工作","project":"工作"}}
```

### 格式说明

- `State`：JSON 对象，保存重建后的当前状态快照，以及 `lastOpTs` / `lastOpId` 用于快速比对。
- `Ops`：每行一个操作，格式为 `timestamp|uuid|device_id|op_type|payload_json`。
  - `timestamp`：操作发生的绝对时间戳（ms）。
  - `uuid`：操作唯一标识，用于去重和丢失检测。
  - `device_id`：产生该操作的设备标识（由每个设备本地生成并持久化）。
  - `op_type`：操作类型。
  - `payload_json`：操作参数 JSON。

## 操作类型与状态机

| 操作 | Payload | 说明 |
|---|---|---|
| `start` | `{ mode, phase, project, taskName }` | 用户点击开始 |
| `pause` | `{}` | 用户点击暂停 |
| `resume` | `{}` | 用户点击继续 |
| `stop` | `{}` | 用户点击停止/重置 |
| `skip` | `{}` | 用户点击跳过当前阶段 |
| `set_mode` | `{ mode }` | 用户切换模式 |
| `set_project` | `{ project }` | 用户切换项目 |
| `set_task` | `{ taskName }` | 用户修改任务名 |
| `phase_complete` | `{ completed, next, duration, entry }` | 计时器自动触发阶段完成，`entry` 包含完整日志条目 |

### 状态重建算法

```
function rebuildState(ops):
  sorted = ops 按 timestamp 升序排序
  state = 初始 idle 状态
  
  for op in sorted:
    switch op.type:
      case 'start':
        state.status = 'running'
        state.segmentStartMs = op.ts
        state.mode = op.payload.mode
        state.phase = op.payload.phase
        state.project = op.payload.project
        state.taskName = op.payload.taskName
      case 'pause':
        if state.status == 'running':
          state.accumulatedMs += op.ts - state.segmentStartMs
          state.status = 'paused'
      case 'resume':
        state.status = 'running'
        state.segmentStartMs = op.ts
      case 'stop':
        state = idle 状态
        state.accumulatedMs = 0
      case 'phase_complete':
        state.completedTomatos = op.payload.completedTomatos
        state.cycleIndex = op.payload.cycleIndex
        state.phase = op.payload.next
        if 自动开始下一阶段:
          state.status = 'running'
          state.segmentStartMs = op.ts
          state.accumulatedMs = 0
        else:
          state.status = 'idle'
          state.phase = 'idle'
        state.todayMinutes += op.payload.duration
      ...
  return state
```

**关键设计**：`phase_complete` 由触发它的设备生成并写入同步文件，其他设备重放时直接跳转到下一阶段，不依赖本地 tick 计算。这避免了多设备同时 tick 导致的重复 `phase_complete`。

### 时间追赶（Time Catch-Up）

设备离线后重新上线，重建状态后可能发现当前阶段在离线期间已经结束：

```
if state.status == 'running':
  elapsed = state.accumulatedMs + (now - state.segmentStartMs)
  duration = getPhaseDuration(state.phase) * 60 * 1000
  if elapsed >= duration:
    // 本设备自动补一个 phase_complete
    autoGeneratePhaseComplete(state, state.segmentStartMs + duration)
    // 将补上的操作写入同步文件
```

这个逻辑在手机 App 和 Obsidian 插件两端都要实现，确保无论哪端先发现"时间到了"，都能正确推进状态。

## 冲突解决策略

由于 iCloud/Dropbox 等网盘同步通常是 **Last-Write-Wins**，两个设备同时写入时可能丢失一方的操作。

### 写入流程

```
writeOps(newOps):
  1. 读取同步文件当前内容
  2. 解析现有 Ops，得到已有 uuid 集合
  3. 过滤掉 newOps 中已存在的 uuid
  4. 如果全部已存在，返回
  5. 将新 Ops 追加到文件末尾
  6. 重新计算 State 快照
  7. 写入文件（覆盖）
```

### 丢失检测与修复

每个设备在内存中维护 `pendingOps`（已发出但尚未确认写入的操作）。

当设备检测到同步文件被修改（Obsidian 用 `vault.on('modify')`，手机 App 用文件系统通知或轮询）：

```
onSyncFileChanged():
  1. 读取文件，解析所有 Ops
  2. 检查 pendingOps 中的每个 uuid 是否存在于文件中
  3. 如果有缺失的 pendingOp：
     a. 说明上次写入被覆盖丢失了
     b. 重新执行 writeOps(缺失的 ops)
  4. 应用所有新 Ops（包括其他设备产生的）到本地状态机
```

Obsidian 插件额外在每次启动时执行一次全量检查，确保没有遗漏。

### 幂等性

所有操作天然幂等：
- 重复重放相同的 `start`/`pause`/`resume` 操作不会导致错误，因为状态机只在合法状态转换时生效。
- `phase_complete` 通过 `uuid` 去重，确保同一日志条目不会被写入两次。

## Obsidian 插件端实现

### 新增文件

- `src/services/sync.ts`：`SyncService`

### SyncService 职责

- **写入**：将本地操作追加到同步文件。
- **监听**：通过 `vault.on('modify')` 监听同步文件变化。
- **重建**：读取 Ops，重建状态，应用到 `TomatoTimer`。
- **日志写入**：重放 `phase_complete` 时，调用 `appendEntry()` 将日志写入当日 Markdown 文件。

### 与现有组件的交互

```
用户点击开始
  └── main.ts
       ├── timer.start()          // 正常计时逻辑
       └── syncService.logOp('start', {...})

TomatoTimer tick 触发 phase_complete
  └── main.ts.onPhaseComplete()
       ├── appendEntry()           // 写入本地日志文件
       ├── syncService.logOp('phase_complete', {entry})
       └── 通知、刷新视图等现有逻辑

syncService 检测到文件变化
  └── 读取新 Ops
       ├── rebuildState()
       └── 如果远程状态与本地不一致
            └── timer.applySyncState(newState)  // 直接设置状态，不触发副作用
       └── 如果有新的 phase_complete
            └── appendEntry()（幂等，通过 uuid 去重）
```

### 不破坏 recovery 服务

- `RecoveryService` 继续每 10 秒保存 `recovery.json`。
- Obsidian 重启时，先由 `RecoveryService` 快速恢复状态。
- `SyncService` 随后读取同步文件，检查是否有更新的 Ops。如果有，应用它们（可能覆盖 recovery 恢复的状态）。
- 这样兼顾了**快速启动**和**跨设备一致**。

### 设置项

新增到 `settings.ts`：

| 选项 | 默认值 | 说明 |
|---|---|---|
| 同步文件路径 | `Tomato Sync.md` | 放在 vault 中的路径 |
| 设备标识 | 自动生成 UUID | 本设备的唯一标识 |

## 手机 App 端实现建议

### 技术选型

推荐 **SwiftUI (iOS/iPadOS 原生)**，理由：
- 最佳的文件系统访问（通过 iCloud Drive / Files app）。
- 最佳的后台任务支持（`BGTaskScheduler` + 本地通知）。
- 最佳的性能和电池效率。

如果也需要 Android，可考虑 **React Native**，但需要为 iOS 编写原生模块处理后台任务和文件监控。

### 文件访问

- 用户首次打开 App 时，引导其选择 Obsidian vault 的根目录（iOS 14+ 支持 `UIDocumentPickerViewController`）。
- App 获得该目录的读写权限后，直接操作 `Tomato Sync.md` 和 `Tomato Logs/` 下的文件。
- 通过 `NSFileCoordinator` 监控文件变化（配合 iCloud 同步）。

### 后台精确计时

iOS 后台限制较严格，采用以下策略组合：

1. **前台计时**：正常每秒更新 UI。
2. **进入后台**：
   - 记录 `backgroundTime = Date()`。
   - 请求 `beginBackgroundTask`（争取约 30 秒后台时间，用于写入同步文件）。
3. **回到前台**：
   - 计算 `elapsedInBackground = Date() - backgroundTime`。
   - 如果计时器在 running，将 `elapsedInBackground` 累加到状态，或直接执行时间追赶逻辑。
   - 重新读取同步文件，应用远程操作。
4. **App 被杀死后的重启**：
   - 启动时读取同步文件，重建状态。
   - 执行时间追赶逻辑：如果 `segmentStartMs` 到当前时间已经超过了阶段时长，自动生成 `phase_complete` 并写入同步文件。
5. **本地通知**：
   - 当阶段即将结束或已经结束时，发送本地通知提醒用户。
   - 如果 App 在后台且未杀死，使用 `Timer.publish` 或 `DispatchSourceTimer` 维持短暂的计时精度（配合 `beginBackgroundTask`）。

### 状态机复用

建议将 Obsidian 插件中的核心计时逻辑（`src/timer.ts` 中的状态机，去除 DOM 相关部分）提取为一个独立的 TypeScript 库，然后通过以下方式在手机端复用：

- **Capacitor / React Native**：直接复用 TypeScript 代码。
- **SwiftUI**：将核心逻辑用 Swift 重写，或嵌入 JavaScriptCore 运行 TypeScript 状态机（更复杂，不推荐）。

考虑到 SwiftUI 是最佳技术选型，推荐**用 Swift 重写核心状态机**（逻辑并不复杂，约几百行），这样能获得最原生的体验。

### UI 设计

手机 App 的 UI 直接复用"小面板"的设计：
- 项目选择器 + 任务输入框
- 当前时间行 + 周期性笔记指示点 + 模式切换
- 今日时间线
- 阶段圆点 + 大时钟 + 操作按钮
- 状态文本 + 今日总时长
- 嵌入式月历（可调用 iOS 原生日历组件，或复用 calendar-extended 的逻辑）

## 边界场景处理

### 场景 1：A、B、C 同时在线，A 点击开始

1. A 写入同步文件：`start` 操作。
2. iCloud 同步文件到 B、C。
3. B、C 的 `onSyncFileChanged` 触发，读取到新 Ops。
4. B、C 重放 `start`，状态变为 running，`segmentStartMs` 与 A 相同。
5. B、C 的 UI 更新为开始计时。

### 场景 2：A 开始计时后断网，B 正常操作

1. A 离线，`pendingOps` 中包含 `start`。
2. B 点击暂停，写入同步文件：`pause` 操作。
3. A 恢复网络，读取同步文件。
4. A 发现 `pendingOps` 中的 `start` 不在文件中（被 B 的写入覆盖了）。
5. A 重新追加 `start` 到文件，并重新读取。
6. A 重放所有 Ops（`start` 然后 `pause`），最终状态为 paused。

### 场景 3：A、B 都断网，分别操作后同时恢复

1. A 离线期间点击了 `start` 然后 `pause`。
2. B 离线期间点击了 `start` 然后 `stop`。
3. 两者同时恢复网络，各自尝试写入。
4. 假设 A 的写入最终保留（Last-Write-Wins）。
5. B 发现自己的 `start` 和 `stop` 不在文件中，重新追加。
6. 最终文件包含 A 的 `start`、`pause` 和 B 的 `start`、`stop`。
7. 两端重放所有 Ops，最终状态为 `stop`（最后一个操作决定最终状态，符合预期）。

### 场景 4：A 开始计时后 App 被杀死，25 分钟后重新打开

1. A 重新打开 App，读取同步文件，状态为 running，`segmentStartMs` 是 25 分钟前。
2. 执行时间追赶：`elapsed >= 25min`。
3. App 自动生成 `phase_complete`，写入同步文件。
4. 如果此时 B（Obsidian 插件）也在线，B 读取到 `phase_complete`，应用它，写入当日日志。

### 场景 5：A 和 B 同时触发 phase_complete

1. A 的计时器 tick 发现时间到了，生成 `phase_complete` 并写入。
2. B 几乎同时 tick 也发现时间到了，但在写入前读取到 A 的 `phase_complete`。
3. B 发现文件中已有相同阶段的 `phase_complete`（通过检查 `completed` 和 `segmentStartMs`），跳过写入。
4. 两端都只写入一次日志（幂等）。

## 文件清单（如需实现）

Obsidian 插件端：
- `src/services/sync.ts` — 新增
- `src/settings.ts` — 新增同步相关设置项
- `src/main.ts` — 集成 SyncService
- `src/timer.ts` — 增加 `applySyncState()` 和时间追赶逻辑

手机 App 端（SwiftUI）：
- `TimerEngine.swift` — 核心状态机（Swift 重写）
- `SyncManager.swift` — 同步文件读写与监控
- `TimerView.swift` — 小面板 UI
- `CalendarEmbedView.swift` — 嵌入式月历
