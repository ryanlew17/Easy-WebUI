// @req REQ-2026-006：持久缓存已移除；地图只存在有像素上限的内存缓存中。
export function claimFirstPaint() {}
export function loadStoredMaps() { return Promise.resolve(undefined); }
export function peekStoredMaps() { return undefined; }
export function preloadStoredMaps() { return Promise.resolve(); }
export function preloadedKeys() { return []; }
export function saveStoredMaps() {}

