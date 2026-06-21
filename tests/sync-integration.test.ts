import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { TimerSettings as TomatoTimerSettings } from '../src/timer';
import { TomatoTimer } from '../src/timer';
import { SyncService } from '../src/services/sync';
import { MemorySyncAdapter, setSharedAdapter } from './mocks/syncAdapter';

// mock Obsidian 同步适配器，让它内部转发到共享内存适配器
vi.mock('../src/sync/adapter', () => import('./mocks/syncAdapter'));

// Node 环境没有 window，但 src/timer.ts 里用了 window.setTimeout
(globalThis as any).window = globalThis;

// 静音 SyncService 里的 console.warn/error，避免测试输出被引擎警告刷屏
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// ==================== 设备封装：timer + sync 绑定 ====================
function createDevice(
    deviceId: string,
    settings: TomatoTimerSettings,
) {
    const timer = new TomatoTimer(settings);

    // 构造一个最小化的 mock plugin
    const plugin = {
        app: {
            vault: {
                on: vi.fn().mockReturnValue({ id: Math.random() }),
                offref: vi.fn(),
            },
        },
        settings: {
            syncDeviceId: deviceId,
            syncDir: 'timer-sync',
            syncRetentionDays: 0,
        },
        timer,
        saveSettings: vi.fn().mockResolvedValue(undefined),
    } as any;

    const service = new SyncService(plugin);

    // 记录最后一次 phaseComplete 的异步操作，方便测试等待
    let lastPhaseCompletePromise: Promise<void> = Promise.resolve();

    timer.onPhaseComplete((completed, next, durationMinutes) => {
        const entry = {
            date: timer.getSessionStartDate(),
            startTime: timer.getSessionStartTime(),
            endTime: new Date().toISOString(),
            duration: durationMinutes,
            mode: timer.getSessionStartMode(),
            taskName: timer.getTaskName(),
        };
        lastPhaseCompletePromise = service.logPhaseComplete(completed, next, durationMinutes, entry);
    });

    return { timer, service, plugin, getLastPhaseCompletePromise: () => lastPhaseCompletePromise };
}

async function syncPair(a: SyncService, b: SyncService) {
    await (a as any).engine.sync();
    await (b as any).engine.sync();
}

