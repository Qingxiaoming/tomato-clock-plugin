# Tomato Clock

[中文说明](README.zh.md)

**A full-featured timer plugin for Obsidian with Pomodoro, stopwatch, countdown modes, Toggl Track-style timeline, project statistics, and local-first data storage.**

## Features

### Three Timer Modes

- **Pomodoro**: Classic Pomodoro Technique with configurable work duration, short break, long break, and cycles per set. Auto-transitions between work and break phases.
- **Stopwatch**: Counts up from zero. Ideal for tasks without a fixed time limit.
- **Countdown**: Counts down from a preset number of minutes. Great for time-boxed tasks.

### Dual Panel System

**Compact Panel** — the default sidebar view, minimal and space-efficient:
- Top: **project selector** + **task name input**
- **Current time row**: large current time + year/month/day/week **periodic note indicator dots** + **mode toggle button**
- **Today timeline**: grey track + colored segments (recorded sessions) + purple **current-time vertical line**
- **Timer row**: **phase dot column** (vertical, indicates which pomodoro) | **clock** (large font, double-click to open full panel, right-click for mode actions) | **action button** (play/skip/reset/stop)
- **Info row**: current status (left) + **today's total duration** (right)
- **Calendar area**: right-side navigation (month-year label + prev/next arrows) + left-side **calendar-extended embedded month view** (with daily note markers)

**Full Panel** — opened by double-clicking the compact clock, information-rich:
- Header: title + today's completed tomato count
- Mode switcher buttons (horizontal text buttons)
- Project selector + task input + countdown minutes input
- Tomato progress dots (4 per cycle)
- Large control buttons (Start/Pause/Resume/Stop/Skip/Reset)
- Four tabs: **Calendar** / **List** / **Timesheet** / **Stats**

### Calendar Tab

- **Day / Week / Month** view modes via the navigation row
- Horizontal 00:00–24:00 time track, colored bars represent each session
- Left-side time ruler (00:00 ~ 24:00)
- Top **project bar** showing project distribution for the current view
- Right-click a colored bar to **edit that entry's project, task, or duration**
- Date navigation: previous day / next day / today

### List Tab

- Record list grouped by date
- Shows start time, end time, duration, mode, project, and task name for each entry

### Timesheet Tab

- Week-view horizontal time track, Toggl Track-inspired design
- Date navigation + legend + total duration summary

### Stats Tab

- Period switcher: Day / Week / Month / Year
- Total duration + tomato count
- Project distribution (with colored dots)
- Bar chart trend (daily for week view, weekly for month view, monthly for year view)
- **Generate Report**: click to create a Markdown report (weekly/monthly/yearly) in the `Reports/` subfolder under your log folder

### Embedded Calendar (Compact Panel)

- Month view based on calendar-extended
- Daily note markers and periodic note markers
- Click month-year label to jump back to current month
- Prev/next arrows for paging

### Logging System

- **Daily files**: one `YYYY-MM-DD.md` file per day in your configured log folder
- **Entry format**: `- 14:30 ~ 14:55 (25m) [pomodoro] task name`
- **Project parsing**: if the task text contains `tomato_project: ProjectName` or `tomato_project：ProjectName`, stats will automatically group by that project
- **Daily note link**: optionally insert a `[[wikilink]]` to the daily note at the top of each log file (path resolved via Obsidian's core Daily Notes plugin)
- **Cross-day handling**: entries spanning midnight are written to the start-date file; statistics code fills in the gap
- **Auto-create folder**: if the log folder does not exist, it is created automatically on first write
- **Auto-open on complete**: optionally open the day's log file in an adjacent pane when a session ends

### Project Management

- Add, edit, and delete projects in the settings panel
- Each project has a custom color
- Select a project in either panel; it is recorded in logs and statistics
- Calendar, timeline, and stats views segment/group by project color

### Internationalization

- Switch between **English and Chinese**
- All UI text, settings labels, and notifications are fully localized

### Status Bar

- Shows remaining time (Pomodoro/Countdown) or elapsed time (Stopwatch) in the Obsidian status bar
- Three display modes: **full** (time + status), **simple** (timer running indicator only), **hidden**
- Click the status bar item to open the compact panel

### Notifications & Sound

- System notification when a phase ends (works even when Obsidian is in the background)
- Beep sound synthesized via Web Audio API in the browser — no external audio files needed
- Browser notification permission is requested automatically on first load

### Session Recovery

- Auto-saves recovery data to `recovery.json` every 10 seconds while the timer is running
- If the timer is running when you close Obsidian, a save is triggered and a browser prompt helps prevent accidental closure
- On reopening Obsidian, `recovery.json` is read automatically to restore the previous timer state (mode, phase, elapsed time, project, task, etc.)

### Command Palette

The following commands are available via Ctrl/Cmd+P:
- Tomato: Start / Pause
- Tomato: Reset
- Tomato: Open panel
- Tomato: Switch to Pomodoro
- Tomato: Switch to Stopwatch
- Tomato: Switch to Countdown

## Settings

| Option | Default | Description |
|---|---|---|
| Language | Chinese | UI language (中文 / English) |
| Work duration | 25 min | Length of each focus session |
| Short break | 5 min | Break after each session |
| Long break | 15 min | Break after a full cycle |
| Cycles per set | 4 | Work sessions before a long break |
| Countdown duration | 25 min | Default duration for countdown mode |
| Auto-start next phase | On | Automatically start the next phase |
| Sound alert | On | Beep when a phase ends |
| OS notification | On | System notification for background use |
| Status bar mode | Full | Full / Simple / Hidden |
| Log folder | Tomato Logs | Folder where daily log files are stored |
| Link daily note | On | Insert a link to the daily note at the top of each log file |
| Open log on complete | On | Auto-open the day's log file when a session ends |
| Calendar snap minutes | 5 min | Calendar slot alignment granularity (1/5/10/15/30) |
| Compact current time font size | 1.7 rem | Font size of the current time row |
| Compact timer font size | 1.8 rem | Font size of the clock area |
| Compact current time font | Courier New | Font family for current time row |
| Compact timer font | Courier New | Font family for the clock |
| Projects | — | Add/edit/delete projects and colors |
| Calendar extended settings | — | calendar-extended settings (week start, daily note format, etc.) |

## Usage

1. Click the ⏱ icon in the left ribbon (or run the "Tomato: Open panel" command) to open the compact panel.
2. Select a project from the dropdown and enter the current task name.
3. Click **Start** to begin timing. In Pomodoro mode, work/break phases cycle automatically.
4. Double-click the clock area in the compact panel to open the full panel and view Calendar, List, Timesheet, and Stats.
5. When a session ends, the log is automatically appended to the day's log file. If "Link daily note" is enabled, you can find the log via backlinks from your daily note.

## Installation

Copy `main.js`, `manifest.json`, and `styles.css` from this repo into `.obsidian/plugins/tomato-clock/` in your vault, then enable the plugin in Obsidian → Settings → Community plugins.

## Privacy & Data

All data is stored locally:
- Timer sessions are logged to Markdown files inside your vault
- Recovery data is saved to `recovery.json` in the plugin directory
- No external servers, no telemetry, no analytics

## Tech Stack

- TypeScript
- Obsidian Plugin API
- esbuild
- Web Audio API (sound synthesis)
- calendar-extended (embedded calendar)
