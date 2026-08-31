/**
 * 上下文裁剪测试（kimi.md §4.3）：注入固定 token 计数器（1 字符 = 1 token，便于心算），
 * 验证预算计算、成对丢弃、系统提示保留、单条超长截断、已缓存 token_count 优先。
 */
import { describe, expect, it } from 'vitest';
import { trimMessages, truncateToTokens, type TrimInputMessage } from '../electron/gateway/trim';

const counter = (t: string): number => t.length;

const params = { max_tokens: 100, context_window: 1000 };
// 预算 = 1000 − 100 − 256 = 644

const msg = (role: TrimInputMessage['role'], len: number, cached?: number): TrimInputMessage => ({
  role,
  content: 'x'.repeat(len),
  token_count: cached,
});

describe('trimMessages', () => {
  it('预算计算：min(context_window) − max_tokens − 256', () => {
    const r = trimMessages({ messages: [msg('user', 10)], params, counter });
    expect(r.budget).toBe(644);
    expect(r.dropped).toBe(0);
    expect(r.truncated).toBe(false);
    expect(r.totalTokens).toBe(10);
  });

  it('模型上限小于 context_window 时取更小值', () => {
    const r = trimMessages({ messages: [msg('user', 10)], params, counter, modelLimit: 500 });
    expect(r.budget).toBe(500 - 100 - 256);
  });

  it('未超预算：原样保留全部消息', () => {
    const r = trimMessages({
      messages: [msg('system', 10), msg('user', 100), msg('assistant', 100), msg('user', 100)],
      params,
      counter,
    });
    expect(r.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(r.dropped).toBe(0);
  });

  it('超预算：从最老的 user/assistant 对开始成对丢弃，系统提示保留', () => {
    const r = trimMessages({
      messages: [
        msg('system', 10),
        msg('user', 200),
        msg('assistant', 200),
        msg('user', 200),
        msg('assistant', 200),
        msg('user', 200),
      ],
      params,
      counter,
    });
    // 总量 1010 > 644 → 丢 u1+a1（−400 → 610 ≤ 644 停）
    expect(r.dropped).toBe(2);
    expect(r.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(r.messages[0].content).toBe('x'.repeat(10)); // 系统提示原样
    expect(r.totalTokens).toBe(610);
  });

  it('只剩 2 条且仍超预算：丢最老 1 条，保住最后一条', () => {
    const r = trimMessages({
      messages: [msg('user', 500), msg('assistant', 300)],
      params,
      counter,
    });
    expect(r.dropped).toBe(1);
    expect(r.messages.map((m) => m.role)).toEqual(['assistant']);
  });

  it('单条消息超预算：截断该消息并标记 truncated', () => {
    const r = trimMessages({
      messages: [msg('system', 10), msg('user', 2000)],
      params,
      counter,
    });
    expect(r.truncated).toBe(true);
    expect(r.dropped).toBe(0);
    const user = r.messages.find((m) => m.role === 'user');
    expect(user?.content.length).toBe(644 - 10); // 预算减去系统提示
    expect(user?.token_count).toBe(644 - 10);
  });

  it('极端：系统提示本身就超预算 → 截断系统提示', () => {
    const r = trimMessages({ messages: [msg('system', 2000)], params, counter });
    expect(r.truncated).toBe(true);
    expect(r.messages[0].content.length).toBe(644);
  });

  it('已缓存 token_count 优先于计数器', () => {
    const r = trimMessages({
      // 内容仅 10 字符，但缓存记 500 token —— 总计 1000 > 644 触发丢弃；
      // 若用计数器（10+10=20）则不会丢，由此证明缓存优先。
      messages: [msg('user', 10, 500), msg('assistant', 10, 500)],
      params,
      counter,
    });
    expect(r.dropped).toBe(1);
    expect(r.messages.map((m) => m.role)).toEqual(['assistant']);
  });
});

describe('truncateToTokens', () => {
  it('未超预算原样返回', () => {
    expect(truncateToTokens('abc', 10, counter)).toBe('abc');
  });
  it('截断到预算长度', () => {
    expect(truncateToTokens('a'.repeat(100), 30, counter).length).toBe(30);
  });
  it('预算为 0 返回空串', () => {
    expect(truncateToTokens('abc', 0, counter)).toBe('');
  });
});

/* ---------- 输出预留与溢出策略（schema v2 新增） ---------- */

describe('trimMessages 输出预留', () => {
  it('limit_response_length 关闭 → 预留 DEFAULT_OUTPUT_RESERVE(4096) 而非 max_tokens', () => {
    const r = trimMessages({
      messages: [msg('user', 10)],
      params: { max_tokens: 100, context_window: 5000, limit_response_length: false },
      counter,
    });
    expect(r.budget).toBe(5000 - 4096 - 256);
  });

  it('limit_response_length 显式开启 → 预留 max_tokens', () => {
    const r = trimMessages({
      messages: [msg('user', 10)],
      params: { max_tokens: 100, context_window: 5000, limit_response_length: true },
      counter,
    });
    expect(r.budget).toBe(5000 - 100 - 256);
  });

  it('limit_response_length 缺省 → 视为开（兼容旧调用，预留 max_tokens）', () => {
    const r = trimMessages({
      messages: [msg('user', 10)],
      params: { max_tokens: 100, context_window: 5000 },
      counter,
    });
    expect(r.budget).toBe(5000 - 100 - 256);
  });
});

describe('trimMessages 策略：truncate_middle', () => {
  // 预算仍为 644（params: max_tokens 100 / context_window 1000）
  it('保系统提示 + 最老一轮 + 尽量新的尾部，丢中段', () => {
    const r = trimMessages({
      messages: [
        msg('system', 10),
        msg('user', 200), // u1 ┐ 最老一轮
        msg('assistant', 200), // a1 ┘
        msg('user', 200), // u2 ┐
        msg('assistant', 200), // a2 ├ 中段（应被丢）
        msg('user', 200), // u3 ┘
        msg('assistant', 200), // a3 ← 最新尾部
      ],
      params,
      strategy: 'truncate_middle',
      counter,
    });
    // 头 u1+a1(400)+sys(10)=410；尾部从最新往里装：a3 → 610；再装 u3 会 810>644 停
    expect(r.dropped).toBe(3);
    expect(r.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'assistant']);
    expect(r.totalTokens).toBe(610);
    expect(r.truncated).toBe(false);
  });

  it('头+尾都装不下 → 丢头退化，只保最后一条', () => {
    const r = trimMessages({
      messages: [msg('user', 300), msg('assistant', 300), msg('user', 400)],
      params,
      strategy: 'truncate_middle',
      counter,
    });
    // 头 600 + 尾 400 = 1000 > 644 → 丢头；尾 400 ≤ 644 保留
    expect(r.dropped).toBe(2);
    expect(r.messages.map((m) => m.role)).toEqual(['user']);
    expect(r.messages[0].content.length).toBe(400);
    expect(r.truncated).toBe(false);
  });

  it('只剩最后一条仍超预算 → 截断该条', () => {
    const r = trimMessages({
      messages: [msg('user', 300), msg('assistant', 300), msg('user', 900)],
      params,
      strategy: 'truncate_middle',
      counter,
    });
    expect(r.dropped).toBe(2); // 头被丢
    expect(r.truncated).toBe(true);
    expect(r.messages).toHaveLength(1);
    expect(r.messages[0].content.length).toBe(644);
    expect(r.totalTokens).toBe(644);
  });

  it('未超预算时与 rolling 一致：原样保留', () => {
    const r = trimMessages({
      messages: [msg('system', 10), msg('user', 100), msg('assistant', 100)],
      params,
      strategy: 'truncate_middle',
      counter,
    });
    expect(r.dropped).toBe(0);
    expect(r.messages).toHaveLength(3);
  });
});

describe('trimMessages 策略：stop', () => {
  it('超预算 → overflow=true，不丢不截，消息原样返回', () => {
    const r = trimMessages({
      messages: [msg('system', 10), msg('user', 500), msg('assistant', 300)],
      params,
      strategy: 'stop',
      counter,
    });
    expect(r.overflow).toBe(true);
    expect(r.dropped).toBe(0);
    expect(r.truncated).toBe(false);
    expect(r.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
    expect(r.totalTokens).toBe(810);
  });

  it('未超预算 → overflow=false', () => {
    const r = trimMessages({
      messages: [msg('user', 10)],
      params,
      strategy: 'stop',
      counter,
    });
    expect(r.overflow).toBe(false);
  });

  it('单条超长也不截断（截断语义只属于 rolling/truncate_middle）', () => {
    const r = trimMessages({
      messages: [msg('user', 2000)],
      params,
      strategy: 'stop',
      counter,
    });
    expect(r.overflow).toBe(true);
    expect(r.truncated).toBe(false);
    expect(r.messages[0].content.length).toBe(2000);
  });
});
