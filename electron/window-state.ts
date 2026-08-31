/**
 * 窗口状态记忆薄壳：window-state.json 读写 + electron screen 接线；
 * 校验/默认尺寸逻辑在 window-state-core.ts（纯函数，tests/window-state.test.ts）。
 */
import { screen } from 'electron';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defaultSize, validateWindowState, type WindowState } from './window-state-core';

const stateFile = (dataDir: string): string => path.join(dataDir, 'window-state.json');

export function loadWindowState(dataDir: string): WindowState | null {
  try {
    const file = stateFile(dataDir);
    if (!existsSync(file)) return null;
    return validateWindowState(
      JSON.parse(readFileSync(file, 'utf8')),
      screen.getAllDisplays().map((d) => d.workArea),
    );
  } catch {
    return null;
  }
}

/** 保存（getNormalBounds 已剔除最大化/全屏态的外扩几何） */
export function saveWindowState(
  dataDir: string,
  bounds: { x: number; y: number; width: number; height: number },
  maximized: boolean,
): void {
  try {
    const state: WindowState = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      maximized,
    };
    writeFileSync(stateFile(dataDir), JSON.stringify(state));
  } catch {
    /* 数据目录不可写等：窗口记忆是锦上添花，不阻塞退出 */
  }
}

export function defaultWindowSize(): { width: number; height: number } {
  return defaultSize(screen.getPrimaryDisplay().workArea);
}
