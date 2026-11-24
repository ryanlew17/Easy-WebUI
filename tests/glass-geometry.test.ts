import { describe, expect, it } from 'vitest';
import { fadeAttributeChanged, isValidSurfaceGeometry, nextGeometryGrace, nextScrollFades, quantizeComposerHeight, surfaceOptionsForRole } from '../src/lib/glass/geometry';

// @req REQ-2026-006：只在对应方向仍有内容时显示滚动渐隐。
describe('@req REQ-2026-006 scroll edge fades', () => {
  it('shows only the lower fade at the scroll start', () => {
    expect(nextScrollFades({ scrollTop: 0, scrollHeight: 500, clientHeight: 200 }))
      .toEqual({ top: false, bottom: true });
  });

  it('shows only the upper fade at the scroll end', () => {
    expect(nextScrollFades({ scrollTop: 300, scrollHeight: 500, clientHeight: 200 }))
      .toEqual({ top: true, bottom: false });
  });

  it('shows both fades in the middle and none without overflow', () => {
    expect(nextScrollFades({ scrollTop: 100, scrollHeight: 500, clientHeight: 200 }))
      .toEqual({ top: true, bottom: true });
    expect(nextScrollFades({ scrollTop: 100, scrollHeight: 180, clientHeight: 200 }))
      .toEqual({ top: false, bottom: false });
  });

  it('uses a one-pixel tolerance and fails closed on invalid geometry', () => {
    expect(nextScrollFades({ scrollTop: -2, scrollHeight: 500, clientHeight: 200 }))
      .toEqual({ top: false, bottom: true });
    expect(nextScrollFades({ scrollTop: 300.5, scrollHeight: 500, clientHeight: 200 }))
      .toEqual({ top: true, bottom: false });
    expect(nextScrollFades({ scrollTop: Number.NaN, scrollHeight: 500, clientHeight: 200 }))
      .toEqual({ top: false, bottom: false });
  });
});

// @req REQ-2026-006：常驻表面限制在聊天场景内，临时 portal 只需位于视口内。
describe('@req REQ-2026-006 glass surface geometry', () => {
  const root = { left: 0, top: 0, width: 1_000, height: 800 };
  const viewport = { left: 0, top: 0, width: 1_440, height: 900 };
  it('accepts permanent geometry inside the chat scene', () => {
    expect(isValidSurfaceGeometry({
      surface: { left: 20, top: 650, width: 800, height: 100 }, root, viewport,
    })).toBe(true);
  });

  it('rejects non-finite or out-of-scene permanent geometry', () => {
    expect(isValidSurfaceGeometry({
      surface: { left: -20, top: 650, width: 800, height: 100 }, root, viewport,
    })).toBe(false);
    expect(isValidSurfaceGeometry({
      surface: { left: Number.NaN, top: 650, width: 800, height: 100 }, root, viewport,
    })).toBe(false);
  });

  it('allows a temporary body portal inside the viewport but outside the scene', () => {
    expect(isValidSurfaceGeometry({
      surface: { left: 1_100, top: 100, width: 240, height: 180 }, root, viewport, temporary: true,
    })).toBe(true);
    expect(isValidSurfaceGeometry({
      surface: { left: 1_350, top: 100, width: 240, height: 180 }, root, viewport, temporary: true,
    })).toBe(false);
  });

  it('maps only the four semantic roles to static material options', () => {
    expect(surfaceOptionsForRole('composer', 'dark')).toMatchObject({ radius: 24, appearance: 'dark', interactive: false });
    expect(surfaceOptionsForRole('topbar', 'light')).toMatchObject({ radius: 0, refraction: 4 });
    expect(surfaceOptionsForRole('model-picker', 'light')).toMatchObject({ radius: 12 });
    expect(surfaceOptionsForRole('generate-pill', 'light')).toMatchObject({ radius: 'capsule' });
  });
});

// @req REQ-2026-006：输入坞只按行高阶梯增长，避免逐像素重建地图。
describe('@req REQ-2026-006 composer height quantization', () => {
  it('rounds up to the next line without changing an exact line', () => {
    expect(quantizeComposerHeight(28.1, 20, 28, 160)).toBe(48);
    expect(quantizeComposerHeight(48, 20, 28, 160)).toBe(48);
    expect(quantizeComposerHeight(47.9, 20, 28, 160)).toBe(48);
  });

  it('clamps the existing minimum and maximum and rejects invalid input', () => {
    expect(quantizeComposerHeight(0, 20, 28, 160)).toBe(28);
    expect(quantizeComposerHeight(999, 20, 28, 160)).toBe(160);
    expect(quantizeComposerHeight(100, 0, 28, 160)).toBe(28);
    expect(quantizeComposerHeight(Number.NaN, 20, 28, 160)).toBe(28);
  });
});

// @req REQ-2026-006：相同渐隐状态不得触发重复 DOM 属性写入。
describe('@req REQ-2026-006 fade attribute writes', () => {
  it('skips unchanged values and writes initial or changed values', () => {
    expect(fadeAttributeChanged('true', true)).toBe(false);
    expect(fadeAttributeChanged('false', false)).toBe(false);
    expect(fadeAttributeChanged('false', true)).toBe(true);
    expect(fadeAttributeChanged(undefined, false)).toBe(true);
  });
});

// @req REQ-2026-006：缩放过渡帧与持续几何错误分开处理。
describe('@req REQ-2026-006 geometry grace period', () => {
  it('starts and preserves an invalid interval without failing immediately', () => {
    expect(nextGeometryGrace({ valid: false, invalidSince: null, time: 1_000 }))
      .toEqual({ invalidSince: 1_000, failed: false });
    expect(nextGeometryGrace({ valid: false, invalidSince: 1_000, time: 1_100 }))
      .toEqual({ invalidSince: 1_000, failed: false });
  });

  it('fails only at the sustained deadline and resets on recovery', () => {
    expect(nextGeometryGrace({ valid: false, invalidSince: 1_000, time: 1_999 }))
      .toEqual({ invalidSince: 1_000, failed: false });
    expect(nextGeometryGrace({ valid: false, invalidSince: 1_000, time: 2_000 }))
      .toEqual({ invalidSince: 1_000, failed: true });
    expect(nextGeometryGrace({ valid: true, invalidSince: 1_000, time: 1_100 }))
      .toEqual({ invalidSince: null, failed: false });
  });
});
