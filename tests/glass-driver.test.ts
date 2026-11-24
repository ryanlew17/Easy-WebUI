import { describe, expect, it } from 'vitest';
import { errorReason } from '../src/lib/glass/driver';

// @req REQ-2026-006：降级原因按错误类型分类，不依赖消息文本匹配。
describe('@req REQ-2026-006 driver error classification', () => {
  it('maps resource-limit RangeErrors to filter-budget', () => {
    expect(errorReason(new RangeError('Map exceeds the pixel budget.'))).toBe('filter-budget');
    expect(errorReason(new RangeError('Pending maps exceed the pixel budget.'))).toBe('filter-budget');
    expect(errorReason(new RangeError('GlassScene supports 4 surfaces; increase maxSurfaces up to 64 or split the scene.'))).toBe('filter-budget');
    expect(errorReason(new RangeError('At least one sampling box is required.'))).toBe('filter-budget');
  });

  it('maps non-range failures to map', () => {
    expect(errorReason(new Error('WebGPU map render failed'))).toBe('map');
    expect(errorReason(new TypeError('Invalid pixel buffer'))).toBe('map');
    expect(errorReason('renderer crashed')).toBe('map');
    expect(errorReason(undefined)).toBe('map');
  });
});
