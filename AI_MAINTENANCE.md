# AI Maintenance Guide — Tomato Clock

**Project Summary**: An Obsidian timer plugin (Pomodoro + Stopwatch + Countdown) with dual-panel UI, Toggl Track-style timeline, calendar-extended embedded month view, project-based statistics, daily logging, session recovery, and English/Chinese i18n.

This document is written for AI assistants (and human maintainers) who need to understand, debug, or extend the Tomato Clock Obsidian plugin. Read this before making changes.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Obsidian Workspace                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ CompactView │  │  FullView   │  │  SettingsTab    │ │
│  │(sidebar)    │  │(double-click│  │                 │ │
│  │             │  │ clock)      │  │                 │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────┘ │
│         │                │                               │
│         └────────────────┘                               │
│                  │                                       │
│           ┌──────┴──────┐                                │
│           │  TomatoPlugin │  ← main.ts                   │
│           │  (Plugin)     │                              │
│           └──────┬──────┘                                │
│                  │                                       │
│    ┌─────────────┼─────────────┐                        │
│    │             │             │                        │
│ ┌──┴──┐    ┌────┴────┐   ┌────┴────┐                  │
│ │Timer │    │Notification│ │Recovery │                  │
│ │Core  │    │  Service   │ │ Service │                  │
│ └──┬──┘    └───────────┘   └─────────┘                  │
│    │                                                     │
│ ┌──┴─────────────────────────────┐                      │
│ │ Log system (daily files)       │                      │
│ │ - parseDayFile()               │                      │
│ │ - appendEntry()                │                      │
│ └────────────────────────────────┘                      │
│                                                         │
│ ┌────────────────────────────────┐                      │
│ │ calendar-extended              │                      │
│ │ - createCalendarEmbed()        │                      │
│ │ - CalendarView                 │                      │
│ └────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

- **Single source of truth**: `TomatoTimer` (timer.ts) holds all runtime timer state. Views are passive consumers.
- **Plugin owns the timer**: `TomatoPlugin` (main.ts) creates the timer, wires callbacks, and mediates between timer and views.
- **Views do NOT own state**: they read from `plugin.timer.getState()` and call timer methods like `start()`, `pause()`, `reset()`.
- **calendar-extended** is a sub-module providing the embedded month calendar in the compact panel and the standalone calendar view.

---

## 2. File Responsibilities

| File | Responsibility |
|---|---|
| `src/main.ts` | Plugin entry. Registers views, commands, status bar, ribbon icon. Owns `TomatoTimer` instance. Handles `onPhaseComplete` → writes log → refreshes views. Watches vault `modify` events to refresh full panel tabs. |
| `src/timer.ts` | Timer engine. Pure logic, no DOM. Manages Pomodoro cycle, stopwatch elapsed time, countdown remaining time. Emits `onTick` every second and `onPhaseComplete` when a phase ends. Supports recovery via `getRecoveryData()` / `restoreFromRecovery()`. |
| `src/timerView.ts` | **Full panel** (`VIEW_TYPE_Tomato`). Built with `ItemView`. Has four tabs: **Calendar**, **List**, **Timesheet**, **Stats**. Contains `buildUI()`, `renderCalendar()`, `renderList()`, `renderTimesheet()`, `renderStats()`. All tab renders go through `refreshTabContent()` which has a concurrency guard (`refreshing` flag). |
| `src/timerViewCompact.ts` | **Compact panel** (`VIEW_TYPE_Tomato_Compact`). Sidebar leaf. Minimal UI: project select, task input, current time row, **today timeline**, vertical phase dots, clock (dblclick opens full panel, right-click mode menu), action button, status + today minutes, **calendar-extended embedded month view**. |
| `src/settings.ts` | Settings schema (`TomatoPluginSettings`), defaults, and the settings UI (`TomatoSettingTab`). Includes project management (add/edit/delete + color picker), status bar mode, font settings, and calendar-extended settings. |
| `src/log.ts` | Log I/O. `appendEntry()` writes to daily files. `parseDayFile()` reads and parses a day's log. `parseProject()` extracts project names from task text. `getDailyNotePath()` resolves daily note paths via Obsidian's internal daily-notes plugin API. |
| `src/i18n.ts` | Translation dictionary (`dict`). Keys are dot-separated strings (e.g. `panel.btn.start`). `t()` for plain text, `tf()` for interpolated text (`{var}` placeholders). Supported langs: `en`, `zh`. |
| `src/services/notification.ts` | `NotificationService`. Plays synthesized beep via Web Audio API. Shows browser/OS notification on phase complete. |
| `src/services/recovery.ts` | `RecoveryService`. Auto-saves `recovery.json` every 10s. Loads on startup to restore timer state. Silently ignores I/O errors. |
| `src/utils.ts` | Shared utilities: `minutesToHM()`, `formatDate()`, `timeToMinutes()`, `projectColor()`, etc. |
| `src/calendar-extended/` | Embedded calendar sub-module. Exports `createCalendarEmbed()`, `CalendarView`, and calendar settings. Used by compact panel for the month view and by the plugin for the standalone calendar leaf. |
| `styles.css` | All plugin styles. Uses Obsidian CSS variables (e.g. `--interactive-accent`, `--background-primary`) for theme compatibility. |

