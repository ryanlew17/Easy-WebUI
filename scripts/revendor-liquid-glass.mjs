import './node-version-guard.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

// @req REQ-2026-006：显式 re-vendor；正常 install/build 不执行网络或生成步骤。
const ROOT = process.cwd();
const TARGET = path.join(ROOT, 'src', 'vendor', 'liquid-glass');
const GLASS = { name: '@glass-sdk/liquid-glass', version: '0.0.2' };
const VGPU = { name: 'vgpu', version: '0.5.0' };
const LISSE = { name: '@lisse/core', version: '0.7.2' };
// 获取日期默认取执行当天；重放历史 re-vendor 时可用 EASYUI_REVENDOR_FETCHED_AT 指定。
const FETCHED_AT = process.env.EASYUI_REVENDOR_FETCHED_AT ?? new Date().toISOString().slice(0, 10);

async function metadata(pkg) {
  const response = await fetch(`https://registry.npmjs.org/${pkg.name.replace('/', '%2f')}/${pkg.version}`);
  if (!response.ok) throw new Error(`Registry metadata failed for ${pkg.name}: ${response.status}`);
  return response.json();
}

async function downloadGlass(info, temp) {
  const bytes = Buffer.from(await (await fetch(info.dist.tarball)).arrayBuffer());
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (integrity !== info.dist.integrity) throw new Error(`Integrity mismatch for ${GLASS.name}`);
  const archive = path.join(temp, 'glass.tgz');
  fs.writeFileSync(archive, bytes);
  const output = path.join(temp, 'glass');
  fs.mkdirSync(output);
  execFileSync('tar', [
    '-xzf', path.relative(ROOT, archive).replaceAll(path.sep, '/'),
    '-C', path.relative(ROOT, output).replaceAll(path.sep, '/'),
  ], { cwd: ROOT, stdio: 'inherit' });
  return path.join(output, 'package');
}

function replaceRequired(file, before, after) {
  const source = fs.readFileSync(file, 'utf8');
  const parts = source.split(before);
  if (parts.length !== 2) throw new Error(`Expected one patch site in ${file}: ${before.slice(0, 100)}`);
  fs.writeFileSync(file, parts.join(after));
}

async function bundleDependency(depsRoot, packageName, entry, outfile) {
  const entryFile = path.join(depsRoot, `${packageName.replace(/[@/]/g, '')}-entry.mjs`);
  const packageDir = path.join(depsRoot, 'node_modules', ...packageName.split('/'));
  fs.writeFileSync(entryFile, `export { ${entry} } from ${JSON.stringify(path.join(packageDir, 'dist', 'index.js'))};\n`);
  const result = await build({
    entryPoints: [entryFile],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2020',
    outfile,
    nodePaths: [path.join(depsRoot, 'node_modules')],
    legalComments: 'eof',
    metafile: true,
    logLevel: 'silent',
  });
  const output = fs.readFileSync(outfile, 'utf8');
  if (/\bnode:(?:fs|path|crypto|http|https|worker_threads|child_process)\b/.test(output)) {
    throw new Error(`Node builtin leaked into ${outfile}`);
  }
  return Object.keys(result.metafile.outputs[Object.keys(result.metafile.outputs)[0]].inputs)
    .map((file) => file.replace(/^build[\\/]revendor-[^/]+[\\/]deps[\\/]/, ''))
    .sort();
}

function rewriteLocalImports() {
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { visit(file); continue; }
      if (!/\.(?:js|d\.ts)$/.test(entry.name)) continue;
      let source = fs.readFileSync(file, 'utf8');
      for (const [bare, local] of [['@lisse/core', 'lisse.js'], ['vgpu', 'vgpu.js']]) {
        const target = path.join(TARGET, 'deps', local);
        let relative = path.relative(path.dirname(file), target).replaceAll(path.sep, '/');
        if (!relative.startsWith('.')) relative = `./${relative}`;
        source = source.replaceAll(`from "${bare}"`, `from "${relative}"`);
      }
      fs.writeFileSync(file, source);
    }
  };
  visit(TARGET);
}

function writeVendor(relative, content) {
  const file = path.join(TARGET, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.trimStart() + '\n');
}

const mapStore = `
// @req REQ-2026-006：持久缓存已移除；地图只存在有像素上限的内存缓存中。
export function claimFirstPaint() {}
export function loadStoredMaps() { return Promise.resolve(undefined); }
export function peekStoredMaps() { return undefined; }
export function preloadStoredMaps() { return Promise.resolve(); }
export function preloadedKeys() { return []; }
export function saveStoredMaps() {}
`;

