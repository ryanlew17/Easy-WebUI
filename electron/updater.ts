/**
 * 在线升级 —— v0.1.1+ 真实实现（GitHub Releases）。
 *
 * 通道与配置：
 * - provider = GitHub（owner/repo 见 package.json build.publish；打包时 electron-builder
 *   把该配置嵌入 app-update.yml，autoUpdater 运行时读取）。
 * - beta 通道：autoUpdater.allowPrerelease ← deps.getBeta()（settings.update_beta，
 *   每次 check 时读取，改设置即生效）。
 * - 校验：electron-updater 按 latest.yml 的 sha512 自动校验下载包完整性，校验失败
 *   downloadUpdate reject。
 * - 数据迁移：安装由 NSIS 完成；0.1.1 起数据默认在 userData 且卸载不删
 *   （deleteAppDataOnUninstall:false），在线升级天然不触碰数据目录；应用侧另有
 *   storage-layout.json 布局版本 + schema_migrations 兜底结构升级。
 *
 * 运行形态：
 * - 打包版（isPackaged）：真实 electron-updater 流程。
 * - dev / 未打包：check() 返回 { status:'unavailable', reason:'dev_mode' }，
 *   download()/install() 抛带码 Error('dev_mode')（electron-updater 只在打包态工作）。
 * - 联调演示：EASYUI_MOCK_UPDATE=1 时全程走 mock（虚构 patch+1 版本、2s 假进度、
 *   install no-op），不触网。
 *
 * 错误语义：网络/配置失败不 reject，以 UpdateCheckResult.status 表达；仅参数级错误 reject。
 * electron-updater 以懒加载 require 引入 —— vitest 纯 Node 环境 import 本文件不得拉起 electron。
 */
import { EVT } from '../shared/ipc';
import type {
  UpdateCheckResult,
  UpdateDownloadResult,
  UpdateInfo,
  UpdateState,
} from '../shared/types';

export interface UpdaterDeps {
  /** 事件推送（主进程里是 win?.webContents.send 的包装） */
  send: (channel: string, payload: unknown) => void;
  getVersion: () => string;
  /** app.isPackaged（dev/冒烟为 false → 走 dev_mode 分支） */
  isPackaged: () => boolean;
  /** 读取 settings.update_beta（接 autoUpdater.allowPrerelease） */
  getBeta: () => boolean;
  logger?: {
    info: (msg: string, extra?: unknown) => void;
    warn: (msg: string, extra?: unknown) => void;
  };
}

export interface Updater {
  check(): Promise<UpdateCheckResult>;
  download(): Promise<UpdateDownloadResult>;
  install(): Promise<void>;
  getState(): UpdateState;
}

