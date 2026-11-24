import './node-version-guard.mjs';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer-core';

// @req REQ-2026-006：真实 file:// + CSP + preload/IPC/SQLite + 本机 SSE 的隔离生产验证。
const ROOT = process.cwd();
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const EXPECT_SURFACES = Number(process.env.EASYUI_GLASS_EXPECT_SURFACES ?? '1');
const TRACK_C = process.env.EASYUI_GLASS_TRACK_C === '1';
const experimentExpectation = (reason) => TRACK_C ? reason : 'css';
const results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, label) => {
  if (!condition) throw new Error(label);
  console.log(`PASS ${label}`);
};

function startProvider() {
  const server = createServer(async (req, res) => {
    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: 'glass-model' }] }));
      return;
    }
    if (req.url === '/v1/chat/completions' && req.method === 'POST') {
      for await (const _ of req) {}
      res.writeHead(200, {
        'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive',
      });
      const chunks = ['Glass ', 'material ', 'stream ', 'verified ', 'with ', 'local ', 'data.'];
      for (const [index, content] of chunks.entries()) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
        await sleep(80);
        if (res.destroyed) return;
        if (index === chunks.length - 1) res.end('data: [DONE]\n\n');
      }
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

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
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Electron exited (${code})`)); });
  });
}

async function launchScenario(name, providerUrl, options = {}) {
  const tempRoot = fs.mkdtempSync(path.join(ROOT, 'build', 'req006-glass-'));
  const appDir = path.join(tempRoot, 'app');
  fs.mkdirSync(path.join(appDir, 'build'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'dist'), path.join(appDir, 'dist'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'dist-electron'), path.join(appDir, 'dist-electron'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(appDir, 'package.json'));
  fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(appDir, 'build', 'icon.png'));
  const child = spawn(ELECTRON, [appDir, '--remote-debugging-port=0', `--user-data-dir=${path.join(tempRoot, 'user-data')}`, '--no-first-run'], {
    cwd: appDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, EASYUI_MOCK_UPDATE: '1', NODE_PATH: [path.join(ROOT, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) },
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  let browser;
  const errors = [];
  const resources = new Set();
  let completed = false;
  try {
    browser = await puppeteer.connect({ browserWSEndpoint: await waitForDevTools(child), defaultViewport: null });
    let page;
    for (let attempt = 0; attempt < 100 && !page; attempt++) {
      page = (await browser.pages()).find((candidate) => candidate.url().includes('dist/index.html'));
      if (!page) await sleep(50);
    }
    if (!page) throw new Error('Electron page not found');
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('request', (request) => resources.add(request.url()));
    if (options.media) await page.emulateMediaFeatures(options.media);
    if (TRACK_C) await page.evaluateOnNewDocument(() => { document.documentElement.dataset.glassEngine = 'enabled'; });
    if (options.init) await page.evaluateOnNewDocument(options.init);

    await page.waitForFunction(() => window.easyui !== undefined, { timeout: 10000 });
    const info = await page.evaluate(() => window.easyui.getSystemInfo());
    check(path.resolve(info.dataPath) === path.join(appDir, 'data'), `${name}: isolated data directory`);
    const seeded = await page.evaluate(async (baseUrl) => {
      const provider = await window.easyui.createProvider({
        name: 'REQ006 Local', base_url: baseUrl, api_format: 'openai-chat', api_key: 'sk-local-req006',
      });
      const models = await window.easyui.fetchModels({ providerId: provider.id });
      await window.easyui.updateProvider(provider.id, {
        models: models.map((id) => ({ id, enabled: true, display_name: id })),
      });
      const conversation = await window.easyui.createConversation();
      await window.easyui.updateConversation(conversation.id, {
        title: 'REQ006 Glass', provider_id: provider.id, model: 'glass-model',
      });
      return conversation.id;
    }, providerUrl);
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('textarea');
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'REQ006 Glass')?.click();
    });
    await page.waitForSelector('.composer-shell');
    const adapter = options.skipAdapterProbe
      ? { webgpu: true, available: false }
      : await page.evaluate(async () => ({
        webgpu: typeof navigator.gpu?.requestAdapter === 'function',
        available: typeof navigator.gpu?.requestAdapter === 'function'
          ? Boolean(await navigator.gpu.requestAdapter()) : false,
      }));
    await page.waitForFunction(() => {
      const shell = document.querySelector('.composer-shell');
      const root = shell?.closest('[data-glass-state]');
      return shell?.dataset.glassActive === 'true' || root?.dataset.glassState === 'fallback' || root?.dataset.glassReason;
    }, { timeout: 15000, polling: 100 });
    const state = await page.evaluate(() => {
      const shell = document.querySelector('.composer-shell');
      const root = shell.closest('[data-glass-state]');
      return {
        state: root.dataset.glassState,
        reason: root.dataset.glassReason,
        surfaces: Number(root.dataset.glassSurfaces),
        maps: Number(root.dataset.glassMaps),
        pixels: Number(root.dataset.glassMapPixels),
        builds: Number(root.dataset.glassMapBuilds),
        active: shell.dataset.glassActive,
        backdrop: getComputedStyle(shell).backdropFilter,
        height: shell.getBoundingClientRect().height,
      };
    });
    const expected = options.expect ?? (TRACK_C && adapter.available ? 'active' : 'css');
    if (expected === 'active') {
      check(state.active === 'true' && state.state === 'active', `${name}: real refraction active (${state.reason || 'ok'})`);
      check(state.surfaces === EXPECT_SURFACES, `${name}: exactly ${EXPECT_SURFACES} permanent surface(s)`);
      check(state.backdrop === 'none', `${name}: active surface removes its own backdrop-filter`);
      check(state.maps > 0 && state.pixels > 0 && state.pixels <= 4_000_000, `${name}: bounded material maps`);
      const mapUrls = await page.evaluate(() => [...document.getElementsByTagNameNS('*', 'feImage')]
        .map((el) => el.getAttribute('href')).filter(Boolean));
      check(mapUrls.length > 0 && mapUrls.every((url) => url.startsWith('data:image/png;base64,')), `${name}: map images use data: PNG`);
      check([...resources].filter((url) => /\/(?:dom|gpu)-[^/]+\.js/.test(url)).every((url) => url.startsWith('file:')), `${name}: lazy chunks load from file://`);
      check(![...resources].some((url) => url.startsWith('blob:')), `${name}: no blob Worker or resources`);
      if (name === 'default') {
        fs.mkdirSync(path.join(ROOT, 'build', 'e2e-shots'), { recursive: true });
        await page.screenshot({ path: path.join(ROOT, 'build', 'e2e-shots', 'req006-electron-glass.png') });
      }
    } else if (expected === 'css') {
      check(state.state === 'fallback', `${name}: CSS fallback state (${state.reason})`);
      if (!TRACK_C) check(state.reason === 'filter-budget', `${name}: engine disabled by default (${state.reason})`);
      if (options.media) check(state.backdrop === 'none', `${name}: preference-safe CSS removes filters`);
      else check(state.backdrop !== 'none', `${name}: CSS backdrop restored`);
    } else {
      check(state.state === 'fallback' && state.reason === expected, `${name}: expected ${expected} fallback (${state.reason})`);
      check(state.backdrop !== 'none', `${name}: CSS backdrop restored after ${expected}`);
    }

    console.log(`STEP ${name}: material assertions complete`);
    const buildsBefore = state.builds;
    await page.hover('.composer-shell');
    console.log(`STEP ${name}: hover complete`);
    await page.type('.composer-input', 'one');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    await page.type('.composer-input', 'two');
    await sleep(250);
    const multiline = await page.evaluate(() => ({
      builds: Number(document.querySelector('.composer-shell').closest('[data-glass-state]').dataset.glassMapBuilds),
      height: document.querySelector('.composer-input').getBoundingClientRect().height,
    }));
    check(multiline.height > 28, `${name}: multiline input grows by a line step`);
    console.log(`STEP ${name}: multiline complete`);
    await page.click('.composer-input');
    await page.keyboard.down('Control');
    await page.keyboard.press('a');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    await sleep(200);
    const settled = await page.evaluate(() => Number(document.querySelector('.composer-shell').closest('[data-glass-state]').dataset.glassMapBuilds));
    await page.type('.composer-input', 'stream');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelector('textarea')?.disabled, { timeout: 5000 });
    await sleep(180);
    await page.evaluate((id) => window.easyui.stopGeneration(id), seeded);
    await page.waitForFunction(() => !document.querySelector('textarea')?.disabled, { timeout: 5000 });
    const messages = await page.evaluate((id) => window.easyui.listMessages(id), seeded);
    console.log(`STEP ${name}: streaming stop complete`);
    check(messages.some((message) => message.role === 'assistant' && message.partial === true), `${name}: streaming stop remains partial and usable`);
    const after = await page.evaluate(() => Number(document.querySelector('.composer-shell').closest('[data-glass-state]').dataset.glassMapBuilds));
    check(after === settled, `${name}: highlight and stream do not rebuild maps`);
    check(multiline.builds >= buildsBefore, `${name}: map build counter remains monotonic per geometry only`);

    if (options.deviceLoss && expected === 'active') {
      const destroyed = await page.evaluate(() => {
        if (!window.__req006Device) return false;
        window.__req006Device.destroy();
        return true;
      });
      check(destroyed, `${name}: captured a real GPUDevice`);
      await page.waitForFunction(() => document.querySelector('.composer-shell').closest('[data-glass-state]').dataset.glassReason === 'device-lost', { timeout: 5000 });
      const fallback = await page.evaluate(() => getComputedStyle(document.querySelector('.composer-shell')).backdropFilter);
      check(fallback !== 'none', `${name}: device loss restores CSS material`);
    }
    check(errors.length === 0, `${name}: no renderer or CSP errors${errors.length ? ` (${errors.join('; ')})` : ''}`);
    results.push({ name, adapter, expected, state, resources: [...resources].filter((url) => !url.startsWith('data:')), errors, workerResource: [...resources].find((url) => url.includes('map-encoder.worker')) ?? null });
    completed = true;
  } catch (error) {
    results.push({ name, error: String(error), state: 'failed', output: output.slice(-1200), errors });
    throw error;
  } finally {
    try { await browser?.disconnect(); } catch {}
    try { execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch {}
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (!completed && process.env.EASYUI_GLASS_KEEP_ON_FAILURE !== '1') {
      // The report below retains the failure evidence; isolated app data is never reused.
    }
  }
}

