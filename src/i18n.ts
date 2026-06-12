export type Lang = 'en' | 'zh';

const dict: Record<string, Record<Lang, string>> = {
    // Panel
    'panel.title': { en: 'Tomato', zh: '番茄钟' },
    'panel.mode.pomodoro': { en: '🍅 Pomodoro', zh: '🍅 番茄钟' },
    'panel.mode.stopwatch': { en: '⏱️ Stopwatch', zh: '⏱️ 正计时' },
    'panel.mode.countdown': { en: '⏳ Countdown', zh: '⏳ 倒计时' },
    'panel.taskPlaceholder': { en: 'Task name...', zh: '本次项目...' },
    'panel.countdownLabel': { en: 'Minutes:', zh: '分钟：' },
    'panel.btn.start': { en: 'Start', zh: '开始' },
    'panel.btn.pause': { en: 'Pause', zh: '暂停' },
    'panel.btn.resume': { en: 'Resume', zh: '继续' },
    'panel.btn.stop': { en: 'Stop', zh: '停止' },
    'panel.btn.skip': { en: 'Skip', zh: '跳过' },
    'panel.btn.reset': { en: 'Reset', zh: '重置' },
    'panel.status.ready': { en: 'Ready', zh: '准备就绪' },
    'panel.status.paused': { en: 'Paused', zh: '已暂停' },
    'panel.status.focus': { en: 'Focus', zh: '专注' },
    'panel.status.shortBreak': { en: 'Short Break', zh: '短休息' },
    'panel.status.longBreak': { en: 'Long Rest', zh: '长休息' },
    'panel.status.stopwatch': { en: 'Stopwatch', zh: '正计时' },
    'panel.status.countdown': { en: 'Countdown', zh: '倒计时' },
    'panel.todayTotal': { en: 'Today:', zh: '今日：' },
    'panel.history.today': { en: 'Today', zh: '今天' },
    'panel.history.noTomatos': { en: 'No Tomatos yet', zh: '还没有番茄钟记录' },
    'panel.history.thisWeek': { en: 'This week', zh: '本周' },
    'panel.history.total': { en: '🍅 {n} total', zh: '🍅 共 {n} 个' },

    // Settings
    'settings.heading': { en: 'Tomato Clock', zh: '番茄钟' },
    'settings.durations': { en: 'Durations', zh: '时长' },
    'settings.workDuration': { en: 'Work duration (min)', zh: '工作时长（分钟）' },
    'settings.shortBreak': { en: 'Short break (min)', zh: '短休息（分钟）' },
    'settings.longBreak': { en: 'Long break (min)', zh: '长休息（分钟）' },
    'settings.cycles': { en: 'Cycles per set', zh: '每组循环数' },
    'settings.cyclesDesc': { en: 'Number of work sessions before a long break', zh: '长休息前的工作时段数' },
    'settings.countdownDuration': { en: 'Countdown duration (min)', zh: '倒计时时长（分钟）' },
    'settings.countdownDurationDesc': { en: 'Default duration for countdown mode', zh: '倒计时模式的默认时长' },
    'settings.behavior': { en: 'Behavior', zh: '行为' },
    'settings.autoStart': { en: 'Auto-start next phase', zh: '自动开始下一阶段' },
    'settings.autoStartDesc': { en: 'Automatically begin the next work or break session', zh: '自动开始下一个工作或休息时段' },
    'settings.sound': { en: 'Sound alert', zh: '声音提醒' },
    'settings.soundDesc': { en: 'Play a short beep when a phase ends', zh: '阶段结束时播放短提示音' },
    'settings.osNotification': { en: 'OS notification', zh: '系统通知' },
    'settings.osNotificationDesc': { en: 'Show a system notification when sessions complete — useful when Obsidian is in the background. Grant permission when prompted.', zh: '阶段完成时显示系统通知——Obsidian 在后台时很有用。请在提示时授予权限。' },
    'settings.log': { en: 'Log', zh: '日志' },
    'settings.logFile': { en: 'Log file path', zh: '日志文件路径' },
    'settings.logFileDesc': { en: 'Markdown file where completed Tomatos are appended. E.g. Tomato Log.md or Journal/Tomato Log.md', zh: '记录已完成番茄钟的 Markdown 文件。例如：Tomato Log.md 或 Journal/Tomato Log.md' },
    'settings.language': { en: 'Language', zh: '语言' },

    // Main / Notices / Commands
    'cmd.startPause': { en: 'Tomato: Start / Pause', zh: '番茄钟：开始 / 暂停' },
    'cmd.reset': { en: 'Tomato: Reset', zh: '番茄钟：重置' },
    'cmd.open': { en: 'Tomato: Open panel', zh: '番茄钟：打开面板' },
    'cmd.modePomodoro': { en: 'Tomato: Switch to Pomodoro', zh: '番茄钟：切换到番茄钟' },
    'cmd.modeStopwatch': { en: 'Tomato: Switch to Stopwatch', zh: '番茄钟：切换到正计时' },
    'cmd.modeCountdown': { en: 'Tomato: Switch to Countdown', zh: '番茄钟：切换到倒计时' },
    'notice.tomatoDone': { en: '🍅 Tomato done! Time to rest.', zh: '🍅 番茄钟完成！该休息了。' },
    'notice.stopwatchStopped': { en: '⏱️ Stopwatch stopped.', zh: '⏱️ 正计时已停止。' },
    'notice.countdownFinished': { en: '⏳ Countdown finished!', zh: '⏳ 倒计时结束！' },
    'notice.breakOver': { en: '☀️ Break over. Back to focus!', zh: '☀️ 休息结束，继续专注！' },
    'notice.title.tomatoDone': { en: '🍅 Tomato done!', zh: '🍅 番茄钟完成！' },
    'notice.title.stopwatchStopped': { en: '⏱️ Stopwatch stopped!', zh: '⏱️ 正计时已停止！' },
    'notice.title.countdownFinished': { en: '⏳ Countdown finished!', zh: '⏳ 倒计时结束！' },
    'notice.title.breakOver': { en: '☀️ Break over!', zh: '☀️ 休息结束！' },
    'notice.body.rest': { en: 'Time to take a break.', zh: '该休息一下了。' },
    'notice.body.sessionLogged': { en: 'Session logged.', zh: '已记录会话。' },
    'notice.body.timeUp': { en: 'Time is up.', zh: '时间到了。' },
    'notice.body.backToFocus': { en: 'Back to focus!', zh: '继续专注！' },
};

export function t(key: string, lang: Lang): string {
    const entry = dict[key];
    if (!entry) return key;
    return entry[lang] ?? entry['en'] ?? key;
}

export function tf(key: string, lang: Lang, vars: Record<string, string | number>): string {
    let text = t(key, lang);
    for (const [k, v] of Object.entries(vars)) {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
    return text;
}
