import { describe, expect, it, vi } from 'vitest';
import { readGlassCapabilities, resolveGlassCapabilities } from '../src/lib/glass/capabilities';

// @req REQ-2026-006：CSS 材质是无 GPU 与辅助偏好下的永久可用路径。
describe('@req REQ-2026-006 glass capabilities', () => {
  it('disables refraction without WebGPU', () => {
    expect(resolveGlassCapabilities({ webGPU: false, reducedTransparency: false, forcedColors: false }))
      .toEqual({ enabled: false, reason: 'webgpu' });
  });

  it('honors reduced transparency and forced colors before GPU work', () => {
    expect(resolveGlassCapabilities({ webGPU: true, reducedTransparency: true, forcedColors: false }))
      .toEqual({ enabled: false, reason: 'reduced-transparency' });
    expect(resolveGlassCapabilities({ webGPU: true, reducedTransparency: false, forcedColors: true }))
      .toEqual({ enabled: false, reason: 'forced-colors' });
  });

  it('requires a callable requestAdapter rather than a property key', () => {
    vi.stubGlobal('navigator', { gpu: undefined });
    expect(readGlassCapabilities().webGPU).toBe(false);
    vi.unstubAllGlobals();
  });

  it('enables only the fully eligible path', () => {
    expect(resolveGlassCapabilities({ webGPU: true, reducedTransparency: false, forcedColors: false }))
      .toEqual({ enabled: true });
  });
});
