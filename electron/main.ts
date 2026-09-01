/**
 * Electron 主进程入口。
 * 启动顺序：数据目录定位（resolveDataDir，便携/指针优先）→ 日志 →
 * 存储迁移（migrateStorageDir，顺序不能错：必须先于 openDatabase）→
 * DB 迁移 → 加密服务 → 备份服务 → 生成编排 → 注册全部 IPC handler → 建窗。
 */
import path from 'node:path';
import { app, BrowserWindow, Menu, safeStorage, session } from 'electron';
import { resolveDataDir } from './paths';
import { migrateStorageDir } from './storage-migrate';
import { createUpdater } from './updater';
import { initLogger, logger } from './logger';
import { openDatabase } from './db';
import { createProvidersDao } from './db/providers';
import { createConversationsDao } from './db/conversations';
import { createMessagesDao } from './db/messages';
import { createSettingsDao } from './db/settings';
import { createPresetsDao } from './db/presets';
import { createCryptoService } from './crypto';
import { createBackupService } from './backup';
import { ChatOrchestrator } from './chat';
import { registerIpcHandlers } from './ipc';
import { defaultWindowSize, loadWindowState, saveWindowState } from './window-state';
import { EVT } from '../shared/ipc';

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

let win: BrowserWindow | null = null;
let dataDirForState = ''; // 窗口状态记忆的落盘目录（whenReady 里赋值）

/**
 * CSP：生产环境渲染层由 index.html 的 meta 提供（file:// 协议不走响应头）；
 * 这里仅对 http(s) 响应补一层（防御纵深）。dev 服务器不加——vite.config.ts
 * 已在 dev 剥离 meta（HMR / react preamble 需要 inline script 与 ws:）。
 */
function setupCspHeader(): void {
  if (isDev) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });
}

function createWindow(): void {
  const saved = dataDirForState ? loadWindowState(dataDirForState) : null;
  const size = saved ?? defaultWindowSize();
  win = new BrowserWindow({
    ...size,
    minWidth: 960, // prd.md §1.3：响应式只保证 960px 可用
    minHeight: 600,
    title: 'Easy WebUI',
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0f',
    // 窗口/任务栏图标：打包版由 exe 内嵌 icon.ico 提供（electron-builder 默认
    // 读取 build/icon.ico）；dev 下 exe 是 Electron 本体（⚛️ 默认图标），
    // 显式指向主图标源文件。打包版不传 —— build/ 不在 files 清单内。
    ...(app.isPackaged ? {} : { icon: path.join(__dirname, '../../build/icon.png') }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // dist-electron/electron/preload.js
    },
  });
  win.on('closed', () => {
    win = null;
  });

  /* 窗口状态记忆：防抖落盘尺寸/位置（最大化态存 normalBounds），关闭时再存一次 */
  if (dataDirForState) {
    let saveTimer: NodeJS.Timeout | null = null;
    const persist = (): void => {
      if (!win) return;
      saveWindowState(dataDirForState, win.getNormalBounds(), win.isMaximized());
    };
    const persistDebounced = (): void => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(persist, 500);
    };
    win.on('resize', persistDebounced);
    win.on('move', persistDebounced);
    win.on('close', () => {
      if (saveTimer) clearTimeout(saveTimer);
      persist();
    });
    if (saved?.maximized) win.maximize();
  }

  // 禁用 Chromium/Electron 默认缩放：缩放只允许走「设置-通用-外观」的应用内
  // CSS zoom（web 与 Electron 同一代码路径）。setVisualZoomLevelLimits 锁死 pinch
  // 视觉缩放；应用菜单置空以摘掉默认菜单的 Ctrl+/-/0 缩放加速器
  // （编辑快捷键由 Chromium 渲染层原生处理，不受影响）。
  win.webContents.setVisualZoomLevelLimits(1, 1);
  Menu.setApplicationMenu(null);

  if (isDev) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
  } else {
    // package.json main = dist-electron/electron/main.js → 项目根在上两级
    void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(() => {
  const resolution = resolveDataDir(app);
  const dataDir = resolution.dir;
  dataDirForState = dataDir;
  initLogger(dataDir);
  // 便携版根目录不可写 → 已回退 userData/data（source 仍记 'portable'）
  if (
    resolution.isPortable &&
    resolution.source === 'portable' &&
    !path.resolve(dataDir).startsWith(path.resolve(process.env.PORTABLE_EXECUTABLE_DIR as string))
  ) {
    logger.warn('portable data dir not writable, fell back to userData', { dataDir });
  }
  logger.info('app starting', {
    dataDir,
    dataPathSource: resolution.source,
    isPortable: resolution.isPortable,
    isDev,
  });

  // 顺序约束：必须先迁移/抢救旧数据，再 openDatabase
  migrateStorageDir(dataDir, resolution.legacyDirs, (msg, extra) => logger.info(msg, extra));

  const db = openDatabase(path.join(dataDir, 'easyui.db'));
  const providers = createProvidersDao(db);
  const conversations = createConversationsDao(db);
  const messages = createMessagesDao(db);
  const settings = createSettingsDao(db);
  const presets = createPresetsDao(db);
  if (!presets.hasGlobal()) presets.ensureGlobal(); // 兜底：全局预设恒存在

  const crypto = createCryptoService({ dataDir, safeStorage });
  const backup = createBackupService({ db, crypto, dataDir, appVersion: app.getVersion() });

  const orchestrator = new ChatOrchestrator({
    conversations,
    messages,
    providers,
    settings,
    presets,
    crypto,
    send: (channel, payload) => win?.webContents.send(channel, payload),
  });

  const updater = createUpdater({
    send: (channel, payload) => win?.webContents.send(channel, payload),
    getVersion: () => app.getVersion(),
    isPackaged: () => app.isPackaged,
    getBeta: () => settings.get().update_beta,
    logger,
  });

  registerIpcHandlers({
    providers,
    conversations,
    messages,
    settings,
    presets,
    crypto,
    orchestrator,
    backup,
    db,
    dataDir,
    dataPathSource: resolution.source,
    isPortable: resolution.isPortable,
    pointerPath: resolution.pointerPath,
    appVersion: app.getVersion(),
    relaunch: () => {
      app.relaunch();
      app.exit(0);
    },
    updater,
    getWindow: () => win,
  });

  // 自动检查更新（settings.auto_update）：发现新版本 → 广播 update:available
  // （渲染进程全局监听弹通知气泡；About 页挂载后经 updateGetState 同步状态并自动下载）。
  // 下载不在这里自动触发 —— 静默拉包占用带宽，交给 About 页状态机在用户知情下进行。
  if (settings.get().auto_update) {
    updater
      .check()
      .then((r) => {
        logger.info('auto update check result', { status: r.status });
        if (r.status === 'available') {
          win?.webContents.send(EVT.updateAvailable, r.info);
        }
      })
      .catch((e) => logger.warn('auto update check failed', e instanceof Error ? e.message : e));
  }

  // 退出前关闭 DB 句柄（quitAndInstall 走同一退出路径；better-sqlite3 同步 close 安全）
  app.on('before-quit', () => {
    try {
      db.close();
    } catch {
      /* 已关闭则忽略 */
    }
  });

  setupCspHeader();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
