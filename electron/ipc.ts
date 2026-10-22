/**
 * IPC handler 注册（docs/architecture.md 关键约束：不信任渲染进程传入的任何字段）。
 * - 每个 payload 先过 zod；
 * - 所有 throw 出去的错误统一过 redact()（docs/design/security.md 安全红线）；
 * - Provider 出参无密文（DAO 层已剥离）。
 */
import { ipcMain, dialog, shell } from 'electron';
import type { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  IPC,
  EVT,
  createParamPresetSchema,
  paramOverridesPatchSchema,
  updateParamPresetSchema,
  setDataDirSchema,
  openExternalSchema,
  sendMessageSchema,
  messageAnchorSchema,
  updateMessageContentSchema,
  deleteMessagesSchema,
  MAX_BACKUP_PASSWORD_CHARS,
} from '../shared/ipc';
import { PRESETS } from '../shared/presets';
import { serializeIpcError } from '../shared/errors';
import {
  applyOverridePatch,
  FACTORY_DEFAULTS,
  GLOBAL_PRESET_ID,
  resolveParams,
} from '../shared/params';
import type {
  ApiFormat,
  DataDirMigrationResult,
  DataPathSource,
  ModelCheck,
  ProviderModel,
  SystemInfo,
} from '../shared/types';
import { redact, redactString, registerSecret } from './crypto/redact';
import { isValidBaseUrl, shouldClearKeyOnBaseUrlChange } from '../shared/url';
import { isAppFrameUrl } from './webcontents-guard';
import { isAllowedRestorePath, normalizeFsPath } from './backup/core';
import type { CryptoService } from './crypto';
import type { DB } from './db';
import type { ProvidersDao } from './db/providers';
import type { ConversationsDao } from './db/conversations';
import type { MessagesDao } from './db/messages';
import type { SettingsDao } from './db/settings';
import type { PresetsDao } from './db/presets';
import type { BackupService } from './backup';
import type { ChatOrchestrator } from './chat';
import type { Updater } from './updater';
import { detectFormat as gwDetectFormat, defaultTokenCounter, listModels, testAllModels, testModel } from './gateway';
import { logger } from './logger';

/* ---------- zod schemas ---------- */

const apiFormatSchema = z.enum(['openai-chat', 'openai-responses', 'anthropic']);

// @req REQ-2026-001 M5：base_url 仅 http/https 且禁 userinfo（密钥不得随 URL 进日志）
const baseUrlSchema = z.string().min(1).max(500).refine(isValidBaseUrl, { message: 'invalid_base_url' });

const providerDraftSchema = z.object({
  name: z.string().min(1).max(100),
  base_url: baseUrlSchema,
  api_format: apiFormatSchema,
  api_key: z.string().max(500).optional(),
});

const modelCheckSchema = z.object({
  status: z.enum(['ok', 'fail', 'unknown']),
  latency_ms: z.number().optional(),
  checked_at: z.number().optional(),
  error: z.string().optional(),
});

const providerModelSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().optional(),
  enabled: z.boolean(),
  last_check: modelCheckSchema.optional(),
});

const updateProviderSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  base_url: baseUrlSchema.optional(),
  api_format: apiFormatSchema.optional(),
  /** undefined=保持不变；'' =清除密钥；非空=重新设置 */
  api_key: z.string().max(500).optional(),
  models: z.array(providerModelSchema).optional(),
});

const updateConversationSchema = z.object({
  title: z.string().max(200).optional(),
  pinned: z.boolean().optional(),
  provider_id: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  /** undefined=保持不变；null=回落全局预设；否则必须指向存在的预设 */
  preset_id: z.string().nullable().optional(),
  /** 会话级思考开关（schema v3） */
  reasoning_enabled: z.boolean().optional(),
  /** overrides 合并语义：值传 null 删除该 override 键；等值修剪在主进程完成 */
  params: paramOverridesPatchSchema.optional(),
});

/** generateResponse 入参（shared/ipc.ts 无独立 schema，风格与 messageAnchorSchema 一致） */
const generateResponseSchema = z.object({
  conversationId: z.string().min(1),
});

const fetchModelsSchema = z.object({
  providerId: z.string().optional(),
  draft: providerDraftSchema.optional(),
});

