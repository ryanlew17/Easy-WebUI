/** IPC 通道与跨进程限制常量；本模块刻意不引入 zod，供 preload 与 Web Mock 轻量复用。 */

/** invoke/handle 通道（请求-响应） */
export const IPC = {
  listProviders: 'providers:list',
  createProvider: 'providers:create',
  updateProvider: 'providers:update',
  deleteProvider: 'providers:delete',
  getPresets: 'providers:presets',
  fetchModels: 'providers:fetch-models',
  testModel: 'providers:test-model',
  testAllModels: 'providers:test-all-models',
  detectFormat: 'providers:detect-format',

  listConversations: 'conversations:list',
  createConversation: 'conversations:create',
  updateConversation: 'conversations:update',
  deleteConversation: 'conversations:delete',
  listMessages: 'conversations:list-messages',
  generateTitle: 'conversations:generate-title',
  switchBranch: 'conversations:switch-branch',
  setActiveLeaf: 'conversations:set-active-leaf',
  updateMessageContent: 'conversations:update-message',
  deleteMessages: 'conversations:delete-messages',

  listParamPresets: 'params:list-presets',
  createParamPreset: 'params:create-preset',
  updateParamPreset: 'params:update-preset',
  deleteParamPreset: 'params:delete-preset',
  resetGlobalPreset: 'params:reset-global-preset',

  sendMessage: 'chat:send',
  stopGeneration: 'chat:stop',
  regenerateMessage: 'chat:regenerate',
  continueMessage: 'chat:continue',
  generateResponse: 'chat:generate',

  getSettings: 'settings:get',
  setSettings: 'settings:set',
  getSystemInfo: 'system:info',
  pickDataDir: 'system:pick-data-dir',
  setDataDir: 'system:set-data-dir',
  relaunchApp: 'system:relaunch',
  openExternal: 'system:open-external',

  updateCheck: 'update:check',
  updateDownload: 'update:download',
  updateInstall: 'update:install',
  updateGetState: 'update:get-state',

  listBackups: 'backups:list',
  createBackup: 'backups:create',
  restoreBackup: 'backups:restore',
  deleteBackup: 'backups:delete',
  openBackupsDir: 'backups:open-dir',
  pickBackupFile: 'backups:pick',
} as const;

/** 事件推送通道（webContents.send → ipcRenderer.on） */
export const EVT = {
  chatDelta: 'chat:delta',
  chatDone: 'chat:done',
  chatError: 'chat:error',
  modelCheck: 'model:check',
  titleUpdated: 'title:updated',
  titleFailed: 'title:failed',
  updateProgress: 'update:progress',
  updateAvailable: 'update:available',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
export type EventChannel = (typeof EVT)[keyof typeof EVT];

/** 单平台模型数量上限（主进程 IPC 与 mock 桥同规则；@req REQ-2026-002） */
export const MAX_PROVIDER_MODELS = 2000;

/** 备份密码长度上限（创建与恢复共用；@req REQ-2026-001，mock 桥同规则） */
export const MAX_BACKUP_PASSWORD_CHARS = 32;
