// @req REQ-2026-006：仅缓存几何地图，resolved + in-flight 共享 4,000,000 像素预算。
import { PixelMapCache } from '../../../lib/glass/map-cache';
import { encodeMaterialPixels } from './map-encoder.js';
import { getMaterialRenderer } from './renderer.js';
import { mapScale } from '../gpu/geometry.js';
import materialShader from '../gpu/maps.js';
import { capsuleMapGeometry, releaseMapToken } from './map-image.js';

const MAX_MAP_PIXELS = 4_000_000;
const decoded = new Map();
const pending = new Map();
let mapBuilds = 0;
let generation = 0;

function release(maps) {
  for (const url of mapUrls(maps)) {
    releaseMapToken(url);
    decoded.delete(url);
  }
}
const cache = new PixelMapCache(MAX_MAP_PIXELS, (_key, maps) => release(maps));
const shaderVersion = (() => {
  let hash = 2166136261;
  for (let i = 0; i < materialShader.wgsl.length; i++) hash = Math.imul(hash ^ materialShader.wgsl.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
})();

function mapUrls(maps) {
  return [maps.field, maps.overlay, ...Object.values(maps.capsule?.planes ?? {}).flat()];
}
function keyFor(geometry, capsule) {
  return [shaderVersion, geometry.width, geometry.height, geometry.radius, geometry.dpr,
    geometry.appearance, geometry.outline, capsule].map((part) => JSON.stringify(part) ?? '').join('|');
}
function pixelCost(geometry) {
  const scale = mapScale(geometry);
  return Math.ceil((geometry.width + 4) * scale) * Math.ceil((geometry.height + 4) * scale) * 2;
}
function shape(geometry, capsule, planes, duration) {
  return {
    field: planes[0][0], overlay: planes[1][0], duration,
    ...(capsule ? { capsule: { cap: geometry.height + 2, height: geometry.height + 4,
      planes: { field: planes[0].slice(1), overlay: planes[1].slice(1) } } } : {}),
  };
}
export async function decode(url) {
  if (decoded.has(url) || typeof Image === 'undefined') return;
  const image = new Image();
  image.src = url;
  await image.decode();
  decoded.set(url, image);
}
function build(geometry, capsule) {
  const key = keyFor(geometry, capsule);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(key);
  if (existing) return existing;
  const ticket = generation;
  const promise = (async () => {
    const pixels = pixelCost(geometry);
    cache.reserve(key, pixels);
    try {
      const { width, height, pixels: rgba, duration } = await (await getMaterialRenderer()).render(geometry);
      const cap = capsule ? Math.round((geometry.height + 2) * mapScale(geometry)) : undefined;
      const planes = await encodeMaterialPixels(rgba, width, height, cap);
      const maps = shape(geometry, capsule, planes, duration);
      await Promise.all(mapUrls(maps).map(decode));
      mapBuilds++;
      if (ticket === generation) cache.put(key, { pixels, value: maps });
      else release(maps);
      return maps;
    } catch (error) {
      cache.abort(key);
      throw error;
    } finally {
      pending.delete(key);
    }
  })();
  pending.set(key, promise);
  return promise;
}
export function getMaterialMaps(geometry) { return build(geometry, false); }
export function getSurfaceMaterialMaps(geometry) {
  const capsule = capsuleMapGeometry(geometry);
  return build(capsule ?? geometry, Boolean(capsule));
}
export function peekMaterialMaps(geometry) { return cache.get(keyFor(geometry, false)); }
export function peekSurfaceMaterialMaps(geometry) {
  const capsule = capsuleMapGeometry(geometry);
  return cache.get(keyFor(capsule ?? geometry, Boolean(capsule)));
}
export function touchMaps() {}
export function clearMaterialMapCache() {
  generation++;
  pending.clear();
  cache.clear();
  decoded.clear();
}
export function getMaterialMapStats() {
  return { maps: cache.size, mapPixels: cache.totalPixels, mapBuilds };
}

