/**
 * 上下文裁剪（docs/design/context-trim.md）——纯函数，可注入 token 计数器测试。
 *
 * 规则：
 * 1. token 估算默认 js-tiktoken cl100k_base；加载/编码失败回退 ceil(chars/3)（中文偏保守）。
 * 2. 预算 = min(context_window, 模型上限 ?? context_window) − 输出预留 − 256（安全余量）。
 *    输出预留：Limit Response Length 开启时为 max_tokens；关闭时回退 4096
 *    （保持旧版"总是预留 max_tokens"的保守行为，避免无限生成顶爆上下文）。
 * 3. 溢出策略（strategy，对应 ParamValues.context_overflow）：
 *    - rolling（默认）：从最早的消息开始成对丢弃（user/assistant 对），
 *      但至少保留最后一条非 system 消息；
 *    - truncate_middle：保系统提示 + 最老一轮（头 1~2 条）+ 尽量新的尾部，丢中段；
 *      头+尾仍超预算则退化为"丢头、截断最后一条"；
 *    - stop：不做任何丢弃/截断，超预算时返回 overflow: true，
 *      由编排层（chat.ts）抛 ApiError{code:'context_overflow'} 阻断发送。
 * 4. rolling / truncate_middle 下，剩余单条消息仍超预算 → 按字符二分截断该消息，
 *    truncated: true（调用方经 onChatError 发 context_truncated 警告，不阻断）。
 *
 * 成对丢弃的取舍：历史可能以 assistant 开头（regenerate 删过尾），
 * 不严格校验角色配对，仅从头部每次丢 2 条（剩 2 条时丢 1 条保住最后一条），
 * 保证"最老优先 + 最后一条必留"，语义近似即可。
 */
import type { ContextOverflow } from '../../shared/params';

export type TokenCounter = (text: string) => number;

/** 裁剪输入只需这三个参数（从 ParamValues 投影；limit_response_length 缺省视为开，兼容旧调用） */
export interface TrimParams {
  max_tokens: number;
  context_window: number;
  limit_response_length?: boolean;
}

export type TrimStrategy = ContextOverflow;

export interface TrimInputMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  token_count?: number | null; // 已缓存的估算值优先
}

export interface TrimmedMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  token_count: number;
}

export interface TrimResult {
  messages: TrimmedMessage[];
  budget: number;
  totalTokens: number;
  dropped: number;
  truncated: boolean;
  /** 仅 strategy='stop'：超预算且未做任何裁剪（调用方必须中断发送） */
  overflow: boolean;
}

export const SAFETY_MARGIN = 256;
/** Limit Response Length 关闭时的输出预留（旧版默认 max_tokens 行为兜底） */
export const DEFAULT_OUTPUT_RESERVE = 4096;

/** 二分截断：返回 token 数 ≤ budget 的最长前缀（按字符二分，O(log n) 次计数） */
export function truncateToTokens(text: string, budget: number, counter: TokenCounter): string {
  if (budget <= 0) return '';
  if (counter(text) <= budget) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (counter(text.slice(0, mid)) <= budget) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo);
}

