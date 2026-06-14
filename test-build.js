var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => TomatoPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian6 = require("obsidian");

// src/timer.ts
var TomatoTimer = class {
  constructor(settings) {
    this.reps = 0;
    this.isRunning = false;
    this.intervalId = null;
    this.completedTomatos = 0;
    this.startTime = 0;
    this.accumulatedMs = 0;
    this.mode = "pomodoro";
    this.countdownSeconds = 0;
    this.taskName = "";
    this.currentProject = "";
    this.sessionStartDate = "";
    this.sessionStartTime = "";
    this.sessionStartMode = "pomodoro";
    this.onTickCb = null;
    this.onPhaseCb = null;
    this.settings = settings;
    this.countdownSeconds = settings.countdownMinutes * 60;
  }
  updateSettings(settings) {
    this.settings = settings;
    if (this.mode === "countdown" && this.reps === 0) {
      this.countdownSeconds = settings.countdownMinutes * 60;
    }
    this.notifyTick();
  }
  onTick(cb) {
    this.onTickCb = cb;
  }
  onPhaseComplete(cb) {
    this.onPhaseCb = cb;
  }
  setMode(mode) {
    this.mode = mode;
    if (mode === "countdown") {
      this.countdownSeconds = this.settings.countdownMinutes * 60;
    }
  }
  getMode() {
    return this.mode;
  }
  setCountdownMinutes(minutes) {
    this.countdownSeconds = minutes * 60;
  }
  setCountdownSeconds(seconds) {
    this.countdownSeconds = seconds;
  }
  setTaskName(name) {
    this.taskName = name;
  }
  getTaskName() {
    return this.taskName;
  }
  setCurrentProject(project) {
    this.currentProject = project;
  }
  getCurrentProject() {
    return this.currentProject;
  }
  getSessionStartDate() {
    return this.sessionStartDate;
  }
  getSessionStartTime() {
    return this.sessionStartTime;
  }
  getSessionStartMode() {
    return this.sessionStartMode;
  }
  adjustSessionStart(minuteDelta) {
    const [h, m] = this.sessionStartTime.split(":").map(Number);
    let totalMin = h * 60 + m + minuteDelta;
    const d = /* @__PURE__ */ new Date(this.sessionStartDate + "T00:00:00");
    while (totalMin < 0) {
      d.setDate(d.getDate() - 1);
      totalMin += 1440;
    }
    while (totalMin >= 1440) {
      d.setDate(d.getDate() + 1);
      totalMin -= 1440;
    }
    this.sessionStartDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    this.sessionStartTime = `${String(Math.floor(totalMin / 60)).padStart(2, "0")}:${String(totalMin % 60).padStart(2, "0")}`;
    if (this.isRunning) {
      this.startTime += minuteDelta * 6e4;
    }
    this.notifyTick();
  }
  start() {
    if (this.isRunning) return;
    if (this.mode === "pomodoro") {
      this.reps += 1;
    } else {
      this.reps = 1;
    }
    this.isRunning = true;
    this.accumulatedMs = 0;
    this.startTime = Date.now();
    const now = /* @__PURE__ */ new Date();
    this.sessionStartDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    this.sessionStartTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    this.sessionStartMode = this.mode;
    this.startInterval();
    this.notifyTick();
  }
  pause() {
    if (!this.isRunning) return;
    this.accumulatedMs += Date.now() - this.startTime;
    this.isRunning = false;
    this.stopInterval();
    this.notifyTick();
  }
  resume() {
    if (this.isRunning) return;
    if (this.reps === 0) return;
    if (this.mode !== "stopwatch" && this.getRemainingMs() <= 0) return;
    this.isRunning = true;
    this.startTime = Date.now();
    this.startInterval();
    this.notifyTick();
  }
  reset() {
    this.stopInterval();
    this.reps = 0;
    this.isRunning = false;
    this.accumulatedMs = 0;
    this.startTime = 0;
    this.sessionStartDate = "";
    this.sessionStartTime = "";
    this.sessionStartMode = this.mode;
    this.notifyTick();
  }
  destroy() {
    this.stopInterval();
    this.onTickCb = null;
    this.onPhaseCb = null;
  }
  getRecoveryData() {
    return {
      mode: this.mode,
      phase: this.currentPhase(),
      isRunning: this.isRunning,
      startTime: this.startTime,
      accumulatedMs: this.isRunning ? this.accumulatedMs + (Date.now() - this.startTime) : this.accumulatedMs,
      taskName: this.taskName,
      currentProject: this.currentProject,
      lastUpdated: Date.now(),
      sessionStartDate: this.sessionStartDate,
      sessionStartTime: this.sessionStartTime,
      countdownSeconds: this.countdownSeconds,
      reps: this.reps,
      completedTomatos: this.completedTomatos,
      sessionStartMode: this.sessionStartMode
    };
  }
  restoreFromRecovery(data) {
    this.mode = data.mode;
    this.reps = data.reps;
    this.completedTomatos = data.completedTomatos;
    this.taskName = data.taskName;
    this.currentProject = data.currentProject ?? "";
    this.sessionStartDate = data.sessionStartDate;
    this.sessionStartTime = data.sessionStartTime;
    this.sessionStartMode = data.sessionStartMode ?? data.mode;
    this.countdownSeconds = typeof data.countdownSeconds === "number" && data.countdownSeconds > 0 ? data.countdownSeconds : this.settings.countdownMinutes * 60;
    this.accumulatedMs = data.accumulatedMs;
    if (data.isRunning) {
      const now = Date.now();
      const delta = now - data.lastUpdated;
      this.accumulatedMs += delta;
      this.startTime = now;
      if (this.mode !== "stopwatch") {
        const total = this.phaseDuration(this.currentPhase()) * 1e3;
        if (this.accumulatedMs >= total) {
          this.isRunning = false;
          const done = this.currentPhase();
          if (done === "work") this.completedTomatos += 1;
          const durationMin = Math.round(this.phaseDuration(done) / 60);
          this.handleEnd(done, durationMin);
          return;
        }
      }
      this.isRunning = true;
      this.startInterval();
    } else {
      this.isRunning = false;
      this.startTime = 0;
    }
    this.notifyTick();
  }
  skip() {
    if (this.reps === 0) return;
    this.stopInterval();
    const done = this.currentPhase();
    this.isRunning = false;
    const elapsedSec = Math.floor((this.accumulatedMs + (Date.now() - this.startTime)) / 1e3);
    const durationMin = Math.max(1, Math.round(elapsedSec / 60));
    this.notifyTick();
    this.handleEnd(done, durationMin);
  }
  getState() {
    const elapsed = Math.floor((this.accumulatedMs + (this.isRunning ? Date.now() - this.startTime : 0)) / 1e3);
    return {
      phase: this.currentPhase(),
      mode: this.mode,
      reps: this.reps,
      remainingSeconds: this.mode === "stopwatch" ? 0 : Math.floor(this.getRemainingMs() / 1e3),
      elapsedSeconds: elapsed,
      isRunning: this.isRunning,
      completedTomatos: this.completedTomatos,
      taskName: this.taskName,
      currentProject: this.currentProject
    };
  }
  getRemainingMs() {
    const elapsed = this.isRunning ? Date.now() - this.startTime : 0;
    const total = this.phaseDuration(this.currentPhase()) * 1e3;
    return Math.max(0, total - this.accumulatedMs - elapsed);
  }
  currentPhase() {
    if (this.mode === "stopwatch") return "stopwatch";
    if (this.mode === "countdown") return "countdown";
    if (this.reps === 0) return "idle";
    if (this.reps % (this.settings.cycles * 2) === 0) return "longBreak";
    if (this.reps % 2 === 0) return "shortBreak";
    return "work";
  }
  nextPhase() {
    if (this.mode !== "pomodoro") return "idle";
    const n = this.reps + 1;
    if (n % (this.settings.cycles * 2) === 0) return "longBreak";
    if (n % 2 === 0) return "shortBreak";
    return "work";
  }
  phaseDuration(phase) {
    switch (phase) {
      case "work":
        return this.settings.workMinutes * 60;
      case "shortBreak":
        return this.settings.shortBreakMinutes * 60;
      case "longBreak":
        return this.settings.longBreakMinutes * 60;
      case "countdown":
        return this.countdownSeconds;
      default:
        return 0;
    }
  }
  startInterval() {
    this.stopInterval();
    this.intervalId = window.setInterval(() => this.tick(), 1e3);
  }
  stopInterval() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
  tick() {
    if (this.mode === "stopwatch") {
      this.notifyTick();
      return;
    }
    if (this.getRemainingMs() <= 0) {
      const done = this.currentPhase();
      this.stopInterval();
      this.isRunning = false;
      if (done === "work") this.completedTomatos += 1;
      const durationMin = Math.round(this.phaseDuration(done) / 60);
      this.notifyTick();
      this.handleEnd(done, durationMin);
    } else {
      this.notifyTick();
    }
  }
  handleEnd(done, durationMinutes) {
    if (this.mode === "stopwatch") {
      this.onPhaseCb?.(done, "idle", durationMinutes);
      this.reps = 0;
      return;
    }
    const next = this.nextPhase();
    this.onPhaseCb?.(done, next, durationMinutes);
    if (this.settings.autoStartNextPhase && this.mode === "pomodoro") {
      this.start();
    }
  }
  notifyTick() {
    this.onTickCb?.(this.getState());
  }
};

// src/timerView.ts
var import_obsidian2 = require("obsidian");

