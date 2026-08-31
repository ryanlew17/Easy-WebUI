/**
 * shared/title.ts 纯逻辑测试：标题模型解析优先级（resolveTitleTarget）、
 * 标题清洗（sanitizeTitle）、超时信号（timeoutSignal）、重试执行器（runWithRetry）。
 * 纯函数无 node/electron 依赖，vitest 直接跑。
 */
import { describe, expect, it } from 'vitest';
import {
  resolveTitleTarget,
  runWithRetry,
  sanitizeTitle,
  timeoutSignal,
  TITLE_RETRY_DELAY_MS,
} from '@shared/title';

const settings = (p: string | null, m: string | null) => ({
  title_provider_id: p,
  title_model: m,
});
const conv = (p: string | null, m: string | null) => ({ provider_id: p, model: m });

/* ---------------- resolveTitleTarget 优先级 ---------------- */

describe('resolveTitleTarget', () => {
  it('设置完整指定 → 设置优先（即使会话也有模型）', () => {
    expect(resolveTitleTarget(settings('sp', 'sm'), conv('cp', 'cm'))).toEqual({
      provider_id: 'sp',
      model: 'sm',
    });
  });

  it('设置未指定（双双 null）→ 回退会话模型', () => {
    expect(resolveTitleTarget(settings(null, null), conv('cp', 'cm'))).toEqual({
      provider_id: 'cp',
      model: 'cm',
    });
  });

  it('设置只填一半（仅 provider）→ 视为未指定，整体回退会话模型', () => {
    expect(resolveTitleTarget(settings('sp', null), conv('cp', 'cm'))).toEqual({
      provider_id: 'cp',
      model: 'cm',
    });
  });

  it('设置只填一半（仅 model）→ 同样整体回退会话模型', () => {
    expect(resolveTitleTarget(settings(null, 'sm'), conv('cp', 'cm'))).toEqual({
      provider_id: 'cp',
      model: 'cm',
    });
  });

  it('设置与会话都缺 → null（调用方报 title_model_unavailable）', () => {
    expect(resolveTitleTarget(settings(null, null), conv(null, null))).toBeNull();
  });

  it('会话为 null（不存在/未传）且设置未指定 → null', () => {
    expect(resolveTitleTarget(settings(null, null), null)).toBeNull();
  });

  it('空白串（含空格）视为未指定', () => {
    expect(resolveTitleTarget(settings('  ', ''), conv('cp', 'cm'))).toEqual({
      provider_id: 'cp',
      model: 'cm',
    });
    expect(resolveTitleTarget(settings('  ', ' '), conv(null, null))).toBeNull();
  });

  it('会话只缺 model（provider 有值）→ 不可用 → null', () => {
    expect(resolveTitleTarget(settings(null, null), conv('cp', null))).toBeNull();
  });

  it('设置值首尾空白被裁剪', () => {
    expect(resolveTitleTarget(settings(' sp ', ' sm '), null)).toEqual({
      provider_id: 'sp',
      model: 'sm',
    });
  });
});

/* ---------------- sanitizeTitle ---------------- */

describe('sanitizeTitle', () => {
  it('去除首尾英文引号与中文引号/书名号', () => {
    expect(sanitizeTitle('"Hello World"')).toBe('Hello World');
    expect(sanitizeTitle('「你好世界」')).toBe('你好世界');
    expect(sanitizeTitle('“混合”')).toBe('混合');
  });

  it('只取首行', () => {
    expect(sanitizeTitle('第一行\n第二行\n第三行')).toBe('第一行');
  });

  it('超过上限截断（默认 60）', () => {
    const long = 'a'.repeat(100);
    expect(sanitizeTitle(long)).toHaveLength(60);
    expect(sanitizeTitle(long, 10)).toHaveLength(10);
  });

  it('空白/纯引号输入 → 空串', () => {
    expect(sanitizeTitle('   ')).toBe('');
    expect(sanitizeTitle('""')).toBe('');
  });
});

/* ---------------- timeoutSignal ---------------- */

describe('timeoutSignal', () => {
  it('到期 abort；cancel 后不触发', async () => {
    const a = timeoutSignal(10);
    expect(a.signal.aborted).toBe(false);
    await new Promise((r) => setTimeout(r, 40));
    expect(a.signal.aborted).toBe(true);

    const b = timeoutSignal(30);
    b.cancel();
    await new Promise((r) => setTimeout(r, 60));
    expect(b.signal.aborted).toBe(false);
  });
});

/* ---------------- runWithRetry ---------------- */

describe('runWithRetry', () => {
  const noSleep = (): Promise<void> => Promise.resolve();

  it('首次成功：不重试，sleep 未被调用', async () => {
    let calls = 0;
    let sleeps = 0;
    const out = await runWithRetry(
      async () => {
        calls++;
        return 'ok';
      },
      { sleep: async () => void sleeps++ },
    );
    expect(out).toBe('ok');
    expect(calls).toBe(1);
    expect(sleeps).toBe(0);
  });

  it('首次失败 → 间隔后重试 1 次成功', async () => {
    let calls = 0;
    const delays: number[] = [];
    const out = await runWithRetry(
      async (attempt) => {
        calls++;
        if (attempt === 1) throw new Error('boom-1');
        return 'recovered';
      },
      { sleep: async (ms) => void delays.push(ms) },
    );
    expect(out).toBe('recovered');
    expect(calls).toBe(2);
    expect(delays).toEqual([TITLE_RETRY_DELAY_MS]);
  });

  it('两次都失败 → 抛出最后一次错误', async () => {
    let calls = 0;
    await expect(
      runWithRetry(
        async (attempt) => {
          calls++;
          throw new Error(`fail-${attempt}`);
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow('fail-2');
    expect(calls).toBe(2);
  });

  it('attempts=1 → 不重试直接抛', async () => {
    let calls = 0;
    await expect(
      runWithRetry(
        async () => {
          calls++;
          throw new Error('nope');
        },
        { attempts: 1, sleep: noSleep },
      ),
    ).rejects.toThrow('nope');
    expect(calls).toBe(1);
  });
});
