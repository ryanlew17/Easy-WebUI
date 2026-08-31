/**
 * 窗口状态校验（纯函数，不依赖 electron —— 便于 vitest 直测；
 * fs/screen 薄壳在 window-state.ts）。
 */
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
}

export interface WorkAreaLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_WIDTH = 960;
export const MIN_HEIGHT = 600;
export const DEFAULT_SIZE = { width: 1280, height: 800 };

/** 载入校验：数值合法、不小于最小窗、且与任一显示器工作区相交（显示器可能已拔掉） */
export function validateWindowState(
  raw: unknown,
  displays: WorkAreaLike[],
): WindowState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { x, y, width, height, maximized } = raw as Record<string, unknown>;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(x + y + width + height)
  )
    return null;
  if (width < MIN_WIDTH || height < MIN_HEIGHT) return null;
  const visible = displays.some(
    (d) =>
      x < d.x + d.width &&
      x + width > d.x &&
      y < d.y + d.height &&
      y + height > d.y,
  );
  if (!visible) return null;
  return { x, y, width, height, maximized: maximized === true };
}

/** 无记忆/无效时的默认尺寸：主显示器工作区内收敛 */
export function defaultSize(primary: WorkAreaLike): { width: number; height: number } {
  return {
    width: Math.min(DEFAULT_SIZE.width, primary.width),
    height: Math.min(DEFAULT_SIZE.height, primary.height),
  };
}