/** 语义化版本比较：a>b → 1，a<b → -1，相等 → 0；忽略 pre-release 尾签之外的噪声 */
export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const pb = b.replace(/^v/, '').split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** 语义化版本 patch+1（mock 用）；无法解析时回退原串加 -mock 后缀 */
function bumpPatch(version: string): string {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) return `${version}-mock`;
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}${m[4]}`;
}

const MOCK_SIZE = 128_000_000;

/* ---------- electron-updater 懒加载（vitest 环境安全） ---------- */

interface AutoUpdaterLike {
  autoDownload: boolean;
  allowPrerelease: boolean;
  on(event: 'download-progress', cb: (p: { percent: number; transferred: number; total: number }) => void): void;
  checkForUpdates(): Promise<{
    updateInfo: {
      version: string;
      releaseNotes?: string | { note: string | null }[] | null;
      releaseDate?: string;
      files?: { size?: number }[];
    };
  } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void;
}

let cachedAutoUpdater: AutoUpdaterLike | null = null;

function loadAutoUpdater(): AutoUpdaterLike {
  if (!cachedAutoUpdater) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('electron-updater') as { autoUpdater: AutoUpdaterLike };
    cachedAutoUpdater = mod.autoUpdater;
  }
  return cachedAutoUpdater;
}

/** electron-updater 的 releaseNotes 兼容字符串与分段数组两种形态 */
function extractReleaseNotes(
  notes: string | { note: string | null }[] | null | undefined,
): string {
  if (!notes) return '';
  if (typeof notes === 'string') return notes;
  return notes
    .map((n) => n.note ?? '')
    .filter(Boolean)
    .join('\n');
}

export function createUpdater(deps: UpdaterDeps): Updater {
  // @req REQ-2026-001 M4：mock 演示通道仅限非打包环境（打包版忽略该环境变量）
  const mock = !deps.isPackaged() && process.env.EASYUI_MOCK_UPDATE === '1';
  /** 主进程权威状态机：渲染进程挂载晚于事件时用 getState() 同步 */
  let state: UpdateState = { phase: 'idle' };
  /** 进度事件只挂一次（真实与 mock 通道共用同一 EVT.updateProgress） */
  let progressWired = false;

  const wireProgress = (u: AutoUpdaterLike): void => {
    if (progressWired) return;
    progressWired = true;
    u.on('download-progress', (p) => {
      deps.send(EVT.updateProgress, {
        percent: Math.round(p.percent * 10) / 10,
        transferred: p.transferred,
        total: p.total,
      });
    });
  };

  /* ---------- mock 通道（EASYUI_MOCK_UPDATE=1，演示/冒烟用，不触网） ---------- */

  const mockCheck = (): UpdateCheckResult => {
    const current = deps.getVersion();
    const result: UpdateCheckResult = {
      status: 'available',
      info: {
        version: bumpPatch(current),
        release_notes: [
          `Easy WebUI ${bumpPatch(current)}（模拟更新）`,
          '',
          '- 修复安装版升级后数据目录丢失的问题',
          '- 修复便携版数据落入临时目录的问题',
          '- 新增数据存储路径自定义与在线升级入口',
          deps.getBeta() ? '- （beta 通道已开启：本版本为预发布模拟）' : '',
        ]
          .filter(Boolean)
          .join('\n'),
        published_at: new Date().toISOString(),
        size: MOCK_SIZE,
      },
    };
    deps.logger?.info('mock update check: available', { current, next: bumpPatch(current) });
    return result;
  };

  const mockDownload = async (): Promise<UpdateDownloadResult> => {
    const total = state.phase !== 'idle' && state.info.size ? state.info.size : MOCK_SIZE;
    await new Promise<void>((resolve) => {
      let percent = 0;
      const timer = setInterval(() => {
        percent = Math.min(100, percent + 10);
        deps.send(EVT.updateProgress, {
          percent,
          transferred: Math.round((total * percent) / 100),
          total,
        });
        if (percent >= 100) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
    deps.logger?.info('mock update download finished', { total });
    return { verified: true };
  };

  /* ---------- 对外接口 ---------- */

  return {
    getState: () => state,

    async check(): Promise<UpdateCheckResult> {
      if (mock) {
        const result = mockCheck();
        if (result.status === 'available') state = { phase: 'available', info: result.info };
        return result;
      }
      if (!deps.isPackaged()) return { status: 'unavailable', reason: 'dev_mode' };
      try {
        const u = loadAutoUpdater();
        u.autoDownload = false; // 下载由 renderer 显式触发（进度事件驱动 UI）
        u.allowPrerelease = deps.getBeta();
        wireProgress(u);
        const res = await u.checkForUpdates();
        const latest = res?.updateInfo;
        if (!latest?.version) return { status: 'unavailable', reason: 'check_failed' };
        const current = deps.getVersion();
        if (compareSemver(latest.version, current) <= 0) {
          state = { phase: 'idle' };
          return { status: 'none' };
        }
        const info: UpdateInfo = {
          version: latest.version.replace(/^v/, ''),
          release_notes: extractReleaseNotes(latest.releaseNotes),
          published_at: latest.releaseDate || undefined,
          size: latest.files?.find((f) => typeof f.size === 'number')?.size,
        };
        state = { phase: 'available', info };
        deps.logger?.info('update available', { current, next: info.version });
        return { status: 'available', info };
      } catch (e) {
        // 网络失败 / 仓库无 Release / latest.yml 缺失等：一律以 status 表达
        deps.logger?.warn('update check failed', e instanceof Error ? e.message : e);
        return { status: 'unavailable', reason: 'check_failed' };
      }
    },

    async download(): Promise<UpdateDownloadResult> {
      if (state.phase === 'idle') throw new Error('no_update_pending');
      if (state.phase === 'downloaded') return { verified: true };
      if (mock) {
        state = { ...state, phase: 'downloading' };
        const r = await mockDownload();
        state = { ...state, phase: 'downloaded' };
        return r;
      }
      if (!deps.isPackaged()) throw new Error('dev_mode');
      try {
        state = { ...state, phase: 'downloading' };
        const u = loadAutoUpdater();
        wireProgress(u);
        await u.downloadUpdate(); // sha512 完整性校验内建，失败即 reject
        state = { ...state, phase: 'downloaded' };
        deps.logger?.info('update downloaded & verified');
        return { verified: true };
      } catch (e) {
        if (state.phase === 'downloading') state = { ...state, phase: 'available' };
        deps.logger?.warn('update download failed', e instanceof Error ? e.message : e);
        throw e instanceof Error ? e : new Error(String(e));
      }
    },

    async install(): Promise<void> {
      if (mock) {
        deps.logger?.info('mock update install (no-op)');
        return;
      }
      if (!deps.isPackaged()) throw new Error('dev_mode');
      if (state.phase !== 'downloaded') throw new Error('update_not_downloaded');
      // 静默安装并重启；DB 句柄由 main.ts 的 before-quit 钩子关闭
      const u = loadAutoUpdater();
      setImmediate(() => u.quitAndInstall(true, true));
    },
  };
}
