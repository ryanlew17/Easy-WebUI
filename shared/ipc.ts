/**
 * 参数/预设及消息操作的 zod 入参 schema，主进程 handle 端逐一校验。
 * 轻量消费者从 ./ipc-constants 读取通道与限制常量，避免仅为常量引入 zod。
 */
import { z } from 'zod';

export {
  IPC,
  EVT,
  MAX_PROVIDER_MODELS,
  MAX_BACKUP_PASSWORD_CHARS,
} from './ipc-constants';
export type { IpcChannel, EventChannel } from './ipc-constants';

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

/** 会话 overrides patch：每键可缺省、可 null 删除，或设为合法新值。 */
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

/* ---------------- 树形消息 / 分支操作入参（schema v3） ---------------- */

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1).max(200_000),
  siblingOf: z.string().min(1).optional(),
});

export const messageAnchorSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

export const updateMessageContentSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  content: z.string().max(200_000),
});

export const deleteMessagesSchema = z.object({
  conversationId: z.string().min(1),
  ids: z.array(z.string().min(1)).min(1).max(500),
});
