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
- Top: project selector + task name input
- Middle: vertical progress dots column | large clock | vertical icon buttons (start/pause/stop/reset) | vertical mode switcher column
- Bottom: current status (left) + today's total duration (right)
- Double-click the clock to open the full panel

**Full Panel** — opened by double-clicking the compact clock, information-rich:
- Header: title + today's completed tomato count
- Mode switcher buttons (horizontal text buttons)
- Project selector + task input + countdown minutes input
- Tomato progress dots (4 per cycle)
- Large control buttons (Start/Pause/Resume/Stop/Skip/Reset)
- Three tabs: Timeline / Stats / History

### Timeline Tab

- Horizontal 00:00–24:00 time track, colored by project
- Date navigation: previous day / next day / today
- Legend (project color key) and total duration summary below the track
- Toggl Track-inspired design

### Stats Tab

- Period switcher: Day / Week / Month / Year
- Total duration + tomato count
- Project distribution (with colored dots)
- Bar chart trend (daily for week view, weekly for month view, monthly for year view)
- **Generate Report**: click to create a Markdown report (weekly/monthly/yearly) in the `Reports/` subfolder under your log folder, avoiding recomputation on every switch

### History Tab

- List of today's timer entries with details

### Logging System

- **Daily files**: one `YYYY-MM-DD.md` file per day in your configured log folder
- **Entry format**: `- 14:30 ~ 14:55 (25m) [pomodoro] task name`
- **Project parsing**: if the task text contains `tomato_project: ProjectName` or `tomato_project：ProjectName`, stats will automatically group by that project
- **Daily note link**: optionally insert a `[[wikilink]]` to the daily note at the top of each log file (path resolved via Obsidian's core Daily Notes plugin)
- **Cross-day handling**: entries spanning midnight are written to the start-date file; statistics code fills in the gap
- **Auto-create folder**: if the log folder does not exist, it is created automatically on first write

### Project Management

- Add, edit, and delete projects in the settings panel
- Each project has a custom color
- Select a project in either panel; it is recorded in logs and statistics
- Timeline and stats views segment/group by project color

### Internationalization

- Switch between **English and Chinese**
- All UI text, settings labels, and notifications are fully localized

### Status Bar

- Shows remaining time (Pomodoro/Countdown) or elapsed time (Stopwatch) in the Obsidian status bar
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
| Log folder | Tomato Logs | Folder where daily log files are stored |
| Link daily note | On | Insert a link to the daily note at the top of each log file |
| Projects | — | Add/edit/delete projects and colors |

## Usage

1. Click the ⏱ icon in the left ribbon (or run the "Tomato: Open panel" command) to open the compact panel.
2. Select a project from the dropdown and enter the current task name.
3. Click **Start** to begin timing. In Pomodoro mode, work/break phases cycle automatically.
4. Double-click the clock area in the compact panel to open the full panel and view the timeline, stats, and history.
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
