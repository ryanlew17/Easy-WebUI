/**
 * 会话标题生成 —— 纯逻辑（无 electron / node / better-sqlite3 依赖，vitest 可直测）。
 * 主进程（electron/chat.ts）与 Web 预览 mock 桥（src/bridge/mock.ts）共用本模块，
 * 保证两端解析优先级与失败语义完全一致。
 *
 * 失败语义（错误码，主进程抛 GatewayError、mock 抛 Error）：
 * - title_model_unavailable：解析不到任何可用模型（设置未指定 + 会话未选模型），
 *   或指定的 provider 不存在 / 无 API 密钥；
 * - title_no_user_message：会话尚无任何 user 消息，没有可总结的输入；
 * - 其余网关错误（网络/限流/超时等）原样透传 code。
 */

export const TITLE_TIMEOUT_MS = 20_000; // 单次尝试总超时
export const TITLE_RETRY_DELAY_MS = 800; // 失败后重试间隔
export const TITLE_MAX_ATTEMPTS = 2; // 首次 + 重试 1 次
export const TITLE_MAX_LEN = 60; // 落库标题长度上限

export interface TitleTarget {
  provider_id: string;
  model: string;
}

interface TitleSettingsLike {
  title_provider_id: string | null;
  title_model: string | null;
}

interface TitleConvLike {
  provider_id: string | null;
  model: string | null;
}

/**
 * 标题模型解析优先级：
 * 1) 设置里完整指定（title_provider_id + title_model 均非空）→ 指定模型；
 * 2) 否则回退会话当前所用模型；
 * 3) 都缺 → null（调用方报 title_model_unavailable）。
 * 设置只填一半（如只有 provider 没选模型）视为未指定，整体回退会话模型。
 */
export function resolveTitleTarget(
  settings: TitleSettingsLike,
  conv: TitleConvLike | null,
): TitleTarget | null {
  const sp = settings.title_provider_id?.trim() ?? '';
  const sm = settings.title_model?.trim() ?? '';
  if (sp && sm) return { provider_id: sp, model: sm };
  const cp = conv?.provider_id?.trim() ?? '';
  const cm = conv?.model?.trim() ?? '';
  if (cp && cm) return { provider_id: cp, model: cm };
  return null;
}

/** 标题文本清洗：去首尾引号/书名号、取首行、限长；空输入 → '' */
export function sanitizeTitle(raw: string, maxLen: number = TITLE_MAX_LEN): string {
  return raw
    .trim()
    .replace(/^["'“”‘’「『]+|["'“”‘’」』]+$/g, '')
    .split('\n')[0]
    .trim()
    .slice(0, maxLen);
}

/**
 * 超时信号：ms 后 abort；调用方负责在收尾 cancel() 清计时器
 * （否则成功路径会挂着一个计时器到点才销）。
 */
export function timeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // 主进程场景：不让计时器阻止进程退出（浏览器无 unref，做特性判断）
  if (typeof timer === 'object' && typeof timer.unref === 'function') timer.unref();
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export interface RetryOptions {
  /** 总尝试次数（默认 TITLE_MAX_ATTEMPTS = 首次 + 重试 1 次） */
  attempts?: number;
  /** 两次尝试间的间隔（默认 TITLE_RETRY_DELAY_MS） */
  delayMs?: number;
  /** 可注入的 sleep（测试用假时钟 / 免等待） */
  sleep?: (ms: number) => Promise<void>;
}

/** 通用"失败 → 间隔 → 重试"执行器：所有尝试用尽后抛出最后一次错误 */
export async function runWithRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const attempts = Math.max(1, opts?.attempts ?? TITLE_MAX_ATTEMPTS);
  const delayMs = opts?.delayMs ?? TITLE_RETRY_DELAY_MS;
  const sleep = opts?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastErr;
}
