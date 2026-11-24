// @req REQ-2026-006：Electron/Chromium 不使用 Gecko 专用图层实现。
export function createLensLayers() {
  return { owns: () => false, update: () => {}, dispose: () => {} };
}

