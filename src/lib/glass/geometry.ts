// @req REQ-2026-006：滚动渐隐与材质几何的纯函数边界，不依赖 DOM。
export interface ScrollGeometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export function nextScrollFades({ scrollTop, scrollHeight, clientHeight }: ScrollGeometry): {
  top: boolean;
  bottom: boolean;
} {
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite) || clientHeight <= 0) {
    return { top: false, bottom: false };
  }
  if (scrollHeight <= clientHeight + 1) return { top: false, bottom: false };
  const top = Math.max(0, scrollTop);
  return {
    top: top > 1,
    bottom: scrollHeight - top - clientHeight > 1,
  };
}

export function quantizeComposerHeight(
  scrollHeight: number,
  lineHeight: number,
  minHeight: number,
  maxHeight: number,
): number {
  if (!Number.isFinite(scrollHeight) || !Number.isFinite(lineHeight) || lineHeight <= 0) return minHeight;
  if (scrollHeight <= minHeight) return minHeight;
  const lines = Math.ceil((scrollHeight - minHeight) / lineHeight);
  return Math.min(maxHeight, Math.max(minHeight, minHeight + lines * lineHeight));
}

export function quantizeComposerMaxHeight(lineHeight: number, maxHeight: number, padding: number): number {
  if (!Number.isFinite(lineHeight) || lineHeight <= 0 || !Number.isFinite(maxHeight)) return maxHeight;
  const lines = Math.max(1, Math.floor((maxHeight - padding) / lineHeight));
  return padding + lines * lineHeight;
}

export interface GlassRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function isValidSurfaceGeometry({ surface, root, viewport, temporary = false }: {
  surface: GlassRect;
  root: GlassRect;
  viewport: GlassRect;
  temporary?: boolean;
}): boolean {
  if (![surface.left, surface.top, surface.width, surface.height].every(Number.isFinite)
    || surface.width <= 0 || surface.height <= 0) return false;
  const within = (outer: GlassRect): boolean =>
    surface.left >= outer.left - 1 && surface.top >= outer.top - 1
    && surface.left + surface.width <= outer.left + outer.width + 1
    && surface.top + surface.height <= outer.top + outer.height + 1;
  return within(viewport) && (temporary || within(root));
}

export function fadeAttributeChanged(current: string | undefined, next: boolean): boolean {
  return current !== String(next);
}

export function nextGeometryGrace({ valid, invalidSince, time, graceMs = 1_000 }: {
  valid: boolean;
  invalidSince: number | null;
  time: number;
  graceMs?: number;
}): { invalidSince: number | null; failed: boolean } {
  if (valid) return { invalidSince: null, failed: false };
  const since = invalidSince ?? time;
  return { invalidSince: since, failed: time - since >= graceMs };
}

export function surfaceOptionsForRole(role: 'composer' | 'topbar' | 'model-picker' | 'generate-pill', appearance: 'light' | 'dark') {
  return {
    material: 'clear' as const,
    appearance,
    radius: role === 'composer' ? 24 : role === 'topbar' ? 0 : role === 'model-picker' ? 12 : 'capsule' as const,
    refraction: role === 'topbar' ? 4 : 6,
    interactive: false as const,
  };
}