const mapEncoder = `
// @req REQ-2026-006：本地 module Worker 失败时回退主线程编码，不使用 blob/data Worker。
import { encodeMapPixels } from './map-encoding.js';
let worker;
let unavailable = false;
let serial = 0;
const pending = new Map();

function fail(error) {
  unavailable = true;
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

function getWorker() {
  if (unavailable) return undefined;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./map-encoder.worker.js', import.meta.url), {
      type: 'module', name: 'easyui-material-encoder',
    });
    worker.onmessage = ({ data: { id, planes, error } }) => {
      const request = pending.get(id);
      pending.delete(id);
      if (error) request?.reject(Error(error));
      else request?.resolve(planes);
    };
    worker.onerror = (event) => { event.preventDefault(); fail(Error('Material encoder worker unavailable.')); };
    worker.onmessageerror = () => fail(Error('Material encoder worker message failed.'));
    return worker;
  } catch {
    unavailable = true;
    return undefined;
  }
}

export async function encodeMaterialPixels(pixels, width, height, cap) {
  const encoder = getWorker();
  if (encoder) {
    try {
      return await new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, { resolve, reject });
        try { encoder.postMessage({ id, pixels, width, height, cap }); }
        catch (error) { pending.delete(id); reject(error); }
      });
    } catch {}
  }
  return encodeMapPixels(pixels, width, height, cap);
}

export function disposeMaterialEncoder() {
  // 会话卸载只终止当前 Worker；下次编码允许重建，不在页面生命周期内永久禁用 Worker 路径。
  fail(Error('Material encoder disposed.'));
  unavailable = false;
}
`;

const worker = `
// @req REQ-2026-006：Vite 将本文件及依赖编译为 file:// 可加载的本地 Worker。
import { encodeMapPixels } from './map-encoding.js';
let queue = Promise.resolve();
self.onmessage = ({ data: { id, pixels, width, height, cap } }) => {
  queue = queue.then(async () => {
    try { self.postMessage({ id, planes: await encodeMapPixels(pixels, width, height, cap) }); }
    catch (error) { self.postMessage({ id, error: String(error) }); }
  });
};
`;

const lensLayers = `
// @req REQ-2026-006：Electron/Chromium 不使用 Gecko 专用图层实现。
export function createLensLayers() {
  return { owns: () => false, update: () => {}, dispose: () => {} };
}
`;

const progressive = `
// @req REQ-2026-006：滚动边缘与渐进模糊由 Track B CSS 承担，本引擎不实现该路径。
export function createProgressiveLayer() {
  return {
    regions: () => [], update: () => '', outsets: () => 0,
    scrollsContent: () => false, error: () => undefined,
    add: () => () => {}, addScroll: () => () => {}, dispose: () => {},
  };
}
`;

const renderer = `
export { getMaterialRenderer, disposeMaterialRenderer } from '../gpu.js';
`;

const maps = `
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
`;

const domTypes = `
export interface GlassDiagnostic { surfaces: number; maps: number; mapTime: number; error?: Error; }
export interface GlassSceneOptions { onDiagnostic?: (diagnostic: GlassDiagnostic) => void; maxSurfaces?: number; }
export interface SurfaceOptions {
  material?: 'clear' | 'regular';
  appearance?: 'light' | 'dark';
  radius?: number | 'capsule';
  refraction?: number;
  tint?: string;
  interactive?: false;
  onReady?: (ready: boolean) => void;
  onError?: (error: Error) => void;
}
export interface GlassSurfaceAnimator { frame(time: number): boolean | void; dispose(): void; }
export interface GlassSceneController {
  setContent(element: HTMLElement | null): void;
  setActive(active: boolean): void;
  addSurface(element: HTMLElement, options?: SurfaceOptions): () => void;
  addAnimator(animator: GlassSurfaceAnimator): () => void;
  dispose(): void;
}
export declare function createGlassScene(root: HTMLElement, config?: GlassSceneOptions): GlassSceneController;
export declare function clearMaterialMapCache(): void;
export declare function getMaterialMapStats(): { maps: number; mapPixels: number; mapBuilds: number };
`;

