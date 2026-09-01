/**
 * 适配层公共类型。注意与 prd.md §6 的 ChatRequest 的差异：
 * 适配器只接受"已解析"的字段（baseUrl/apiKey），providerId → 密钥的解析
 * 在编排层（electron/chat.ts）完成——这样适配层不含 DB 依赖，可纯单测。
 *
 * params 为"已解析生效"的完整 ParamValues（全局预设 ← 用户预设 ← 会话 overrides
 * 在 chat.ts 里 resolveParams 完成）；各适配器按协议能力挑选字段发送（契约 §5）。
 */
import type { ChatChunk, ParamValues, Usage } from '../../shared/types';

export interface AdapterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AdapterChatInput {
  baseUrl: string; // 已去末尾 '/'
  apiKey: string; // 已解密，仅存在于请求组装瞬间
  model: string;
  messages: AdapterMessage[];
  params: ParamValues;
  stream: boolean;
  signal: AbortSignal;
  /** true = 会话关闭了思考：buildRequest 混入 shared/reasoning.ts 的 reasoningOffPayload */
  reasoningOff?: boolean;
  /** 测试可注入更小的空闲超时；默认 60s（sse.DEFAULT_STREAM_IDLE_MS） */
  idleMs?: number;
}

export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface ProtocolAdapter {
  /** 组装请求（导出以便单测断言 payload，如 anthropic 顶层 system / top_k） */
  buildRequest(input: AdapterChatInput): BuiltRequest;
  chat(input: AdapterChatInput): AsyncGenerator<ChatChunk>;
}

export type { ChatChunk, ParamValues, Usage };
