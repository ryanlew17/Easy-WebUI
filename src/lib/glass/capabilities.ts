// @req REQ-2026-006：任何辅助偏好或 GPU 能力缺失都在引擎加载前选择 CSS。
import type { GlassCapabilities, GlassFallbackReason } from './types';

export function resolveGlassCapabilities(input: GlassCapabilities):
  | { enabled: true }
  | { enabled: false; reason: GlassFallbackReason } {
  if (input.forcedColors) return { enabled: false, reason: 'forced-colors' };
  if (input.reducedTransparency) return { enabled: false, reason: 'reduced-transparency' };
  if (!input.webGPU) return { enabled: false, reason: 'webgpu' };
  return { enabled: true };
}

export function readGlassCapabilities(): GlassCapabilities {
  const gpu = typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { gpu?: { requestAdapter?: unknown } }).gpu;
  return {
    webGPU: typeof gpu?.requestAdapter === 'function',
    reducedTransparency:
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-transparency: reduce)').matches,
    forcedColors: typeof window !== 'undefined' && window.matchMedia('(forced-colors: active)').matches,
  };
}