const gpuTypes = `
export declare function disposeMaterialRenderer(): Promise<void>;
export declare function onMaterialDeviceLoss(listener: () => void): () => void;
`;

async function main() {
  const [glassInfo, vgpuInfo, lisseInfo] = await Promise.all([metadata(GLASS), metadata(VGPU), metadata(LISSE)]);
  const temp = fs.mkdtempSync(path.join(ROOT, 'build', 'revendor-'));
  try {
    const [glassDir] = await Promise.all([
      downloadGlass(glassInfo, temp),
      execFileSync(process.execPath, [
        path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        'install', '--prefix', path.join(temp, 'deps'), '--ignore-scripts', '--no-audit', '--no-fund',
        `${VGPU.name}@${VGPU.version}`, `${LISSE.name}@${LISSE.version}`,
      ], { stdio: 'ignore' }),
    ]);
    fs.rmSync(TARGET, { recursive: true, force: true });
    for (const directory of ['core', 'dom', 'gpu']) {
      fs.cpSync(path.join(glassDir, 'dist', directory), path.join(TARGET, directory), { recursive: true });
      fs.cpSync(path.join(glassDir, 'dist', 'types', directory), path.join(TARGET, 'types', directory), { recursive: true });
    }
    for (const file of ['core.js', 'dom.js', 'gpu.js', 'styles.css']) fs.copyFileSync(path.join(glassDir, 'dist', file), path.join(TARGET, file));
    fs.copyFileSync(path.join(glassDir, 'LICENSE'), path.join(TARGET, 'LICENSE.liquid-glass'));
    fs.rmSync(path.join(TARGET, 'core', 'progressive.js'), { force: true });
    fs.rmSync(path.join(TARGET, 'types', 'core', 'progressive.d.ts'), { force: true });
    writeVendor('dom/map-store.js', mapStore);
    writeVendor('dom/map-encoder.js', mapEncoder);
    writeVendor('dom/map-encoder.d.ts', 'export declare function encodeMaterialPixels(pixels: Uint8Array, width: number, height: number, cap?: number): Promise<unknown>;\nexport declare function disposeMaterialEncoder(): void;\n');
    writeVendor('dom/map-encoder.worker.js', worker);
    writeVendor('dom/progressive.js', progressive);
    writeVendor('dom/lens-layers.js', lensLayers);
    fs.rmSync(path.join(TARGET, 'types', 'dom', 'lens-layers.d.ts'), { force: true });
    writeVendor('dom/renderer.js', renderer);
    writeVendor('dom/maps.js', maps);
    writeVendor('types/dom/index.d.ts', domTypes);
    writeVendor('dom.d.ts', "export * from './types/dom/index.js';");
    writeVendor('gpu.d.ts', gpuTypes);
    writeVendor('core.d.ts', "export * from './types/core/index.js';");
    writeVendor('dom/engine.js', "export const chromium = true;\nexport const webkit = true;\nexport const gecko = false;\n");

    replaceRequired(path.join(TARGET, 'dom.js'), 'from "@lisse/core"', 'from "./deps/lisse.js"');
    replaceRequired(path.join(TARGET, 'gpu.js'), 'from "vgpu"', 'from "./deps/vgpu.js"');
    writeVendor('dom/ticker.js', fs.readFileSync(path.join(glassDir, 'dist', 'dom', 'ticker.js'), 'utf8')
      .replace('step: i,', 'step: (time) => d.active ? i(time) : !1,')
      .replace('disposed: !1\n', 'disposed: !1, active: !0\n')
      .replace('}, f = () => u.schedule(d), p =', '}, f = () => d.active && u.schedule(d), p =')
      .replace('return f(), {', 'return f(), { setActive(active) { d.active = active, active && f() },'));

    const domFile = path.join(TARGET, 'dom.js');
    replaceRequired(domFile, 'return {\n\t\tsetContent(e) {', 'return {\n\t\tsetActive(active) { $.setActive(active) },\n\t\tsetContent(e) {');
    replaceRequired(domFile, 'e.maps = n, e.shown = t, e.error = void 0, V = !0, $.wake()', 'e.maps = n, e.shown = t, e.error = void 0, V = !0, $.wake(), e.options.onReady?.(!0)');
    replaceRequired(domFile, 'e.key = r, K.warm(i), e.maps = i, e.shown = t, e.error = void 0, V = !0;', 'e.key = r, K.warm(i), e.maps = i, e.shown = t, e.error = void 0, V = !0, e.options.onReady?.(!0);');
    replaceRequired(domFile, 'Ke(e.error)', 'Ke(e.error),e.options.onError?.(e.error)');
    replaceRequired(domFile, 'peekSurfaceMaterialMaps as k } from "./dom/maps.js"', 'peekSurfaceMaterialMaps as k, getMaterialMapStats as mapStats } from "./dom/maps.js"');
    replaceRequired(domFile, 'v as resolveMotion };', 'v as resolveMotion, mapStats as getMaterialMapStats };');

    const gpuFile = path.join(TARGET, 'gpu.js');
    replaceRequired(gpuFile, 'p === e && (p = void 0);', 'p === e && (p = void 0), deviceLossListeners.forEach((listener) => listener());');
    replaceRequired(gpuFile, 'var g = i;', 'var deviceLossListeners = new Set();\nfunction onMaterialDeviceLoss(listener) { deviceLossListeners.add(listener); return () => deviceLossListeners.delete(listener); }\nvar g = i;');
    replaceRequired(gpuFile, 'export { f as MaterialRenderer, h as disposeMaterialRenderer, m as getMaterialRenderer, n as mapPlanes, r as mapScale, g as materialShader };', 'export { f as MaterialRenderer, h as disposeMaterialRenderer, m as getMaterialRenderer, n as mapPlanes, r as mapScale, g as materialShader, onMaterialDeviceLoss };');

    const depsRoot = path.join(temp, 'deps');
    const vgpuInputs = await bundleDependency(depsRoot, 'vgpu', 'init, effect, frame, target', path.join(TARGET, 'deps', 'vgpu.js'));
    const lisseInputs = await bundleDependency(depsRoot, '@lisse/core', 'getLayoutSize, generateClipPath, generatePath, acquirePosition, createDropShadow, createSvgEffects, extractAndStripEffects, hasEffects, observeAnchor, observeResize, releasePosition, restoreStyles', path.join(TARGET, 'deps', 'lisse.js'));
    writeVendor('deps/vgpu.d.ts', 'export type Gpu = any;\nexport type ShaderSource = any;\n');
    writeVendor('deps/lisse.d.ts', 'export interface SmoothCornerOptions { [key: string]: unknown }\n');
    rewriteLocalImports();
    fs.copyFileSync(path.join(depsRoot, 'node_modules', 'vgpu', 'LICENSE'), path.join(TARGET, 'LICENSE.vgpu'));
    fs.copyFileSync(path.join(depsRoot, 'node_modules', '@lisse', 'core', 'LICENSE'), path.join(TARGET, 'LICENSE.lisse'));
    writeVendor('VENDORED.md', `
# Vendored Liquid Glass

- Fetch date: ${FETCHED_AT}
- Glass HQ: ${GLASS.name}@${GLASS.version}, ${glassInfo.dist.tarball}, ${glassInfo.dist.integrity}
- vgpu: ${VGPU.name}@${VGPU.version}, ${vgpuInfo.dist.tarball}, ${vgpuInfo.dist.integrity}
- Lisse: ${LISSE.name}@${LISSE.version}, ${lisseInfo.dist.tarball}, ${lisseInfo.dist.integrity}

Only the Glass core/dom/gpu paths and required shared files are vendored. React, Base UI, GlassMenu, Gecko, persistent caches, remote resources and Node runtimes are excluded. vgpu and Lisse are bundled from the exact exports used by the Glass entries, then imported locally.

## Local adaptations

- Replaced IndexedDB/localStorage map persistence with the shared 4,000,000-pixel LRU and in-flight budget; evictions release decoded images and SVG map tokens.
- Replaced inline blob/data Workers with a Vite module Worker and synchronous encoder fallback; map images remain data: PNG URLs.
- Replaced progressive blur with a no-op boundary because Track B owns scroll fades; disabled Gecko at the engine capability boundary.
- Added per-surface ready/error callbacks, scene setActive, material map diagnostics and device-loss notifications.
- Changed bare vgpu/Lisse imports to local bundled modules. This file and the local patches must be reviewed on every re-vendor.

## vgpu bundle inputs

${vgpuInputs.map((file) => `- ${file}`).join('\n')}

## Lisse bundle inputs

${lisseInputs.map((file) => `- ${file}`).join('\n')}
`);
    console.log(`Vendored liquid glass into ${path.relative(ROOT, TARGET)}`);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

await main();
