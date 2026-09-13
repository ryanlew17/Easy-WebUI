/**
 * redact() —— 日志与错误的统一脱敏（docs/design/security.md，日志与脱敏）。
 *
 * 设计：进程内维护"已知密钥注册表"（registerSecret），凡是要离开主进程安全边界的
 * 字符串/对象/Error（日志行、IPC throw、事件 payload）一律先过 redact()，
 * 递归地把出现过的密钥原文替换为 `前 3 字符 + '***'`（如 sk-ab***）。
 *
 * 本模块不依赖 electron / node 内置模块以外的任何东西，保持纯函数可测。
 */

const secrets = new Set<string>();

/** 注册一个已知密钥（解密瞬间、收到 draft.api_key 时调用）。过短的值忽略，避免误伤。 */
export function registerSecret(secret: string | null | undefined): void {
  if (typeof secret === 'string' && secret.length >= 4) {
    secrets.add(secret);
  }
}

/** 仅测试用：清空注册表。 */
export function clearRegisteredSecrets(): void {
  secrets.clear();
}

function mask(secret: string): string {
  return secret.slice(0, 3) + '***';
}

export function redactString(input: string): string {
  let out = input;
  for (const s of secrets) {
    if (s && out.includes(s)) {
      out = out.split(s).join(mask(s));
    }
  }
  return out;
}

/**
 * 递归脱敏：string / Array / 普通对象 / Error。
 * 不修改入参，返回新值；Error 保留 name 与 code。
 */
export function redact<T>(value: T): T {
  if (typeof value === 'string') {
    return redactString(value) as unknown as T;
  }
  if (value instanceof Error) {
    const e = new Error(redactString(value.message));
    e.name = value.name;
    const code = (value as { code?: unknown }).code;
    if (typeof code === 'string') (e as { code?: string }).code = code;
    if (value.stack) e.stack = redactString(value.stack);
    return e as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v);
    }
    return out as T;
  }
  return value;
}
