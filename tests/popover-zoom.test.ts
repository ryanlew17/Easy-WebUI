import { describe, expect, it } from 'vitest';
import { resolvePopoverZoom } from '../src/components/Popover';

// @req REQ-2026-006：零宽锚点不得把应用缩放误算为 1。
describe('@req REQ-2026-006 popover zoom resolution', () => {
  it('uses the application zoom when available', () => {
    expect(resolvePopoverZoom('2.5', 1)).toBe(2.5);
    expect(resolvePopoverZoom('0.5', 0)).toBe(0.5);
  });

  it('falls back to measured zoom and rejects invalid values', () => {
    expect(resolvePopoverZoom('', 2)).toBe(2);
    expect(resolvePopoverZoom('invalid', 1.5)).toBe(1.5);
    expect(resolvePopoverZoom('0', 2)).toBe(2);
    expect(resolvePopoverZoom('', 0)).toBe(1);
  });
});