describe('多端同步集成测试 P1-P5', () => {
    let adapter: MemorySyncAdapter;
    const baseSettings: TomatoTimerSettings = {
        workMinutes: 1,
        shortBreakMinutes: 1,
        longBreakMinutes: 1,
        cycles: 4,
        autoStartNextPhase: false,
        countdownMinutes: 1,
    };

    beforeEach(() => {
        adapter = new MemorySyncAdapter();
        setSharedAdapter(adapter);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('P-01: A 开始 pomodoro，B 同步后停止，两端 idle', async () => {
        const devA = createDevice('device-A', baseSettings);
        const devB = createDevice('device-B', baseSettings);
        await devA.service.init();
        await devB.service.init();

        devA.timer.start();
        await devA.service.logOp('start', {
            mode: 'pomodoro',
            project: 'p1',
            taskName: 'task1',
        });
        await syncPair(devA.service, devB.service);

        expect(devA.timer.getState().status).toBe('running');
        expect(devB.timer.getState().status).toBe('running');

        devB.timer.stop();
        await devB.getLastPhaseCompletePromise();
        await syncPair(devA.service, devB.service);

        expect(devA.timer.getState().status).toBe('idle');
        expect(devB.timer.getState().status).toBe('idle');

        const ops = adapter.getAllOps();
        expect(ops.some(r => r.op === 'start')).toBe(true);
        expect(ops.some(r => r.op === 'proxy_end' || r.op === 'end')).toBe(true);
    });

    it('P-02: B 开始 pomodoro，A 同步后停止，两端 idle', async () => {
        const devA = createDevice('device-A', baseSettings);
        const devB = createDevice('device-B', baseSettings);
        await devA.service.init();
        await devB.service.init();

        devB.timer.start();
        await devB.service.logOp('start', {
            mode: 'pomodoro',
            project: 'p2',
            taskName: 'task2',
        });
        await syncPair(devA.service, devB.service);

        expect(devA.timer.getState().status).toBe('running');

        vi.advanceTimersByTime(1);
        devA.timer.stop();
        await devA.getLastPhaseCompletePromise();
        await syncPair(devA.service, devB.service);

        expect(devB.timer.getState().status).toBe('idle');
    });

    it('P-03: A 开始短 work，自然结束后 B 同步到 idle', async () => {
        const devA = createDevice('device-A', baseSettings);
        const devB = createDevice('device-B', baseSettings);
        await devA.service.init();
        await devB.service.init();

        devA.timer.start();
        await devA.service.logOp('start', {
            mode: 'pomodoro',
            project: 'p3',
            taskName: 'task3',
        });
        await syncPair(devA.service, devB.service);

        expect(devB.timer.getState().status).toBe('running');

        vi.advanceTimersByTime(60 * 1000 + 1000);
        await vi.advanceTimersByTimeAsync(0);
        await devA.getLastPhaseCompletePromise();

        await syncPair(devA.service, devB.service);

        expect(devA.timer.getState().status).toBe('idle');
        expect(devB.timer.getState().status).toBe('idle');
    });

    it('P-04: B 开始短 work，自然结束后 A 同步到 idle', async () => {
        const devA = createDevice('device-A', baseSettings);
        const devB = createDevice('device-B', baseSettings);
        await devA.service.init();
        await devB.service.init();

        devB.timer.start();
        await devB.service.logOp('start', {
            mode: 'pomodoro',
            project: 'p4',
            taskName: 'task4',
        });
        await syncPair(devA.service, devB.service);

        expect(devA.timer.getState().status).toBe('running');

        vi.advanceTimersByTime(60 * 1000 + 1000);
        await vi.advanceTimersByTimeAsync(0);
        await devB.getLastPhaseCompletePromise();

        await syncPair(devA.service, devB.service);

        expect(devA.timer.getState().status).toBe('idle');
        expect(devB.timer.getState().status).toBe('idle');
    });

    it('P-05: A 开始 stopwatch，B 停止后两端 idle', async () => {
        const devA = createDevice('device-A', baseSettings);
        const devB = createDevice('device-B', baseSettings);
        await devA.service.init();
        await devB.service.init();

        devA.timer.setMode('stopwatch');
        await devA.service.logOp('set_mode', { value: 'stopwatch' });
        await syncPair(devA.service, devB.service);

        devA.timer.start();
        await devA.service.logOp('start', {
            mode: 'stopwatch',
            project: 'p5',
            taskName: 'task5',
        });
        await syncPair(devA.service, devB.service);

        expect(devB.timer.getState().mode).toBe('stopwatch');
        expect(devB.timer.getState().status).toBe('running');

        devB.timer.stop();
        await devB.getLastPhaseCompletePromise();
        await syncPair(devA.service, devB.service);

        expect(devA.timer.getState().status).toBe('idle');
        expect(devB.timer.getState().status).toBe('idle');
    });
});

describe('并发/竞态测试 R', () => {
    let adapter: MemorySyncAdapter;
    const baseSettings: TomatoTimerSettings = {
        workMinutes: 1,
        shortBreakMinutes: 1,
        longBreakMinutes: 1,
        cycles: 4,
        autoStartNextPhase: false,
        countdownMinutes: 1,
    };

    beforeEach(() => {
        adapter = new MemorySyncAdapter();
        setSharedAdapter(adapter);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('R-01: 两端几乎同时开始，冲突后只剩一个 running session', async () => {
        const devA = createDevice('device-A', baseSettings);
        const devB = createDevice('device-B', baseSettings);
        await devA.service.init();
        await devB.service.init();

        // A、B 各自写 start op，模拟离线/并发开始
        devA.timer.start();
        await devA.service.logOp('start', { mode: 'pomodoro' });
        devB.timer.start();
        await devB.service.logOp('start', { mode: 'pomodoro' });

        // 双向同步，触发冲突解决
        await syncPair(devA.service, devB.service);
        // 多同步一次，让 end/proxy_end 生效
        await syncPair(devA.service, devB.service);

        // 最终两端状态应一致，且只剩一个 running session
        expect(devA.timer.getState().status).toBe('running');
        expect(devB.timer.getState().status).toBe('running');
        expect((devA.service as any).engine.getState().runningSessions.length).toBe(1);
        expect((devB.service as any).engine.getState().runningSessions.length).toBe(1);

        const ops = adapter.getAllOps();
        const starts = ops.filter(r => r.op === 'start');
        const ends = ops.filter(r => r.op === 'end' || r.op === 'proxy_end');
        expect(starts.length).toBe(2);
        expect(ends.length).toBe(1);
    });

    it('R-03: 两端几乎同时停止同一远程会话，最终 idle 且不重复写 end', async () => {
        const devA = createDevice('device-A', baseSettings);
        const devB = createDevice('device-B', baseSettings);
        await devA.service.init();
        await devB.service.init();

        // A 开始，B 同步到 running
        devA.timer.start();
        await devA.service.logOp('start', { mode: 'pomodoro' });
        await syncPair(devA.service, devB.service);

        expect(devB.timer.getState().status).toBe('running');

        // B 先停止（会写 proxy_end）
        devB.timer.stop();
        await devB.getLastPhaseCompletePromise();

        // 在 B 的 proxy_end 被 A 看到之前，A 也停止
        vi.advanceTimersByTime(1);
        devA.timer.stop();
        await devA.getLastPhaseCompletePromise();

        // 双向同步
        await syncPair(devA.service, devB.service);
        await syncPair(devA.service, devB.service);

        expect(devA.timer.getState().status).toBe('idle');
        expect(devB.timer.getState().status).toBe('idle');

        const ops = adapter.getAllOps();
        const ends = ops.filter(r => r.op === 'end' || r.op === 'proxy_end');
        expect(ends.length).toBeLessThanOrEqual(2);
    });
});

describe('生命周期测试 LC', () => {
    let adapter: MemorySyncAdapter;
    const baseSettings: TomatoTimerSettings = {
        workMinutes: 1,
        shortBreakMinutes: 1,
        longBreakMinutes: 1,
        cycles: 4,
        autoStartNextPhase: false,
        countdownMinutes: 1,
    };

    beforeEach(() => {
        adapter = new MemorySyncAdapter();
        setSharedAdapter(adapter);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('LC-01: A 冷启动时 B 正在运行，A 能正确镜像远程 session', async () => {
        const devA = createDevice('device-A', baseSettings);
        const devB = createDevice('device-B', baseSettings);
        await devA.service.init();
        await devB.service.init();

        // B 开始运行
        devB.timer.start();
        await devB.service.logOp('start', { mode: 'pomodoro' });
        await syncPair(devA.service, devB.service);

        expect(devA.timer.getState().status).toBe('running');
        const bStateBefore = (devB.service as any).engine.getState();
        const remoteSession = bStateBefore.runningSessions[0];
        expect(remoteSession).toBeDefined();

        // 模拟 A 杀进程重启：destroy 后重新创建同 deviceId 的 service
        devA.service.destroy();
        const devANew = createDevice('device-A', baseSettings);
        await devANew.service.init();
        await syncPair(devANew.service, devB.service);

        expect(devANew.timer.getState().status).toBe('running');
        const aStateAfter = (devANew.service as any).engine.getState();
        expect(aStateAfter.runningSessions.length).toBe(1);
        expect(aStateAfter.runningSessions[0].session).toBe(remoteSession.session);
    });
});
