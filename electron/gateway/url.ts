/**
 * URL 拼接规则（docs/contracts/protocol-mapping.md，URL 拼接）。
 *
 * 按"最小惊讶原则"：
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
