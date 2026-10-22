/**
 * 数据目录定位（v0.1.1 重写）：
 *
 * 解析优先级：
 *  ① 指针文件（自定义路径）：JSON 形如 {"dataDir": "..."}；合法绝对路径且可写
 *     （不存在则 mkdir 后探测）→ source 'custom'；
 *  ② 便携版（app.isPackaged 且 env.PORTABLE_EXECUTABLE_DIR 存在）→
 *     便携根目录/data，source 'portable'；不可写才回退 userData/data
 *     （source 仍记 'portable'，由 main.ts 依据 returnedFallback 比较 logger.warn）；
 *  ③ 其余（安装版、dev）→ 安装版 userData/data；dev 用 app.getAppPath()/data，
 *     source 'default'。
 *
 * 修复背景：
 *  - 问题①：NSIS per-user 安装版升级重装会清空安装目录 → exe 旁 data/ 连同备份
 *    一起丢失。故安装版默认从「exe 旁 data」改为「userData/data」，旧 exe 旁目录
 *    仅作为 legacyDirs 供 storage-migrate 抢救。
 *  - 问题②：electron-builder portable 目标运行时解包到 %TEMP%，process.execPath
 *    指向每次不同的临时目录 → 便携版数据落在 %TEMP% 丢失。正确根目录是环境变量
 *    PORTABLE_EXECUTABLE_DIR（指向便携 exe 所在目录）。
 *
 * 本文件不 import electron（AppLike 接口模式），vitest 纯 Node 可测。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface AppLike {
  isPackaged: boolean;
  getAppPath(): string;
  getPath(name: 'userData'): string;
}

export interface DataDirResolution {
  dir: string;
  source: 'default' | 'portable' | 'custom';
  isPortable: boolean;
  /** 自定义路径指针文件位置（setDataDir 写入，resolveDataDir 读取） */
  pointerPath: string;
  /** 旧版本可能遗留数据的目录（供 storage-migrate 抢救；已过滤不存在项） */
  legacyDirs: string[];
}

/** 便携版指针文件名：放便携根目录，随 exe 一起走 */
const PORTABLE_POINTER_NAME = 'easywebui-data-dir.json';
/** 非便携指针文件名：放 userData（NSIS deleteAppDataOnUninstall:false，卸载保留） */
const POINTER_NAME = 'data-dir-pointer.json';

function isWritableDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.writetest-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** 读取指针文件；非法（不存在/坏 JSON/非绝对路径）返回 null */
function readPointer(pointerPath: string): string | null {
  try {
    if (!fs.existsSync(pointerPath)) return null;
    const parsed: unknown = JSON.parse(fs.readFileSync(pointerPath, 'utf8'));
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      typeof (parsed as { dataDir?: unknown }).dataDir === 'string'
    ) {
      const dir = (parsed as { dataDir: string }).dataDir;
      return path.isAbsolute(dir) ? dir : null;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * best-effort 扫描 os.tmpdir() 下名字含 easy-webui/easywebui 的目录
 * （electron-builder portable 的历史解包目录），收集其中存在 data/easyui.db
 * 的 data 目录。扫描失败静默忽略。
 */
function scanTempLegacyDirs(): string[] {
  const out: string[] = [];
  try {
    for (const entry of fs.readdirSync(os.tmpdir())) {
      const name = entry.toLowerCase();
      if (!name.includes('easy-webui') && !name.includes('easywebui')) continue;
      const dataDir = path.join(os.tmpdir(), entry, 'data');
      try {
        // @req REQ-2026-001 M3：除 easyui.db 外还要求 storage-layout.json 标记，
        // 防本机他进程在 %TEMP% 投毒迁移源
        if (
          fs.existsSync(path.join(dataDir, 'easyui.db')) &&
          fs.existsSync(path.join(dataDir, 'storage-layout.json'))
        ) {
          out.push(dataDir);
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function resolveDataDir(app: AppLike, env = process.env): DataDirResolution {
  const portableRoot = app.isPackaged ? env.PORTABLE_EXECUTABLE_DIR : undefined;
  const isPortable = !!portableRoot;
  const userData = app.getPath('userData');

  const pointerPath = isPortable
    ? path.join(portableRoot as string, PORTABLE_POINTER_NAME)
    : path.join(userData, POINTER_NAME);

  // —— legacyDirs（供迁移抢救；不存在则过滤）——
  const legacyCandidates: string[] = [];
  if (app.isPackaged) {
    // 安装版：旧安装目录 exe 旁 data/；便携版：当前运行的临时解包目录 exe 旁 data/
    legacyCandidates.push(path.join(path.dirname(process.execPath), 'data'));
    if (isPortable) legacyCandidates.push(...scanTempLegacyDirs());
  }
  // dev → []
  const legacyDirs = [...new Set(legacyCandidates)].filter((d) => {
    try {
      return fs.existsSync(d);
    } catch {
      return false;
    }
  });

  // ① 自定义指针
  const pointed = readPointer(pointerPath);
  if (pointed && isWritableDir(pointed)) {
    return {
      dir: pointed,
      source: 'custom',
      isPortable,
      pointerPath,
      legacyDirs: legacyDirs.filter((d) => path.resolve(d) !== path.resolve(pointed)),
    };
  }

  // ② 便携版：exe 所在目录/data（不可写才回退 userData/data，source 不变）
  if (isPortable) {
    const portableData = path.join(portableRoot as string, 'data');
    if (isWritableDir(portableData)) {
      return {
        dir: portableData,
        source: 'portable',
        isPortable,
        pointerPath,
        legacyDirs: legacyDirs.filter((d) => path.resolve(d) !== path.resolve(portableData)),
      };
    }
    const fallback = path.join(userData, 'data');
    fs.mkdirSync(fallback, { recursive: true });
    return { dir: fallback, source: 'portable', isPortable, pointerPath, legacyDirs };
  }

  // ③ 安装版 / dev
  const dir = app.isPackaged
    ? path.join(userData, 'data') // 修复①：安装版默认 userData/data
    : path.join(app.getAppPath(), 'data'); // dev 保持现状：项目根 data/
  fs.mkdirSync(dir, { recursive: true });
  return {
    dir,
    source: 'default',
    isPortable,
    pointerPath,
    legacyDirs: legacyDirs.filter((d) => path.resolve(d) !== path.resolve(dir)),
  };
}