---

## 3. Key Data Flows

### 3.1 Timer Tick

```
TomatoTimer.interval ──► onTick(state) ──► main.ts.onTick()
                                              ├──► refreshStatusBar(state)
                                              ├──► refreshAllViews()
                                              │       ├──► compactView.updateTimerUI(state)
                                              │       └──► fullView.updateTimerUI(state)
                                              └──► recoveryService.save() (every 10s)
```

### 3.2 Phase Complete → Log Write

```
TomatoTimer ──► onPhaseComplete(completed, next, duration)
    └──► main.ts.onPhaseComplete()
            ├──► appendEntry() → writes YYYY-MM-DD.md
            ├──► openLogForEditing() → opens file in adjacent pane (if enabled)
            ├──► notificationService.notify()
            └──► refresh full panel tabs (via vault 'modify' watcher)
```

**Important**: `appendEntry()` triggers a vault `modify` event. `main.ts` listens to `modify` and calls `refreshTabContent()` on all full-panel leaves. This means a phase complete can cause **two** refreshes: one direct in `onPhaseComplete`, and one from the `modify` event. The `refreshing` lock in `timerView.ts` deduplicates these.

### 3.3 View Refresh (Full Panel)

```
refreshTabContent()          [has concurrency lock]
    ├──► tabContentEl.empty()
    └──► if currentTab == 'calendar' → renderCalendar()
         │    └──► await parseLogsForPeriod()          [async I/O]
         │    └──► build DOM (project bar, grid, ruler, bars)
         ├──► if currentTab == 'list' → renderList()
         │    └──► await parseLogsForPeriod()
         │    └──► build DOM (grouped entry list)
         ├──► if currentTab == 'timesheet' → renderTimesheet()
         │    └──► await parseLogsForPeriod()
         │    └──► build DOM (nav, track, legend, summary)
         └──► if currentTab == 'stats' → renderStats()
              └──► await parseLogsForPeriod()
              └──► build DOM (period buttons, charts, report button)
```

**Concurrency guard**: `refreshTabContent()` checks `this.refreshing`. If already refreshing, it returns immediately. All user actions (tab clicks, date arrows, "Today" button, period buttons) route through `refreshTabContent()` — **never** call `renderXxx()` directly from event handlers.

### 3.4 Compact Panel Timeline Refresh

```
renderTodayTimeline()
    ├──► await parseDayFile()          [async I/O]
    ├──► compute hash of entries
    ├──► if data changed OR timeline is empty → rebuild track + segments + current line
    └──► else → only update current line position
```

**Important**: The timeline must render even when there are **no entries** (empty track + current line). The `isEmpty` guard ensures the skeleton is built on first call.

---

## 4. Common Modification Points

### 4.1 Add a new UI text

1. Add key-value pairs to `src/i18n.ts` under `dict` for both `en` and `zh`.
2. Use `this.plugin.t('your.key')` in views or `this.plugin.tf('your.key', {var: 'value'})` for interpolated strings.
3. **Never** hardcode Chinese or English strings in view files.

### 4.2 Add a new setting

1. Add field to `TomatoPluginSettings` interface in `src/settings.ts`.
2. Add default to `DEFAULT_SETTINGS`.
3. Add UI control in `TomatoSettingTab.display()`.
4. If the setting affects timer durations, call `this.plugin.applySettings()` in the onChange handler so `TomatoTimer` picks it up.
5. If the setting affects view appearance, call `this.plugin.refreshAllViews()` in the onChange handler.

### 4.3 Change timer behavior

- Edit `src/timer.ts`. Keep it DOM-free.
- If you add new state fields, update `TimerState` interface and `getRecoveryData()` / `restoreFromRecovery()` so session recovery still works.
- If you add a new phase or mode, update `PhaseType` / `TimerMode` types and add localized status strings in `i18n.ts`.

### 4.4 Modify the Calendar / List / Timesheet / Stats tabs

- Edit `src/timerView.ts`.
- Each tab render method receives `this.tabContentEl` (already emptied by `refreshTabContent`).
- Use `createDiv()`, `createEl()`, `createSpan()` (Obsidian helper APIs) instead of raw `document.createElement`.
- For async data, `await` inside the render method. The concurrency lock prevents duplicate renders.

### 4.5 Modify the Compact Panel

- Edit `src/timerViewCompact.ts`.
- `buildUI()` creates the static structure; `updateTimerUI()` updates dynamic text/colors based on timer state.
- `renderTodayTimeline()` is async and has its own `renderingTimeline` guard.
- The embedded calendar is created via `createCalendarEmbed()` and stored in `this.calendarEmbed`.