const detectFormatSchema = z.object({
  base_url: baseUrlSchema,
  api_key: z.string().optional(),
  providerId: z.string().optional(),
});

const settingsPatchSchema = z.object({
  language: z.enum(['zh-CN', 'en-US', 'system']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  auto_title: z.boolean().optional(),
  enter_send: z.boolean().optional(),
  /** 标题生成指定模型：null = 清除指定（回退会话模型） */
  title_provider_id: z.string().min(1).max(100).nullable().optional(),
  title_model: z.string().min(1).max(300).nullable().optional(),
  /** 外观（docs/contracts/impl-contract.md，GeneralSettings）：缩放 0.5~2.5；字体栈字符白名单与渲染进程 shared/appearance.ts 一致 */
  zoom: z.number().min(0.5).max(2.5).optional(),
  font_ui: z.string().max(200).regex(/^[A-Za-z0-9 ,.'"-]*$/).optional(),
  font_code: z.string().max(200).regex(/^[A-Za-z0-9 ,.'"-]*$/).optional(),
  /** 界面字号 px（rem 基准，10~24 整数）；null = 默认 16px */
  font_ui_size: z.number().int().min(10).max(24).nullable().optional(),
  /** 代码块字号 px（6~40 整数）；null = 默认 */
  font_code_size: z.number().int().min(6).max(40).nullable().optional(),
  code_theme: z.enum(['light', 'dark', 'auto']).optional(),
  /** 启动时自动检查更新 */
  auto_update: z.boolean().optional(),
  /** 更新通道包含预发布版本（beta） */
  update_beta: z.boolean().optional(),
});

const createBackupSchema = z.object({
  includeKeys: z.boolean(),
  // @req REQ-2026-001：密码 8–32 位（下限由 buildBackup 业务校验，UI maxLength 同步）
  password: z.string().max(MAX_BACKUP_PASSWORD_CHARS).optional(),
});

const restoreBackupSchema = z.object({
  // @req REQ-2026-001：仅允许绝对路径的 .zip（渲染进程不得让主进程解析任意文件）
  path: z
    .string()
    .min(1)
    .max(1000)
    .regex(/\.zip$/i, 'invalid_backup_path')
    .refine((p) => path.win32.isAbsolute(p) || path.posix.isAbsolute(p), {
      message: 'invalid_backup_path',
    }),
  password: z.string().max(MAX_BACKUP_PASSWORD_CHARS).optional(),
  mode: z.enum(['merge', 'overwrite']),
});

/* ---------- 注册 ---------- */

export interface IpcDeps {
  providers: ProvidersDao;
  conversations: ConversationsDao;
  messages: MessagesDao;
  settings: SettingsDao;
  presets: PresetsDao;
  crypto: CryptoService;
  orchestrator: ChatOrchestrator;
  backup: BackupService;
  /** 已打开的 db 句柄（setDataDir 迁移前做 wal_checkpoint） */
  db: DB;
  dataDir: string;
  dataPathSource: DataPathSource;
  isPortable: boolean;
  /** 自定义数据目录指针文件位置（setDataDir 写入） */
  pointerPath: string;
  appVersion: string;
  /** 重启应用（app.relaunch() + app.exit(0)） */
  relaunch: () => void;
  updater: Updater;
  getWindow: () => BrowserWindow | null;
}

/** 带码 Error：code 会被 shared/errors.ts deriveIpcCode 识别并跨进程传递 */
function codedError(code: string, detail?: string): Error {
  const e = new Error(detail ? `${code}: ${detail}` : code);
  (e as Error & { code?: string }).code = code;
  return e;
}

/** dev 白名单原点（registerIpcHandlers 入口赋值；prod 为 null） */
let ipcDevOrigin: string | null = null;

/** 包装：zod 校验 + 错误脱敏 + 错误码跨进程编码。
 * Electron invoke 拒绝时只序列化 Error.message（自定义 .code 丢失），
 * 故统一编码为 EASYUI_ERR:{code,message}（见 shared/errors.ts）；
 * 渲染进程用 parseIpcError 解码。 */
function handle<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (...args: TArgs) => Promise<TResult> | TResult,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      // @req REQ-2026-001 I3：只接受应用文档自身 frame 的调用
      // （防寄生页面/异常窗口拿到全部 IPC 权限）
      if (!isAppFrameUrl(event.senderFrame?.url, ipcDevOrigin)) throw new Error('invalid_sender');
      return await fn(...(args as TArgs));
    } catch (e) {
      const safe = redact(e);
      const err = safe instanceof Error ? safe : new Error(redactString(String(safe)));
      logger.warn(`ipc ${channel} failed`, err.message);
      throw serializeIpcError(err);
    }
  });
}

/** 解析"providerId 或 draft"两种形态的 (baseUrl, format, key)，draft.api_key 或库内已存密钥 */
function resolveEndpoint(
  deps: IpcDeps,
  input: { providerId?: string; draft?: z.infer<typeof providerDraftSchema> },
): { baseUrl: string; format: ApiFormat; apiKey: string } {
  if (input.draft) {
    const key = input.draft.api_key ?? '';
    if (key) registerSecret(key);
    return { baseUrl: input.draft.base_url, format: input.draft.api_format, apiKey: key };
  }
  if (input.providerId) {
    const row = deps.providers.getRow(input.providerId);
    if (!row) throw new Error('provider_not_found');
    if (!row.api_key_cipher) throw new Error('missing_api_key');
    const key = deps.crypto.decryptString(row.api_key_cipher.toString('utf8'));
    registerSecret(key);
    return { baseUrl: row.base_url, format: row.api_format, apiKey: key };
  }
  throw new Error('invalid_input');
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { providers, conversations, messages, settings, presets, crypto, orchestrator, backup } =
    deps;
  ipcDevOrigin = process.env.VITE_DEV_SERVER_URL
    ? new URL(process.env.VITE_DEV_SERVER_URL).origin
    : null;

  /* —— 平台管理 —— */
  handle(IPC.listProviders, () => providers.list());

  handle(IPC.createProvider, (raw: unknown) => {
    const draft = providerDraftSchema.parse(raw);
    if (draft.api_key) registerSecret(draft.api_key);
    return providers.insert({
      name: draft.name,
      base_url: draft.base_url,
      api_format: draft.api_format,
      api_key_cipher: draft.api_key ? Buffer.from(crypto.encryptString(draft.api_key), 'utf8') : null,
    });
  });

  handle(IPC.updateProvider, (id: unknown, raw: unknown) => {
    const providerId = z.string().min(1).parse(id);
    const patch = updateProviderSchema.parse(raw);
    if (patch.api_key) registerSecret(patch.api_key);
    // @req REQ-2026-001 C1：带密钥 provider 的 base_url 换 host 且未同时给新 key
    // → 自动清除已存密钥（否则恶意调用可把解密后的 key 发往攻击者端点）。
    let clearKeyOnHostChange = false;
    if (patch.base_url !== undefined && patch.api_key === undefined) {
      const row = providers.getRow(providerId);
      if (row?.api_key_cipher && shouldClearKeyOnBaseUrlChange(row.base_url, patch.base_url)) {
        clearKeyOnHostChange = true;
        logger.info('provider key cleared: base_url host changed', { providerId });
      }
    }
    const updated = providers.update(providerId, {
      name: patch.name,
      base_url: patch.base_url,
      api_format: patch.api_format,
      api_key_cipher:
        patch.api_key === undefined
          ? clearKeyOnHostChange
            ? null // 换 host 自动清除
            : undefined // 保持不变
          : patch.api_key === ''
            ? null // 空串 = 清除密钥
            : Buffer.from(crypto.encryptString(patch.api_key), 'utf8'),
      models: patch.models,
    });
    if (!updated) throw new Error('provider_not_found');
    return updated;
  });

  handle(IPC.deleteProvider, (id: unknown) => providers.delete(z.string().min(1).parse(id)));

  handle(IPC.getPresets, () => [...PRESETS]);

  handle(IPC.fetchModels, async (raw: unknown) => {
    const input = fetchModelsSchema.parse(raw);
    const ep = resolveEndpoint(deps, input);
    return listModels(ep.baseUrl, ep.format, ep.apiKey);
  });

  handle(IPC.testModel, async (providerId: unknown, modelId: unknown) => {
    const pid = z.string().min(1).parse(providerId);
    const mid = z.string().min(1).parse(modelId);
    const row = providers.getRow(pid);
    if (!row) throw new Error('provider_not_found');
    if (!row.api_key_cipher) throw new Error('missing_api_key');
    const key = crypto.decryptString(row.api_key_cipher.toString('utf8'));
    registerSecret(key);
    const check = await testModel({
      baseUrl: row.base_url,
      apiFormat: row.api_format,
      apiKey: key,
      model: mid,
    });
    providers.updateModelCheck(pid, mid, check);
    return check;
  });

  handle(IPC.testAllModels, async (providerId: unknown) => {
    const pid = z.string().min(1).parse(providerId);
    const row = providers.getRow(pid);
    if (!row) throw new Error('provider_not_found');
    if (!row.api_key_cipher) throw new Error('missing_api_key');
    const key = crypto.decryptString(row.api_key_cipher.toString('utf8'));
    registerSecret(key);
    const provider = providers.get(pid);
    const modelIds = (provider?.models ?? [])
      .filter((m: ProviderModel) => m.enabled)
      .map((m: ProviderModel) => m.id);
    const win = deps.getWindow();
    await testAllModels({
      baseUrl: row.base_url,
      apiFormat: row.api_format,
      apiKey: key,
      modelIds,
      concurrency: 4,
      onEach: (modelId: string, check: ModelCheck) => {
        providers.updateModelCheck(pid, modelId, check);
        win?.webContents.send(EVT.modelCheck, { providerId: pid, modelId, check });
      },
    });
  });

  handle(IPC.detectFormat, async (raw: unknown) => {
    const input = detectFormatSchema.parse(raw);
    let apiKey = input.api_key ?? '';
    if (!apiKey && input.providerId) {
      const row = providers.getRow(input.providerId);
      if (row?.api_key_cipher) {
        apiKey = crypto.decryptString(row.api_key_cipher.toString('utf8'));
      }
    }
    if (apiKey) registerSecret(apiKey);
    return gwDetectFormat(input.base_url, apiKey);
  });

  /* —— 会话与消息 —— */
  handle(IPC.listConversations, () => conversations.list());
  handle(IPC.createConversation, () => conversations.create());
  handle(IPC.updateConversation, (id: unknown, raw: unknown) => {
    const cid = z.string().min(1).parse(id);
    const patch = updateConversationSchema.parse(raw);
    const current = conversations.get(cid);
    if (!current) throw new Error('conversation_not_found');

    // preset_id：undefined=不变；null=全局预设；否则必须存在
    let presetId = patch.preset_id === undefined ? current.preset_id : patch.preset_id;
    if (presetId !== null && !presets.get(presetId)) throw new Error('preset_not_found');

    // params patch = overrides 合并：以"（可能新选的）预设"为基线做等值修剪
    let overrides = current.overrides;
    if (patch.params) {
      const globalParams = presets.get(GLOBAL_PRESET_ID)?.params ?? FACTORY_DEFAULTS;
      const preset = presetId ? presets.get(presetId) : null;
      const base = resolveParams(globalParams, preset, {});
      overrides = applyOverridePatch(base, current.overrides, patch.params);
    }

    const updated = conversations.update(cid, {
      title: patch.title,
      pinned: patch.pinned,
      provider_id: patch.provider_id,
      model: patch.model,
      preset_id: patch.preset_id,
      reasoning_enabled: patch.reasoning_enabled,
      overrides: patch.params ? overrides : undefined,
    });
    if (!updated) throw new Error('conversation_not_found');
    return updated;
  });
  handle(IPC.deleteConversation, (id: unknown) =>
    conversations.delete(z.string().min(1).parse(id)),
  );
  handle(IPC.listMessages, (conversationId: unknown) =>
    messages.list(z.string().min(1).parse(conversationId)),
  );
  handle(IPC.generateTitle, (conversationId: unknown) =>
    orchestrator.generateTitle(z.string().min(1).parse(conversationId)),
  );

  /* —— 树形分支操作（schema v3） —— */

  /** 校验消息存在且属于该会话，返回消息（供分支操作复用） */
  const requireMessageInConv = (conversationId: string, messageId: string) => {
    const msg = messages.get(messageId);
    if (!msg || msg.conversation_id !== conversationId) throw new Error('message_not_found');
    return msg;
  };

  handle(IPC.switchBranch, (raw: unknown) => {
    const input = messageAnchorSchema.parse(raw);
    requireMessageInConv(input.conversationId, input.messageId);
    messages.switchToSibling(input.conversationId, input.messageId);
    return messages.list(input.conversationId);
  });

  handle(IPC.setActiveLeaf, (raw: unknown) => {
    const input = messageAnchorSchema.parse(raw);
    requireMessageInConv(input.conversationId, input.messageId);
    messages.setActiveLeaf(input.conversationId, input.messageId);
    return messages.list(input.conversationId);
  });

  handle(IPC.updateMessageContent, (raw: unknown) => {
    const input = updateMessageContentSchema.parse(raw);
    requireMessageInConv(input.conversationId, input.messageId);
    const updated = messages.update(input.messageId, {
      content: input.content,
      token_count: defaultTokenCounter(input.content), // 内容变了，缓存的估算值同步刷新
    });
    if (!updated) throw new Error('message_not_found');
    return updated;
  });

  handle(IPC.deleteMessages, (raw: unknown) => {
    const input = deleteMessagesSchema.parse(raw);
    for (const id of input.ids) requireMessageInConv(input.conversationId, id);
    messages.deleteWithDescendants(input.conversationId, input.ids);
    return messages.list(input.conversationId);
  });

  /* —— 参数预设 —— */
  handle(IPC.listParamPresets, () => presets.list());

  handle(IPC.createParamPreset, (raw: unknown) =>
    presets.create(createParamPresetSchema.parse(raw)),
  );

  handle(IPC.updateParamPreset, (id: unknown, raw: unknown) => {
    const pid = z.string().min(1).parse(id);
    const patch = updateParamPresetSchema.parse(raw);
    const existing = presets.get(pid);
    if (!existing) throw new Error('preset_not_found');
    // 全局预设只允许改 params
    if (existing.is_global && patch.name !== undefined && patch.name !== existing.name) {
      throw new Error('global_preset_readonly');
    }
    const updated = presets.update(pid, patch);
    if (!updated) throw new Error('preset_not_found');
    return updated;
  });

  handle(IPC.deleteParamPreset, (id: unknown) => {
    const pid = z.string().min(1).parse(id);
    const existing = presets.get(pid);
    if (!existing) throw new Error('preset_not_found');
    if (existing.is_global) throw new Error('global_preset_readonly');
    presets.delete(pid); // 引用会话的 preset_id 在 DAO 内置 null
  });

  handle(IPC.resetGlobalPreset, () => presets.resetGlobal());

  /* —— 对话生成 —— */
  handle(IPC.sendMessage, (raw: unknown) =>
    orchestrator.sendMessage(sendMessageSchema.parse(raw)),
  );
  handle(IPC.regenerateMessage, (raw: unknown) =>
    orchestrator.regenerateMessage(messageAnchorSchema.parse(raw)),
  );
  handle(IPC.continueMessage, async (raw: unknown) => {
    await orchestrator.continueMessage(messageAnchorSchema.parse(raw));
  });
  handle(IPC.generateResponse, (raw: unknown) =>
    orchestrator.generateResponse(generateResponseSchema.parse(raw)),
  );
  handle(IPC.stopGeneration, (conversationId: unknown) => {
    orchestrator.stopGeneration(z.string().min(1).parse(conversationId));
  });

  /* —— 通用设置 / 系统信息 —— */
  handle(IPC.getSettings, () => settings.get());
  handle(IPC.setSettings, (raw: unknown) => settings.set(settingsPatchSchema.parse(raw)));
  handle(IPC.getSystemInfo, (): SystemInfo => ({
    dataPath: deps.dataDir,
    dataPathSource: deps.dataPathSource,
    isPortable: deps.isPortable,
    isElectron: true,
    version: deps.appVersion,
    encryption: crypto.status(),
    platform: process.platform,
  }));

  /* —— 数据目录（Electron 独占） —— */
  handle(IPC.pickDataDir, async (): Promise<string | null> => {
    const options = {
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
      title: '选择数据存储目录',
    };
    const win = deps.getWindow();
    const r = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
  });

  handle(IPC.setDataDir, async (raw: unknown): Promise<DataDirMigrationResult> => {
    const input = setDataDirSchema.parse(raw);
    if (!path.isAbsolute(input.path)) throw codedError('invalid_dir', input.path);

    const current = path.resolve(deps.dataDir);
    const target = path.resolve(input.path);
    const eq = (a: string, b: string) =>
      process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

    // 目标就是当前数据目录本身 → 无操作
    if (eq(target, current)) {
      return { status: 'noop', needsRestart: false, path: current };
    }
    // 防嵌套：目标是当前目录的子目录，或当前目录的父目录
    const isSub = (parent: string, child: string) => {
      const rel = path.relative(parent, child);
      return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
    };
    if (isSub(current, target)) {
      throw codedError('dir_inside_current', '目标目录不能位于当前数据目录内部');
    }
    if (isSub(target, current)) {
      throw codedError('dir_inside_current', '目标目录不能是当前数据目录的父目录');
    }

    // 可写探测（不存在则创建）
    try {
      fs.mkdirSync(target, { recursive: true });
      const probe = path.join(target, `.writetest-${process.pid}-${Date.now()}`);
      fs.writeFileSync(probe, 'ok');
      fs.rmSync(probe, { force: true });
    } catch {
      throw codedError('dir_not_writable', target);
    }

    const writePointer = () => {
      try {
        fs.mkdirSync(path.dirname(deps.pointerPath), { recursive: true });
        fs.writeFileSync(deps.pointerPath, JSON.stringify({ dataDir: target }), 'utf8');
      } catch {
        throw codedError('dir_not_writable', `指针文件写入失败: ${deps.pointerPath}`);
      }
    };

    // 目标已含 Easy WebUI 数据 → 不复制，仅写指针直接采用
    if (
      fs.existsSync(path.join(target, 'easyui.db')) ||
      fs.existsSync(path.join(target, 'storage-layout.json'))
    ) {
      writePointer();
      logger.info('data dir switched (existing data)', { from: current, to: target });
      return { status: 'switched', needsRestart: true, path: target };
    }

    // 目标为空 → 先把 WAL 收编回主库文件，再整体复制；绝不删除旧目录数据
    deps.db.pragma('wal_checkpoint(TRUNCATE)');
    try {
      fs.cpSync(current, target, { recursive: true });
    } catch (e) {
      throw codedError(
        'dir_not_writable',
        `复制失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    writePointer();
    logger.info('data dir migrated', { from: current, to: target });
    return { status: 'migrated', needsRestart: true, path: target };
  });

  handle(IPC.relaunchApp, () => {
    deps.relaunch();
  });

  handle(IPC.openExternal, async (raw: unknown) => {
    const url = openExternalSchema.parse(raw);
    await shell.openExternal(url);
  });

  /* —— 在线升级 —— */
  handle(IPC.updateCheck, () => deps.updater.check());
  handle(IPC.updateDownload, () => deps.updater.download());
  handle(IPC.updateInstall, () => deps.updater.install());
  handle(IPC.updateGetState, () => deps.updater.getState());

  /* —— 备份 —— */
  /** 本会话 pickBackupFile 对话框放行过的路径（restoreBackup 白名单用，@req REQ-2026-001） */
  const pickedBackupPaths = new Set<string>();
  handle(IPC.listBackups, () => backup.listBackups());
  handle(IPC.createBackup, (raw: unknown) => backup.createBackup(createBackupSchema.parse(raw)));
  handle(IPC.restoreBackup, async (raw: unknown) => {
    const input = restoreBackupSchema.parse(raw);
    // @req REQ-2026-001：恢复路径只接受 backups 目录内文件或本会话对话框
    // （pickBackupFile）选择过的文件——zod 只管"绝对路径 .zip"形状，
    // 这层把任意磁盘 zip 解析原语收窄到用户可见来源
    if (!isAllowedRestorePath(input.path, backup.dir(), pickedBackupPaths)) {
      throw codedError('invalid_backup_path');
    }
    return backup.restoreBackup(input);
  });
  handle(IPC.deleteBackup, (filename: unknown) =>
    backup.deleteBackup(z.string().min(1).parse(filename)),
  );
  handle(IPC.openBackupsDir, async () => {
    await shell.openPath(backup.dir());
  });
  handle(IPC.pickBackupFile, async () => {
    const win = deps.getWindow();
    if (!win) return null;
    const r = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'zip', extensions: ['zip'] }],
    });
    const picked = r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
    if (picked) pickedBackupPaths.add(normalizeFsPath(picked));
    return picked;
  });
}
