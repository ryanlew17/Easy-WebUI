/**
 * 窗口状态校验纯函数（electron/window-state-core.ts）。
 * fs/screen 薄壳不在此测（需 Electron 运行时，集成阶段人工验收）。
 */
import { describe, expect, it } from 'vitest';
import { defaultSize, validateWindowState } from '../electron/window-state-core';

const DISPLAY = { x: 0, y: 0, width: 1920, height: 1040 };
const displays = [DISPLAY];

describe('validateWindowState', () => {
  it('合法状态原样返回（含 maximized 标记）', () => {
    expect(
      validateWindowState(
        { x: 100, y: 80, width: 1280, height: 800, maximized: true },
        displays,
      ),
    ).toEqual({ x: 100, y: 80, width: 1280, height: 800, maximized: true });
  });

  it('缺 maximized 视为非最大化', () => {
    const r = validateWindowState({ x: 0, y: 0, width: 1280, height: 800 }, displays);
    expect(r?.maximized).toBe(false);
  });

  it('非对象 / 非数值 / NaN 一律拒绝', () => {
    expect(validateWindowState(null, displays)).toBeNull();
    expect(validateWindowState('x', displays)).toBeNull();
    expect(validateWindowState({ x: 1, y: 2 }, displays)).toBeNull();
    expect(
      validateWindowState({ x: Number.NaN, y: 0, width: 1280, height: 800 }, displays),
    ).toBeNull();
  });

  it('小于最小窗尺寸拒绝', () => {
    expect(
      validateWindowState({ x: 0, y: 0, width: 800, height: 600 }, displays),
    ).toBeNull();
    expect(
      validateWindowState({ x: 0, y: 0, width: 1280, height: 500 }, displays),
    ).toBeNull();
  });

  it('矩形与所有工作区无交集（显示器已拔掉）拒绝', () => {
    expect(
      validateWindowState({ x: -5000, y: -5000, width: 1280, height: 800 }, displays),
    ).toBeNull();
    expect(
      validateWindowState({ x: 4000, y: 0, width: 1280, height: 800 }, displays),
    ).toBeNull();
  });

  it('与任一工作区部分相交即可保留（多显示器边缘）', () => {
    const dual = [DISPLAY, { x: 1920, y: 0, width: 1920, height: 1040 }];
    expect(
      validateWindowState({ x: 1800, y: 0, width: 1280, height: 800 }, dual),
    ).not.toBeNull();
  });
});

describe('defaultSize', () => {
  it('常规屏取 1280×800', () => {
    expect(defaultSize(DISPLAY)).toEqual({ width: 1280, height: 800 });
  });

  it('小屏收敛到工作区内', () => {
    const small = { x: 0, y: 0, width: 1024, height: 640 };
    expect(defaultSize(small)).toEqual({ width: 1024, height: 640 });
  });
});