export function trimMessages(opts: {
  messages: TrimInputMessage[];
  params: TrimParams;
  strategy?: TrimStrategy;
  modelLimit?: number;
  counter: TokenCounter;
  safetyMargin?: number;
}): TrimResult {
  const { messages, params, counter } = opts;
  const strategy: TrimStrategy = opts.strategy ?? 'rolling';
  const margin = opts.safetyMargin ?? SAFETY_MARGIN;
  const reserve =
    params.limit_response_length === false ? DEFAULT_OUTPUT_RESERVE : params.max_tokens;
  const budget = Math.max(
    0,
    Math.min(params.context_window, opts.modelLimit ?? params.context_window) - reserve - margin,
  );

  const counted: TrimmedMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
    token_count: m.token_count ?? counter(m.content),
  }));

  const systems = counted.filter((m) => m.role === 'system');
  const convo = counted.filter((m) => m.role !== 'system');

  const total0 = counted.reduce((s, m) => s + m.token_count, 0);

  // stop：不裁剪，超预算只打 overflow 信号（由编排层阻断发送）
  if (strategy === 'stop') {
    return {
      messages: counted,
      budget,
      totalTokens: total0,
      dropped: 0,
      truncated: false,
      overflow: total0 > budget,
    };
  }

  let total = total0;
  let dropped = 0;
  let truncated = false;

  if (strategy === 'truncate_middle' && total > budget && convo.length > 1) {
    // 保 system + 最老一轮 + 尽量新的尾部，丢中段
    const sysTokens = systems.reduce((s, m) => s + m.token_count, 0);
    const headCount = convo.length >= 3 ? 2 : 1; // 最老一轮；至少给尾部留 1 条
    let head = convo.slice(0, headCount);
    const rest = convo.slice(headCount);

    const tail: TrimmedMessage[] = [];
    let used = sysTokens + head.reduce((s, m) => s + m.token_count, 0);
    for (let i = rest.length - 1; i >= 0; i--) {
      const m = rest[i];
      if (tail.length > 0 && used + m.token_count > budget) break;
      tail.unshift(m); // 至少保留最后一条（可能本身已超预算，下面退化逻辑处理）
      used += m.token_count;
    }
    dropped = rest.length - tail.length;

    if (used > budget) {
      // 头+最后一条都装不下 → 丢头（头也算 dropped），退化为只保尾部
      dropped += head.length;
      used -= head.reduce((s, m) => s + m.token_count, 0);
      head = [];
    }
    if (used > budget && tail.length > 0) {
      // 只剩尾部仍超预算 → 截断最老的一条尾部消息（通常只剩最后一条）
      const msg = tail[0];
      const room = budget - (used - msg.token_count);
      const next = truncateToTokens(msg.content, room, counter);
      if (next !== msg.content) {
        truncated = true;
        used -= msg.token_count;
        msg.content = next;
        msg.token_count = counter(next);
        used += msg.token_count;
      }
    }
    total = used;
    convo.splice(0, convo.length, ...head, ...tail);
  } else {
    // rolling：从最老的消息成对丢弃，但至少保留最后一条非 system 消息
    while (total > budget && convo.length > 1) {
      const n = convo.length >= 3 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        total -= convo[i].token_count;
      }
      convo.splice(0, n);
      dropped += n;
    }
  }

  // 单条仍超预算 → 截断（docs/design/context-trim.md，单条截断）
  if (total > budget && convo.length === 1) {
    const others = systems.reduce((s, m) => s + m.token_count, 0);
    const room = budget - others;
    const msg = convo[0];
    const next = truncateToTokens(msg.content, room, counter);
    if (next !== msg.content) {
      truncated = true;
      total -= msg.token_count;
      msg.content = next;
      msg.token_count = counter(next);
      total += msg.token_count;
    }
  } else if (total > budget && convo.length === 0 && systems.length > 0) {
    // 极端情况：系统提示本身就超预算，截断最后一条 system
    const last = systems[systems.length - 1];
    const others = total - last.token_count;
    const next = truncateToTokens(last.content, budget - others, counter);
    if (next !== last.content) {
      truncated = true;
      total -= last.token_count;
      last.content = next;
      last.token_count = counter(next);
      total += last.token_count;
    }
  }

  return {
    messages: [...systems, ...convo],
    budget,
    totalTokens: total,
    dropped,
    truncated,
    overflow: false,
  };
}

/* ---------------- 默认 token 计数器（js-tiktoken + 回退） ---------------- */

interface Encoder {
  encode(text: string): number[];
}

let encoderCache: Encoder | null | undefined;

function tryLoadEncoder(): Encoder | null {
  if (encoderCache !== undefined) return encoderCache;
  encoderCache = null;
  try {
    // 用 require 而非静态 import：vitest(ESM) 下 require 不存在会走 catch，
    // electron(CJS) 下若 js-tiktoken 加载失败同样回退——两条路径都不会炸模块。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = (typeof require === 'function' ? require : null)?.('js-tiktoken') as
      | { getEncoding?: (name: string) => Encoder }
      | undefined;
    if (mod?.getEncoding) {
      encoderCache = mod.getEncoding('cl100k_base');
    }
  } catch {
    encoderCache = null;
  }
  return encoderCache;
}

/** 默认估算器：cl100k_base；任何失败回退 ceil(chars/3)（中文偏保守；docs/design/context-trim.md 估算器） */
export const defaultTokenCounter: TokenCounter = (text: string): number => {
  const enc = tryLoadEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch {
      /* fall through */
    }
  }
  return Math.ceil(text.length / 3);
};