### 4.6 Change log format

- **Write path**: `src/log.ts` → `appendEntry()`.
- **Read/parse path**: `src/log.ts` → `ENTRY_RE` regex and `parseDayFile()`.
- **Critical**: if you change the line format, update `ENTRY_RE` to match. Otherwise stats and history will break.
- Project parsing is done by `parseProject()` using regex `/tomato_project[：:]\s*(\S+)/`.

### 4.7 Add a new command

- Add to `main.ts` `onload()` in the commands section.
- Add localized command name to `i18n.ts` under `cmd.*` keys.

---

## 5. Important Rules & Pitfalls

### 5.1 Never call `renderXxx()` directly from event handlers

❌ Bad:
```ts
btn.addEventListener('click', () => void this.renderCalendar());
```

✅ Good:
```ts
btn.addEventListener('click', () => void this.refreshTabContent());
```

`refreshTabContent()` holds the `refreshing` lock and handles `tabContentEl.empty()` centrally.

### 5.2 Do not duplicate `el.empty()` inside render methods

`refreshTabContent()` already does `this.tabContentEl.empty()` before dispatching to `renderCalendar()` / `renderList()` / `renderTimesheet()` / `renderStats()`. The render methods should **not** call `el.empty()` themselves (historically this caused race-condition duplicates).

### 5.3 `buildUI()` must be idempotent and guarded

Both `timerView.ts` and `timerViewCompact.ts` have a `uiBuilt` flag. `buildUI()` checks it and returns early if true. `onClose()` resets it to `false`. This prevents duplicate DOM creation if `onOpen()` is ever called twice.

### 5.4 Recovery data must stay in sync with timer state

If you add new fields to `TimerState`, mirror them in `RecoveryData` and update:
- `TomatoTimer.getRecoveryData()`
- `TomatoTimer.restoreFromRecovery()`

Otherwise users will lose that state on Obsidian restart.

### 5.5 Log folder auto-creation

`appendEntry()` creates the log folder if missing. Do not assume the folder exists.

### 5.6 Daily note link uses internal API

`getDailyNotePath()` accesses `app.internal.plugins.getPlugin('daily-notes')`. This is an **internal** Obsidian API and may break in future Obsidian versions. If it breaks, gracefully fall back to `null` (no link inserted).

### 5.7 Do not use `registerDomEvent` for view-internal buttons

Use `btn.addEventListener(...)` for buttons inside views. `registerDomEvent` is for events on elements that may outlive the view. Since `buildUI()` empties `contentEl` on open, direct `addEventListener` is fine and avoids leaking listeners.

### 5.8 Avoid importing views into each other

`timerView.ts` and `timerViewCompact.ts` do not import each other. They both import from `main.ts` (to call `activateFullView()` etc.). Keep this one-way dependency.

### 5.9 Timeline must render empty skeleton

`renderTodayTimeline()` must build the track and current line even when `dayRecord.entries` is empty. The `isEmpty` guard (`this.timelineEl.childElementCount === 0`) ensures this. Without it, the timeline only appears after the first logged entry.

### 5.10 Calendar bar edit dialog

In `renderCalendar()`, each bar has a `contextmenu` listener that opens `editEntryDialog()`. This dialog modifies the log file directly via `app.vault.process()`. After editing, the vault `modify` event triggers a refresh.

---

## 6. Build & Test

```bash
npm run build
```

- `tsc -noEmit` checks types.
- `esbuild.config.mjs` bundles to `main.js`.
- `styles.css` is copied as-is; Obsidian hot-reloads it when the file changes.

To test in Obsidian:
1. Run `npm run build`.
2. Reload the plugin in Obsidian (or use the Hot-Reload plugin).
3. If you see duplicate UI elements, check that `uiBuilt` and `refreshing` guards are in place.

---

## 7. Glossary

| Term | Meaning |
|---|---|
| Phase | One segment of time: `work`, `shortBreak`, `longBreak`, `idle`, `stopwatch`, `countdown` |
| Mode | Timer operating mode: `pomodoro`, `stopwatch`, `countdown` |
| Rep | Counter of completed work sessions in the current cycle |
| Cycle | A full set of work sessions before a long break (default 4) |
| Entry | One line in a daily log file representing a completed session |
| Project | User-defined category with a name and color |
| Recovery | The mechanism that saves/restores timer state across Obsidian restarts |
| Timeline | The compact panel's horizontal 00:00–24:00 track showing today's logged sessions |
| Calendar embed | The calendar-extended month view embedded in the compact panel |
| Project bar | The colored bar at the top of the Calendar tab showing project distribution |
| Snap minutes | Calendar slot alignment granularity (e.g. 5 min means bars snap to 5-minute boundaries) |
