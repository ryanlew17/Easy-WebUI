import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import os from 'node:os';
import { measurementIdentity } from './perf-identity.mjs';

// @req REQ-2026-006：真实 Paint/主线程/帧间隔/地图像素的交互性能套件。
const EDGE = process.env.EASYUI_BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const args = process.argv.slice(2);
const option = (name) => {
  if (args.includes(name)) return args[args.indexOf(name) + 1];
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};
const DIST = normalize(option('--dist') ?? 'dist');
const RUNS = Math.max(1, Number(option('--runs') ?? '1'));
const LABEL = option('--label') ?? 'candidate';
const OUTPUT = option('--output');
const REQUIRE_GLASS = args.includes('--require-glass');
const NO_COMPOSER_OPTICS = args.includes('--no-composer-optics');
const NO_COMPOSER_RINGS = args.includes('--no-composer-rings');
const NO_COMPOSER_HIGHLIGHT = args.includes('--no-composer-highlight');
const ROUND_COMPOSER = args.includes('--round-composer');
const NO_COMPOSER_BLUR = args.includes('--no-composer-blur');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) file = join(DIST, 'index.html');
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
});

const seed = () => {
  const t0 = 1767225600000;
  const messages = [];
  let parent = null;
  for (let i = 0; i < 48; i++) {
    const role = i % 2 ? 'assistant' : 'user';
    const id = `m${i}`;
    const content = role === 'assistant'
      ? `## Reply ${i}\n\n**Bold** text and a table.\n\n\`\`\`ts\nconst value${i}: number = ${i};\nfunction render(name: string): string { return \`hello \${name}\`; }\nconsole.log(render(value${i}));\n\`\`\`\n\n| A | B |\n| - | - |\n| ${i} | done |`
      : `Question ${i} with some ordinary text.`;
    messages.push({ id, conversation_id: 'c-perf', parent_id: parent, role, content,
      reasoning: '', token_count: 40, partial: false, error: null, created_at: t0 + i });
    parent = id;
  }
  localStorage.setItem('easyui_mock_providers', JSON.stringify([
    { id: 'p-perf', name: 'Perf', base_url: 'https://api.deepseek.com', api_format: 'openai-chat', has_key: true,
      models: [{ id: 'deepseek-chat', enabled: true }], created_at: 1, updated_at: 1 },
  ]));
  localStorage.setItem('easyui_mock_conversations', JSON.stringify([
    { id: 'c-perf', title: 'Perf', provider_id: 'p-perf', model: 'deepseek-chat', preset_id: null,
      overrides: {}, pinned: false, reasoning_enabled: false, created_at: t0, updated_at: t0 },
  ]));
  localStorage.setItem('easyui_mock_messages', JSON.stringify(messages));
  document.cookie = `easyui_prefs=${encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'en-US' }))};path=/`;
};
const captureDevice = () => {
  const gpu = navigator.gpu;
  if (!gpu) return;
  const requestAdapter = gpu.requestAdapter.bind(gpu);
  gpu.requestAdapter = async (...args) => {
    const adapter = await requestAdapter(...args);
    if (!adapter) return adapter;
    const requestDevice = adapter.requestDevice.bind(adapter);
    adapter.requestDevice = async (...deviceArgs) => {
      const device = await requestDevice(...deviceArgs);
      window.__perfGlassDevice = device;
      return device;
    };
    return adapter;
  };
};

