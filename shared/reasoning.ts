/**
 * 思考（reasoning/thinking）开关支持 —— 两端共用。
 *
 * 语义（用户约定）：
 * - 支持 reasoning 的模型默认都会开思考，因此 reasoning_enabled=true 时**不附加任何参数**；
 * - reasoning_enabled=false 时按 api_format 附加"关闭思考"参数（reasoningOffPayload）；
 * - 模型能力未知时默认支持（按钮显示）；仅对已确认不支持推理的模型隐藏开关。
 */
import type { ApiFormat } from './types';

/**
 * 已确认不支持 reasoning 的模型 id 模式（小写子串匹配）。
 * 保守原则：只收录确定不含思考能力的系列；拿不准的一律不收（默认支持）。
 * - gpt-3.5 / gpt-4o / gpt-4-turbo 等 OpenAI 非推理系列（o1/o3/gpt-5 等不在列）
 * - moonshot-v1 / kimi-k2-instruct：Kimi 非思考系列（kimi-k2-thinking 不在列）
 * - deepseek-v3 旧版非思考端点以 deepseek-chat 历史形态存在（deepseek-reasoner 不在列）；
 *   DeepSeek V3.1+ 的 deepseek-chat 支持 thinking 切换，故不收
 * - llama / mistral / gemma / phi / qwen2.5 等开源基础系列（qwen3 思考切换版不在列）
 * - glm-4 非思考系列（glm-z1 / glm-4.5 思考版不在列）
 */
const NON_REASONING_PATTERNS: readonly string[] = [
  'gpt-3.5',
  'gpt-4o',
  'gpt-4-turbo',
  'moonshot-v1',
  'kimi-k2-instruct',
  'kimi-latest',
  'llama',
  'mistral',
  'mixtral',
  'gemma',
  'phi-',
  'qwen2.5',
  'glm-4-air',
  'glm-4-flash',
];

/** 模型是否支持 reasoning 开关（未知 → true） */
export function modelSupportsReasoning(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return !NON_REASONING_PATTERNS.some((p) => id.includes(p));
}

/**
 * reasoning_enabled=false 时按 API 协议附加的请求体片段：
 * - openai-chat：DeepSeek/Kimi/智谱/SiliconFlow 等通行的 `thinking: {type:'disabled'}`；
 * - openai-responses：`reasoning: {effort:'none'}`（OpenAI Responses 推理档位关闭形态）；
 * - anthropic：`thinking: {type:'disabled'}`（Anthropic 显式关闭形态）。
 */
export function reasoningOffPayload(format: ApiFormat): Record<string, unknown> {
  switch (format) {
    case 'openai-chat':
      return { thinking: { type: 'disabled' } };
    case 'openai-responses':
      return { reasoning: { effort: 'none' } };
    case 'anthropic':
      return { thinking: { type: 'disabled' } };
  }
}
