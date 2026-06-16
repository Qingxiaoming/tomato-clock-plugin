# Tomato Clock 元素标准说法表

本文档用于统一小面板、大面板及相关 UI 元素的中文称呼，方便后续交流时准确指代。

---

## 面板层级

| 代码中的指代 | 标准说法 | 补充说明 |
|---|---|---|
| `TomatoTimerCompactView` | **小面板** / 紧凑面板 | 侧边栏的默认视图 |
| `TomatoTimerView` | **大面板** / 完整面板 | 双击时钟或从标签页打开 |
| `VIEW_TYPE_Tomato_Compact` | 小面板视图类型 | 注册给 Obsidian 的 ID |
| `VIEW_TYPE_Tomato` | 大面板视图类型 | 注册给 Obsidian 的 ID |

---

## 小面板元素（`timerViewCompact.ts`）

| 代码中的变量/类名 | 标准说法 | 补充说明 |
|---|---|---|
| `topRow` | **顶行** | 项目选择器 + 任务输入框 |
| `projectSelect` | **项目选择器** | 下拉框，选项目 |
| `taskInput` | **任务输入框** | 填写本次任务名称 |
| `currentRow` | **当前时间行** | 显示时间、年月日周、模式按钮 |
| `currentTimeEl` | **当前时间** | 大字号 HH:MM |
| `yearDotEl` / `monthDotEl` / `dayDotEl` / `weekDotEl` | **年/月/日/周 指示点** | 对应周期性笔记的小圆点 |
| `modeBtn` | **模式切换按钮** | 番茄钟/正计时/倒计时循环 |
| `timelineEl` | **今日时间线** | 整个时间线容器 |
| `Tomato-compact-timeline-track` | **时间线轨道** | 灰色横条底轨 |
| `Tomato-compact-timeline-seg` | **时间线色块** | 各个番茄钟/记录在轨道上的彩色段 |
| `Tomato-compact-timeline-current` | **当前时刻竖线** | 紫色细线，标记当前时间 |
| `timerRow` | **计时器行** | 圆点列 + 时钟 + 操作按钮 |
| `dotCol` | **阶段圆点列** | 垂直排列的周期完成指示点 |
| `phaseDotEls` | **阶段圆点** | 单个圆点，表示第几个番茄钟 |
| `timerDisplayEl` | **时钟** / 计时器显示 | 大字号倒计时/正计时数字 |
| `actionBtn` | **操作按钮** | 播放/跳过/重置/停止 |
| `infoRow` | **信息行** | 状态文字 + 今日总时长 |
| `statusTextEl` | **状态文本** | 如"专注""短休息" |
| `todayMinutesEl` | **今日总时长** | 右下角显示今日累计分钟 |
| `calWrapper` | **日历区** | 右侧导航 + 日历主体 |
| `calMonthYearEl` | **日历年月标签** | 如"2026年6月"，可点击跳转 |
| `calendarEmbed` | **嵌入式日历** | 基于 calendar-extended 的月历 |

---

## 大面板元素（`timerView.ts`）

| 代码中的变量/类名 | 标准说法 | 补充说明 |
|---|---|---|
| `weekViewEl` | **大面板容器** | 整个大面板的根容器 |
| `navRow` | **导航行** | 周/日/月切换、前后翻页、今天按钮 |
| `weekTitleEl` | **视图标题** | 如"W24"或"2026年6月" |
| `viewTabBtns` | **标签页按钮** | 日历/列表/时间表/统计 |
| `tabContentEl` | **标签内容区** | 当前选中标签的渲染区域 |
| `currentTab` | **当前标签** | calendar / list / timesheet / stats |
| `calendarView` | **日历视图模式** | day / week / month |
| `currentLineEl` | **当前时刻横线** | 日历格子里标记当前时间的红线 |
| `ongoingBarEl` | **进行中条** | 表示当前正在进行的会话 |
| `Tomato-cal-grid` | **日历网格** | 带时间轴的格子 |
| `Tomato-cal-bar` | **日历条** | 每个格子里的彩色时间段 |
| `Tomato-cal-ruler` | **时间标尺** | 左侧 00:00 ~ 24:00 刻度 |

---

## 其他全局元素

| 代码中的变量/类名 | 标准说法 | 补充说明 |
|---|---|---|
| `statusBarEl` | **状态栏** | 底部状态栏的计时显示 |
| `ribbonIconEl` | **功能区图标** | 左侧边栏的番茄钟图标 |
| `TomatoSettingTab` | **设置标签页** | 插件设置界面 |
| `notificationService` | **通知服务** | 阶段完成的系统通知 + 提示音 |
| `recoveryService` | **恢复服务** | 自动保存/恢复计时状态 |
