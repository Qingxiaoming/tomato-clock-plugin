import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, useCallback } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, TextInput, ScrollView, Alert, Switch } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { documentDirectory } from 'expo-file-system';
import { TomatoTimer, type TimerState, type TimerMode } from './src/services/timer';
import { SyncService } from './src/services/sync';
import { LocalFileAdapter, WebDAVAdapter } from './src/services/syncAdapter';

const SETTINGS = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cycles: 4,
  autoStartNextPhase: false,
  countdownMinutes: 10,
};

const PROJECTS = [
  { name: '工作', color: '#3b82f6' },
  { name: '学习', color: '#10b981' },
  { name: '生活', color: '#f59e0b' },
  { name: '娱乐', color: '#ef4444' },
];

const WEBDAV_CONFIG_KEY = '@tomato_webdav_config';

interface WebDAVConfig {
  enabled: boolean;
  url: string;
  username: string;
  password: string;
  filePath: string;
}

export default function App() {
  const timerRef = useRef(new TomatoTimer(SETTINGS));
  const syncRef = useRef<SyncService | null>(null);
  const [state, setState] = useState<TimerState>(timerRef.current.getState());

  const [webdavConfig, setWebdavConfig] = useState<WebDAVConfig>({
    enabled: false,
    url: 'https://dav.jianguoyun.com/dav/',
    username: '',
    password: '',
    filePath: '/Obsidian/Tomato Sync.md',
  });
  const [showSettings, setShowSettings] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');

  useEffect(() => {
    const timer = timerRef.current;
    timer.onTick(s => setState(s));
    timer.onPhaseComplete((completed, _next, durationMin) => {
      if (completed === 'work' || completed === 'stopwatch' || completed === 'countdown') {
        const entry = {
          date: timer.getSessionStartDate(),
          startTime: timer.getSessionStartTime(),
          endTime: timeNow(),
          duration: durationMin,
          mode: timer.getSessionStartMode(),
          taskName: buildLogTaskName(timer.getCurrentProject(), timer.getTaskName()),
        };
        syncRef.current?.logPhaseComplete(completed, _next, durationMin, entry);
      }
    });

    const sync = new SyncService(timer);
    syncRef.current = sync;

    // Load WebDAV config and init
    AsyncStorage.getItem(WEBDAV_CONFIG_KEY).then(raw => {
      if (raw) {
        try {
          const cfg = JSON.parse(raw) as WebDAVConfig;
          setWebdavConfig(cfg);
          if (cfg.enabled && cfg.url && cfg.username && cfg.password) {
            sync.setAdapter(new WebDAVAdapter(cfg.url, cfg.username, cfg.password, cfg.filePath));
          }
        } catch {
          // ignore
        }
      }
      return sync.init();
    }).catch(e => {
      console.error('Sync init failed:', e);
      setSyncStatus('error');
    });

    return () => {
      sync.destroy();
      timer.destroy();
    };
  }, []);

  const saveWebDAVConfig = useCallback(async (cfg: WebDAVConfig) => {
    setWebdavConfig(cfg);
    await AsyncStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(cfg));
    const sync = syncRef.current;
    if (!sync) return;

    if (cfg.enabled && cfg.url && cfg.username && cfg.password) {
      sync.setAdapter(new WebDAVAdapter(cfg.url, cfg.username, cfg.password, cfg.filePath));
      setSyncStatus('syncing');
      try {
        await sync.loadFromSyncFile();
        setSyncStatus('idle');
      } catch (e) {
        Alert.alert('WebDAV 连接失败', String(e));
        setSyncStatus('error');
      }
    } else {
      const dir = (documentDirectory || '').replace(/\/?$/, '/');
      const defaultUri = dir + encodeURIComponent('Tomato Sync.md');
      sync.setAdapter(new LocalFileAdapter(defaultUri));
    }
  }, []);

  const handleAction = useCallback(() => {
    const timer = timerRef.current;
    const sync = syncRef.current;
    if (state.phase === 'idle') {
      timer.start();
      const ns = timer.getState();
      sync?.logOp('start', { mode: ns.mode, phase: ns.phase, project: ns.currentProject, taskName: ns.taskName, countdownSec: ns.totalPhaseSeconds, sessionDate: timer.getSessionStartDate(), sessionTime: timer.getSessionStartTime() });
    } else if (state.status === 'running') {
      timer.pause();
      sync?.logOp('pause', {});
    } else {
      timer.resume();
      sync?.logOp('resume', {});
    }
  }, [state.phase, state.status]);

  const handleReset = useCallback(() => {
    timerRef.current.reset();
    syncRef.current?.logOp('stop', {});
  }, []);

  const handleSkip = useCallback(() => {
    timerRef.current.skip();
    syncRef.current?.logOp('skip', {});
  }, []);

  const handleModeChange = useCallback((mode: TimerMode) => {
    timerRef.current.setMode(mode);
    syncRef.current?.logOp('set_mode', { mode });
  }, []);

  const handleProjectChange = useCallback((project: string) => {
    timerRef.current.setCurrentProject(project);
    syncRef.current?.logOp('set_project', { project });
  }, []);

  const handleTaskChange = useCallback((task: string) => {
    timerRef.current.setTaskName(task);
    syncRef.current?.logOp('set_task', { taskName: task });
  }, []);

  const pickLocalSyncFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/markdown', copyToCacheDirectory: true });
      if (!result.canceled && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        const sync = syncRef.current;
        if (sync) {
          sync.setAdapter(new LocalFileAdapter(uri));
          await sync.loadFromSyncFile();
        }
      }
    } catch (e) {
      Alert.alert('选择文件失败', String(e));
    }
  };

  const shareSyncFile = async () => {
    const sync = syncRef.current;
    if (!sync) return;
    // For WebDAV, we can't share directly; for local file we can
    // This is a simplified share
    Alert.alert('提示', '分享功能仅支持本地文件模式');
  };

  const mainBtnText = state.phase === 'idle'
    ? '开始'
    : state.status === 'running'
      ? '暂停'
      : '继续';

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="auto" />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>番茄钟</Text>
            <TouchableOpacity onPress={() => setShowSettings(!showSettings)}>
              <Text style={styles.headerSetting}>{showSettings ? '返回' : '设置'}</Text>
            </TouchableOpacity>
          </View>

          {showSettings ? (
            <SettingsPanel
              config={webdavConfig}
              onChange={saveWebDAVConfig}
              syncStatus={syncStatus}
              onPickLocalFile={pickLocalSyncFile}
            />
          ) : (
            <>
              {/* Mode selector */}
              <View style={styles.modeRow}>
                {(['pomodoro', 'stopwatch', 'countdown'] as TimerMode[]).map(m => (
                  <TouchableOpacity
                    key={m}
                    style={[styles.modeBtn, state.mode === m && styles.modeBtnActive]}
                    onPress={() => handleModeChange(m)}
                  >
                    <Text style={[styles.modeBtnText, state.mode === m && styles.modeBtnTextActive]}>
                      {m === 'pomodoro' ? '番茄钟' : m === 'stopwatch' ? '正计时' : '倒计时'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Timer display */}
              <View style={styles.timerWrap}>
                <Text style={styles.timerText}>
                  {state.mode === 'stopwatch'
                    ? fmtElapsed(state.remainingSeconds)
                    : fmtTime(state.remainingSeconds)}
                </Text>
                <Text style={styles.timerSub}>
                  {state.phase === 'idle'
                    ? '准备开始'
                    : state.phase === 'work'
                      ? `专注 · 第 ${state.cycleIndex} 个`
                      : state.phase === 'shortBreak'
                        ? '短休息'
                        : state.phase === 'longBreak'
                          ? '长休息'
                          : state.phase === 'countdown'
                            ? '倒计时'
                            : '正计时'}
                </Text>
              </View>

              {/* Project & Task */}
              <View style={styles.inputRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.projectScroll}>
                  <TouchableOpacity
                    style={[styles.projectChip, state.currentProject === '' && styles.projectChipActive]}
                    onPress={() => handleProjectChange('')}
                  >
                    <Text style={[styles.projectChipText, state.currentProject === '' && styles.projectChipTextActive]}>无项目</Text>
                  </TouchableOpacity>
                  {PROJECTS.map(p => (
                    <TouchableOpacity
                      key={p.name}
                      style={[styles.projectChip, state.currentProject === p.name && { backgroundColor: p.color + '22', borderColor: p.color }]}
                      onPress={() => handleProjectChange(p.name)}
                    >
                      <View style={[styles.projectDot, { backgroundColor: p.color }]} />
                      <Text style={[styles.projectChipText, state.currentProject === p.name && { color: p.color }]}>{p.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
              <TextInput
                style={styles.taskInput}
                placeholder="任务名称"
                value={state.taskName}
                onChangeText={handleTaskChange}
              />

              {/* Controls */}
              <View style={styles.controls}>
                <TouchableOpacity style={styles.mainBtn} onPress={handleAction}>
                  <Text style={styles.mainBtnText}>{mainBtnText}</Text>
                </TouchableOpacity>
                {state.phase !== 'idle' && (
                  <View style={styles.secondaryRow}>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={handleReset}>
                      <Text style={styles.secondaryBtnText}>停止</Text>
                    </TouchableOpacity>
                    {state.mode !== 'countdown' && (
                      <TouchableOpacity style={styles.secondaryBtn} onPress={handleSkip}>
                        <Text style={styles.secondaryBtnText}>跳过</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* Sync status */}
              <View style={styles.syncStatusRow}>
                <Text style={styles.syncStatusLabel}>同步</Text>
                <Text style={[styles.syncStatusValue, syncStatus === 'error' && { color: '#ef4444' }]}>
                  {syncStatus === 'idle' ? '正常' : syncStatus === 'syncing' ? '同步中...' : '连接失败'}
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function SettingsPanel({ config, onChange, syncStatus, onPickLocalFile }: {
  config: WebDAVConfig;
  onChange: (cfg: WebDAVConfig) => void;
  syncStatus: 'idle' | 'syncing' | 'error';
  onPickLocalFile: () => void;
}) {
  const [local, setLocal] = useState(config);

  return (
    <View style={styles.settingsPanel}>
      <Text style={styles.settingsHeading}>同步设置</Text>

      <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>使用 WebDAV（坚果云）</Text>
        <Switch value={local.enabled} onValueChange={v => setLocal({ ...local, enabled: v })} />
      </View>

      {local.enabled ? (
        <>
          <Text style={styles.settingHint}>服务器地址（坚果云默认已填好）</Text>
          <TextInput
            style={styles.settingInput}
            value={local.url}
            onChangeText={v => setLocal({ ...local, url: v })}
            placeholder="https://dav.jianguoyun.com/dav/"
            autoCapitalize="none"
          />
          <Text style={styles.settingHint}>用户名（邮箱）</Text>
          <TextInput
            style={styles.settingInput}
            value={local.username}
            onChangeText={v => setLocal({ ...local, username: v })}
            placeholder="your@email.com"
            autoCapitalize="none"
          />
          <Text style={styles.settingHint}>应用密码（不是登录密码）</Text>
          <TextInput
            style={styles.settingInput}
            value={local.password}
            onChangeText={v => setLocal({ ...local, password: v })}
            placeholder="在坚果云网页版生成"
            secureTextEntry
            autoCapitalize="none"
          />
          <Text style={styles.settingHint}>文件路径（相对于 WebDAV 根目录）</Text>
          <TextInput
            style={styles.settingInput}
            value={local.filePath}
            onChangeText={v => setLocal({ ...local, filePath: v })}
            placeholder="/Obsidian/Tomato Sync.md"
            autoCapitalize="none"
          />
          <Text style={styles.settingTip}>
            提示：坚果云应用密码需要在网页版「安全选项」中生成。{'\n'}
            确保电脑端的 Obsidian vault 也同步到同一个坚果云目录。
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.settingHint}>使用本地文件模式</Text>
          <TouchableOpacity style={styles.settingBtn} onPress={onPickLocalFile}>
            <Text style={styles.settingBtnText}>选择本地同步文件</Text>
          </TouchableOpacity>
        </>
      )}

      <TouchableOpacity style={styles.saveBtn} onPress={() => onChange(local)}>
        <Text style={styles.saveBtnText}>保存并应用</Text>
      </TouchableOpacity>

      <Text style={styles.settingStatus}>当前状态: {syncStatus === 'idle' ? '正常' : syncStatus === 'syncing' ? '同步中...' : '连接失败'}</Text>
    </View>
  );
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function timeNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function buildLogTaskName(project: string, task: string): string {
  if (project && task) return `${task} tomato_project: ${project}`;
  return task || project || '未命名';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  scroll: { padding: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  headerSetting: { fontSize: 14, color: '#3b82f6' },
  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  modeBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#e5e7eb' },
  modeBtnActive: { backgroundColor: '#3b82f6' },
  modeBtnText: { fontSize: 14, color: '#4b5563' },
  modeBtnTextActive: { color: '#fff', fontWeight: '600' },
  timerWrap: { alignItems: 'center', marginBottom: 20 },
  timerText: { fontSize: 64, fontWeight: '200', color: '#111827', fontVariant: ['tabular-nums'] },
  timerSub: { fontSize: 16, color: '#6b7280', marginTop: 4 },
  inputRow: { marginBottom: 8 },
  projectScroll: { flexGrow: 0 },
  projectChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#d1d5db', marginRight: 8, backgroundColor: '#fff' },
  projectChipActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  projectChipText: { fontSize: 13, color: '#374151' },
  projectChipTextActive: { color: '#3b82f6', fontWeight: '600' },
  projectDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  taskInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: '#fff', marginBottom: 16 },
  controls: { alignItems: 'center', marginBottom: 20 },
  mainBtn: { backgroundColor: '#3b82f6', paddingHorizontal: 48, paddingVertical: 14, borderRadius: 28, minWidth: 160, alignItems: 'center' },
  mainBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  secondaryRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  secondaryBtn: { backgroundColor: '#e5e7eb', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },
  secondaryBtnText: { color: '#374151', fontSize: 14 },
  todayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 12 },
  todayLabel: { fontSize: 14, color: '#6b7280' },
  todayValue: { fontSize: 16, fontWeight: '600', color: '#111827' },
  syncStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 12 },
  syncStatusLabel: { fontSize: 14, color: '#6b7280' },
  syncStatusValue: { fontSize: 14, fontWeight: '600', color: '#10b981' },
  logSection: { backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  logHeading: { fontSize: 14, fontWeight: '600', color: '#111827', marginBottom: 10 },
  logItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  logTime: { fontSize: 12, color: '#6b7280', width: 100 },
  logDuration: { fontSize: 12, color: '#3b82f6', width: 50, textAlign: 'center' },
  logTask: { flex: 1, fontSize: 13, color: '#374151' },

  // Settings
  settingsPanel: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  settingsHeading: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 16 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  settingLabel: { fontSize: 15, color: '#374151' },
  settingHint: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  settingInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, marginBottom: 12 },
  settingTip: { fontSize: 12, color: '#6b7280', lineHeight: 18, marginBottom: 16 },
  settingBtn: { backgroundColor: '#f3f4f6', paddingVertical: 10, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  settingBtnText: { fontSize: 14, color: '#374151' },
  saveBtn: { backgroundColor: '#3b82f6', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  settingStatus: { fontSize: 12, color: '#6b7280', marginTop: 12, textAlign: 'center' },
});
