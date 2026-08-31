/**
 * URL 拼接规则（契约 §3）。
 *
 * 取舍说明：kimi.md 写作 `{base}/v1/chat/completions`，但大量服务商的 base_url
 * 已含版本段（/v1 /v3 /v4，如智谱 `open.bigmodel.cn/api/paas/v4`）或 Anthropic
 * 兼容前缀（如 `api.xiaomimimo.com/anthropic`）。盲目叠加 `/v1` 会产生
 * `/v4/v1/chat/completions` 这类 404。按"最小惊讶原则"：
 * - 先去末尾斜杠；
 * - base 已以 `/v\d+` 结尾 → 直接拼接 path，不再叠加 /v1；
 * - 否则补 `/v1`。
 * 注意：`/anthropic` 兼容前缀（如 `api.xiaomimimo.com/anthropic`）不算版本段——
 * Anthropic Messages API 真实路径是 `{base}/v1/messages`，因此该类 base 仍补
 * `/v1`，得到 `…/anthropic/v1/messages`（与官方 SDK 行为一致）。
 * 已知局限：base 含版本段但不在末尾（罕见）时不识别，保持简单规则优先。
 */
export function joinUrl(rawBase: string, path: string): string {
  const base = rawBase.replace(/\/+$/, '');
  const versioned = /\/v\d+$/.test(base); // 仅 /vN 结尾视为已带版本段
  return versioned ? `${base}${path}` : `${base}/v1${path}`;
}
