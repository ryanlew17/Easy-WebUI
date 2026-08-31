/**
 * shared/errors.ts —— IPC 错误编解码（Bug2 统一方案）单元测试。
 * 覆盖：EASYUI_ERR: 合法前缀 / Electron invoke 包装 + 前缀 / 非法 JSON / 前缀后非对象 /
 * 自带 .code / 裸 code 作 message / 无前缀普通 message / 空 message / 非 Error 输入；
 * 以及主进程侧 deriveIpcCode / serializeIpcError 的推导分支。
 */
import { describe, expect, it } from 'vitest';
import {
  IPC_ERROR_PREFIX,
  deriveIpcCode,
  parseIpcError,
  serializeIpcError,
} from '../shared/errors';

/** 模拟 Electron 主→渲染序列化：invoke 拒绝只保留 message，并包一层调用信息 */
function simulateIpcRoundtrip(err: Error): Error {
  return new Error(`Error invoking remote method 'chat:send': Error: ${err.message}`);
}

describe('parseIpcError', () => {
  it('识别合法 EASYUI_ERR: 前缀并还原 code/message', () => {
    const err = new Error(IPC_ERROR_PREFIX + JSON.stringify({ code: 'no_model', message: 'no model selected' }));
    expect(parseIpcError(err)).toEqual({ code: 'no_model', message: 'no model selected' });
  });

  it('识别 Electron invoke 包装后的前缀（indexOf 而非 startsWith）', () => {
    const wire = simulateIpcRoundtrip(
      new Error(IPC_ERROR_PREFIX + JSON.stringify({ code: 'context_overflow', message: 'budget exceeded' })),
    );
    expect(parseIpcError(wire)).toEqual({ code: 'context_overflow', message: 'budget exceeded' });
  });

  it('前缀后非法 JSON → 兜底 unknown，保留原文', () => {
    const err = new Error(`Error invoking remote method 'x': Error: ${IPC_ERROR_PREFIX}{bad json`);
    const out = parseIpcError(err);
    expect(out.code).toBe('unknown');
    expect(out.message).toContain(IPC_ERROR_PREFIX);
  });

  it('前缀后 JSON 非对象/缺 code → 兜底 unknown', () => {
    expect(parseIpcError(new Error(IPC_ERROR_PREFIX + '"just a string"')).code).toBe('unknown');
    expect(parseIpcError(new Error(IPC_ERROR_PREFIX + JSON.stringify({ message: 'x' }))).code).toBe(
      'unknown',
    );
    expect(parseIpcError(new Error(IPC_ERROR_PREFIX + JSON.stringify({ code: '' }))).code).toBe(
      'unknown',
    );
  });

  it('前缀 JSON 缺 message → message 为空串', () => {
    expect(
      parseIpcError(new Error(IPC_ERROR_PREFIX + JSON.stringify({ code: 'provider_not_found' }))),
    ).toEqual({ code: 'provider_not_found', message: '' });
  });

  it('自带 .code 的错误（mock 桥 / 本地逻辑）直接采用', () => {
    const err = new Error('network unreachable') as Error & { code: string };
    err.code = 'request_failed';
    expect(parseIpcError(err)).toEqual({ code: 'request_failed', message: 'network unreachable' });
  });

  it('裸 code 作 message（历史抛法 / mock）识别为 code', () => {
    expect(parseIpcError(new Error('title_model_unavailable'))).toEqual({
      code: 'title_model_unavailable',
      message: '',
    });
  });

  it('Electron 包装 + 裸 code（旧主进程兼容路径）', () => {
    const wire = simulateIpcRoundtrip(new Error('generation_in_progress'));
    expect(parseIpcError(wire)).toEqual({ code: 'generation_in_progress', message: '' });
  });

  it('无前缀普通 message → code unknown，message 为剥离包装后的文本', () => {
    const wire = simulateIpcRoundtrip(new Error('something broke badly'));
    expect(parseIpcError(wire)).toEqual({ code: 'unknown', message: 'something broke badly' });
  });

  it('空 message → code unknown，message 空串', () => {
    expect(parseIpcError(new Error(''))).toEqual({ code: 'unknown', message: '' });
  });

  it('非 Error 输入：字符串 / null / 数字均不抛且兜底', () => {
    expect(parseIpcError('preset_not_found')).toEqual({ code: 'preset_not_found', message: '' });
    expect(parseIpcError(null)).toEqual({ code: 'unknown', message: '' });
    expect(parseIpcError(undefined)).toEqual({ code: 'unknown', message: '' });
    expect(parseIpcError(42)).toEqual({ code: 'unknown', message: '42' });
  });
});

describe('deriveIpcCode（主进程侧）', () => {
  it('显式 .code 优先', () => {
    expect(deriveIpcCode({ code: 'context_overflow', message: 'budget exceeded' })).toBe(
      'context_overflow',
    );
  });
  it('ZodError → invalid_input', () => {
    expect(deriveIpcCode({ name: 'ZodError', message: '[{"path":["x"]}]' })).toBe('invalid_input');
  });
  it('裸 code 作 message → 该 code', () => {
    expect(deriveIpcCode({ name: 'Error', message: 'provider_not_found' })).toBe(
      'provider_not_found',
    );
  });
  it('普通 message → unknown', () => {
    expect(deriveIpcCode({ name: 'Error', message: 'disk full at C:\\data' })).toBe('unknown');
  });
});

describe('serializeIpcError ↔ parseIpcError 往返', () => {
  it('带 code 的 GatewayError 风格错误往返后 code 保留', () => {
    const encoded = serializeIpcError({ code: 'missing_api_key', message: 'provider has no api key' });
    const wire = simulateIpcRoundtrip(encoded);
    expect(parseIpcError(wire)).toEqual({
      code: 'missing_api_key',
      message: 'provider has no api key',
    });
  });
  it('裸 code 抛法往返后 code 保留（兼容 ipc.ts 大量 new Error(code) 现状）', () => {
    const wire = simulateIpcRoundtrip(serializeIpcError({ name: 'Error', message: 'global_preset_readonly' }));
    expect(parseIpcError(wire).code).toBe('global_preset_readonly');
  });
});
