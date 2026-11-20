import { describe, expect, it } from 'vitest';
import {
  assertSupportedNodeVersion,
  isSupportedNodeVersion,
  NODE_VERSION_RANGE,
} from '../scripts/node-version-guard.mjs';

describe('@req REQ-2026-004 Node version gate', () => {
  it.each([
    ['24.22.3', false],
    ['26.12.1', false],
    ['26.13.0', false],
    ['26.13.1', true],
    ['v26.13.1', true],
    ['26.14.0', true],
    ['27.0.0', false],
    // Node 运行时只接受标准 x.y.z；预发布、构建元和畸形版本串失败关闭
    ['26.14.0-nightly.1', false],
    ['26.13.1+build.1', false],
    ['v26', false],
    ['', false],
    ['not-a-version', false],
  ])('%s => %s', (version, expected) => {
    expect(isSupportedNodeVersion(version)).toBe(expected);
  });

  it('reports the required range', () => {
    expect(NODE_VERSION_RANGE).toBe('>=26.13.1 <27');
    expect(() => assertSupportedNodeVersion('24.22.3')).toThrow('>=26.13.1 <27');
  });
});
