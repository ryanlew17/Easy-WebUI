/**
 * 共享 IPC schema 的 zod 4 兼容边界（@req REQ-2026-002）。
 * 固定有效输入、长度/集合上限、nullish、未知键剥离与真实 ZodError 脱敏编码。
 */
import { describe, expect, it } from 'vitest';
import {
  contextOverflowSchema,
  createParamPresetSchema,
  deleteMessagesSchema,
  messageAnchorSchema,
  openExternalSchema,
  paramOverridesPatchSchema,
  paramValuesSchema,
  sendMessageSchema,
  setDataDirSchema,
  updateMessageContentSchema,
  updateParamPresetSchema,
} from '../shared/ipc';
import { FACTORY_DEFAULTS } from '../shared/params';
import { parseIpcError, serializeIpcError } from '../shared/errors';

describe('参数与预设 schema', () => {
  it('接受工厂默认参数并保持字段值', () => {
    expect(paramValuesSchema.parse(FACTORY_DEFAULTS)).toEqual(FACTORY_DEFAULTS);
  });

  it('拒绝越界温度和非整数 max_tokens', () => {
    expect(paramValuesSchema.safeParse({ ...FACTORY_DEFAULTS, temperature: 2.01 }).success).toBe(false);
    expect(paramValuesSchema.safeParse({ ...FACTORY_DEFAULTS, max_tokens: 1.5 }).success).toBe(false);
  });

  it('overrides 保留 null/缺省语义并剥离未知键', () => {
    expect(
      paramOverridesPatchSchema.parse({ temperature: null, top_k: 32, unexpected: 'drop' }),
    ).toEqual({ temperature: null, top_k: 32 });
  });

  it('预设创建校验名称，更新允许空 patch', () => {
    expect(
      createParamPresetSchema.safeParse({ name: '', params: FACTORY_DEFAULTS }).success,
    ).toBe(false);
    expect(updateParamPresetSchema.parse({})).toEqual({});
  });

  it('context_overflow 只接受三种既定策略', () => {
    for (const strategy of ['rolling', 'truncate_middle', 'stop']) {
      expect(contextOverflowSchema.parse(strategy)).toBe(strategy);
    }
    expect(contextOverflowSchema.safeParse('discard').success).toBe(false);
  });
});

describe('消息与系统 schema', () => {
  it('sendMessage 拒绝空内容和超过 200000 字符的内容', () => {
    expect(sendMessageSchema.safeParse({ conversationId: 'c', content: '' }).success).toBe(false);
    expect(
      sendMessageSchema.safeParse({ conversationId: 'c', content: 'x'.repeat(200_001) }).success,
    ).toBe(false);
    expect(sendMessageSchema.parse({ conversationId: 'c', content: 'hello' })).toEqual({
      conversationId: 'c',
      content: 'hello',
    });
  });

  it('messageAnchor 要求会话与消息 id', () => {
    expect(messageAnchorSchema.safeParse({ conversationId: 'c' }).success).toBe(false);
    expect(messageAnchorSchema.parse({ conversationId: 'c', messageId: 'm' })).toEqual({
      conversationId: 'c',
      messageId: 'm',
    });
  });

  it('updateMessageContent 允许清空内容但保留长度上限', () => {
    expect(
      updateMessageContentSchema.parse({ conversationId: 'c', messageId: 'm', content: '' }),
    ).toEqual({ conversationId: 'c', messageId: 'm', content: '' });
    expect(
      updateMessageContentSchema.safeParse({
        conversationId: 'c',
        messageId: 'm',
        content: 'x'.repeat(200_001),
      }).success,
    ).toBe(false);
  });

  it('deleteMessages 拒绝空集合和超过 500 个 id', () => {
    expect(deleteMessagesSchema.safeParse({ conversationId: 'c', ids: [] }).success).toBe(false);
    expect(
      deleteMessagesSchema.safeParse({ conversationId: 'c', ids: Array(501).fill('m') }).success,
    ).toBe(false);
    expect(deleteMessagesSchema.parse({ conversationId: 'c', ids: ['m'] })).toEqual({
      conversationId: 'c',
      ids: ['m'],
    });
  });

  it('数据目录与外链保留长度和协议边界', () => {
    expect(setDataDirSchema.safeParse({ path: '' }).success).toBe(false);
    expect(setDataDirSchema.parse({ path: 'E:\\data' })).toEqual({ path: 'E:\\data' });
    expect(openExternalSchema.safeParse('file:///etc/passwd').success).toBe(false);
    expect(openExternalSchema.safeParse('javascript:alert(1)').success).toBe(false);
    expect(openExternalSchema.parse('https://github.com/ryanlew17/Easy-WebUI')).toBe(
      'https://github.com/ryanlew17/Easy-WebUI',
    );
  });
});

describe('真实 ZodError 的 IPC 编码', () => {
  it('只暴露 invalid_input，不回传 issue JSON 或字段细节', () => {
    let failure: unknown;
    try {
      sendMessageSchema.parse({ conversationId: 'c', content: '' });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeDefined();
    const encoded = serializeIpcError(failure as Error);
    expect(parseIpcError(encoded)).toEqual({ code: 'invalid_input', message: 'invalid_input' });
    expect(encoded.message).not.toContain('conversationId');
    expect(encoded.message).not.toContain('too_small');
  });
});