const provider = await startProvider();
const providerUrl = `http://127.0.0.1:${provider.address().port}/v1`;
const only = process.env.EASYUI_GLASS_ONLY;
const runScenario = async (...args) => {
  if (!only || only === args[0]) return launchScenario(...args);
};
try {
  await runScenario('default', providerUrl, {
    deviceLoss: true,
    init: () => {
      const gpu = navigator.gpu;
      if (!gpu) return;
      const requestAdapter = gpu.requestAdapter.bind(gpu);
      gpu.requestAdapter = async (...args) => {
        const adapter = await requestAdapter(...args);
        if (!adapter) return adapter;
        const requestDevice = adapter.requestDevice.bind(adapter);
        adapter.requestDevice = async (...deviceArgs) => {
          const device = await requestDevice(...deviceArgs);
          window.__req006Device = device;
          return device;
        };
        return adapter;
      };
    },
  });
  await runScenario('no-webgpu', providerUrl, {
    expect: 'css',
    init: () => { Object.defineProperty(navigator, 'gpu', { get: () => undefined }); },
  });
  await runScenario('map-failure', providerUrl, {
    expect: experimentExpectation('map'),
    init: () => {
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () {
        if (this.src.startsWith('data:image/png')) return Promise.reject(new Error('forced map decode failure'));
        return decode.call(this);
      };
    },
  });
  await runScenario('ready-timeout', providerUrl, {
    expect: experimentExpectation('timeout'),
    skipAdapterProbe: true,
    init: () => {
      if (navigator.gpu) navigator.gpu.requestAdapter = () => new Promise(() => {});
    },
  });
  await runScenario('geometry-failure', providerUrl, {
    expect: experimentExpectation('geometry'),
    init: () => {
      const rect = HTMLDivElement.prototype.getBoundingClientRect;
      HTMLDivElement.prototype.getBoundingClientRect = function () {
        const value = rect.call(this);
        if (!this.classList.contains('composer-shell')) return value;
        return { ...value, left: -100000, width: value.width };
      };
    },
  });
  await runScenario('reduced-transparency', providerUrl, {
    expect: 'css',
    media: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  await runScenario('forced-colors', providerUrl, {
    expect: 'css',
    media: [{ name: 'forced-colors', value: 'active' }],
  });
  console.log(JSON.stringify({ kind: 'req006-electron-glass', results }, null, 2));
  console.log('ELECTRON_GLASS_CHECKS_PASS');
} finally {
  provider.close();
  console.log(JSON.stringify({ kind: 'req006-electron-glass-results', results }, null, 2));
}
