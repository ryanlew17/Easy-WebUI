import './node-version-guard.mjs';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { measurementIdentity } from './perf-identity.mjs';

// @req REQ-2026-006：真实会话存在后的生产冷启动；所有数据目录均为临时隔离目录。
const ROOT = process.cwd();
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const electronVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
const args = process.argv.slice(2);
const option = (name) => {
  if (args.includes(name)) return args[args.indexOf(name) + 1];
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};
const RUNS = Math.max(1, Number(option('--runs') ?? '5'));
const LABEL = option('--label') ?? 'candidate';
const DIST = option('--dist') ?? 'dist';
const DIST_ELECTRON = option('--dist-electron') ?? 'dist-electron';
const OUTPUT = option('--output');
const MATERIAL = !args.includes('--no-material');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
const results = [];

function waitForDevTools(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Electron DevTools endpoint timeout')), 15000);
    const onData = (data) => {
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(data.toString());
      if (!match) return;
      clearTimeout(timer);
      child.stderr.off('data', onData);
      resolve(match[1]);
    };
    child.stderr.on('data', onData);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Electron exited before DevTools (${code})`)); });
  });
}

async function launchApp(appDir, tempRoot) {
  const child = spawn(ELECTRON, [appDir, '--remote-debugging-port=0', `--user-data-dir=${path.join(tempRoot, 'user-data')}`, '--no-first-run'], {
    cwd: appDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, EASYUI_MOCK_UPDATE: '1', NODE_PATH: [path.join(ROOT, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) },
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  return { child, endpoint: await waitForDevTools(child), output: () => output };
}

async function connectApp(endpoint) {
  const browser = await puppeteer.connect({ browserWSEndpoint: endpoint, defaultViewport: null });
  let page;
  for (let attempt = 0; attempt < 100 && !page; attempt++) {
    page = (await browser.pages()).find((candidate) => candidate.url().includes('dist/index.html'));
    if (!page) await sleep(50);
  }
  if (!page) throw new Error('Electron application page not found');
  await page.waitForFunction(() => window.easyui !== undefined, { timeout: 10000, polling: 100 });
  return { browser, page };
}

async function stopApp(child, browser) {
  try { await browser?.disconnect(); } catch {}
  try { execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5000)]);
  }
}

async function seedConversation(appDir, tempRoot) {
  const launched = await launchApp(appDir, tempRoot);
  let browser;
  try {
    ({ browser } = await connectApp(launched.endpoint));
    const page = (await browser.pages()).find((candidate) => candidate.url().includes('dist/index.html'));
    await page.evaluate(async () => {
      const provider = await window.easyui.createProvider({
        name: 'Perf Local', base_url: 'http://127.0.0.1:9/v1', api_format: 'openai-chat', api_key: 'sk-perf-local',
      });
      await window.easyui.updateProvider(provider.id, { models: [{ id: 'perf-model', enabled: true }] });
      const conversation = await window.easyui.createConversation();
      await window.easyui.updateConversation(conversation.id, {
        title: 'Perf Glass', provider_id: provider.id, model: 'perf-model',
      });
    });
  } finally {
    await stopApp(launched.child, browser);
  }
}

for (let run = 0; run < RUNS; run++) {
  const tempRoot = fs.mkdtempSync(path.join(ROOT, 'build', 'req006-electron-perf-'));
  const appDir = path.join(tempRoot, 'app');
  fs.mkdirSync(path.join(appDir, 'build'), { recursive: true });
  fs.cpSync(path.join(ROOT, DIST), path.join(appDir, 'dist'), { recursive: true });
  fs.cpSync(path.join(ROOT, DIST_ELECTRON), path.join(appDir, 'dist-electron'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(appDir, 'package.json'));
  fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(appDir, 'build', 'icon.png'));
  if (MATERIAL) await seedConversation(appDir, tempRoot);

  const start = performance.now();
  const launched = await launchApp(appDir, tempRoot);
  let browser;
  let completed = false;
  try {
    let page;
    ({ browser, page } = await connectApp(launched.endpoint));
    if (MATERIAL) await page.waitForSelector('.composer-shell', { timeout: 10000 });
    else await page.waitForSelector('textarea, button', { timeout: 10000 });
    const interactiveMs = performance.now() - start;
    const info = await page.evaluate(() => window.easyui.getSystemInfo());
    if (path.resolve(info.dataPath) !== path.join(appDir, 'data')) throw new Error(`benchmark escaped isolated data dir: ${info.dataPath}`);
    let materialReadyMs = interactiveMs;
    if (MATERIAL) {
      await page.waitForFunction(() => {
        const shell = document.querySelector('.composer-shell');
        const root = shell?.closest('[data-glass-state]');
        return shell && (!root || shell.dataset.glassActive === 'true' || root.dataset.glassState === 'fallback');
      }, { timeout: 10000, polling: 100 });
      materialReadyMs = performance.now() - start;
    }
    const material = await page.evaluate(async () => {
      const shell = document.querySelector('.composer-shell');
      const root = shell?.closest('[data-glass-state]');
      let adapterInfo = null;
      if (navigator.gpu?.requestAdapter) {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter?.info) {
          adapterInfo = Object.fromEntries(['vendor', 'architecture', 'device', 'description', 'driver']
            .map((key) => [key, adapter.info[key]]).filter(([, value]) => value !== undefined && value !== ''));
        }
      }
      return {
        state: root?.dataset.glassState ?? 'css',
        surfaces: Number(root?.dataset.glassSurfaces ?? 0),
        maps: Number(root?.dataset.glassMaps ?? 0),
        mapPixels: Number(root?.dataset.glassMapPixels ?? 0),
        adapterInfo,
      };
    });
    results.push({ run: run + 1, interactiveMs: +interactiveMs.toFixed(2), materialReadyMs: +materialReadyMs.toFixed(2), material, isolatedData: true });
    completed = true;
  } finally {
    await stopApp(launched.child, browser);
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (!completed) throw new Error(`Electron cold start run ${run + 1} failed: ${launched.output().slice(-1500)}`);
  }
}

const interactive = results.map((result) => result.interactiveMs);
const materialReady = results.map((result) => result.materialReadyMs);
const report = {
  kind: 'req006-electron-cold-start',
  environment: {
    ...measurementIdentity(),
    platform: process.platform,
    release: os.release(),
    cpu: os.cpus()[0]?.model ?? 'unknown',
    electron: electronVersion,
    updateChannel: 'deterministic mock (no external update request)',
    dataDir: 'isolated temporary app and userData under build/',
    label: LABEL,
    dist: DIST,
    distElectron: DIST_ELECTRON,
    material: MATERIAL,
    adapter: results[0]?.material.adapterInfo ?? null,
  },
  summary: {
    runs: results.length,
    interactiveMedianMs: +median(interactive).toFixed(2),
    interactiveMaxMs: +Math.max(...interactive).toFixed(2),
    materialReadyMedianMs: +median(materialReady).toFixed(2),
    materialReadyMaxMs: +Math.max(...materialReady).toFixed(2),
    budgetMs: 3000,
    withinBudget: Math.max(...interactive, ...materialReady) < 3000,
  },
  results,
};
const serialized = JSON.stringify(report, null, 2);
if (OUTPUT) {
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, serialized);
} else {
  console.log(serialized);
}