// src/log.ts
var import_obsidian = require("obsidian");
var ENTRY_RE = /^- (\d{2}:\d{2}) ~ (\d{2}:\d{2}) \((\d+)m\) \[([^\]]+)\](.*)/;
function todayString() {
  const n = /* @__PURE__ */ new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function nowTimeString() {
  const n = /* @__PURE__ */ new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function parseProject(taskName) {
  const m = taskName.match(/tomato_project[：:]\s*(\S+)/);
  return m?.[1];
}
function getDailyNotePath(app, dateStr) {
  const internalPlugins = app.internalPlugins;
  let dailyNotes = null;
  if (internalPlugins?.getPluginById) {
    dailyNotes = internalPlugins.getPluginById("daily-notes");
  } else {
    dailyNotes = app.internal?.plugins?.getPlugin?.("daily-notes") ?? null;
  }
  if (!dailyNotes) return null;
  const options = dailyNotes.instance?.options ?? dailyNotes.options;
  if (!options) return null;
  const folder = options.folder ?? "";
  const format = options.format ?? "YYYY-MM-DD";
  const moment = window.moment;
  if (!moment) return null;
  const m = moment(dateStr, "YYYY-MM-DD");
  const fileName = m.format(format);
  return folder ? `${folder}/${fileName}` : fileName;
}
function logFilePath(settings, dateStr) {
  const folder = (0, import_obsidian.normalizePath)(settings.logFolder);
  return `${folder}/${dateStr}.md`;
}
async function appendEntry(app, settings, entry) {
  const folder = (0, import_obsidian.normalizePath)(settings.logFolder);
  const path = (0, import_obsidian.normalizePath)(logFilePath(settings, entry.date));
  const taskPart = entry.taskName ? ` ${entry.taskName}` : "";
  const line = `- ${entry.startTime} ~ ${entry.endTime} (${entry.duration}m) [${entry.mode}]${taskPart}
`;
  const folderExists = await app.vault.adapter.exists(folder);
  if (!folderExists) {
    await app.vault.adapter.mkdir(folder);
  }
  const existing = app.vault.getFileByPath(path);
  if (!(existing instanceof import_obsidian.TFile)) {
    let header = "";
    if (settings.enableDailyNoteLink) {
      const dailyPath = getDailyNotePath(app, entry.date);
      if (dailyPath) {
        header = `[[${dailyPath}]]

`;
      }
    }
    await app.vault.create(path, `${header}${line}`);
    return;
  }
  await app.vault.process(existing, (content) => {
    const sep = content.endsWith("\n") ? "" : "\n";
    return `${content}${sep}${line}`;
  });
}
async function parseDayFile(app, settings, dateStr) {
  const path = (0, import_obsidian.normalizePath)(logFilePath(settings, dateStr));
  const file = app.vault.getFileByPath(path);
  if (!(file instanceof import_obsidian.TFile)) return { date: dateStr, entries: [] };
  const content = await app.vault.read(file);
  const lines = content.split("\n");
  const entries = [];
  for (const line of lines) {
    const match = ENTRY_RE.exec(line);
    if (!match) continue;
    const rest = (match[5] ?? "").trim();
    entries.push({
      startTime: match[1] ?? "",
      endTime: match[2] ?? "",
      duration: parseInt(match[3] ?? "0", 10),
      mode: match[4] ?? "pomodoro",
      taskName: rest,
      project: parseProject(rest),
      rest
    });
  }
  return { date: dateStr, entries };
}
async function getDayMinutes(app, settings, dateStr) {
  let total = 0;
  const today = await parseDayFile(app, settings, dateStr);
  for (const e of today.entries) {
    if (isCrossDay(e.startTime, e.endTime)) {
      total += 1440 - timeToMinutes(e.startTime);
    } else {
      total += e.duration;
    }
  }
  const prevDate = prevDayString(dateStr);
  const prev = await parseDayFile(app, settings, prevDate);
  for (const e of prev.entries) {
    if (isCrossDay(e.startTime, e.endTime)) {
      total += timeToMinutes(e.endTime);
    }
  }
  return total;
}
function isCrossDay(startTime, endTime) {
  return timeToMinutes(endTime) < timeToMinutes(startTime);
}
function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function prevDayString(dateStr) {
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
async function writeDayEntries(app, settings, dateStr, entries) {
  const path = (0, import_obsidian.normalizePath)(logFilePath(settings, dateStr));
  const file = app.vault.getFileByPath(path);
  let header = "";
  if (settings.enableDailyNoteLink) {
    const dailyPath = getDailyNotePath(app, dateStr);
    if (dailyPath) {
      header = `[[${dailyPath}]]

`;
    }
  }
  const lines = entries.map((e) => {
    const taskPart = e.taskName ? ` ${e.taskName}` : "";
    return `- ${e.startTime} ~ ${e.endTime} (${e.duration}m) [${e.mode}]${taskPart}`;
  });
  const content = header + lines.join("\n") + (lines.length > 0 ? "\n" : "");
  if (file instanceof import_obsidian.TFile) {
    await app.vault.modify(file, content);
  } else {
    const folder = (0, import_obsidian.normalizePath)(settings.logFolder);
    const folderExists = await app.vault.adapter.exists(folder);
    if (!folderExists) {
      await app.vault.adapter.mkdir(folder);
    }
    await app.vault.create(path, content);
  }
}

// src/utils.ts
function startOfWeek(dateStr) {
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekDays(dateStr) {
  const start = startOfWeek(dateStr);
  const result = [start];
  let cur = start;
  for (let i = 0; i < 6; i++) {
    const d = /* @__PURE__ */ new Date(cur + "T00:00:00");
    d.setDate(d.getDate() + 1);
    cur = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    result.push(cur);
  }
  return result;
}
function weekNumber(dateStr) {
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 864e5 + 1) / 7);
}
function addDays(dateStr, days) {
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function formatDateShort(dateStr) {
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function dayNameShort(dateStr, lang = "zh") {
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  const names = lang === "zh" ? ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return names[d.getDay()];
}
function daysInMonth(dateStr) {
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  const year = d.getFullYear();
  const month = d.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const result = [];
  for (let i = 1; i <= count; i++) {
    result.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
  }
  return result;
}
function minutesToHM(m) {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
}
function projectColor(plugin, projectName) {
  if (!projectName) return "#9ca3af";
  const proj = plugin.settings.projects.find((p) => p.name === projectName);
  return proj?.color ?? "#9ca3af";
}

// src/timerView.ts
var VIEW_TYPE_Tomato = "Tomato-timer-view";
var TomatoTimerView = class extends import_obsidian2.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.currentTab = "calendar";
    this.calendarView = "week";
    this.navDate = todayString();
    this.uiBuilt = false;
    this.isDraggingOngoing = false;
    this.plugin = plugin;
  }
  get lang() {
    return this.plugin.settings.language;
  }
  getViewType() {
    return VIEW_TYPE_Tomato;
  }
  getDisplayText() {
    return this.plugin.t("panel.tab.timeline");
  }
  getIcon() {
    return "timer";
  }
  async onOpen() {
    this.buildUI();
    this.updateTimerUI(this.plugin.timer.getState());
    await this.refreshTabContent();
    this.calendarInterval = window.setInterval(() => this.updateCurrentTimeLine(), 1e4);
  }
  async onClose() {
    this.uiBuilt = false;
    if (this.calendarInterval) {
      clearInterval(this.calendarInterval);
      this.calendarInterval = void 0;
    }
    this.currentLineEl = void 0;
    this.currentLineLabel = void 0;
    this.ongoingBarEl = void 0;
    this.ongoingBarLabel = void 0;
  }
  // ========== BUILD UI ==========
  buildUI() {
    if (this.uiBuilt) return;
    this.uiBuilt = true;
    const root = this.contentEl;
    root.empty();
    root.addClass("Tomato-container");
    this.weekViewEl = root.createDiv({ cls: "Tomato-week-view" });
    const navRow = this.weekViewEl.createDiv({ cls: "Tomato-week-nav" });
    const navLeft = navRow.createDiv({ cls: "Tomato-week-nav-left" });
    const prevBtn = navLeft.createEl("button", {
      cls: "Tomato-week-nav-btn",
      text: "<"
    });
    this.weekTitleEl = navLeft.createEl("span", { cls: "Tomato-week-title" });
    const nextBtn = navLeft.createEl("button", {
      cls: "Tomato-week-nav-btn",
      text: ">"
    });
    this.todayBtn = navRow.createEl("button", { cls: "Tomato-week-nav-btn Tomato-week-today-btn", text: this.plugin.t("panel.history.today") });
    const navRight = navRow.createDiv({ cls: "Tomato-cal-view-switch" });
    const viewDayBtn = navRight.createEl("button", { cls: "Tomato-cal-view-btn", text: this.plugin.t("panel.view.day") });
    const viewWeekBtn = navRight.createEl("button", { cls: "Tomato-cal-view-btn active", text: this.plugin.t("panel.view.week") });
    const viewMonthBtn = navRight.createEl("button", { cls: "Tomato-cal-view-btn", text: this.plugin.t("panel.view.month") });
    const viewBtns = { day: viewDayBtn, week: viewWeekBtn, month: viewMonthBtn };
    this.registerDomEvent(prevBtn, "click", () => {
      if (this.calendarView === "day") {
        this.navDate = addDays(this.navDate, -1);
      } else if (this.calendarView === "week") {
        this.navDate = addDays(this.navDate, -7);
      } else {
        const d = /* @__PURE__ */ new Date(this.navDate + "T00:00:00");
        d.setMonth(d.getMonth() - 1);
        this.navDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      void this.refreshTabContent();
    });
    this.registerDomEvent(nextBtn, "click", () => {
      if (this.calendarView === "day") {
        this.navDate = addDays(this.navDate, 1);
      } else if (this.calendarView === "week") {
        this.navDate = addDays(this.navDate, 7);
      } else {
        const d = /* @__PURE__ */ new Date(this.navDate + "T00:00:00");
        d.setMonth(d.getMonth() + 1);
        this.navDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      }
      void this.refreshTabContent();
    });
    this.registerDomEvent(this.todayBtn, "click", () => {
      this.navDate = todayString();
      void this.refreshTabContent();
    });
    Object.keys(viewBtns).forEach((v) => {
      this.registerDomEvent(viewBtns[v], "click", () => {
        this.calendarView = v;
        Object.keys(viewBtns).forEach((k) => {
          viewBtns[k].toggleClass("active", k === v);
        });
        void this.refreshTabContent();
      });
    });
    const viewTabs = this.weekViewEl.createDiv({ cls: "Tomato-view-tabs" });
    this.viewTabBtns = {
      calendar: viewTabs.createEl("button", { cls: "Tomato-view-tab active", text: this.plugin.t("panel.tab.calendar") }),
      list: viewTabs.createEl("button", { cls: "Tomato-view-tab", text: this.plugin.t("panel.tab.list") }),
      timesheet: viewTabs.createEl("button", { cls: "Tomato-view-tab", text: this.plugin.t("panel.tab.timesheet") }),
      stats: viewTabs.createEl("button", { cls: "Tomato-view-tab", text: this.plugin.t("panel.tab.stats") })
    };
    Object.keys(this.viewTabBtns).forEach((tab) => {
      this.registerDomEvent(this.viewTabBtns[tab], "click", () => {
        this.currentTab = tab;
        Object.keys(this.viewTabBtns).forEach((t2) => {
          this.viewTabBtns[t2].toggleClass("active", t2 === tab);
        });
        void this.refreshTabContent();
      });
    });
    this.tabContentEl = this.weekViewEl.createDiv({ cls: "Tomato-week-tab-content" });
  }
  updateTimerUI(state) {
    if (this.ongoingBarEl?.isConnected) {
      this.ongoingBarEl.style.backgroundColor = projectColor(this.plugin, state.currentProject);
      const title = state.taskName || state.currentProject || this.plugin.t("panel.timer.running");
      const titleEl = this.ongoingBarEl.querySelector(".Tomato-cal-bar-title");
      if (titleEl) titleEl.setText(title);
    }
  }
  // ========== WEEK VIEW ==========
  async refreshTabContent() {
    if (!this.uiBuilt) return;
    this.currentLineEl = void 0;
    this.currentLineLabel = void 0;
    this.ongoingBarEl = void 0;
    this.ongoingBarLabel = void 0;
    this.renderWeekNavTitle();
    let days;
    if (this.calendarView === "day") {
      days = [this.navDate];
    } else if (this.calendarView === "week") {
      days = weekDays(this.navDate);
    } else {
      days = daysInMonth(this.navDate);
    }
    const allEntries = [];
    for (const date of days) {
      const dayRecord = await parseDayFile(this.plugin.app, this.plugin.settings, date);
      for (let i = 0; i < dayRecord.entries.length; i++) {
        allEntries.push({ ...dayRecord.entries[i], date, originalIndex: i });
      }
    }
    this.tabContentEl.empty();
    switch (this.currentTab) {
      case "calendar":
        this.renderCalendar(allEntries, days);
        break;
      case "list":
        this.renderList(allEntries);
        break;
      case "timesheet":
        this.renderTimesheet(allEntries);
        break;
      case "stats":
        this.renderStats(allEntries);
        break;
    }
  }
  renderWeekNavTitle() {
    if (this.calendarView === "day") {
      const isToday = this.navDate === todayString();
      const prefix = isToday ? this.plugin.t("panel.timeline.today") : "";
      this.weekTitleEl.setText(`${prefix ? prefix + " \xB7 " : ""}${this.navDate}`);
      this.todayBtn?.setText(this.plugin.t("panel.history.today"));
    } else if (this.calendarView === "week") {
      const start = startOfWeek(this.navDate);
      const end = addDays(start, 6);
      const wn = weekNumber(this.navDate);
      const isCurrentWeek = start === startOfWeek(todayString());
      const prefix = isCurrentWeek ? this.plugin.t("panel.week.thisWeek") : "";
      this.weekTitleEl.setText(`${prefix ? prefix + " \xB7 " : ""}W${wn} (${formatDateShort(start)} ~ ${formatDateShort(end)})`);
      this.todayBtn?.setText(this.plugin.t("panel.week.thisWeek"));
    } else {
      const d = /* @__PURE__ */ new Date(this.navDate + "T00:00:00");
      const isCurrentMonth = d.getFullYear() === (/* @__PURE__ */ new Date()).getFullYear() && d.getMonth() === (/* @__PURE__ */ new Date()).getMonth();
      const prefix = isCurrentMonth ? this.plugin.t("panel.week.thisMonth") : "";
      const monthLabel = `${d.getFullYear()}\u5E74${d.getMonth() + 1}\u6708`;
      this.weekTitleEl.setText(`${prefix ? prefix + " \xB7 " : ""}${monthLabel}`);
      this.todayBtn?.setText(this.plugin.t("panel.week.thisMonth"));
    }
  }
  // ========== CALENDAR VIEW ==========
  renderProjectBar(entries, container) {
    const projectTotals = /* @__PURE__ */ new Map();
    let totalDuration = 0;
    for (const entry of entries) {
      const key = entry.project || this.plugin.t("panel.stats.noProject");
      projectTotals.set(key, (projectTotals.get(key) || 0) + entry.duration);
      totalDuration += entry.duration;
    }
    if (totalDuration > 0) {
      const barWrap = container.createDiv({ cls: "Tomato-cal-project-bar" });
      for (const [project, duration] of projectTotals) {
        const pct = duration / totalDuration * 100;
        const seg = barWrap.createDiv({ cls: "Tomato-cal-project-seg" });
        seg.style.width = `${pct}%`;
        seg.style.backgroundColor = projectColor(this.plugin, project);
        seg.setAttribute("aria-label", `${project}: ${minutesToHM(duration)}`);
      }
    }
  }
  buildCalendarGrid(wrap, days) {
    let grid;
    let ruler;
    if (this.calendarView === "month") {
      grid = wrap.createDiv({ cls: "Tomato-cal-grid" });
      grid.style.gridTemplateColumns = `44px repeat(${days.length}, minmax(16px, 1fr))`;
      ruler = grid.createDiv({ cls: "Tomato-cal-ruler Tomato-cal-ruler-month" });
    } else {
      const headerRow = wrap.createDiv({ cls: "Tomato-cal-header-row" });
      headerRow.style.gridTemplateColumns = `44px repeat(${days.length}, minmax(20px, 1fr))`;
      headerRow.createDiv({ cls: "Tomato-cal-ruler-placeholder" });
      for (let i = 0; i < days.length; i++) {
        const date = days[i];
        const header = headerRow.createDiv({ cls: "Tomato-cal-col-header" });
        if (i === 0) header.addClass("first-col");
        const isToday = date === todayString();
        header.toggleClass("today", isToday);
        header.createDiv({ cls: "Tomato-cal-col-daynum", text: String((/* @__PURE__ */ new Date(date + "T00:00:00")).getDate()) });
        header.createDiv({ cls: "Tomato-cal-col-dayname", text: dayNameShort(date, this.lang) });
        header.addEventListener("contextmenu", (evt) => {
          evt.preventDefault();
          const menu = new import_obsidian2.Menu();
          menu.addItem((item) => {
            item.setTitle(this.plugin.t("panel.week.openLog")).setIcon("document").onClick(async () => {
              const path = (0, import_obsidian2.normalizePath)(`${this.plugin.settings.logFolder}/${date}.md`);
              const file = this.app.vault.getFileByPath(path);
              if (file) {
                const leaf = this.app.workspace.getLeaf(false);
                await leaf.openFile(file);
              }
            });
          });
          menu.showAtMouseEvent(evt);
        });
      }
      grid = wrap.createDiv({ cls: "Tomato-cal-grid" });
      grid.style.gridTemplateColumns = `44px repeat(${days.length}, minmax(20px, 1fr))`;
      ruler = grid.createDiv({ cls: "Tomato-cal-ruler" });
    }
    for (let h = 0; h <= 24; h += 2) {
      const label = ruler.createDiv({ cls: "Tomato-cal-ruler-label" });
      label.style.top = `${h / 24 * 100}%`;
      label.setText(`${String(h).padStart(2, "0")}:00`);
    }
    if (this.calendarView !== "month") {
      const today = todayString();
      if (days.includes(today)) {
        const now = /* @__PURE__ */ new Date();
        const currentMin = now.getHours() * 60 + now.getMinutes();
        this.currentLineEl = grid.createDiv({ cls: "Tomato-cal-current-line" });
        this.currentLineEl.style.top = `${currentMin / 1440 * 100}%`;
        this.currentLineLabel = ruler.createDiv({ cls: "Tomato-cal-current-label" });
        this.currentLineLabel.style.top = `${currentMin / 1440 * 100}%`;
        this.currentLineLabel.style.left = "2px";
        this.currentLineLabel.setText(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
      }
    }
    return { grid, ruler };
  }
  renderCalendar(entries, days) {
    const el = this.tabContentEl;
    el.empty();
    this.renderProjectBar(entries, el);
    const wrap = el.createDiv({ cls: "Tomato-cal-wrap" });
    const { grid, ruler } = this.buildCalendarGrid(wrap, days);
    for (let i = 0; i < days.length; i++) {
      const date = days[i];
      const col = grid.createDiv({ cls: "Tomato-cal-col" });
      if (i === 0) col.addClass("first-col");
      col.setAttribute("data-date", date);
      for (let h = 1; h < 24; h++) {
        const line = col.createDiv({ cls: "Tomato-cal-hline" });
        line.style.top = `${h / 24 * 100}%`;
      }
      const dayEntries = entries.filter((e) => e.date === date).map((e) => ({ entry: e, index: e.originalIndex })).sort((a, b) => timeToMinutes(a.entry.startTime) - timeToMinutes(b.entry.startTime));
      const positioned = this.positionEntries(dayEntries);
      for (const pe of positioned) {
        const bar = col.createDiv({ cls: "Tomato-cal-bar" });
        const startMin = timeToMinutes(pe.entry.startTime);
        const top = startMin / 1440 * 100;
        const height = pe.entry.duration / 1440 * 100;
        bar.style.top = `${top}%`;
        bar.style.height = `${Math.max(height, 0.5)}%`;
        bar.style.left = `${pe.left}%`;
        bar.style.width = `${pe.width}%`;
        bar.style.backgroundColor = projectColor(this.plugin, pe.entry.project);
        const title = pe.entry.project || pe.entry.taskName || "";
        if (title && this.calendarView !== "month") {
          bar.createDiv({ cls: "Tomato-cal-bar-title", text: title });
        }
        if (pe.entry.duration >= 15 && this.calendarView === "day") {
          bar.createDiv({ cls: "Tomato-cal-bar-time", text: `${pe.entry.startTime} ~ ${pe.entry.endTime}` });
        }
        bar.addEventListener("contextmenu", (evt) => {
          evt.preventDefault();
          evt.stopPropagation();
          this.editEntryDialog(date, pe.index, pe.entry);
        });
        if (this.calendarView !== "month") {
          bar.addEventListener("mousedown", (evt) => {
            if (evt.button !== 0) return;
            const target = evt.target;
            if (target.hasClass("Tomato-cal-bar-resize-handle")) return;
            evt.preventDefault();
            evt.stopPropagation();
            const startY = evt.clientY;
            const originalTop = bar.offsetTop;
            const colEl = col;
            const snapMin = this.plugin.settings.calendarSnapMinutes || 5;
            let dragLabel = bar.querySelector(".Tomato-cal-bar-dragtime");
            if (!dragLabel) {
              dragLabel = bar.createDiv({ cls: "Tomato-cal-bar-dragtime" });
            }
            dragLabel.style.display = "block";
            bar.addClass("Tomato-cal-bar-dragging");
            document.body.style.cursor = "grabbing";
            const snapTop = (rawTop) => {
              const centerY = rawTop + bar.clientHeight / 2;
              const ratio = Math.max(0, Math.min(1, centerY / colEl.clientHeight));
              const minute = Math.round(ratio * 1440);
              const snappedMinute = Math.max(0, Math.min(1440, Math.round(minute / snapMin) * snapMin));
              const snappedRatio = snappedMinute / 1440;
              const snappedTop = snappedRatio * colEl.clientHeight - bar.clientHeight / 2;
              const clampedTop = Math.max(0, Math.min(colEl.clientHeight - bar.clientHeight, snappedTop));
              const h = Math.floor(snappedMinute / 60) % 24;
              const m = snappedMinute % 60;
              const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              return { top: clampedTop, timeStr };
            };
            const onMove = (e) => {
              const dy = e.clientY - startY;
              const rawTop = originalTop + dy;
              const { top: top2, timeStr } = snapTop(rawTop);
              bar.style.top = `${top2}px`;
              dragLabel.setText(timeStr);
            };
            const onUp = async (e) => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
              bar.removeClass("Tomato-cal-bar-dragging");
              document.body.style.cursor = "";
              if (dragLabel) dragLabel.style.display = "none";
              const rect = colEl.getBoundingClientRect();
              const y = bar.getBoundingClientRect().top - rect.top;
              const ratio = Math.max(0, Math.min(1, y / rect.height));
              const minute = Math.round(ratio * 1440);
              const snappedMinute = Math.max(0, Math.min(1440, Math.round(minute / snapMin) * snapMin));
              const h = Math.floor(snappedMinute / 60) % 24;
              const m = snappedMinute % 60;
              const newStart = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              const newEndMin = snappedMinute + pe.entry.duration;
              const eh = Math.floor(newEndMin / 60) % 24;
              const em = newEndMin % 60;
              const newEnd = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
              await this.doEditEntry(date, pe.index, { startTime: newStart, endTime: newEnd });
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          });
          const resizeTop = bar.createDiv({ cls: "Tomato-cal-bar-resize-handle Tomato-cal-bar-resize-top" });
          const resizeBottom = bar.createDiv({ cls: "Tomato-cal-bar-resize-handle Tomato-cal-bar-resize-bottom" });
          resizeTop.addEventListener("mousedown", (evt) => {
            if (evt.button !== 0) return;
            evt.preventDefault();
            evt.stopPropagation();
            const startY = evt.clientY;
            const originalTop = bar.offsetTop;
            const originalHeight = bar.clientHeight;
            const originalEndMin = timeToMinutes(pe.entry.endTime);
            const colEl = col;
            const snapMin = this.plugin.settings.calendarSnapMinutes || 5;
            bar.addClass("Tomato-cal-bar-dragging");
            document.body.style.cursor = "ns-resize";
            let dragLabel = bar.querySelector(".Tomato-cal-bar-dragtime");
            if (!dragLabel) {
              dragLabel = bar.createDiv({ cls: "Tomato-cal-bar-dragtime" });
            }
            dragLabel.style.display = "block";
            const onMove = (e) => {
              const dy = e.clientY - startY;
              const newTop = originalTop + dy;
              const newHeight = Math.max(4, originalHeight - dy);
              bar.style.top = `${Math.max(0, newTop)}px`;
              bar.style.height = `${newHeight}px`;
              const ratio = Math.max(0, Math.min(1, newTop / colEl.clientHeight));
              const minute = Math.round(ratio * 1440);
              const snappedMinute = Math.max(0, Math.min(originalEndMin - snapMin, Math.round(minute / snapMin) * snapMin));
              const h = Math.floor(snappedMinute / 60) % 24;
              const m = snappedMinute % 60;
              dragLabel.setText(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
            };
            const onUp = async (e) => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
              bar.removeClass("Tomato-cal-bar-dragging");
              document.body.style.cursor = "";
              if (dragLabel) dragLabel.style.display = "none";
              const rect = colEl.getBoundingClientRect();
              const y = bar.getBoundingClientRect().top - rect.top;
              const ratio = Math.max(0, Math.min(1, y / rect.height));
              const minute = Math.round(ratio * 1440);
              const snappedMinute = Math.max(0, Math.min(originalEndMin - snapMin, Math.round(minute / snapMin) * snapMin));
              const h = Math.floor(snappedMinute / 60) % 24;
              const m = snappedMinute % 60;
              const newStart = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              const newDuration = originalEndMin - snappedMinute;
              await this.doEditEntry(date, pe.index, { startTime: newStart, duration: newDuration });
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          });
          resizeBottom.addEventListener("mousedown", (evt) => {
            if (evt.button !== 0) return;
            evt.preventDefault();
            evt.stopPropagation();
            const startY = evt.clientY;
            const originalHeight = bar.clientHeight;
            const originalStartMin = timeToMinutes(pe.entry.startTime);
            const colEl = col;
            const snapMin = this.plugin.settings.calendarSnapMinutes || 5;
            bar.addClass("Tomato-cal-bar-dragging");
            document.body.style.cursor = "ns-resize";
            let dragLabel = bar.querySelector(".Tomato-cal-bar-dragtime");
            if (!dragLabel) {
              dragLabel = bar.createDiv({ cls: "Tomato-cal-bar-dragtime" });
            }
            dragLabel.style.display = "block";
            const onMove = (e) => {
              const dy = e.clientY - startY;
              const newHeight = Math.max(4, originalHeight + dy);
              bar.style.height = `${newHeight}px`;
              const bottomY = bar.offsetTop + newHeight;
              const ratio = Math.max(0, Math.min(1, bottomY / colEl.clientHeight));
              const minute = Math.round(ratio * 1440);
              const snappedMinute = Math.max(originalStartMin + snapMin, Math.round(minute / snapMin) * snapMin);
              const h = Math.floor(snappedMinute / 60) % 24;
              const m = snappedMinute % 60;
              dragLabel.setText(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
            };
            const onUp = async (e) => {
              document.removeEventListener("mousemove", onMove);
              document.removeEventListener("mouseup", onUp);
              bar.removeClass("Tomato-cal-bar-dragging");
              document.body.style.cursor = "";
              if (dragLabel) dragLabel.style.display = "none";
              const rect = colEl.getBoundingClientRect();
              const bottomY = bar.getBoundingClientRect().bottom - rect.top;
              const ratio = Math.max(0, Math.min(1, bottomY / rect.height));
              const minute = Math.round(ratio * 1440);
              const snappedMinute = Math.max(originalStartMin + snapMin, Math.round(minute / snapMin) * snapMin);
              const h = Math.floor(snappedMinute / 60) % 24;
              const m = snappedMinute % 60;
              const newEnd = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
              const newDuration = snappedMinute - originalStartMin;
              await this.doEditEntry(date, pe.index, { endTime: newEnd, duration: newDuration });
            };
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
          });
        }
      }
      if (this.calendarView !== "month") {
        this.renderOngoingBar(col, date);
      }
      if (this.calendarView !== "month") {
        let dragSelectEl = null;
        let dragStartY = 0;
        let isSelecting = false;
        const onSelectMove = (e) => {
          if (!isSelecting || !dragSelectEl) return;
          const rect = col.getBoundingClientRect();
          const currentY = e.clientY - rect.top;
          const startYLocal = dragStartY - rect.top;
          const top = Math.max(0, Math.min(startYLocal, currentY));
          const height = Math.abs(currentY - startYLocal);
          dragSelectEl.style.top = `${top}px`;
          dragSelectEl.style.height = `${height}px`;
        };
        const onSelectUp = (e) => {
          if (!isSelecting || !dragSelectEl) return;
          isSelecting = false;
          const rect = col.getBoundingClientRect();
          const startYLocal = dragStartY - rect.top;
          const endYLocal = e.clientY - rect.top;
          const topY = Math.min(startYLocal, endYLocal);
          const bottomY = Math.max(startYLocal, endYLocal);
          if (bottomY - topY < 5) {
            dragSelectEl.remove();
            dragSelectEl = null;
            document.removeEventListener("mousemove", onSelectMove);
            document.removeEventListener("mouseup", onSelectUp);
            return;
          }
          const startRatio = Math.max(0, Math.min(1, topY / rect.height));
          const endRatio = Math.max(0, Math.min(1, bottomY / rect.height));
          const startMinute = Math.round(startRatio * 1440);
          const endMinute = Math.max(startMinute + 1, Math.round(endRatio * 1440));
          const sh = Math.floor(startMinute / 60);
          const sm = startMinute % 60;
          const eh = Math.floor(endMinute / 60);
          const em = endMinute % 60;
          const startTime = `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;
          const endTime = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
          dragSelectEl.remove();
          dragSelectEl = null;
          document.removeEventListener("mousemove", onSelectMove);
          document.removeEventListener("mouseup", onSelectUp);
          this.showAddEntryDialog(date, startTime, endTime);
        };
        col.addEventListener("mousedown", (evt) => {
          if (evt.button !== 0) return;
          if (evt.target !== col && !evt.target.hasClass("Tomato-cal-hline")) return;
          evt.preventDefault();
          isSelecting = true;
          dragStartY = evt.clientY;
          dragSelectEl = col.createDiv({ cls: "Tomato-cal-select-range" });
          const rect = col.getBoundingClientRect();
          const y = evt.clientY - rect.top;
          dragSelectEl.style.top = `${y}px`;
          dragSelectEl.style.height = "0px";
          document.addEventListener("mousemove", onSelectMove);
          document.addEventListener("mouseup", onSelectUp);
        });
      }
    }
  }
  renderOngoingBar(col, date) {
    if (!this.plugin.timer.getState().isRunning || date !== this.plugin.timer.getSessionStartDate()) return;
    const sessionTime = this.plugin.timer.getSessionStartTime();
    const startMin = timeToMinutes(sessionTime);
    const now = /* @__PURE__ */ new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    let duration;
    if (currentMin >= startMin) {
      duration = currentMin - startMin;
    } else {
      duration = 1440 - startMin + currentMin;
    }
    const top = startMin / 1440 * 100;
    const height = duration / 1440 * 100;
    this.ongoingBarEl = col.createDiv({ cls: "Tomato-cal-bar Tomato-cal-bar-ongoing" });
    this.ongoingBarEl.style.top = `${top}%`;
    this.ongoingBarEl.style.height = `${Math.max(height, 0.5)}%`;
    this.ongoingBarEl.style.left = "0%";
    this.ongoingBarEl.style.width = "100%";
    this.ongoingBarEl.style.backgroundColor = projectColor(this.plugin, this.plugin.timer.getCurrentProject());
    const title = this.plugin.timer.getTaskName() || this.plugin.timer.getCurrentProject() || this.plugin.t("panel.timer.running");
    this.ongoingBarEl.createDiv({ cls: "Tomato-cal-bar-title", text: title });
    this.ongoingBarLabel = this.ongoingBarEl.createDiv({ cls: "Tomato-cal-bar-time", text: minutesToHM(duration) });
    const resizeTop = this.ongoingBarEl.createDiv({ cls: "Tomato-cal-bar-resize-handle Tomato-cal-bar-resize-top" });
    resizeTop.addEventListener("mousedown", (evt) => {
      if (evt.button !== 0) return;
      evt.preventDefault();
      evt.stopPropagation();
      const startY = evt.clientY;
      const originalTop = this.ongoingBarEl.offsetTop;
      const originalStartMin = startMin;
      const colEl = col;
      const snapMin = this.plugin.settings.calendarSnapMinutes || 5;
      this.isDraggingOngoing = true;
      this.ongoingBarEl.addClass("Tomato-cal-bar-dragging");
      document.body.style.cursor = "ns-resize";
      let dragLabel = this.ongoingBarEl.querySelector(".Tomato-cal-bar-dragtime");
      if (!dragLabel) {
        dragLabel = this.ongoingBarEl.createDiv({ cls: "Tomato-cal-bar-dragtime" });
      }
      dragLabel.style.display = "block";
      const onMove = (e) => {
        const dy = e.clientY - startY;
        const newTop = Math.max(0, originalTop + dy);
        this.ongoingBarEl.style.top = `${newTop}px`;
        const ratio = Math.max(0, Math.min(1, newTop / colEl.clientHeight));
        const minute = Math.round(ratio * 1440);
        const snappedMinute = Math.max(0, Math.min(currentMin - snapMin, Math.round(minute / snapMin) * snapMin));
        const h = Math.floor(snappedMinute / 60) % 24;
        const m = snappedMinute % 60;
        dragLabel.setText(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      };
      const onUp = async (e) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        this.ongoingBarEl.removeClass("Tomato-cal-bar-dragging");
        document.body.style.cursor = "";
        if (dragLabel) dragLabel.style.display = "none";
        this.isDraggingOngoing = false;
        const rect = colEl.getBoundingClientRect();
        const y = this.ongoingBarEl.getBoundingClientRect().top - rect.top;
        const ratio = Math.max(0, Math.min(1, y / rect.height));
        const minute = Math.round(ratio * 1440);
        const snappedMinute = Math.max(0, Math.min(currentMin - snapMin, Math.round(minute / snapMin) * snapMin));
        const deltaMin = snappedMinute - originalStartMin;
        if (deltaMin !== 0) {
          this.plugin.timer.adjustSessionStart(deltaMin);
          await this.refreshTabContent();
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
    this.ongoingBarEl.addEventListener("mousedown", (evt) => {
      if (evt.button !== 0) return;
      if (evt.target.hasClass("Tomato-cal-bar-resize-handle")) return;
      evt.preventDefault();
      const startY = evt.clientY;
      const originalTop = this.ongoingBarEl.offsetTop;
      const originalStartMin = startMin;
      const colEl = col;
      const snapMin = this.plugin.settings.calendarSnapMinutes || 5;
      this.isDraggingOngoing = true;
      this.ongoingBarEl.addClass("Tomato-cal-bar-dragging");
      document.body.style.cursor = "grabbing";
      let dragLabel = this.ongoingBarEl.querySelector(".Tomato-cal-bar-dragtime");
      if (!dragLabel) {
        dragLabel = this.ongoingBarEl.createDiv({ cls: "Tomato-cal-bar-dragtime" });
      }
      dragLabel.style.display = "block";
      const onMove = (e) => {
        const dy = e.clientY - startY;
        const newTop = Math.max(0, originalTop + dy);
        this.ongoingBarEl.style.top = `${newTop}px`;
        const ratio = Math.max(0, Math.min(1, newTop / colEl.clientHeight));
        const minute = Math.round(ratio * 1440);
        const snappedMinute = Math.max(0, Math.min(currentMin - snapMin, Math.round(minute / snapMin) * snapMin));
        const h = Math.floor(snappedMinute / 60) % 24;
        const m = snappedMinute % 60;
        dragLabel.setText(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      };
      const onUp = async (e) => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        this.ongoingBarEl.removeClass("Tomato-cal-bar-dragging");
        document.body.style.cursor = "";
        if (dragLabel) dragLabel.style.display = "none";
        this.isDraggingOngoing = false;
        const rect = colEl.getBoundingClientRect();
        const y = this.ongoingBarEl.getBoundingClientRect().top - rect.top;
        const ratio = Math.max(0, Math.min(1, y / rect.height));
        const minute = Math.round(ratio * 1440);
        const snappedMinute = Math.max(0, Math.min(currentMin - snapMin, Math.round(minute / snapMin) * snapMin));
        const deltaMin = snappedMinute - originalStartMin;
        if (deltaMin !== 0) {
          this.plugin.timer.adjustSessionStart(deltaMin);
          await this.refreshTabContent();
        }
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
  updateCurrentTimeLine() {
    const n = /* @__PURE__ */ new Date();
    const min = n.getHours() * 60 + n.getMinutes();
    if (this.currentLineEl?.isConnected) {
      this.currentLineEl.style.top = `${min / 1440 * 100}%`;
    }
    if (this.currentLineLabel?.isConnected) {
      this.currentLineLabel.style.top = `${min / 1440 * 100}%`;
      this.currentLineLabel.setText(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`);
    }
    if (this.ongoingBarEl?.isConnected && this.plugin.timer.getState().isRunning && !this.isDraggingOngoing) {
      const startMin = timeToMinutes(this.plugin.timer.getSessionStartTime());
      let duration;
      if (min >= startMin) {
        duration = min - startMin;
      } else {
        duration = 1440 - startMin + min;
      }
      const top = startMin / 1440 * 100;
      const height = duration / 1440 * 100;
      this.ongoingBarEl.style.top = `${top}%`;
      this.ongoingBarEl.style.height = `${Math.max(height, 0.5)}%`;
      this.ongoingBarLabel?.setText(minutesToHM(duration));
    }
  }
  positionEntries(dayEntries) {
    const result = [];
    for (let i = 0; i < dayEntries.length; i++) {
      const { entry, index } = dayEntries[i];
      const start = timeToMinutes(entry.startTime);
      const end = start + entry.duration;
      const overlaps = [i];
      for (let j = 0; j < dayEntries.length; j++) {
        if (i === j) continue;
        const oStart = timeToMinutes(dayEntries[j].entry.startTime);
        const oEnd = oStart + dayEntries[j].entry.duration;
        if (start < oEnd && end > oStart) {
          overlaps.push(j);
        }
      }
      overlaps.sort((a, b) => a - b);
      const pos = overlaps.indexOf(i);
      const count = overlaps.length;
      const gap = count > 1 ? 1 : 0;
      result.push({
        entry,
        index,
        left: pos / count * 100,
        width: 100 / count - gap
      });
    }
    return result;
  }
  // ========== LIST VIEW ==========
  renderList(entries) {
    const el = this.tabContentEl;
    el.empty();
    const days = weekDays(this.navDate);
    const total = entries.reduce((s, e) => s + e.duration, 0);
    const totalEl = el.createDiv({ cls: "Tomato-list-total" });
    totalEl.setText(`${this.plugin.t("panel.week.total")} ${minutesToHM(total)}`);
    for (const date of days.slice().reverse()) {
      const dayEntries = entries.filter((e) => e.date === date);
      if (dayEntries.length === 0) continue;
      const section = el.createDiv({ cls: "Tomato-list-day" });
      const header = section.createDiv({ cls: "Tomato-list-day-header" });
      const isToday = date === todayString();
      header.toggleClass("today", isToday);
      header.createSpan({ text: `${dayNameShort(date, this.lang)} ${formatDateShort(date)}` });
      const dayTotal = dayEntries.reduce((s, e) => s + e.duration, 0);
      header.createSpan({ cls: "Tomato-list-day-total", text: minutesToHM(dayTotal) });
      for (const entry of dayEntries.slice().reverse()) {
        const row = section.createDiv({ cls: "Tomato-list-row" });
        row.addEventListener("contextmenu", (evt) => {
          evt.preventDefault();
          this.editEntryDialog(date, entry.originalIndex, entry);
        });
        const dot = row.createDiv({ cls: "Tomato-list-dot" });
        dot.style.backgroundColor = projectColor(this.plugin, entry.project);
        const meta = row.createDiv({ cls: "Tomato-list-meta" });
        const rawTask = (entry.taskName || "").replace(/^tomato_project：\s*\S+\s*/, "").trim();
        const taskName = rawTask || entry.project || this.plugin.t("panel.stats.noProject");
        meta.createDiv({ cls: "Tomato-list-task", text: taskName });
        meta.createDiv({ cls: "Tomato-list-time", text: `${entry.startTime} ~ ${entry.endTime}` });
        row.createDiv({ cls: "Tomato-list-duration", text: minutesToHM(entry.duration) });
      }
    }
    if (entries.length === 0) {
      el.createDiv({ cls: "Tomato-empty", text: this.plugin.t("panel.history.noTomatos") });
    }
  }
  // ========== TIMESHEET VIEW ==========
  renderTimesheet(entries) {
    const el = this.tabContentEl;
    el.empty();
    const days = weekDays(this.navDate);
    const projects = Array.from(new Set(entries.map((e) => e.project || this.plugin.t("panel.stats.noProject")))).sort();
    const noProjectLabel = this.plugin.t("panel.stats.noProject");
    const table = el.createDiv({ cls: "Tomato-ts-table" });
    const headerRow = table.createDiv({ cls: "Tomato-ts-row Tomato-ts-header" });
    headerRow.createDiv({ cls: "Tomato-ts-cell Tomato-ts-project", text: this.plugin.t("panel.entry.project") });
    for (const date of days) {
      const cell = headerRow.createDiv({ cls: "Tomato-ts-cell" });
      cell.createDiv({ text: dayNameShort(date, this.lang).toUpperCase() });
      cell.createDiv({ cls: "Tomato-ts-date", text: formatDateShort(date) });
    }
    headerRow.createDiv({ cls: "Tomato-ts-cell Tomato-ts-total", text: this.plugin.t("panel.week.total") });
    const dailyTotals = /* @__PURE__ */ new Map();
    for (const date of days) dailyTotals.set(date, 0);
    for (const proj of projects) {
      const row = table.createDiv({ cls: "Tomato-ts-row" });
      const projCell = row.createDiv({ cls: "Tomato-ts-cell Tomato-ts-project" });
      const dot = projCell.createDiv({ cls: "Tomato-ts-dot" });
      dot.style.backgroundColor = projectColor(this.plugin, proj === noProjectLabel ? "" : proj);
      projCell.createSpan({ text: proj });
      let projTotal = 0;
      for (const date of days) {
        const mins = entries.filter((e) => e.date === date && (e.project || noProjectLabel) === proj).reduce((s, e) => s + e.duration, 0);
        projTotal += mins;
        dailyTotals.set(date, (dailyTotals.get(date) || 0) + mins);
        const cell = row.createDiv({ cls: "Tomato-ts-cell" });
        if (mins > 0) {
          cell.setText(minutesToHM(mins));
        }
      }
      row.createDiv({ cls: "Tomato-ts-cell Tomato-ts-total", text: minutesToHM(projTotal) });
    }
    const totalRow = table.createDiv({ cls: "Tomato-ts-row Tomato-ts-total-row" });
    totalRow.createDiv({ cls: "Tomato-ts-cell Tomato-ts-project", text: this.plugin.t("panel.week.total") });
    let grandTotal = 0;
    for (const date of days) {
      const t2 = dailyTotals.get(date) || 0;
      grandTotal += t2;
      const cell = totalRow.createDiv({ cls: "Tomato-ts-cell" });
      if (t2 > 0) cell.setText(minutesToHM(t2));
    }
    totalRow.createDiv({ cls: "Tomato-ts-cell Tomato-ts-total", text: minutesToHM(grandTotal) });
    if (entries.length === 0) {
      el.createDiv({ cls: "Tomato-empty", text: this.plugin.t("panel.history.noTomatos") });
    }
  }
  // ========== STATS VIEW (Pie Chart) ==========
  renderStats(entries) {
    const el = this.tabContentEl;
    el.empty();
    const total = entries.reduce((sum, e) => sum + e.duration, 0);
    if (total === 0) {
      el.createDiv({ cls: "Tomato-empty", text: this.plugin.t("panel.history.noTomatos") });
      return;
    }
    const noProjectLabel = this.plugin.t("panel.stats.noProject");
    const projMap = /* @__PURE__ */ new Map();
    for (const e of entries) {
      const p = e.project || noProjectLabel;
      projMap.set(p, (projMap.get(p) || 0) + e.duration);
    }
    const projList = Array.from(projMap.entries()).sort((a, b) => b[1] - a[1]);
    const size = 200;
    const radius = 80;
    const cx = size / 2;
    const cy = size / 2;
    let currentAngle = -Math.PI / 2;
    const chartWrap = el.createDiv({ cls: "Tomato-stats-chart" });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.addClass("Tomato-pie-svg");
    chartWrap.appendChild(svg);
    for (const [proj, mins] of projList) {
      const sliceAngle = mins / total * 2 * Math.PI;
      const x1 = cx + radius * Math.cos(currentAngle);
      const y1 = cy + radius * Math.sin(currentAngle);
      const x2 = cx + radius * Math.cos(currentAngle + sliceAngle);
      const y2 = cy + radius * Math.sin(currentAngle + sliceAngle);
      const largeArc = sliceAngle > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", projectColor(this.plugin, proj === noProjectLabel ? "" : proj));
      path.setAttribute("stroke", "var(--background-primary)");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("title", `${proj}: ${minutesToHM(mins)}`);
      path.addClass("Tomato-pie-slice");
      svg.appendChild(path);
      currentAngle += sliceAngle;
    }
    const hole = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hole.setAttribute("cx", String(cx));
    hole.setAttribute("cy", String(cy));
    hole.setAttribute("r", "40");
    hole.setAttribute("fill", "var(--background-primary)");
    svg.appendChild(hole);
    const labelsWrap = el.createDiv({ cls: "Tomato-stats-labels" });
    for (const [proj, mins] of projList) {
      const label = labelsWrap.createDiv({ cls: "Tomato-stats-label" });
      const dot = label.createDiv({ cls: "Tomato-stats-dot" });
      dot.style.backgroundColor = projectColor(this.plugin, proj === noProjectLabel ? "" : proj);
      const pct = Math.round(mins / total * 100);
      label.createSpan({ text: `${proj} ${minutesToHM(mins)} (${pct}%)` });
    }
    const totalText = chartWrap.createDiv({ cls: "Tomato-pie-total" });
    totalText.setText(minutesToHM(total));
  }
  // ========== CONTEXT MENU & EDITING ==========
  showEntryMenu(evt, date, entry, index) {
    const menu = new import_obsidian2.Menu();
    menu.addItem((item) => {
      item.setTitle(this.plugin.t("panel.entry.edit"));
      item.setIcon("pencil");
      item.onClick(() => this.editEntryDialog(date, index, entry));
    });
    menu.addItem((item) => {
      item.setTitle(this.plugin.t("panel.entry.delete"));
      item.setIcon("trash");
      item.onClick(() => this.deleteEntry(date, index));
    });
    menu.showAtMouseEvent(evt);
  }
  async deleteEntry(date, index) {
    const { entries } = await parseDayFile(this.plugin.app, this.plugin.settings, date);
    entries.splice(index, 1);
    await writeDayEntries(this.plugin.app, this.plugin.settings, date, entries);
    new import_obsidian2.Notice(this.plugin.t("panel.entry.delete"));
    await this.refreshTabContent();
  }
  editEntryDialog(date, index, entry) {
    const rawTask = entry.taskName.replace(/^tomato_project：\s*\S+\s*/, "").trim();
    new EntryModal(this.app, this.plugin, this.plugin.t("panel.entry.edit"), {
      startTime: entry.startTime,
      endTime: entry.endTime,
      duration: String(entry.duration),
      project: entry.project || "",
      task: rawTask
    }, (result) => {
      const startMin = timeToMinutes(result.startTime || entry.startTime);
      const endMin = timeToMinutes(result.endTime || entry.endTime);
      if (isNaN(startMin) || isNaN(endMin)) {
        new import_obsidian2.Notice(this.plugin.t("notice.invalidTimeFormat"));
        return;
      }
      void this.doEditEntry(date, index, {
        startTime: result.startTime,
        endTime: result.endTime,
        duration: Math.max(0, endMin - startMin),
        project: result.project || void 0,
        taskName: result.task || void 0
      });
    }, () => {
      void this.deleteEntry(date, index);
    }).open();
  }
  async doEditEntry(date, index, updates) {
    const { entries } = await parseDayFile(this.plugin.app, this.plugin.settings, date);
    if (index >= 0 && index < entries.length) {
      const updated = { ...entries[index], ...updates };
      this.encodeProjectIntoTaskName(updated);
      entries[index] = updated;
      await writeDayEntries(this.plugin.app, this.plugin.settings, date, entries);
      new import_obsidian2.Notice(this.plugin.t("panel.entry.edit"));
      this.plugin.refreshLogViews();
    }
  }
  encodeProjectIntoTaskName(entry) {
    if (entry.project) {
      const rawTask = (entry.taskName || "").replace(/^tomato_project：\s*\S+\s*/, "").trim();
      entry.taskName = `tomato_project\uFF1A${entry.project}${rawTask ? " " + rawTask : ""}`;
      entry.rest = entry.taskName;
    }
  }
  showAddEntryDialog(date, startTime, endTime) {
    const durationMin = endTime ? Math.max(1, timeToMinutes(endTime) - timeToMinutes(startTime)) : 60;
    new EntryModal(this.app, this.plugin, this.plugin.t("panel.entry.add"), {
      startTime,
      endTime: endTime || "",
      duration: String(durationMin),
      project: this.plugin.timer.getCurrentProject() || "",
      task: this.plugin.timer.getTaskName() || ""
    }, (result) => {
      const duration = parseInt(result.duration || "60", 10);
      if (isNaN(duration) || duration <= 0) {
        new import_obsidian2.Notice(this.plugin.t("notice.invalidDuration"));
        return;
      }
      const st = result.startTime || startTime;
      const startMin = timeToMinutes(st);
      const endMin = startMin + duration;
      const h = Math.floor(endMin / 60) % 24;
      const m = endMin % 60;
      const endTime2 = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      void this.doAddEntry(date, {
        startTime: st,
        endTime: endTime2,
        duration,
        mode: this.plugin.timer.getMode(),
        project: result.project || void 0,
        taskName: result.task || "",
        rest: result.task || ""
      });
    }).open();
  }
  async doAddEntry(date, entry) {
    this.encodeProjectIntoTaskName(entry);
    const { entries } = await parseDayFile(this.plugin.app, this.plugin.settings, date);
    entries.push(entry);
    entries.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    await writeDayEntries(this.plugin.app, this.plugin.settings, date, entries);
    new import_obsidian2.Notice(this.plugin.t("panel.entry.add"));
    this.plugin.refreshLogViews();
  }
};
var EntryModal = class extends import_obsidian2.Modal {
  constructor(app, plugin, title, initial, onSave, onDelete) {
    super(app);
    this.plugin = plugin;
    this.titleEl.setText(title);
    this.result = { ...initial };
    this.onSave = onSave;
    this.onDelete = onDelete;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("Tomato-modal");
    new import_obsidian2.Setting(contentEl).setName(this.plugin.t("panel.entry.startTime")).addText((text) => {
      text.setValue(this.result.startTime);
      text.onChange((v) => {
        this.result.startTime = v;
      });
    });
    new import_obsidian2.Setting(contentEl).setName(this.plugin.t("panel.entry.endTime")).addText((text) => {
      text.setValue(this.result.endTime);
      text.onChange((v) => {
        this.result.endTime = v;
      });
    });
    new import_obsidian2.Setting(contentEl).setName(this.plugin.t("panel.entry.duration")).addText((text) => {
      text.setValue(this.result.duration);
      text.onChange((v) => {
        this.result.duration = v;
      });
    });
    new import_obsidian2.Setting(contentEl).setName(this.plugin.t("panel.entry.project")).addText((text) => {
      text.setValue(this.result.project);
      text.onChange((v) => {
        this.result.project = v;
      });
    });
    new import_obsidian2.Setting(contentEl).setName(this.plugin.t("panel.entry.task")).addText((text) => {
      text.setValue(this.result.task);
      text.onChange((v) => {
        this.result.task = v;
      });
    });
    const btnSetting = new import_obsidian2.Setting(contentEl).addButton((btn) => {
      btn.setButtonText(this.plugin.t("panel.btn.save"));
      btn.onClick(() => {
        this.onSave(this.result);
        this.close();
      });
    });
    if (this.onDelete) {
      btnSetting.addButton((btn) => {
        btn.setButtonText(this.plugin.t("panel.entry.delete"));
        btn.buttonEl.addClass("mod-warning");
        btn.onClick(() => {
          this.onDelete();
          this.close();
        });
      });
    }
  }
};

// src/timerViewCompact.ts
var import_obsidian4 = require("obsidian");

// src/miniCalendar.ts
var import_obsidian3 = require("obsidian");
function getDailyNoteSettings(app) {
  const periodicNotes = app.plugins?.getPlugin?.("periodic-notes");
  if (periodicNotes?.settings?.daily?.enabled) {
    const s = periodicNotes.settings.daily;
    return {
      format: s.format || "YYYY-MM-DD",
      folder: (s.folder ?? "").trim()
    };
  }
  const internalPlugins = app.internalPlugins;
  const dailyNotes = internalPlugins?.getPluginById?.("daily-notes");
  if (dailyNotes) {
    const options = dailyNotes.instance?.options ?? dailyNotes.options;
    return {
      format: options?.format ?? "YYYY-MM-DD",
      folder: (options?.folder ?? "").trim()
    };
  }
  return null;
}
function getWeeklyNoteSettings(app) {
  const periodicNotes = app.plugins?.getPlugin?.("periodic-notes");
  if (periodicNotes?.settings?.weekly?.enabled) {
    const s = periodicNotes.settings.weekly;
    return {
      format: s.format || "gggg-[W]ww",
      folder: (s.folder ?? "").trim()
    };
  }
  const internalPlugins = app.internalPlugins;
  const calendarPlugin = internalPlugins?.getPluginById?.("calendar");
  if (calendarPlugin) {
    const options = calendarPlugin.instance?.options ?? calendarPlugin.options;
    return {
      format: options?.weeklyNoteFormat ?? "gggg-[W]ww",
      folder: (options?.weeklyNoteFolder ?? "").trim()
    };
  }
  return null;
}
var MiniCalendar = class {
  constructor(parent, plugin) {
    this.notesSet = /* @__PURE__ */ new Set();
    this.weekNotesSet = /* @__PURE__ */ new Set();
    this.lang = "zh";
    this.plugin = plugin;
    this.lang = plugin.settings.language ?? "zh";
    this.container = parent.createDiv({ cls: "Tomato-mini-calendar" });
    this.displayedMonth = /* @__PURE__ */ new Date();
    this.displayedMonth.setDate(1);
    this.displayedMonth.setHours(0, 0, 0, 0);
    void this.render();
  }
  destroy() {
    this.container.empty();
    this.container.remove();
  }
  async render() {
    this.container.empty();
    this.buildHeader();
    await this.buildGrid();
  }
  buildHeader() {
    const header = this.container.createDiv({ cls: "Tomato-mini-cal-header" });
    const prevBtn = header.createEl("button", { cls: "Tomato-mini-cal-nav-btn", text: "<" });
    const titleEl = header.createEl("span", { cls: "Tomato-mini-cal-title" });
    const nextBtn = header.createEl("button", { cls: "Tomato-mini-cal-nav-btn", text: ">" });
    const todayBtn = header.createEl("button", {
      cls: "Tomato-mini-cal-nav-btn Tomato-mini-cal-today-btn",
      text: this.lang === "zh" ? "\u4ECA" : "T"
    });
    const moment = window.moment;
    const m = moment(this.displayedMonth);
    titleEl.setText(this.lang === "zh" ? m.format("YYYY\u5E74M\u6708") : m.format("MMM YYYY"));
    prevBtn.addEventListener("click", () => {
      this.displayedMonth.setMonth(this.displayedMonth.getMonth() - 1);
      void this.render();
    });
    nextBtn.addEventListener("click", () => {
      this.displayedMonth.setMonth(this.displayedMonth.getMonth() + 1);
      void this.render();
    });
    todayBtn.addEventListener("click", () => {
      this.displayedMonth = /* @__PURE__ */ new Date();
      this.displayedMonth.setDate(1);
      this.displayedMonth.setHours(0, 0, 0, 0);
      void this.render();
    });
  }
  async buildGrid() {
    this.gridWrapEl = this.container.createDiv({ cls: "Tomato-mini-cal-grid-wrap" });
    const weekdays = this.lang === "zh" ? ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    const headerRow = this.gridWrapEl.createDiv({ cls: "Tomato-mini-cal-weekdays" });
    for (const wd of weekdays) {
      headerRow.createDiv({ cls: "Tomato-mini-cal-weekday", text: wd });
    }
    const grid = this.gridWrapEl.createDiv({ cls: "Tomato-mini-cal-days" });
    const year = this.displayedMonth.getFullYear();
    const month = this.displayedMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth2 = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < startDayOfWeek; i++) {
      grid.createDiv({ cls: "Tomato-mini-cal-day empty" });
    }
    const todayStr = this.todayString();
    await this.indexNotes(year, month);
    const moment = window.moment;
    for (let d = 1; d <= daysInMonth2; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayEl = grid.createDiv({ cls: "Tomato-mini-cal-day" });
      const numEl = dayEl.createDiv({ cls: "Tomato-mini-cal-day-num", text: String(d) });
      if (dateStr === todayStr) {
        dayEl.addClass("today");
      }
      if (this.notesSet.has(dateStr)) {
        dayEl.addClass("has-note");
      }
      dayEl.addEventListener("click", () => {
        void this.openOrCreateDailyNote(dateStr);
      });
      dayEl.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        this.showDayContextMenu(dateStr, evt);
      });
    }
  }
  todayString() {
    const n = /* @__PURE__ */ new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  }
  async indexNotes(year, month) {
    this.notesSet.clear();
    this.weekNotesSet.clear();
    const daily = getDailyNoteSettings(this.plugin.app);
    const weekly = getWeeklyNoteSettings(this.plugin.app);
    const moment = window.moment;
    const daysInMonth2 = new Date(year, month + 1, 0).getDate();
    if (daily) {
      for (let d = 1; d <= daysInMonth2; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const m = moment(dateStr, "YYYY-MM-DD");
        const fileName = m.format(daily.format);
        const path = daily.folder ? (0, import_obsidian3.normalizePath)(`${daily.folder}/${fileName}.md`) : (0, import_obsidian3.normalizePath)(`${fileName}.md`);
        if (this.plugin.app.vault.getFileByPath(path)) {
          this.notesSet.add(dateStr);
        }
      }
    }
    if (weekly) {
      const startOfMonth = moment(`${year}-${String(month + 1).padStart(2, "0")}-01`, "YYYY-MM-DD");
      const endOfMonth = startOfMonth.clone().endOf("month");
      let currentWeek = startOfMonth.clone().startOf("week");
      while (currentWeek.isSameOrBefore(endOfMonth)) {
        const fileName = currentWeek.format(weekly.format);
        const path = weekly.folder ? (0, import_obsidian3.normalizePath)(`${weekly.folder}/${fileName}.md`) : (0, import_obsidian3.normalizePath)(`${fileName}.md`);
        if (this.plugin.app.vault.getFileByPath(path)) {
          this.weekNotesSet.add(currentWeek.format("YYYY-MM-DD"));
        }
        currentWeek.add(1, "week");
      }
    }
  }
  async openOrCreateDailyNote(dateStr) {
    const settings = getDailyNoteSettings(this.plugin.app);
    if (!settings) {
      new import_obsidian3.Notice(this.lang === "zh" ? "\u672A\u627E\u5230\u65E5\u8BB0\u63D2\u4EF6\u8BBE\u7F6E" : "Daily note settings not found");
      return;
    }
    const moment = window.moment;
    const m = moment(dateStr, "YYYY-MM-DD");
    const fileName = m.format(settings.format);
    const path = settings.folder ? (0, import_obsidian3.normalizePath)(`${settings.folder}/${fileName}.md`) : (0, import_obsidian3.normalizePath)(`${fileName}.md`);
    const existing = this.plugin.app.vault.getFileByPath(path);
    if (existing instanceof import_obsidian3.TFile) {
      const leaf = this.plugin.app.workspace.getLeaf(false);
      await leaf.openFile(existing);
      return;
    }
    try {
      if (settings.folder) {
        const dir = (0, import_obsidian3.normalizePath)(settings.folder);
        if (!this.plugin.app.vault.getAbstractFileByPath(dir)) {
          await this.plugin.app.vault.createFolder(dir);
        }
      }
      const created = await this.plugin.app.vault.create(path, "");
      const leaf = this.plugin.app.workspace.getLeaf(false);
      await leaf.openFile(created);
    } catch (e) {
      new import_obsidian3.Notice(`${this.lang === "zh" ? "\u521B\u5EFA\u7B14\u8BB0\u5931\u8D25" : "Failed to create note"}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  showDayContextMenu(dateStr, evt) {
    const settings = getDailyNoteSettings(this.plugin.app);
    if (!settings) return;
    const moment = window.moment;
    const m = moment(dateStr, "YYYY-MM-DD");
    const fileName = m.format(settings.format);
    const path = settings.folder ? (0, import_obsidian3.normalizePath)(`${settings.folder}/${fileName}.md`) : (0, import_obsidian3.normalizePath)(`${fileName}.md`);
    const file = this.plugin.app.vault.getFileByPath(path);
    if (!file) return;
    const menu = new import_obsidian3.Menu();
    menu.addItem((item) => {
      item.setTitle(this.lang === "zh" ? "\u5728\u65B0\u6807\u7B7E\u9875\u6253\u5F00" : "Open in new tab").setIcon("file-plus").onClick(async () => {
        const leaf = this.plugin.app.workspace.getLeaf("tab");
        await leaf.openFile(file);
      });
    });
    menu.addItem((item) => {
      item.setTitle(this.lang === "zh" ? "\u5728\u6587\u4EF6\u5939\u4E2D\u663E\u793A" : "Reveal in navigation").setIcon("folder-open").onClick(() => {
        this.plugin.app.internal?.commands?.executeCommandById?.("file-explorer:reveal-active-file");
      });
    });
    menu.showAtMouseEvent(evt);
  }
};

// src/timerViewCompact.ts
var VIEW_TYPE_Tomato_Compact = "Tomato-timer-compact-view";
var TomatoTimerCompactView = class _TomatoTimerCompactView extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.phaseDotEls = [];
    this.lastMinutesRefresh = 0;
    this.uiBuilt = false;
    this.renderingTimeline = false;
    this.cachedModeIcon = "";
    this.cachedActionIcon = "";
    this.cachedFontSizeVar = "";
    this.cachedTimerFontSizeVar = "";
    this.cachedCurrentFontFamily = "";
    this.cachedTimerFontFamily = "";
    this.cachedDataPhase = "";
    this.cachedDotDisplay = "";
    this.cachedTimelineHash = "";
    this.phaseLabels = null;
    this.plugin = plugin;
  }
  static {
    this.MODE_ICONS = {
      pomodoro: "target",
      stopwatch: "timer",
      countdown: "hourglass"
    };
  }
  static {
    this.MODE_CYCLE = ["pomodoro", "stopwatch", "countdown"];
  }
  getViewType() {
    return VIEW_TYPE_Tomato_Compact;
  }
  getDisplayText() {
    return this.plugin.t("panel.title");
  }
  getIcon() {
    return "timer";
  }
  async onOpen() {
    this.buildUI();
    this.updateTimerUI(this.plugin.timer.getState());
    void this.refreshTodayMinutes();
    this.updateCurrentTime();
    this.currentTimeInterval = window.setInterval(() => {
      this.updateCurrentTime();
      void this.renderTodayTimeline();
    }, 3e4);
    const debouncedRefresh = () => {
      if (this.calendarRefreshTimer) {
        window.clearTimeout(this.calendarRefreshTimer);
      }
      this.calendarRefreshTimer = window.setTimeout(() => {
        this.calendarRefreshTimer = void 0;
        void this.miniCalendar?.render();
      }, 500);
    };
    this.registerEvent(this.app.vault.on("create", debouncedRefresh));
    this.registerEvent(this.app.vault.on("delete", debouncedRefresh));
    this.registerEvent(this.app.vault.on("rename", debouncedRefresh));
  }
  async onClose() {
    this.uiBuilt = false;
    if (this.currentTimeInterval) {
      clearInterval(this.currentTimeInterval);
      this.currentTimeInterval = void 0;
    }
    if (this.calendarRefreshTimer) {
      window.clearTimeout(this.calendarRefreshTimer);
      this.calendarRefreshTimer = void 0;
    }
    this.miniCalendar?.destroy();
  }
  buildUI() {
    if (this.uiBuilt) return;
    this.uiBuilt = true;
    const root = this.contentEl;
    root.empty();
    root.addClass("Tomato-compact-container");
    root.style.setProperty("--tomato-compact-current-time-font-size", `${this.plugin.settings.compactCurrentTimeFontSize}rem`);
    root.style.setProperty("--tomato-compact-timer-font-size", `${this.plugin.settings.compactTimerFontSize}rem`);
    root.style.setProperty("--tomato-compact-current-time-font-family", this.plugin.settings.compactCurrentTimeFontFamily);
    root.style.setProperty("--tomato-compact-timer-font-family", this.plugin.settings.compactTimerFontFamily);
    const topRow = root.createDiv({ cls: "Tomato-compact-top-row" });
    this.projectSelect = topRow.createEl("select", { cls: "Tomato-compact-project-select" });
    this.registerDomEvent(this.projectSelect, "change", () => {
      this.plugin.timer.setCurrentProject(this.projectSelect.value);
    });
    this.renderProjectSelect();
    this.taskInput = topRow.createEl("input", {
      cls: "Tomato-compact-task-input",
      attr: { placeholder: this.plugin.t("panel.taskPlaceholder") }
    });
    this.registerDomEvent(this.taskInput, "input", () => {
      this.plugin.timer.setTaskName(this.taskInput.value);
    });
    const currentRow = root.createDiv({ cls: "Tomato-compact-current-row" });
    this.currentTimeEl = currentRow.createDiv({ cls: "Tomato-compact-current-time", text: "--:--" });
    this.modeBtn = currentRow.createEl("button", {
      cls: "Tomato-compact-mode-btn Tomato-compact-mode-toggle"
    });
    (0, import_obsidian4.setIcon)(this.modeBtn, _TomatoTimerCompactView.MODE_ICONS["pomodoro"]);
    this.registerDomEvent(this.modeBtn, "click", () => {
      const current = this.plugin.timer.getMode();
      const cycle = _TomatoTimerCompactView.MODE_CYCLE;
      const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
      this.plugin.timer.setMode(next);
      this.plugin.refreshAllViews?.();
    });
    this.timelineEl = root.createDiv({ cls: "Tomato-compact-timeline" });
    const timerRow = root.createDiv({ cls: "Tomato-compact-timer-row" });
    this.dotCol = timerRow.createDiv({ cls: "Tomato-compact-dot-col" });
    this.phaseDotEls = [];
    for (let i = 0; i < this.plugin.settings.cycles; i++) {
      this.phaseDotEls.push(this.dotCol.createDiv({ cls: "Tomato-compact-dot" }));
    }
    const timerCol = timerRow.createDiv({ cls: "Tomato-compact-timer-col" });
    this.timerDisplayEl = timerCol.createDiv({ cls: "Tomato-compact-display", text: "--" });
    this.timerDisplayEl.addEventListener("dblclick", () => {
      void this.plugin.activateFullView();
    });
    this.timerDisplayEl.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      this.onTimerContextMenu(evt);
    });
    const btnCol = timerRow.createDiv({ cls: "Tomato-compact-action-col" });
    this.actionBtn = btnCol.createEl("button", {
      cls: "Tomato-compact-icon-btn Tomato-compact-btn-primary"
    });
    (0, import_obsidian4.setIcon)(this.actionBtn, "play");
    this.registerDomEvent(this.actionBtn, "click", () => this.onAction());
    const infoRow = root.createDiv({ cls: "Tomato-compact-info-row" });
    this.statusTextEl = infoRow.createDiv({ cls: "Tomato-compact-status", text: this.plugin.t("panel.status.ready") });
    this.todayMinutesEl = infoRow.createDiv({ cls: "Tomato-compact-today", text: "" });
    this.miniCalendar = new MiniCalendar(root, this.plugin);
  }
  updateCurrentTime() {
    const now = /* @__PURE__ */ new Date();
    this.currentTimeEl.setText(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`);
  }
  onTimerContextMenu(evt) {
    const state = this.plugin.timer.getState();
    const mode = state.mode;
    if (mode === "stopwatch") return;
    if (mode === "pomodoro") {
      if (state.phase === "idle") return;
      const menu = new import_obsidian4.Menu();
      menu.addItem((item) => {
        item.setTitle(this.plugin.t("panel.btn.stop")).setIcon("square").onClick(() => this.plugin.timer.skip());
      });
      menu.showAtMouseEvent(evt);
      return;
    }
    if (mode === "countdown") {
      evt.preventDefault();
      this.showCountdownInlineEdit();
      return;
    }
  }
  parseCountdownInput(value) {
    const cleaned = value.replace(/[：]/g, ":").replace(/[^0-9:]/g, "");
    const parts = cleaned.split(":").filter((p) => p !== "").map((p) => parseInt(p, 10)).filter((n) => !isNaN(n));
    if (parts.length === 0) return 0;
    if (parts.length === 1) return parts[0] * 60;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  showCountdownInlineEdit() {
    const curSec = this.plugin.timer.getState().remainingSeconds;
    const input = document.createElement("input");
    input.type = "text";
    input.value = curSec > 0 ? String(Math.floor(curSec / 60)) : String(this.plugin.settings.countdownMinutes);
    input.className = "Tomato-compact-inline-input";
    input.style.cssText = `
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 100px;
            text-align: center;
            font-size: inherit;
            font-family: inherit;
            font-weight: inherit;
            background: var(--background-primary);
            color: var(--text-normal);
            border: 1px solid var(--interactive-accent);
            border-radius: 4px;
            padding: 2px 4px;
            z-index: 10;
            outline: none;
        `;
    const container = this.timerDisplayEl.parentElement;
    container.style.position = "relative";
    container.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) {
        const seconds = this.parseCountdownInput(input.value);
        if (seconds > 0) {
          this.plugin.timer.setCountdownSeconds(seconds);
          this.plugin.timer.reset();
          this.timerDisplayEl.setText(this.fmtTime(seconds));
        }
      }
      if (input.parentElement) input.remove();
      this.plugin.refreshAllViews?.();
    };
    input.addEventListener("keyup", (e) => {
      if (e.key === "Enter" || e.keyCode === 13 || e.code === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        finish(true);
      } else if (e.key === "Escape" || e.keyCode === 27) {
        finish(false);
      }
    });
    input.addEventListener("blur", () => {
      finish(true);
    });
    input.addEventListener("input", () => {
      const seconds = this.parseCountdownInput(input.value);
      if (seconds > 0) {
        this.timerDisplayEl.setText(this.fmtTime(seconds));
      }
    });
  }
  onAction() {
    const s = this.plugin.timer.getState();
    if (s.phase === "idle") {
      this.plugin.timer.start();
      return;
    }
    const mode = this.plugin.timer.getMode();
    if (mode === "pomodoro") {
      this.plugin.timer.skip();
    } else if (mode === "countdown") {
      this.plugin.timer.reset();
    } else if (mode === "stopwatch") {
      this.plugin.timer.skip();
    }
  }
  updateTimerUI(state) {
    const fontSize = `${this.plugin.settings.compactCurrentTimeFontSize}rem`;
    const timerFontSize = `${this.plugin.settings.compactTimerFontSize}rem`;
    if (this.cachedFontSizeVar !== fontSize) {
      this.cachedFontSizeVar = fontSize;
      this.contentEl.style.setProperty("--tomato-compact-current-time-font-size", fontSize);
    }
    if (this.cachedTimerFontSizeVar !== timerFontSize) {
      this.cachedTimerFontSizeVar = timerFontSize;
      this.contentEl.style.setProperty("--tomato-compact-timer-font-size", timerFontSize);
    }
    if (this.cachedCurrentFontFamily !== this.plugin.settings.compactCurrentTimeFontFamily) {
      this.cachedCurrentFontFamily = this.plugin.settings.compactCurrentTimeFontFamily;
      this.contentEl.style.setProperty("--tomato-compact-current-time-font-family", this.plugin.settings.compactCurrentTimeFontFamily);
    }
    if (this.cachedTimerFontFamily !== this.plugin.settings.compactTimerFontFamily) {
      this.cachedTimerFontFamily = this.plugin.settings.compactTimerFontFamily;
      this.contentEl.style.setProperty("--tomato-compact-timer-font-family", this.plugin.settings.compactTimerFontFamily);
    }
    const displaySeconds = state.mode === "stopwatch" ? state.elapsedSeconds : state.remainingSeconds;
    const timeText = this.fmtTime(displaySeconds);
    if (this.timerDisplayEl.getText() !== timeText) {
      this.timerDisplayEl.setText(timeText);
    }
    const statusText = this.formatPhaseLabel(state);
    if (this.statusTextEl.getText() !== statusText) {
      this.statusTextEl.setText(statusText);
    }
    if (this.cachedDataPhase !== state.phase) {
      this.cachedDataPhase = state.phase;
      this.contentEl.setAttribute("data-phase", state.phase);
    }
    const hasManyDots = state.mode === "pomodoro" && this.plugin.settings.cycles >= 4;
    const hasHours = displaySeconds >= 3600;
    const targetClass = hasHours && hasManyDots ? "ultra-compact" : hasHours || hasManyDots ? "compact" : "";
    this.timerDisplayEl.removeClass("compact", "ultra-compact");
    if (targetClass) {
      this.timerDisplayEl.addClass(targetClass);
    }
    const modeIcon = _TomatoTimerCompactView.MODE_ICONS[state.mode];
    if (this.cachedModeIcon !== modeIcon) {
      this.cachedModeIcon = modeIcon;
      (0, import_obsidian4.setIcon)(this.modeBtn, modeIcon);
    }
    let actionIcon;
    if (state.phase === "idle") {
      actionIcon = "play";
    } else if (state.mode === "pomodoro") {
      actionIcon = "skip-forward";
    } else if (state.mode === "countdown") {
      actionIcon = "rotate-ccw";
    } else {
      actionIcon = "square";
    }
    if (this.cachedActionIcon !== actionIcon) {
      this.cachedActionIcon = actionIcon;
      (0, import_obsidian4.setIcon)(this.actionBtn, actionIcon);
    }
    this.actionBtn.disabled = false;
    const dotDisplay = state.mode === "pomodoro" ? "flex" : "none";
    if (this.cachedDotDisplay !== dotDisplay) {
      this.cachedDotDisplay = dotDisplay;
      this.dotCol.style.display = dotDisplay;
    }
    if (state.mode === "pomodoro") {
      const doneInCycle = state.completedTomatos % this.plugin.settings.cycles;
      this.phaseDotEls.forEach((dot, i) => {
        dot.toggleClass("completed", i < doneInCycle);
        dot.toggleClass("active", state.phase === "work" && state.isRunning && i === doneInCycle);
      });
    } else {
      this.phaseDotEls.forEach((dot) => {
        dot.removeClass("completed", "active");
      });
    }
    if (this.projectSelect.options.length !== this.plugin.settings.projects.length + 1) {
      this.renderProjectSelect();
    }
    if (this.projectSelect.value !== state.currentProject) {
      this.projectSelect.value = state.currentProject;
    }
    if (this.taskInput.value !== state.taskName) {
      this.taskInput.value = state.taskName;
    }
    const now = Date.now();
    if (now - this.lastMinutesRefresh > 1e4) {
      this.lastMinutesRefresh = now;
      void this.refreshTodayMinutes();
      void this.renderTodayTimeline();
    }
  }
  async renderTodayTimeline() {
    if (!this.uiBuilt || !this.timelineEl || this.renderingTimeline) return;
    this.renderingTimeline = true;
    try {
      const date = todayString();
      const dayRecord = await parseDayFile(this.app, this.plugin.settings, date);
      const hashParts = [];
      for (const entry of dayRecord.entries) {
        hashParts.push(`${entry.startTime}-${entry.duration}-${entry.project}`);
      }
      const newHash = hashParts.join("|");
      const dataChanged = this.cachedTimelineHash !== newHash;
      if (dataChanged) {
        this.cachedTimelineHash = newHash;
        this.timelineEl.empty();
        const track = this.timelineEl.createDiv({ cls: "Tomato-compact-timeline-track" });
        if (dayRecord.entries.length > 0) {
          const totalDayMinutes = 1440;
          for (const entry of dayRecord.entries) {
            const startMin = timeToMinutes(entry.startTime);
            const left = startMin / totalDayMinutes * 100;
            const width = entry.duration / totalDayMinutes * 100;
            const seg = track.createDiv({ cls: "Tomato-compact-timeline-seg" });
            seg.style.left = `${left}%`;
            seg.style.width = `${Math.max(width, 0.3)}%`;
            seg.style.backgroundColor = projectColor(this.plugin, entry.project);
          }
        }
        const currentLine = this.timelineEl.createDiv({ cls: "Tomato-compact-timeline-current" });
        const currentMin = (/* @__PURE__ */ new Date()).getHours() * 60 + (/* @__PURE__ */ new Date()).getMinutes();
        currentLine.style.left = `${currentMin / 1440 * 100}%`;
      } else {
        const currentLine = this.timelineEl.querySelector(".Tomato-compact-timeline-current");
        if (currentLine) {
          const currentMin = (/* @__PURE__ */ new Date()).getHours() * 60 + (/* @__PURE__ */ new Date()).getMinutes();
          currentLine.style.left = `${currentMin / 1440 * 100}%`;
        }
      }
    } finally {
      this.renderingTimeline = false;
    }
  }
  async refreshTodayMinutes() {
    try {
      const minutes = await getDayMinutes(this.app, this.plugin.settings, todayString());
      if (minutes > 0) {
        this.todayMinutesEl.setText(`${this.plugin.t("panel.todayTotal")} ${minutes}min`);
      } else {
        this.todayMinutesEl.setText("");
      }
    } catch {
      this.todayMinutesEl.setText("");
    }
  }
  renderProjectSelect() {
    const current = this.plugin.timer?.getCurrentProject() ?? "";
    this.projectSelect.empty();
    this.projectSelect.createEl("option", { text: this.plugin.t("panel.projectPlaceholder"), value: "" });
    for (const proj of this.plugin.settings.projects) {
      this.projectSelect.createEl("option", { text: proj.name, value: proj.name });
    }
    this.projectSelect.value = current;
  }
  fmtTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor(s % 3600 / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  formatPhaseLabel(state) {
    if (!this.phaseLabels) {
      this.phaseLabels = {
        work: this.plugin.t("panel.status.focus"),
        shortBreak: this.plugin.t("panel.status.shortBreak"),
        longBreak: this.plugin.t("panel.status.longBreak"),
        idle: this.plugin.t("panel.status.ready"),
        stopwatch: this.plugin.t("panel.status.stopwatch"),
        countdown: this.plugin.t("panel.status.countdown")
      };
    }
    return this.phaseLabels[state.phase];
  }
};

// src/settings.ts
var import_obsidian5 = require("obsidian");
var DEFAULT_SETTINGS = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cycles: 4,
  autoStartNextPhase: true,
  enableSound: true,
  enableOsNotification: true,
  logFolder: "Tomato Logs",
  enableDailyNoteLink: true,
  countdownMinutes: 25,
  language: "zh",
  projects: [],
  showStatusBar: true,
  openLogOnComplete: true,
  calendarSnapMinutes: 5,
  compactCurrentTimeFontSize: 1.7,
  compactTimerFontSize: 1.8,
  compactCurrentTimeFontFamily: "'Courier New', Courier, monospace",
  compactTimerFontFamily: "'Courier New', Courier, monospace"
};
var TomatoSettingTab = class extends import_obsidian5.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  async loadSystemFonts(dropdown, currentValue) {
    let fonts = [];
    try {
      if ("queryLocalFonts" in window) {
        const localFonts = await window.queryLocalFonts();
        const names = /* @__PURE__ */ new Set();
        for (const font of localFonts) {
          names.add(font.family);
        }
        fonts = Array.from(names).sort();
      }
    } catch {
    }
    if (fonts.length === 0) {
      fonts = [
        "Arial",
        "Helvetica",
        "Times New Roman",
        "Georgia",
        "Courier New",
        "Consolas",
        "Monaco",
        "JetBrains Mono",
        "Fira Code",
        "Inter",
        "Roboto",
        "system-ui",
        "Microsoft YaHei",
        "SimSun",
        "DengXian",
        "PingFang SC",
        "Hiragino Sans GB",
        "Noto Sans CJK SC",
        "Source Han Sans SC"
      ];
    }
    if (!fonts.includes(currentValue)) {
      fonts.unshift(currentValue);
    }
    for (const font of fonts) {
      dropdown.addOption(font, font);
    }
    dropdown.setValue(currentValue);
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const _t = (k) => this.plugin.t(k);
    new import_obsidian5.Setting(containerEl).setHeading().setName(_t("settings.heading"));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.language")).addDropdown((d) => d.addOption("zh", "\u4E2D\u6587").addOption("en", "English").setValue(this.plugin.settings.language).onChange(async (v) => {
      this.plugin.settings.language = v;
      await this.plugin.saveSettings();
      this.plugin.refreshAllViews();
      this.plugin.refreshLogViews();
      this.display();
    }));
    new import_obsidian5.Setting(containerEl).setHeading().setName(_t("settings.durations"));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.workDuration")).addSlider((s) => s.setLimits(1, 90, 1).setValue(this.plugin.settings.workMinutes).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.workMinutes = v;
      await this.plugin.saveSettings();
      this.plugin.applySettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.shortBreak")).addSlider((s) => s.setLimits(1, 30, 1).setValue(this.plugin.settings.shortBreakMinutes).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.shortBreakMinutes = v;
      await this.plugin.saveSettings();
      this.plugin.applySettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.longBreak")).addSlider((s) => s.setLimits(5, 60, 1).setValue(this.plugin.settings.longBreakMinutes).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.longBreakMinutes = v;
      await this.plugin.saveSettings();
      this.plugin.applySettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.cycles")).setDesc(_t("settings.cyclesDesc")).addSlider((s) => s.setLimits(2, 8, 1).setValue(this.plugin.settings.cycles).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.cycles = v;
      await this.plugin.saveSettings();
      this.plugin.applySettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.countdownDuration")).setDesc(_t("settings.countdownDurationDesc")).addSlider((s) => s.setLimits(1, 120, 1).setValue(this.plugin.settings.countdownMinutes).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.countdownMinutes = v;
      await this.plugin.saveSettings();
      this.plugin.applySettings();
    }));
    new import_obsidian5.Setting(containerEl).setHeading().setName(_t("settings.behavior"));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.autoStart")).setDesc(_t("settings.autoStartDesc")).addToggle((t2) => t2.setValue(this.plugin.settings.autoStartNextPhase).onChange(async (v) => {
      this.plugin.settings.autoStartNextPhase = v;
      await this.plugin.saveSettings();
      this.plugin.applySettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.sound")).setDesc(_t("settings.soundDesc")).addToggle((t2) => t2.setValue(this.plugin.settings.enableSound).onChange(async (v) => {
      this.plugin.settings.enableSound = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.osNotification")).setDesc(_t("settings.osNotificationDesc")).addToggle((t2) => t2.setValue(this.plugin.settings.enableOsNotification).onChange(async (v) => {
      this.plugin.settings.enableOsNotification = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.showStatusBar")).setDesc(_t("settings.showStatusBarDesc")).addToggle((t2) => t2.setValue(this.plugin.settings.showStatusBar).onChange(async (v) => {
      this.plugin.settings.showStatusBar = v;
      await this.plugin.saveSettings();
      this.plugin.applySettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.calendarSnap")).setDesc(_t("settings.calendarSnapDesc")).addDropdown((d) => d.addOption("1", "1 min").addOption("5", "5 min").addOption("10", "10 min").addOption("15", "15 min").addOption("30", "30 min").setValue(String(this.plugin.settings.calendarSnapMinutes)).onChange(async (v) => {
      this.plugin.settings.calendarSnapMinutes = parseInt(v, 10);
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.compactCurrentTimeFontSize")).setDesc(_t("settings.compactCurrentTimeFontSizeDesc")).addSlider((s) => s.setLimits(0.8, 2.5, 0.1).setValue(this.plugin.settings.compactCurrentTimeFontSize).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.compactCurrentTimeFontSize = v;
      await this.plugin.saveSettings();
      this.plugin.refreshAllViews();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.compactTimerFontSize")).setDesc(_t("settings.compactTimerFontSizeDesc")).addSlider((s) => s.setLimits(0.8, 2.5, 0.1).setValue(this.plugin.settings.compactTimerFontSize).setDynamicTooltip().onChange(async (v) => {
      this.plugin.settings.compactTimerFontSize = v;
      await this.plugin.saveSettings();
      this.plugin.refreshAllViews();
    }));
    const currentTimeFontSetting = new import_obsidian5.Setting(containerEl).setName(_t("settings.compactCurrentTimeFontFamily")).setDesc(_t("settings.compactCurrentTimeFontFamilyDesc"));
    let currentTimeFontDropdown;
    currentTimeFontSetting.addDropdown((d) => {
      currentTimeFontDropdown = d;
      d.onChange(async (v) => {
        this.plugin.settings.compactCurrentTimeFontFamily = v;
        await this.plugin.saveSettings();
        this.plugin.refreshAllViews();
      });
    });
    void this.loadSystemFonts(currentTimeFontDropdown, this.plugin.settings.compactCurrentTimeFontFamily);
    const timerFontSetting = new import_obsidian5.Setting(containerEl).setName(_t("settings.compactTimerFontFamily")).setDesc(_t("settings.compactTimerFontFamilyDesc"));
    let timerFontDropdown;
    timerFontSetting.addDropdown((d) => {
      timerFontDropdown = d;
      d.onChange(async (v) => {
        this.plugin.settings.compactTimerFontFamily = v;
        await this.plugin.saveSettings();
        this.plugin.refreshAllViews();
      });
    });
    void this.loadSystemFonts(timerFontDropdown, this.plugin.settings.compactTimerFontFamily);
    new import_obsidian5.Setting(containerEl).setHeading().setName(_t("settings.log"));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.logFolder")).setDesc(_t("settings.logFolderDesc")).addText((t2) => t2.setPlaceholder("Tomato Logs").setValue(this.plugin.settings.logFolder).onChange(async (v) => {
      this.plugin.settings.logFolder = v.trim() || "Tomato Logs";
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.enableDailyNoteLink")).setDesc(_t("settings.enableDailyNoteLinkDesc")).addToggle((t2) => t2.setValue(this.plugin.settings.enableDailyNoteLink).onChange(async (v) => {
      this.plugin.settings.enableDailyNoteLink = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName(_t("settings.openLogOnComplete")).setDesc(_t("settings.openLogOnCompleteDesc")).addToggle((t2) => t2.setValue(this.plugin.settings.openLogOnComplete).onChange(async (v) => {
      this.plugin.settings.openLogOnComplete = v;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setHeading().setName(_t("settings.projects"));
    const projectListEl = containerEl.createDiv({ cls: "Tomato-project-list" });
    const renderProjects = () => {
      projectListEl.empty();
      this.plugin.settings.projects.forEach((proj, idx) => {
        const row = projectListEl.createDiv({ cls: "Tomato-project-row" });
        row.createEl("input", { type: "text", value: proj.name, cls: "Tomato-project-name" }, (el) => {
          el.addEventListener("change", async () => {
            this.plugin.settings.projects[idx].name = el.value.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshAllViews();
            this.plugin.refreshLogViews();
          });
        });
        row.createEl("input", { type: "color", value: proj.color || "#3b82f6", cls: "Tomato-project-color" }, (el) => {
          el.addEventListener("input", async () => {
            this.plugin.settings.projects[idx].color = el.value;
            await this.plugin.saveSettings();
            this.plugin.refreshAllViews();
            this.plugin.refreshLogViews();
          });
        });
        row.createEl("button", { text: "\u{1F5D1}\uFE0F", cls: "Tomato-project-delete" }, (el) => {
          el.addEventListener("click", async () => {
            const deleted = this.plugin.settings.projects[idx].name;
            this.plugin.settings.projects.splice(idx, 1);
            await this.plugin.saveSettings();
            if (this.plugin.timer.getCurrentProject() === deleted) {
              this.plugin.timer.setCurrentProject("");
            }
            renderProjects();
            this.plugin.refreshAllViews();
            this.plugin.refreshLogViews();
          });
        });
      });
    };
    renderProjects();
    new import_obsidian5.Setting(containerEl).addButton((b) => b.setButtonText(_t("settings.addProject")).onClick(async () => {
      this.plugin.settings.projects.push({ name: "", color: "#3b82f6" });
      await this.plugin.saveSettings();
      renderProjects();
      this.plugin.refreshAllViews();
      this.plugin.refreshLogViews();
    }));
  }
};

// src/i18n.ts
var dict = {
  // Panel
  "panel.title": { en: "Tomato", zh: "\u756A\u8304\u949F" },
  "panel.mode.pomodoro": { en: "\u{1F345} Pomodoro", zh: "\u{1F345} \u756A\u8304\u949F" },
  "panel.mode.stopwatch": { en: "\u23F1\uFE0F Stopwatch", zh: "\u23F1\uFE0F \u6B63\u8BA1\u65F6" },
  "panel.mode.countdown": { en: "\u23F3 Countdown", zh: "\u23F3 \u5012\u8BA1\u65F6" },
  "panel.taskPlaceholder": { en: "Task name...", zh: "\u672C\u6B21\u4EFB\u52A1..." },
  "panel.countdownLabel": { en: "Minutes:", zh: "\u5206\u949F\uFF1A" },
  "panel.btn.start": { en: "Start", zh: "\u5F00\u59CB" },
  "panel.btn.save": { en: "Save", zh: "\u4FDD\u5B58" },
  "panel.btn.pause": { en: "Pause", zh: "\u6682\u505C" },
  "panel.btn.resume": { en: "Resume", zh: "\u7EE7\u7EED" },
  "panel.btn.stop": { en: "Stop", zh: "\u505C\u6B62" },
  "panel.btn.skip": { en: "Skip", zh: "\u8DF3\u8FC7" },
  "panel.btn.reset": { en: "Reset", zh: "\u91CD\u7F6E" },
  "panel.status.ready": { en: "Ready", zh: "\u51C6\u5907\u5C31\u7EEA" },
  "panel.status.paused": { en: "Paused", zh: "\u5DF2\u6682\u505C" },
  "panel.status.focus": { en: "Focus", zh: "\u4E13\u6CE8" },
  "panel.status.shortBreak": { en: "Short Break", zh: "\u77ED\u4F11\u606F" },
  "panel.status.longBreak": { en: "Long Rest", zh: "\u957F\u4F11\u606F" },
  "panel.status.stopwatch": { en: "Stopwatch", zh: "\u6B63\u8BA1\u65F6" },
  "panel.status.countdown": { en: "Countdown", zh: "\u5012\u8BA1\u65F6" },
  "panel.timer.running": { en: "Running", zh: "\u8FDB\u884C\u4E2D" },
  "panel.todayTotal": { en: "Today:", zh: "\u4ECA\u65E5\uFF1A" },
  "panel.history.today": { en: "Today", zh: "\u4ECA\u5929" },
  "panel.history.noTomatos": { en: "No Tomatos yet", zh: "\u8FD8\u6CA1\u6709\u756A\u8304\u949F\u8BB0\u5F55" },
  "panel.history.thisWeek": { en: "This week", zh: "\u672C\u5468" },
  "panel.history.total": { en: "\u{1F345} {n} total", zh: "\u{1F345} \u5171 {n} \u4E2A" },
  "panel.tab.timeline": { en: "Timeline", zh: "\u65F6\u95F4\u7EBF" },
  "panel.tab.stats": { en: "Stats", zh: "\u7EDF\u8BA1" },
  "panel.tab.history": { en: "History", zh: "\u5386\u53F2" },
  "panel.tab.calendar": { en: "Calendar", zh: "\u5468\u89C6\u56FE" },
  "panel.tab.list": { en: "List view", zh: "\u5217\u8868" },
  "panel.tab.timesheet": { en: "Timesheet", zh: "\u65F6\u95F4\u8868" },
  "panel.week.thisWeek": { en: "This week", zh: "\u672C\u5468" },
  "panel.week.thisMonth": { en: "This month", zh: "\u672C\u6708" },
  "panel.week.total": { en: "WEEK TOTAL", zh: "\u672C\u5468\u603B\u8BA1" },
  "panel.week.openLog": { en: "Open log", zh: "\u6253\u5F00\u65E5\u5FD7" },
  "panel.view.day": { en: "Day", zh: "\u65E5" },
  "panel.view.week": { en: "Week", zh: "\u5468" },
  "panel.view.month": { en: "Month", zh: "\u6708" },
  "panel.entry.edit": { en: "Edit", zh: "\u7F16\u8F91" },
  "panel.entry.delete": { en: "Delete", zh: "\u5220\u9664" },
  "panel.entry.add": { en: "Add entry", zh: "\u6DFB\u52A0\u8BB0\u5F55" },
  "panel.entry.startTime": { en: "Start time", zh: "\u5F00\u59CB\u65F6\u95F4" },
  "panel.entry.endTime": { en: "End time", zh: "\u7ED3\u675F\u65F6\u95F4" },
  "panel.entry.duration": { en: "Duration (min)", zh: "\u65F6\u957F\uFF08\u5206\u949F\uFF09" },
  "panel.entry.project": { en: "Project", zh: "\u9879\u76EE" },
  "panel.entry.task": { en: "Task", zh: "\u4EFB\u52A1" },
  "panel.stats.period.day": { en: "Day", zh: "\u65E5" },
  "panel.stats.period.week": { en: "Week", zh: "\u5468" },
  "panel.stats.period.month": { en: "Month", zh: "\u6708" },
  "panel.stats.period.year": { en: "Year", zh: "\u5E74" },
  "panel.stats.totalDuration": { en: "Total\n{duration}", zh: "\u603B\u65F6\u957F\n{duration}" },
  "panel.stats.tomatos": { en: "Tomatos\n{n}", zh: "\u756A\u8304\u949F\n{n}" },
  "panel.stats.projectDist": { en: "Project Distribution", zh: "\u9879\u76EE\u5206\u5E03" },
  "panel.stats.trend": { en: "Trend", zh: "\u8D8B\u52BF" },
  "panel.stats.monthlyTrend": { en: "Monthly Trend", zh: "\u6708\u5EA6\u8D8B\u52BF" },
  "panel.stats.noProject": { en: "No project", zh: "\u65E0\u9879\u76EE" },
  "panel.stats.export": { en: "Generate {period} report", zh: "\u751F\u6210{period}\u62A5" },
  "panel.timeline.total": { en: "Total {duration} \xB7 {n} tomatos", zh: "\u603B\u65F6\u957F {duration} \xB7 {n} \u4E2A\u756A\u8304\u949F" },
  "panel.timeline.today": { en: "Today", zh: "\u4ECA\u5929" },
  "panel.report.weekTitle": { en: "Weekly Report {start} ~ {end}", zh: "\u5468\u62A5 {start} ~ {end}" },
  "panel.report.monthTitle": { en: "Monthly Report {month}", zh: "\u6708\u62A5 {month}" },
  "panel.report.yearTitle": { en: "Yearly Report {year}", zh: "\u5E74\u62A5 {year}" },
  "panel.report.totalDuration": { en: "Total Duration", zh: "\u603B\u65F6\u957F" },
  "panel.report.tomatoCount": { en: "Tomato Count", zh: "\u756A\u8304\u949F\u6570" },
  "panel.report.projectDist": { en: "Project Distribution", zh: "\u9879\u76EE\u5206\u5E03" },
  "panel.report.monthlyDetails": { en: "Monthly Details", zh: "\u6708\u5EA6\u8BE6\u60C5" },
  "panel.report.dailyDetails": { en: "Daily Details", zh: "\u6BCF\u65E5\u8BE6\u60C5" },
  "panel.report.monthSuffix": { en: "Month {n}", zh: "{n}\u6708" },
  // Settings
  "settings.heading": { en: "Tomato Clock", zh: "\u756A\u8304\u949F" },
  "settings.durations": { en: "Durations", zh: "\u65F6\u957F" },
  "settings.workDuration": { en: "Work duration (min)", zh: "\u5DE5\u4F5C\u65F6\u957F\uFF08\u5206\u949F\uFF09" },
  "settings.shortBreak": { en: "Short break (min)", zh: "\u77ED\u4F11\u606F\uFF08\u5206\u949F\uFF09" },
  "settings.longBreak": { en: "Long break (min)", zh: "\u957F\u4F11\u606F\uFF08\u5206\u949F\uFF09" },
  "settings.cycles": { en: "Cycles per set", zh: "\u6BCF\u7EC4\u5FAA\u73AF\u6570" },
  "settings.cyclesDesc": { en: "Number of work sessions before a long break", zh: "\u957F\u4F11\u606F\u524D\u7684\u5DE5\u4F5C\u65F6\u6BB5\u6570" },
  "settings.countdownDuration": { en: "Countdown duration (min)", zh: "\u5012\u8BA1\u65F6\u65F6\u957F\uFF08\u5206\u949F\uFF09" },
  "settings.countdownDurationDesc": { en: "Default duration for countdown mode", zh: "\u5012\u8BA1\u65F6\u6A21\u5F0F\u7684\u9ED8\u8BA4\u65F6\u957F" },
  "settings.behavior": { en: "Behavior", zh: "\u884C\u4E3A" },
  "settings.autoStart": { en: "Auto-start next phase", zh: "\u81EA\u52A8\u5F00\u59CB\u4E0B\u4E00\u9636\u6BB5" },
  "settings.autoStartDesc": { en: "Automatically begin the next work or break session", zh: "\u81EA\u52A8\u5F00\u59CB\u4E0B\u4E00\u4E2A\u5DE5\u4F5C\u6216\u4F11\u606F\u65F6\u6BB5" },
  "settings.sound": { en: "Sound alert", zh: "\u58F0\u97F3\u63D0\u9192" },
  "settings.soundDesc": { en: "Play a short beep when a phase ends", zh: "\u9636\u6BB5\u7ED3\u675F\u65F6\u64AD\u653E\u77ED\u63D0\u793A\u97F3" },
  "settings.osNotification": { en: "OS notification", zh: "\u7CFB\u7EDF\u901A\u77E5" },
  "settings.osNotificationDesc": { en: "Show a system notification when sessions complete \u2014 useful when Obsidian is in the background. Grant permission when prompted.", zh: "\u9636\u6BB5\u5B8C\u6210\u65F6\u663E\u793A\u7CFB\u7EDF\u901A\u77E5\u2014\u2014Obsidian \u5728\u540E\u53F0\u65F6\u5F88\u6709\u7528\u3002\u8BF7\u5728\u63D0\u793A\u65F6\u6388\u4E88\u6743\u9650\u3002" },
  "settings.log": { en: "Log", zh: "\u65E5\u5FD7" },
  "settings.logFolder": { en: "Log folder", zh: "\u65E5\u5FD7\u6587\u4EF6\u5939" },
  "settings.logFolderDesc": { en: "Folder where daily log files are stored. One file per day named YYYY-MM-DD.md.", zh: "\u5B58\u653E\u6BCF\u65E5\u65E5\u5FD7\u6587\u4EF6\u7684\u6587\u4EF6\u5939\u3002\u6BCF\u5929\u4E00\u4E2A\u6587\u4EF6\uFF0C\u6587\u4EF6\u540D\u4E3A YYYY-MM-DD.md\u3002" },
  "settings.enableDailyNoteLink": { en: "Link daily note", zh: "\u94FE\u63A5\u5F53\u65E5\u65E5\u8BB0" },
  "settings.enableDailyNoteLinkDesc": { en: "Insert a link to the daily note at the top of each tomato log file.", zh: "\u5728\u6BCF\u4E2A\u756A\u8304\u949F\u65E5\u5FD7\u6587\u4EF6\u9876\u90E8\u63D2\u5165\u6307\u5411\u5F53\u5929\u65E5\u8BB0\u7684\u94FE\u63A5\u3002" },
  "settings.openLogOnComplete": { en: "Open log on complete", zh: "\u8BA1\u65F6\u5B8C\u6210\u65F6\u6253\u5F00\u65E5\u5FD7" },
  "settings.openLogOnCompleteDesc": { en: "Automatically open the daily log file when a session ends.", zh: "\u4F1A\u8BDD\u7ED3\u675F\u65F6\u81EA\u52A8\u6253\u5F00\u5F53\u5929\u7684\u65E5\u5FD7\u6587\u4EF6\u3002" },
  "settings.showStatusBar": { en: "Show status bar", zh: "\u663E\u793A\u72B6\u6001\u680F" },
  "settings.showStatusBarDesc": { en: "Show timer in the status bar at the bottom.", zh: "\u5728\u5E95\u90E8\u72B6\u6001\u680F\u663E\u793A\u8BA1\u65F6\u5668\u3002" },
  "settings.calendarSnap": { en: "Timeline snap interval", zh: "\u65F6\u95F4\u7EBF\u5438\u9644\u7C92\u5EA6" },
  "settings.calendarSnapDesc": { en: "Drag snap granularity in minutes for the calendar view.", zh: "\u5468\u89C6\u56FE\u62D6\u52A8\u65F6\u7684\u65F6\u95F4\u5438\u9644\u7C92\u5EA6\uFF08\u5206\u949F\uFF09\u3002" },
  "settings.compactCurrentTimeFontSize": { en: "Current time font size", zh: "\u5F53\u524D\u65F6\u95F4\u5B57\u4F53\u5927\u5C0F" },
  "settings.compactCurrentTimeFontSizeDesc": { en: "Font size for the current time display in the compact panel (rem).", zh: "\u7D27\u51D1\u9762\u677F\u4E2D\u5F53\u524D\u65F6\u95F4\u663E\u793A\u7684\u5B57\u4F53\u5927\u5C0F\uFF08rem\uFF09\u3002" },
  "settings.compactTimerFontSize": { en: "Timer font size", zh: "\u8BA1\u65F6\u5668\u5B57\u4F53\u5927\u5C0F" },
  "settings.compactTimerFontSizeDesc": { en: "Font size for the timer display in the compact panel (rem).", zh: "\u7D27\u51D1\u9762\u677F\u4E2D\u8BA1\u65F6\u5668\u663E\u793A\u7684\u5B57\u4F53\u5927\u5C0F\uFF08rem\uFF09\u3002" },
  "settings.compactCurrentTimeFontFamily": { en: "Current time font", zh: "\u5F53\u524D\u65F6\u95F4\u5B57\u4F53" },
  "settings.compactCurrentTimeFontFamilyDesc": { en: "CSS font-family for the current time display.", zh: "\u5F53\u524D\u65F6\u95F4\u663E\u793A\u7684 CSS font-family\u3002" },
  "settings.compactTimerFontFamily": { en: "Timer font", zh: "\u8BA1\u65F6\u5668\u5B57\u4F53" },
  "settings.compactTimerFontFamilyDesc": { en: "CSS font-family for the timer display.", zh: "\u8BA1\u65F6\u5668\u663E\u793A\u7684 CSS font-family\u3002" },
  "settings.language": { en: "Language", zh: "\u8BED\u8A00" },
  "settings.projects": { en: "Projects", zh: "\u9879\u76EE" },
  "settings.addProject": { en: "Add project", zh: "\u6DFB\u52A0\u9879\u76EE" },
  "panel.projectPlaceholder": { en: "Project", zh: "\u9879\u76EE" },
  // Main / Notices / Commands
  "cmd.startPause": { en: "Tomato: Start / Pause", zh: "\u756A\u8304\u949F\uFF1A\u5F00\u59CB / \u6682\u505C" },
  "cmd.reset": { en: "Tomato: Reset", zh: "\u756A\u8304\u949F\uFF1A\u91CD\u7F6E" },
  "cmd.open": { en: "Tomato: Open panel", zh: "\u756A\u8304\u949F\uFF1A\u6253\u5F00\u9762\u677F" },
  "cmd.modePomodoro": { en: "Tomato: Switch to Pomodoro", zh: "\u756A\u8304\u949F\uFF1A\u5207\u6362\u5230\u756A\u8304\u949F" },
  "cmd.modeStopwatch": { en: "Tomato: Switch to Stopwatch", zh: "\u756A\u8304\u949F\uFF1A\u5207\u6362\u5230\u6B63\u8BA1\u65F6" },
  "cmd.modeCountdown": { en: "Tomato: Switch to Countdown", zh: "\u756A\u8304\u949F\uFF1A\u5207\u6362\u5230\u5012\u8BA1\u65F6" },
  "notice.tomatoDone": { en: "\u{1F345} Tomato done! Time to rest.", zh: "\u{1F345} \u756A\u8304\u949F\u5B8C\u6210\uFF01\u8BE5\u4F11\u606F\u4E86\u3002" },
  "notice.stopwatchStopped": { en: "\u23F1\uFE0F Stopwatch stopped.", zh: "\u23F1\uFE0F \u6B63\u8BA1\u65F6\u5DF2\u505C\u6B62\u3002" },
  "notice.countdownFinished": { en: "\u23F3 Countdown finished!", zh: "\u23F3 \u5012\u8BA1\u65F6\u7ED3\u675F\uFF01" },
  "notice.breakOver": { en: "\u2600\uFE0F Break over. Back to focus!", zh: "\u2600\uFE0F \u4F11\u606F\u7ED3\u675F\uFF0C\u7EE7\u7EED\u4E13\u6CE8\uFF01" },
  "notice.title.tomatoDone": { en: "\u{1F345} Tomato done!", zh: "\u{1F345} \u756A\u8304\u949F\u5B8C\u6210\uFF01" },
  "notice.title.stopwatchStopped": { en: "\u23F1\uFE0F Stopwatch stopped!", zh: "\u23F1\uFE0F \u6B63\u8BA1\u65F6\u5DF2\u505C\u6B62\uFF01" },
  "notice.title.countdownFinished": { en: "\u23F3 Countdown finished!", zh: "\u23F3 \u5012\u8BA1\u65F6\u7ED3\u675F\uFF01" },
  "notice.title.breakOver": { en: "\u2600\uFE0F Break over!", zh: "\u2600\uFE0F \u4F11\u606F\u7ED3\u675F\uFF01" },
  "notice.body.rest": { en: "Time to take a break.", zh: "\u8BE5\u4F11\u606F\u4E00\u4E0B\u4E86\u3002" },
  "notice.body.sessionLogged": { en: "Session logged.", zh: "\u5DF2\u8BB0\u5F55\u4F1A\u8BDD\u3002" },
  "notice.body.timeUp": { en: "Time is up.", zh: "\u65F6\u95F4\u5230\u4E86\u3002" },
  "notice.body.backToFocus": { en: "Back to focus!", zh: "\u7EE7\u7EED\u4E13\u6CE8\uFF01" },
  "notice.invalidTimeFormat": { en: "Invalid time format", zh: "\u65F6\u95F4\u683C\u5F0F\u65E0\u6548" },
  "notice.invalidDuration": { en: "Invalid duration", zh: "\u65F6\u957F\u65E0\u6548" },
  "notice.logWriteFailed": { en: "Failed to write log", zh: "\u65E5\u5FD7\u5199\u5165\u5931\u8D25" }
};
function t(key, lang) {
  const entry = dict[key];
  if (!entry) return key;
  return entry[lang] ?? entry["en"] ?? key;
}
function tf(key, lang, vars) {
  let text = t(key, lang);
  for (const [k, v] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return text;
}

// src/services/notification.ts
var NotificationService = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  send(title, body) {
    if (!this.plugin.settings.enableOsNotification) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification(title, { body, silent: true });
  }
  beep() {
    if (!this.plugin.settings.enableSound) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(1e-3, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch {
    }
  }
};

// src/services/recovery.ts
var RECOVERY_INTERVAL_MS = 1e4;
var RecoveryService = class {
  constructor(plugin) {
    this.plugin = plugin;
    this.timer = null;
  }
  get recoveryPath() {
    return `${this.plugin.manifest.dir}/recovery.json`;
  }
  startAutoSave() {
    this.stopAutoSave();
    this.timer = window.setInterval(() => {
      void this.save();
    }, RECOVERY_INTERVAL_MS);
  }
  stopAutoSave() {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
  async save() {
    try {
      const data = this.plugin.timer.getRecoveryData();
      await this.plugin.app.vault.adapter.write(this.recoveryPath, JSON.stringify(data, null, 2));
    } catch {
    }
  }
  async load() {
    try {
      const raw = await this.plugin.app.vault.adapter.read(this.recoveryPath);
      const data = JSON.parse(raw);
      if (data && typeof data.isRunning === "boolean") {
        this.plugin.timer.restoreFromRecovery(data);
      }
    } catch {
    }
  }
};

// src/main.ts
var TomatoPlugin = class extends import_obsidian6.Plugin {
  t(key) {
    return t(key, this.settings.language);
  }
  tf(key, vars) {
    return tf(key, this.settings.language, vars);
  }
  async onload() {
    await this.loadSettings();
    this.timer = new TomatoTimer({
      workMinutes: this.settings.workMinutes,
      shortBreakMinutes: this.settings.shortBreakMinutes,
      longBreakMinutes: this.settings.longBreakMinutes,
      cycles: this.settings.cycles,
      autoStartNextPhase: this.settings.autoStartNextPhase,
      countdownMinutes: this.settings.countdownMinutes
    });
    this.timer.onTick((s) => this.onTick(s));
    this.timer.onPhaseComplete((c, n, d) => {
      void this.onPhaseComplete(c, n, d);
    });
    this.notificationService = new NotificationService(this);
    this.recoveryService = new RecoveryService(this);
    await this.recoveryService.load();
    this.recoveryService.startAutoSave();
    this.registerDomEvent(window, "beforeunload", () => {
      if (this.timer.getState().isRunning) {
        void this.recoveryService.save();
      }
    });
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    this.registerView(VIEW_TYPE_Tomato, (leaf) => new TomatoTimerView(leaf, this));
    this.registerView(VIEW_TYPE_Tomato_Compact, (leaf) => new TomatoTimerCompactView(leaf, this));
    this.addRibbonIcon("timer", this.t("panel.title"), () => {
      void this.activateView();
    });
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("Tomato-statusbar");
    this.statusBarEl.addClass("Tomato-clickable");
    this.registerDomEvent(this.statusBarEl, "click", () => this.activateView());
    this.refreshStatusBar({ phase: "idle", remainingSeconds: 0, elapsedSeconds: 0, isRunning: false, mode: "pomodoro" });
    this.toggleStatusBar();
    this.addCommand({
      id: "start-pause",
      name: this.t("cmd.startPause"),
      callback: () => {
        const s = this.timer.getState();
        if (s.phase === "idle") this.timer.start();
        else if (s.isRunning) this.timer.pause();
        else this.timer.resume();
      }
    });
    this.addCommand({ id: "reset", name: this.t("cmd.reset"), callback: () => this.timer.reset() });
    this.addCommand({ id: "open", name: this.t("cmd.open"), callback: () => this.activateView() });
    this.addCommand({
      id: "mode-pomodoro",
      name: this.t("cmd.modePomodoro"),
      callback: () => {
        this.timer.setMode("pomodoro");
        this.refreshAllViews();
      }
    });
    this.addCommand({
      id: "mode-stopwatch",
      name: this.t("cmd.modeStopwatch"),
      callback: () => {
        this.timer.setMode("stopwatch");
        this.refreshAllViews();
      }
    });
    this.addCommand({
      id: "mode-countdown",
      name: this.t("cmd.modeCountdown"),
      callback: () => {
        this.timer.setMode("countdown");
        this.timer.setCountdownMinutes(this.settings.countdownMinutes);
        this.refreshAllViews();
      }
    });
    this.registerEvent(this.app.vault.on("modify", (file) => {
      const folder = (0, import_obsidian6.normalizePath)(this.settings.logFolder);
      if ((0, import_obsidian6.normalizePath)(file.path).startsWith(folder + "/")) {
        this.refreshLogViews();
      }
    }));
    this.addSettingTab(new TomatoSettingTab(this.app, this));
  }
  onunload() {
    void this.recoveryService.save();
    this.recoveryService.stopAutoSave();
    this.timer.destroy();
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  applySettings() {
    this.timer.updateSettings({
      workMinutes: this.settings.workMinutes,
      shortBreakMinutes: this.settings.shortBreakMinutes,
      longBreakMinutes: this.settings.longBreakMinutes,
      cycles: this.settings.cycles,
      autoStartNextPhase: this.settings.autoStartNextPhase,
      countdownMinutes: this.settings.countdownMinutes
    });
    this.toggleStatusBar();
    this.refreshAllViews();
    this.refreshStatusBar(this.timer.getState());
  }
  toggleStatusBar() {
    this.statusBarEl.style.display = this.settings.showStatusBar ? "" : "none";
  }
  /** Open compact panel (default) */
  async activateView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_Tomato_Compact);
    if (existing.length > 0) {
      void workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_Tomato_Compact, active: true });
      void workspace.revealLeaf(leaf);
    }
  }
  /** Open full panel in the main tab area */
  async activateFullView() {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE_Tomato);
    if (existing.length > 0) {
      void workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE_Tomato, active: true });
      void workspace.revealLeaf(leaf);
    }
  }
  refreshAllViews() {
    const state = this.timer.getState();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato)) {
      if (leaf.view instanceof TomatoTimerView) leaf.view.updateTimerUI(state);
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato_Compact)) {
      if (leaf.view instanceof TomatoTimerCompactView) leaf.view.updateTimerUI(state);
    }
  }
  refreshLogViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato)) {
      if (leaf.view instanceof TomatoTimerView) void leaf.view.refreshTabContent();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_Tomato_Compact)) {
      if (leaf.view instanceof TomatoTimerCompactView) void leaf.view.refreshTodayMinutes();
    }
  }
  onTick(state) {
    this.refreshStatusBar(state);
    this.refreshAllViews();
  }
  async onPhaseComplete(completed, _next, durationMinutes) {
    const noticeMap = {
      work: { msg: "notice.tomatoDone", title: "notice.title.tomatoDone", body: "notice.body.rest" },
      stopwatch: { msg: "notice.stopwatchStopped", title: "notice.title.stopwatchStopped", body: "notice.body.sessionLogged" },
      countdown: { msg: "notice.countdownFinished", title: "notice.title.countdownFinished", body: "notice.body.timeUp" },
      shortBreak: { msg: "notice.breakOver", title: "notice.title.breakOver", body: "notice.body.backToFocus" },
      longBreak: { msg: "notice.breakOver", title: "notice.title.breakOver", body: "notice.body.backToFocus" }
    };
    const n = noticeMap[completed] ?? noticeMap.shortBreak;
    new import_obsidian6.Notice(this.t(n.msg), 4e3);
    this.notificationService.send(this.t(n.title), this.t(n.body));
    this.notificationService.beep();
    if (completed === "work" || completed === "stopwatch" || completed === "countdown") {
      try {
        await appendEntry(this.app, this.settings, {
          date: this.timer.getSessionStartDate(),
          startTime: this.timer.getSessionStartTime(),
          endTime: nowTimeString(),
          duration: durationMinutes,
          mode: this.timer.getSessionStartMode(),
          taskName: this.buildLogTaskName()
        });
      } catch (e) {
        new import_obsidian6.Notice(`${this.t("notice.logWriteFailed")}: ${e instanceof Error ? e.message : String(e)}`, 6e3);
      }
      if (this.settings.openLogOnComplete) {
        await this.openLogForEditing();
      }
      this.refreshLogViews();
      if (completed === "stopwatch" || completed === "countdown") {
        this.timer.reset();
        this.timer.setTaskName("");
        this.timer.setCurrentProject("");
        this.refreshAllViews();
      }
    }
  }
  async openLogForEditing() {
    const path = (0, import_obsidian6.normalizePath)(`${this.settings.logFolder}/${todayString()}.md`);
    const file = this.app.vault.getFileByPath(path);
    if (!(file instanceof import_obsidian6.TFile)) return;
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file);
    const editor = this.app.workspace.activeEditor?.editor;
    if (editor) {
      const lastLine = editor.lastLine();
      editor.setCursor({ line: lastLine, ch: editor.getLine(lastLine).length });
      editor.focus();
    }
  }
  buildLogTaskName() {
    const project = this.timer.getCurrentProject();
    const task = this.timer.getTaskName();
    if (project) {
      return `tomato_project\uFF1A${project} ${task}`;
    }
    return task;
  }
  refreshStatusBar(state) {
    const emoji = phaseEmoji(state.phase);
    if (state.phase === "idle") {
      this.statusBarEl.setText(`${emoji} --`);
      return;
    }
    const displaySec = state.mode === "stopwatch" ? state.elapsedSeconds : state.remainingSeconds;
    const m = String(Math.floor(displaySec / 60)).padStart(2, "0");
    const s = String(displaySec % 60).padStart(2, "0");
    this.statusBarEl.setText(`${emoji} ${m}:${s}${state.isRunning ? "" : " \u23F8"}`);
  }
};
function phaseEmoji(phase) {
  switch (phase) {
    case "work":
      return "\u{1F345}";
    case "shortBreak":
      return "\u2615";
    case "longBreak":
      return "\u{1F6CC}";
    case "stopwatch":
      return "\u23F1\uFE0F";
    case "countdown":
      return "\u23F3";
    default:
      return "\u23F1\uFE0F";
  }
}
