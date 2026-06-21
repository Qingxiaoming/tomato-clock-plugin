#!/usr/bin/env node
/**
 * 番茄时钟多端同步模拟器
 *
 * 用法：
 *   node test.js [同步目录] <命令> [参数...]
 *
 * 默认同步目录为 test.js 同层级（上级目录）的 timer-sync 文件夹：
 *   d:\软件\yan\桌面\0V0燕小重的文库\姑且算作我的\.obsidian\plugins\timer-sync
 *
 * 示例：
 *   node test.js status
 *   node test.js start pomodoro
 *   node test.js config --mode=pomodoro --project=Demo --task=BugFix
 *   node test.js end
 *   node test.js proxy-end <deviceId> <sessionId>
 *   node test.js watch
 *   node test.js reset --force
 *   node test.js "D:/自定义/同步目录" status
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 中没有 __dirname，需要手动构造
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 默认同步目录：test.js 所在目录下的 timer-sync 文件夹
const DEFAULT_SYNC_DIR = path.resolve(__dirname, 'timer-sync');

const KNOWN_COMMANDS = new Set([
    'status',
    'start',
    'end',
    'proxy-end',
    'config',
    'watch',
    'reset',
]);

// ---- 工具函数 ----

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function nowISO() {
    return new Date().toISOString();
}

function opsDir(syncDir) {
    return path.join(syncDir, 'ops');
}

function statePath(syncDir) {
    return path.join(syncDir, 'state.json');
}

function metaPath(syncDir) {
    return path.join(syncDir, '.simulator-meta.json');
}

async function ensureDir(dir) {
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch {}
}

async function dirExists(dir) {
    try {
        const stat = await fs.stat(dir);
        return stat.isDirectory();
    } catch {
        return false;
    }
}

async function readFile(p, fallback = '') {
    try {
        return await fs.readFile(p, 'utf8');
    } catch {
        return fallback;
    }
}

async function readJson(p, fallback = null) {
    const raw = await readFile(p, '');
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.error('JSON 解析失败:', p, e.message);
        return fallback;
    }
}

async function loadMeta(syncDir) {
    return (await readJson(metaPath(syncDir), { deviceId: generateUUID(), seq: 0 })) || { deviceId: generateUUID(), seq: 0 };
}

async function saveMeta(syncDir, meta) {
    await fs.writeFile(metaPath(syncDir), JSON.stringify(meta, null, 2) + '\n');
}

async function appendOpsLine(syncDir, deviceId, record) {
    const file = path.join(opsDir(syncDir), `ops_${deviceId}.jsonl`);
    await ensureDir(opsDir(syncDir));
    let content = await readFile(file);
    if (content.length > 0 && !content.endsWith('\n')) content += '\n';
    content += JSON.stringify(record) + '\n';
    await fs.writeFile(file, content);
}

async function listOpsFiles(syncDir) {
    const dir = opsDir(syncDir);
    try {
        const files = await fs.readdir(dir);
        return files.filter(f => f.startsWith('ops_') && f.endsWith('.jsonl'));
    } catch (e) {
        if (e.code !== 'ENOENT') {
            console.error(`读取 ops 目录失败: ${dir}`, e.message);
        }
        return [];
    }
}

async function listSyncDirFiles(syncDir) {
    try {
        return await fs.readdir(syncDir);
    } catch (e) {
        return [];
    }
}

async function loadAllOps(syncDir) {
    const files = await listOpsFiles(syncDir);
    const result = [];
    for (const name of files) {
        const content = await readFile(path.join(opsDir(syncDir), name));
        const lines = content.split('\n');
        for (const raw of lines) {
            const trimmed = raw.trim();
            if (!trimmed) continue;
            try {
                result.push(JSON.parse(trimmed));
            } catch (e) {
                console.warn('非法 op 行:', trimmed);
            }
        }
    }
    return result;
}

function mergeAndSort(ops) {
    const byKey = new Map();
    for (const r of ops) {
        const key = `${r.device}:${r.seq}`;
        const existing = byKey.get(key);
        if (!existing || r.ts < existing.ts) {
            byKey.set(key, r);
        }
    }
    const records = Array.from(byKey.values());
    records.sort((a, b) => {
        if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
        if (a.device !== b.device) return a.device < b.device ? -1 : 1;
        return a.seq - b.seq;
    });
    return records;
}

function replay(ops) {
    const running = new Map();
    let mode, project, task;

    for (const op of ops) {
        const key = (d, s) => `${d}:${s}`;
        switch (op.op) {
            case 'start': {
                for (const [k, s] of running) {
                    if (s.device === op.device) running.delete(k);
                }
                const p = op.payload || {};
                running.set(key(op.device, op.session), {
                    device: op.device,
                    session: op.session,
                    startTs: op.ts,
                    tags: p.tags,
                    mode: p.mode,
                    countdownSec: p.countdownSec,
                    sessionDate: p.sessionDate,
                    sessionTime: p.sessionTime,
                });
                break;
            }
            case 'end': {
                running.delete(key(op.device, op.session));
                break;
            }
            case 'proxy_end': {
                const p = op.payload || {};
                if (p.targetDevice && p.targetSession) {
                    running.delete(key(p.targetDevice, p.targetSession));
                }
                break;
            }
            case 'config': {
                const p = op.payload || {};
                if (p.mode !== undefined) mode = p.mode;
                if (p.project !== undefined) project = p.project;
                if (p.task !== undefined) task = p.task;
                break;
            }
        }
    }

    const runningSessions = Array.from(running.values()).sort((a, b) => {
        if (a.startTs !== b.startTs) return a.startTs < b.startTs ? -1 : 1;
        if (a.device !== b.device) return a.device < b.device ? -1 : 1;
        return a.session < b.session ? -1 : 1;
    });

    let status = 'idle';
    if (runningSessions.length === 1) status = 'running';
    else if (runningSessions.length > 1) status = 'conflict';

    return { status, runningSessions, mode, project, task };
}

async function printStatus(syncDir) {
    const dir = opsDir(syncDir);
    const files = await listOpsFiles(syncDir);
    console.log('\n===== 同步目录:', syncDir, '=====');
    console.log('ops 子目录:', dir);
    console.log('ops 文件数:', files.length);

    if (files.length === 0) {
        const allFiles = await listSyncDirFiles(syncDir);
        if (allFiles.length > 0) {
            console.log('同步目录下实际文件/文件夹:', allFiles.join(', '));
        } else {
            console.log('同步目录下没有任何文件');
        }
    }

    for (const name of files) {
        const content = await readFile(path.join(opsDir(syncDir), name));
        const lines = content.split('\n').filter(Boolean);
        console.log(`\n--- ${name} (${lines.length} 行) ---`);
        for (const line of lines) {
            console.log(line);
        }
    }

    const ops = await loadAllOps(syncDir);
    const sorted = mergeAndSort(ops);
    const derived = replay(sorted);
    console.log('\n--- 派生状态（重放所有 ops）---');
    console.log(JSON.stringify(derived, null, 2));

    const meta = await loadMeta(syncDir);
    console.log('\n--- 本模拟器身份 ---');
    console.log('deviceId:', meta.deviceId);
    console.log('nextSeq:', meta.seq + 1);
}

// ---- 命令实现 ----

async function cmdStatus(syncDir) {
    await printStatus(syncDir);
}

async function cmdStart(syncDir, args) {
    const meta = await loadMeta(syncDir);
    meta.seq += 1;
    const session = generateUUID();
    const mode = args[0];
    const project = args[1];
    const task = args[2];

    const payload = {};
    if (mode) payload.mode = mode;
    if (project) payload.project = project;
    if (task) payload.task = task;

    const d = new Date();
    payload.sessionDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    payload.sessionTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    const record = {
        op: 'start',
        ts: nowISO(),
        device: meta.deviceId,
        session,
        seq: meta.seq,
        payload: Object.keys(payload).length > 0 ? payload : undefined,
    };

    await appendOpsLine(syncDir, meta.deviceId, record);
    await saveMeta(syncDir, meta);
    console.log('已写入 start op');
    console.log('session:', session);
    console.log('seq:', meta.seq);
    await printStatus(syncDir);
    return session;
}

async function cmdEnd(syncDir, args) {
    const meta = await loadMeta(syncDir);
    const ops = await loadAllOps(syncDir);
    const sorted = mergeAndSort(ops);
    const derived = replay(sorted);
    const local = derived.runningSessions.find(s => s.device === meta.deviceId);

    if (!local) {
        console.error('本模拟器没有正在运行的会话，无法 end');
        console.log('当前运行中:', derived.runningSessions);
        return;
    }

    meta.seq += 1;
    const note = args.join(' ') || undefined;
    const record = {
        op: 'end',
        ts: nowISO(),
        device: meta.deviceId,
        session: local.session,
        seq: meta.seq,
        payload: note ? { note } : undefined,
    };

    await appendOpsLine(syncDir, meta.deviceId, record);
    await saveMeta(syncDir, meta);
    console.log('已写入 end op，结束 session:', local.session);
    await printStatus(syncDir);
}

async function cmdProxyEnd(syncDir, args) {
    if (args.length < 2) {
        console.error('用法: proxy-end <deviceId> <sessionId>');
        return;
    }
    const [targetDevice, targetSession] = args;
    const meta = await loadMeta(syncDir);
    meta.seq += 1;

    const record = {
        op: 'proxy_end',
        ts: nowISO(),
        device: meta.deviceId,
        session: generateUUID(),
        seq: meta.seq,
        payload: { targetDevice, targetSession },
    };

    await appendOpsLine(syncDir, meta.deviceId, record);
    await saveMeta(syncDir, meta);
    console.log(`已写入 proxy_end，结束 ${targetDevice}:${targetSession}`);
    await printStatus(syncDir);
}

async function cmdConfig(syncDir, args) {
    const payload = {};
    for (const arg of args) {
        if (arg.startsWith('--mode=')) payload.mode = arg.slice('--mode='.length);
        else if (arg.startsWith('--project=')) payload.project = arg.slice('--project='.length);
        else if (arg.startsWith('--task=')) payload.task = arg.slice('--task='.length);
    }

    if (Object.keys(payload).length === 0) {
        console.error('请提供 --mode= / --project= / --task= 至少一个');
        return;
    }

    const meta = await loadMeta(syncDir);
    meta.seq += 1;
    const record = {
        op: 'config',
        ts: nowISO(),
        device: meta.deviceId,
        session: generateUUID(),
        seq: meta.seq,
        payload,
    };

    await appendOpsLine(syncDir, meta.deviceId, record);
    await saveMeta(syncDir, meta);
    console.log('已写入 config op:', payload);
    await printStatus(syncDir);
}

async function cmdWatch(syncDir) {
    console.log('开始监视同步目录变化（每 3 秒刷新一次，Ctrl+C 退出）...');
    await ensureDir(opsDir(syncDir));
    let lastMtime = 0;

    while (true) {
        try {
            const stat = await fs.stat(opsDir(syncDir)).catch(() => null);
            const mtime = stat ? stat.mtimeMs : 0;
            if (mtime !== lastMtime) {
                lastMtime = mtime;
                await printStatus(syncDir);
            }
        } catch (e) {
            console.error('监视出错:', e.message);
        }
        await new Promise(r => setTimeout(r, 3000));
    }
}

async function cmdReset(syncDir, args) {
    const force = args.includes('--force') || args.includes('-f');

    if (!force) {
        console.log('即将删除目录下所有 ops 文件、state.json 和模拟器元数据，确认吗？ (yes/no)');
        const ok = await askYesNo();
        if (!ok) {
            console.log('已取消');
            return;
        }
    }

    const files = await listOpsFiles(syncDir);
    for (const f of files) {
        await fs.unlink(path.join(opsDir(syncDir), f));
        console.log('已删除:', f);
    }

    try {
        await fs.unlink(statePath(syncDir));
        console.log('已删除: state.json');
    } catch {}

    try {
        await fs.unlink(metaPath(syncDir));
        console.log('已删除: .simulator-meta.json');
    } catch {}

    console.log('重置完成');
}

// ---- 入口 ----

async function main() {
    const rawArgs = process.argv.slice(2);

    let syncDir;
    let command;
    let args;

    if (rawArgs.length === 0) {
        showHelp();
        process.exit(1);
    }

    if (KNOWN_COMMANDS.has(rawArgs[0])) {
        // 第一个参数就是命令，使用默认同步目录
        syncDir = DEFAULT_SYNC_DIR;
        command = rawArgs[0];
        args = rawArgs.slice(1);
    } else if (rawArgs.length >= 2 && KNOWN_COMMANDS.has(rawArgs[1])) {
        // 第一个参数是自定义同步目录，第二个是命令
        syncDir = rawArgs[0];
        command = rawArgs[1];
        args = rawArgs.slice(2);
    } else {
        console.error('错误：无法识别命令。');
        showHelp();
        process.exit(1);
    }

    const syncDirExists = await dirExists(syncDir);
    if (!syncDirExists) {
        console.error(`错误：同步目录不存在: ${syncDir}`);
        console.error('请确认路径正确，或让 Obsidian/手机端先初始化同步目录。');
        process.exit(1);
    }

    const writeCommands = new Set(['start', 'end', 'proxy-end', 'config']);
    if (writeCommands.has(command)) {
        const opsDirectory = opsDir(syncDir);
        const opsExists = await dirExists(opsDirectory);
        if (!opsExists) {
            console.error(`错误：同步目录下没有找到 ops 子目录: ${opsDirectory}`);
            console.error('请确认路径正确，或先用真实插件初始化同步目录结构。');
            process.exit(1);
        }
    }

    switch (command) {
        case 'status':
            await cmdStatus(syncDir);
            break;
        case 'help':
        case '-h':
        case '--help':
            showHelp();
            break;
        case 'start':
            await cmdStart(syncDir, args);
            break;
        case 'end':
            await cmdEnd(syncDir, args);
            break;
        case 'proxy-end':
            await cmdProxyEnd(syncDir, args);
            break;
        case 'config':
            await cmdConfig(syncDir, args);
            break;
        case 'watch':
            await cmdWatch(syncDir);
            break;
        case 'reset':
            await cmdReset(syncDir, args);
            break;
        default:
            console.error('未知命令:', command);
            process.exit(1);
    }
}

function askYesNo() {
    return new Promise(resolve => {
        process.stdin.once('data', data => {
            const input = data.toString().trim().toLowerCase();
            resolve(input === 'yes' || input === 'y');
        });
    });
}

function showHelp() {
    console.log('用法: node test.js [同步目录] <命令> [参数...]');
    console.log('');
    console.log('默认同步目录:', DEFAULT_SYNC_DIR);
    console.log('');
    console.log('命令:');
    console.log('  status                          查看当前 ops/state/派生状态');
    console.log('  start [mode] [project] [task]   模拟本机开始一个番茄钟');
    console.log('  end [note]                      结束本机当前运行中的会话');
    console.log('  proxy-end <device> <session>    代理结束另一台设备的会话');
    console.log('  config --mode=... --project=... --task=...  写入配置');
    console.log('  watch                           每 3 秒刷新一次状态');
    console.log('  reset [--force]                 删除所有同步数据和模拟器身份');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});