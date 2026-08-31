/**
 * 在线升级 —— v0.1.1 桩实现 + 接口预留。
 *
 * 当前行为：
 * - 未配置更新源：check() 返回 { status:'unavailable', reason:'not_configured' }，
 *   download()/install() 抛带码 Error('not_configured')（IPC 编码后渲染进程可识别）。
 * - 联调 mock：环境变量 EASYUI_MOCK_UPDATE === '1' 时，
 *   check() 返回一个虚构的 patch+1 新版本；download() 每 ~200ms 经
 *   deps.send(EVT.updateProgress, {percent, transferred, total}) 推 0→100 进度后
 *   resolve { verified: true }；install() no-op resolve。
 *
 * ── 真实实现接线点（TODO，升级时按此替换桩）──
 * 1. 安装依赖 electron-updater（注意 package.json 的 npmRebuild:false /
 *    electronDist 配置是规避 Windows EPERM 的，不要动；electron-updater 纯 JS
 *    无需 rebuild）。
 * 2. check()     → autoUpdater.checkForUpdates()；
 *    provider 用 GitHub（owner/repo 待定），同时在 package.json build.publish
 *    配置 [{ provider:'github', owner, repo }]；
 *    autoUpdater.allowPrerelease ← deps.getBeta()（settings.update_beta）。
 * 3. download()  → autoUpdater.downloadUpdate()；把 'download-progress' 事件
 *    （{percent, transferred, total}）原样转发 deps.send(EVT.updateProgress, …)。
 * 4. install()   → autoUpdater.quitAndInstall()（先关 db 句柄，见 main.ts）。
 * 5. 签名校验：electron-updater 默认按 latest.yml 的 sha512 校验包完整性；
 *    Windows 发布建议另加 Authenticode 代码签名证书（build.win.certificateFile）。
 * 6. 错误语义保持：网络/配置失败不 reject，以 UpdateCheckResult.status 表达；
 *    仅参数级错误 reject。
 */
import { EVT } from '../shared/ipc';
import type { UpdateCheckResult, UpdateDownloadResult } from '../shared/types';

export interface UpdaterDeps {
  /** 事件推送（主进程里是 win?.webContents.send 的包装） */
  send: (channel: string, payload: unknown) => void;
  getVersion: () => string;
  /** 读取 settings.update_beta（真实实现接 allowPrerelease） */
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
}

/** 语义化版本 patch+1（mock 用）；无法解析时回退原串加 -mock 后缀 */
function bumpPatch(version: string): string {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) return `${version}-mock`;
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}${m[4]}`;
}

const MOCK_SIZE = 128_000_000;

export function createUpdater(deps: UpdaterDeps): Updater {
  const mock = process.env.EASYUI_MOCK_UPDATE === '1';
  /** mock 模式下记录"已发现待下载"的版本，避免 download 无的放矢 */
  let pending: UpdateCheckResult | null = null;

  return {
    async check(): Promise<UpdateCheckResult> {
      if (!mock) return { status: 'unavailable', reason: 'not_configured' };
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
      pending = result;
      deps.logger?.info('mock update check: available', { current, next: bumpPatch(current) });
      return result;
    },

    async download(): Promise<UpdateDownloadResult> {
      if (!mock) throw new Error('not_configured');
      const total =
        pending?.status === 'available' && pending.info.size ? pending.info.size : MOCK_SIZE;
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
    },

    async install(): Promise<void> {
      if (!mock) throw new Error('not_configured');
      // 桩：no-op。真实实现 = autoUpdater.quitAndInstall()。
      deps.logger?.info('mock update install (no-op)');
    },
  };
}