let browser;
const allRuns = [];
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await puppeteer.launch({ executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--force-device-scale-factor=1'] });

  async function newPage() {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(seed);
    await page.evaluateOnNewDocument(captureDevice);
    await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('textarea');
    await page.waitForFunction(() => document.querySelectorAll('.msg-in').length === 48);
    await page.waitForFunction(() => document.querySelectorAll('code.hljs').length === 24, { timeout: 5000 });
    await sleep(300);
    const overrides = [];
    if (NO_COMPOSER_OPTICS) overrides.push('.composer-shell::before,.composer-shell::after,.composer-highlight{display:none!important}');
    if (NO_COMPOSER_RINGS) overrides.push('.composer-shell::before,.composer-shell::after{display:none!important}');
    if (NO_COMPOSER_HIGHLIGHT) overrides.push('.composer-highlight{display:none!important}');
    if (ROUND_COMPOSER) overrides.push('.composer-shell{corner-shape:round!important}');
    if (NO_COMPOSER_BLUR) overrides.push('.composer-shell{backdrop-filter:none!important}');
    if (overrides.length) await page.addStyleTag({ content: overrides.join('\n') });
    return { page, errors };
  }

  async function startMeasure(page, name) {
    const cdp = await page.createCDPSession();
    const trace = [];
    cdp.on('Tracing.dataCollected', ({ value }) => trace.push(...value));
    await cdp.send('Performance.enable');
    await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
    const before = await cdp.send('Performance.getMetrics');
    await page.evaluate(() => {
      window.__perfFrames = [];
      window.__perfLongTasks = [];
      window.__perfRafRequests = 0;
      let previous;
      const tick = (time) => {
        if (previous !== undefined) window.__perfFrames.push(time - previous);
        previous = time;
        window.__perfRafRequests++;
        window.__perfRaf = requestAnimationFrame(tick);
      };
      window.__perfRaf = requestAnimationFrame(tick);
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__perfLongTasks.push(entry.duration);
      }).observe({ entryTypes: ['longtask'] });
    });
    return { cdp, trace, before, name, start: Date.now(), page };
  }

  async function endMeasure(session) {
    const { cdp, trace, before, name, start, page } = session;
    const wallMs = Date.now() - start;
    const tracingComplete = new Promise((resolve) => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    await tracingComplete;
    const after = await cdp.send('Performance.getMetrics');
    const sample = await page.evaluate(() => {
      cancelAnimationFrame(window.__perfRaf);
      const root = document.querySelector('.composer-shell')?.closest('[data-glass-state]');
      return {
        frames: window.__perfFrames,
        longTasks: window.__perfLongTasks,
        rafRequests: window.__perfRafRequests,
        maps: Number(root?.dataset.glassMaps ?? 0),
        mapPixels: Number(root?.dataset.glassMapPixels ?? 0),
        mapBuilds: Number(root?.dataset.glassMapBuilds ?? 0),
        surfaces: Number(root?.dataset.glassSurfaces ?? 0),
        state: root?.dataset.glassState ?? 'css',
        filterArea: [...document.querySelectorAll('[data-glass-active="true"]')]
          .reduce((sum, el) => { const r = el.getBoundingClientRect(); return sum + r.width * r.height; }, 0),
      };
    });
    const metric = (set, key) => set.metrics.find((entry) => entry.name === key)?.value ?? 0;
    const delta = (key) => +((metric(after, key) - metric(before, key)) * 1000).toFixed(2);
    return {
      name,
      wallMs,
      frameP50Ms: +percentile(sample.frames, 0.5).toFixed(2),
      frameP95Ms: +percentile(sample.frames, 0.95).toFixed(2),
      frameMaxMs: +Math.max(0, ...sample.frames).toFixed(2),
      longTaskMaxMs: +Math.max(0, ...sample.longTasks).toFixed(2),
      longTaskCount: sample.longTasks.length,
      paintEvents: trace.filter((event) => event.name === 'Paint').length,
      rasterEvents: trace.filter((event) => event.name === 'Rasterize').length,
      rafRequests: sample.rafRequests,
      scriptDurationMs: delta('ScriptDuration'),
      taskDurationMs: delta('TaskDuration'),
      layoutDurationMs: delta('LayoutDuration'),
      recalcStyleDurationMs: delta('RecalcStyleDuration'),
      jsHeapAfterMiB: +(metric(after, 'JSHeapUsedSize') / 1048576).toFixed(2),
      nodesAfter: Math.round(metric(after, 'Nodes')),
      maps: sample.maps,
      mapPixels: sample.mapPixels,
      mapBuilds: sample.mapBuilds,
      surfaces: sample.surfaces,
      filterAreaPx: Math.round(sample.filterArea),
      state: sample.state,
      memory: session.memory ?? null,
    };
  }

  async function suite(page, errors) {
    const reports = [];
    reports.push(await (async () => {
      const session = await startMeasure(page, 'stream-scroll');
      await page.type('textarea', 'Run performance stream');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('textarea')?.disabled);
      await page.evaluate(() => {
        const list = document.querySelector('.message-scroll') ?? document.querySelector('[aria-label="Message list"]');
        let direction = -1;
        window.__perfScroll = setInterval(() => {
          const remaining = list.scrollHeight - list.clientHeight;
          let next = list.scrollTop + direction * 24;
          if (next <= 0 || next >= remaining) { direction *= -1; next = list.scrollTop + direction * 24; }
          list.scrollTop = next;
        }, 16);
      });
      await page.waitForFunction(() => !document.querySelector('textarea')?.disabled, { timeout: 20000 });
      await page.evaluate(() => clearInterval(window.__perfScroll));
      return endMeasure(session);
    })());

    reports.push(await (async () => {
      const session = await startMeasure(page, 'multiline');
      await page.click('textarea');
      for (let line = 0; line < 8; line++) {
        if (line) {
          await page.keyboard.down('Shift');
          await page.keyboard.press('Enter');
          await page.keyboard.up('Shift');
        }
        await page.type('textarea', `line ${line}`);
      }
      await page.keyboard.down('Control');
      await page.keyboard.press('a');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      return endMeasure(session);
    })());

    reports.push(await (async () => {
      const session = await startMeasure(page, 'resize-right-drag');
      for (const width of [1200, 1440, 1280, 1440]) await page.setViewport({ width, height: 900 });
      const separator = await page.$('[role="separator"][aria-orientation="vertical"]');
      if (separator) {
        const box = await separator.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + 200);
        await page.mouse.down();
        await page.mouse.move(box.x - 100, box.y + 200, { steps: 12 });
        await page.mouse.up();
      }
      return endMeasure(session);
    })());

    reports.push(await (async () => {
      const session = await startMeasure(page, 'dual-zoom');
      for (const zoom of [0.5, 1, 2.5, 1]) {
        await page.evaluate((value) => {
          document.documentElement.style.zoom = String(value);
          document.documentElement.style.setProperty('--app-zoom', String(value));
        }, zoom);
        await sleep(180);
      }
      const cdp = await page.createCDPSession();
      for (const scale of [0.67, 1, 2, 1]) {
        await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
        await sleep(180);
      }
      return endMeasure(session);
    })());

    reports.push(await (async () => {
      const session = await startMeasure(page, 'theme-popovers');
      for (let index = 0; index < 6; index++) {
        await page.evaluate((dark) => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, index % 2 === 0);
        await sleep(100);
      }
      for (let index = 0; index < 30; index++) {
        await page.click('.glass-bar [aria-haspopup="listbox"]');
        await sleep(50);
        await page.keyboard.press('Escape');
        await sleep(180);
      }
      for (let index = 0; index < 5; index++) {
        await page.evaluate(() => {
          [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Settings')?.click();
        });
        await sleep(200);
        await page.evaluate(() => {
          [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Back')?.click();
        });
        await sleep(200);
      }
      return endMeasure(session);
    })());

    reports.push(await (async () => {
      const session = await startMeasure(page, 'device-loss');
      const destroyed = await page.evaluate(() => {
        if (!window.__perfGlassDevice) return false;
        window.__perfGlassDevice.destroy();
        return true;
      });
      if (!destroyed && REQUIRE_GLASS) throw new Error('No real GPUDevice captured for device-loss scenario');
      await sleep(500);
      return endMeasure(session);
    })());

    reports.push(await (async () => {
      const session = await startMeasure(page, 'idle-memory');
      await sleep(1500);
      await cdpCollectGarbage(session.cdp);
      const first = await session.cdp.send('Performance.getMetrics');
      await sleep(500);
      await cdpCollectGarbage(session.cdp);
      const second = await session.cdp.send('Performance.getMetrics');
      session.memory = { before: heap(first), after: heap(second) };
      return endMeasure(session);
    })());
    if (errors.length) throw new Error(errors.join('; '));
    return reports;
  }

  function heap(metrics) {
    return +(metrics.metrics.find((entry) => entry.name === 'JSHeapUsedSize')?.value / 1048576).toFixed(2);
  }
  async function cdpCollectGarbage(cdp) {
    await cdp.send('HeapProfiler.collectGarbage');
  }

  for (let run = 0; run <= RUNS; run++) {
    const { page, errors } = await newPage();
    if (run === 0) {
      await page.type('textarea', 'warmup');
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => !document.querySelector('textarea')?.disabled, { timeout: 20000 });
      await page.click('.glass-bar [aria-haspopup="listbox"]');
      await sleep(200);
      await page.keyboard.press('Escape');
      await page.close();
      continue;
    }
    const reports = await suite(page, errors);
    allRuns.push({ run, reports });
    await page.close();
  }

  const report = {
    kind: 'req006-glass-interactions',
    environment: {
      ...measurementIdentity(), platform: process.platform, release: os.release(),
      cpu: os.cpus()[0]?.model ?? 'unknown', node: process.version,
      viewport: '1440x900', gpu: true, label: LABEL, dist: DIST,
    },
    warmupRuns: 1,
    results: allRuns,
  };
  const serialized = JSON.stringify(report, null, 2);
  if (OUTPUT) writeFileSync(OUTPUT, serialized);
  else console.log(serialized);
} finally {
  if (browser) await browser.close();
  server.close();
}
