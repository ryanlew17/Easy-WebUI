/**
 * 结构化输出（JSON Schema）解析助手 —— 纯逻辑，可单测。
 * 发送前校验：不可解析的 schema 直接抛 ApiError{code:'invalid_json_schema'}
 * （在 buildRequest 阶段抛出，请求根本不会发出）。
 */
import { GatewayError } from './errors';

export const STRUCTURED_OUTPUT_NAME = 'easyui_output';

/** 解析用户输入的 JSON Schema 文本；失败抛 GatewayError('invalid_json_schema') */
export function parseStructuredSchema(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new GatewayError(
      'invalid_json_schema',
      `structured output schema is not valid JSON: ${(e as Error).message}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new GatewayError('invalid_json_schema', 'structured output schema must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}
