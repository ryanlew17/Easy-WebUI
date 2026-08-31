/**
 * IPC 通道名常量 + 参数/预设的 zod 入参 schema —— 主进程（ipcMain.handle）
 * 与 preload（ipcRenderer.invoke/on）必须使用这里的常量，禁止散写字符串字面量。
 *
 * 注意：本文件仅被 electron/ 侧（main、preload、ipc）消费；渲染进程 UI 只感知
 * window.easyui 接口（shared/types.ts 的 EasyUiApi），不直接触碰通道名与 schema。
 * Web 预览 mock 桥同样不经过 IPC（但复用 shared/params.ts 的同一套纯函数）。
 */
import { z } from 'zod';

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

  listParamPresets: 'params:list-presets',
  createParamPreset: 'params:create-preset',
  updateParamPreset: 'params:update-preset',
  deleteParamPreset: 'params:delete-preset',
  resetGlobalPreset: 'params:reset-global-preset',

  sendMessage: 'chat:send',
  stopGeneration: 'chat:stop',

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
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
export type EventChannel = (typeof EVT)[keyof typeof EVT];

/* ---------------- 参数/预设 zod schema（主进程 handle 端逐一校验） ---------------- */

export const contextOverflowSchema = z.enum(['rolling', 'truncate_middle', 'stop']);

/** 完整 ParamValues（预设存全量；逐键范围约束与 UI 一致） */
export const paramValuesSchema = z.object({
  system_prompt: z.string().max(100_000),
  temperature: z.number().min(0).max(2),
  limit_response_length: z.boolean(),
  max_tokens: z.number().int().min(1).max(128000),
  context_overflow: contextOverflowSchema,
  stop_strings: z.array(z.string().max(1000)).max(32),
  top_k: z.number().int().min(0).max(500),
  repeat_penalty_enabled: z.boolean(),
  repeat_penalty: z.number().min(0).max(2),
  presence_penalty_enabled: z.boolean(),
  presence_penalty: z.number().min(-2).max(2),
  top_p_enabled: z.boolean(),
  top_p: z.number().min(0).max(1),
  min_p_enabled: z.boolean(),
  min_p: z.number().min(0).max(1),
  structured_output_enabled: z.boolean(),
  structured_output_schema: z.string().max(100_000),
  context_window: z.number().int().min(256).max(2_000_000),
  stream: z.boolean(),
});

/**
 * 会话 overrides patch：每键可缺省（不触碰）、可 null（删除该 override 键）、
 * 或合法新值（主进程做等值修剪）。
 */
export const paramOverridesPatchSchema = z.object({
  system_prompt: z.string().max(100_000).nullish(),
  temperature: z.number().min(0).max(2).nullish(),
  limit_response_length: z.boolean().nullish(),
  max_tokens: z.number().int().min(1).max(128000).nullish(),
  context_overflow: contextOverflowSchema.nullish(),
  stop_strings: z.array(z.string().max(1000)).max(32).nullish(),
  top_k: z.number().int().min(0).max(500).nullish(),
  repeat_penalty_enabled: z.boolean().nullish(),
  repeat_penalty: z.number().min(0).max(2).nullish(),
  presence_penalty_enabled: z.boolean().nullish(),
  presence_penalty: z.number().min(-2).max(2).nullish(),
  top_p_enabled: z.boolean().nullish(),
  top_p: z.number().min(0).max(1).nullish(),
  min_p_enabled: z.boolean().nullish(),
  min_p: z.number().min(0).max(1).nullish(),
  structured_output_enabled: z.boolean().nullish(),
  structured_output_schema: z.string().max(100_000).nullish(),
  context_window: z.number().int().min(256).max(2_000_000).nullish(),
  stream: z.boolean().nullish(),
});

export const createParamPresetSchema = z.object({
  name: z.string().min(1).max(100),
  params: paramValuesSchema,
});

export const updateParamPresetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  params: paramValuesSchema.optional(),
});

/** 数据目录变更入参：绝对路径，长度兜底 */
export const setDataDirSchema = z.object({
  path: z.string().min(1).max(500),
});

/** 外部链接打开入参：仅允许 http/https，防 file:/自定义协议 */
export const openExternalSchema = z
  .string()
  .min(1)
  .max(1000)
  .regex(/^https?:\/\//i);
