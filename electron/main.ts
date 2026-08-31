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

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:";

let win: BrowserWindow | null = null;

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
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960, // kimi.md §1.3：响应式只保证 960px 可用
    minHeight: 600,
    title: 'Easy WebUI',
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'), // dist-electron/electron/preload.js
    },
  });
  win.on('closed', () => {
    win = null;
  });

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

  // 自动检查更新（wiring point 演示）：仅记录日志，不向渲染进程推事件
  if (settings.get().auto_update) {
    updater
      .check()
      .then((r) => logger.info('auto update check result', r))
      .catch((e) => logger.warn('auto update check failed', e instanceof Error ? e.message : e));
  }

  setupCspHeader();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
