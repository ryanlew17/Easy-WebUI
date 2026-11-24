import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, writeFileSync } from 'node:fs';
import { measurementIdentity } from './perf-identity.mjs';
import { extname, join, normalize } from 'node:path';
import os from 'node:os';

const EDGE = process.env.EASYUI_BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const args = process.argv.slice(2);
const option = (name) => {
  if (args.includes(name)) return args[args.indexOf(name) + 1];
  const prefix = `${name}=`;
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
};
const DIST = normalize(option('--dist') ?? 'dist');
const RUNS = Math.max(1, Number(option('--runs') ?? '5'));
const GPU = args.includes('--gpu');
const LABEL = option('--label') ?? 'candidate';
const OUTPUT = option('--output');
const NO_OPTICS = args.includes('--no-optics');
const ROUND_CORNERS = args.includes('--round-corners');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join(DIST, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(DIST) || !existsSync(file) || !statSync(file).isFile()) {
    file = join(DIST, 'index.html');
  }
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)];
let browser;

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: [...(GPU ? [] : ['--disable-gpu']), '--no-sandbox', '--force-device-scale-factor=1'],
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
      messages.push({
        id,
        conversation_id: 'c-perf',
        parent_id: parent,
        role,
        content,
        reasoning: '',
        token_count: 40,
        partial: false,
        error: null,
        created_at: t0 + i,
      });
      parent = id;
    }
    localStorage.setItem(
      'easyui_mock_providers',
      JSON.stringify([
        {
          id: 'p-perf',
          name: 'Perf',
          base_url: 'https://api.deepseek.com',
          api_format: 'openai-chat',
          has_key: true,
          models: [{ id: 'deepseek-chat', enabled: true }],
          created_at: 1,
          updated_at: 1,
        },
      ]),
    );
    localStorage.setItem(
      'easyui_mock_conversations',
      JSON.stringify([
        {
          id: 'c-perf',
          title: 'Perf',
          provider_id: 'p-perf',
          model: 'deepseek-chat',
          preset_id: null,
          overrides: {},
          pinned: false,
          reasoning_enabled: false,
          created_at: t0,
          updated_at: t0,
        },
      ]),
    );
    localStorage.setItem('easyui_mock_messages', JSON.stringify(messages));
    document.cookie =
      'easyui_prefs=' +
      encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'en-US' })) +
      ';path=/';
  };

  const results = [];
  for (let run = 0; run <= RUNS; run++) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(seed);
    await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('textarea');
    await page.waitForFunction(() => document.querySelectorAll('.msg-in').length === 48);
    await page.waitForFunction(() => document.querySelectorAll('code.hljs').length === 24, { timeout: 5000 });
    await sleep(300);
    if (NO_OPTICS) {
      await page.evaluate(() => {
        for (const sheet of document.styleSheets) {
          for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
            const text = sheet.cssRules[index].cssText;
            if (text.includes('glass-optics') || text.includes('message-scroll') || text.includes('composer-highlight')) sheet.deleteRule(index);
          }
        }
      });
    }
    if (ROUND_CORNERS) {
      await page.evaluate(() => {
        for (const sheet of document.styleSheets) {
          for (let index = sheet.cssRules.length - 1; index >= 0; index--) {
            if (sheet.cssRules[index].cssText.includes('corner-shape') || sheet.cssRules[index].cssText.includes('bubble-surface')) sheet.deleteRule(index);
          }
        }
      });
    }

    const cdp = await page.createCDPSession();
    await cdp.send('Performance.enable');
    const before = await cdp.send('Performance.getMetrics');
    await page.evaluate(() => {
      window.__req003LongTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__req003LongTasks.push(entry.duration);
      }).observe({ entryTypes: ['longtask'] });
    });

    const start = Date.now();
    await page.type('textarea', 'Run performance stream');
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelectorAll('.msg-in').length === 50 && document.querySelector('textarea')?.disabled,
      { timeout: 5000 },
    );
    await page.waitForFunction(() => {
      const bubbles = document.querySelectorAll('.msg-in');
      const streamingCode = bubbles[bubbles.length - 1]?.querySelector('pre code');
      return streamingCode && !streamingCode.classList.contains('hljs');
    }, { timeout: 10000 });
    await page.waitForFunction(
      () => document.querySelectorAll('.msg-in').length === 50 && !document.querySelector('textarea')?.disabled,
      { timeout: 20000 },
    );
    await page.waitForFunction(() => {
      const bubbles = document.querySelectorAll('.msg-in');
      return bubbles[bubbles.length - 1]?.querySelector('code.hljs');
    }, { timeout: 5000 });
    const wallMs = Date.now() - start;
    const after = await cdp.send('Performance.getMetrics');
    const metric = (metrics, name) => metrics.metrics.find((entry) => entry.name === name)?.value ?? 0;
    const durationDelta = (name) => +((metric(after, name) - metric(before, name)) * 1000).toFixed(2);
    const longTasks = await page.evaluate(() => window.__req003LongTasks);
    const visibleBubbles = await page.evaluate(() => document.querySelectorAll('.msg-in').length);
    const highlightedBlocks = await page.evaluate(() => document.querySelectorAll('code.hljs').length);
    if (visibleBubbles !== 50) throw new Error(`visible bubble count ${visibleBubbles} != 50`);
    if (highlightedBlocks !== 25) throw new Error(`highlighted block count ${highlightedBlocks} != 25`);
    if (errors.length > 0) throw new Error(`renderer errors: ${errors.join('; ')}`);
    if (run === 0) {
      await page.close();
      continue;
    }

    results.push({
      run: run + 1,
      wallMs,
      visibleBubbles,
      highlightedBlocks,
      streamingHighlightDeferred: true,
      ScriptDuration: durationDelta('ScriptDuration'),
      LayoutDuration: durationDelta('LayoutDuration'),
      RecalcStyleDuration: durationDelta('RecalcStyleDuration'),
      TaskDuration: durationDelta('TaskDuration'),
      JSHeapBeforeMiB: +(metric(before, 'JSHeapUsedSize') / 1048576).toFixed(2),
      JSHeapAfterMiB: +(metric(after, 'JSHeapUsedSize') / 1048576).toFixed(2),
      nodesBefore: Math.round(metric(before, 'Nodes')),
      nodesAfter: Math.round(metric(after, 'Nodes')),
      longTaskCount: longTasks.length,
      longTaskTotalMs: +longTasks.reduce((sum, value) => sum + value, 0).toFixed(2),
      longTaskMaxMs: +Math.max(0, ...longTasks).toFixed(2),
    });
    await page.close();
  }

  const report = {
    kind: 'req003-renderer',
    environment: {
      ...measurementIdentity(),
      platform: process.platform,
      release: os.release(),
      cpu: os.cpus()[0]?.model ?? 'unknown',
      node: process.version,
      viewport: '1440x900',
      gpu: GPU,
      label: LABEL,
      dist: DIST,
    },
    dataset: '48 seeded Markdown/code/table messages + user + streaming assistant = 50 visible bubbles',
    warmupRuns: 1,
    summary: {
      scriptDurationMedianMs: +median(results.map((r) => r.ScriptDuration)).toFixed(2),
      taskDurationMedianMs: +median(results.map((r) => r.TaskDuration)).toFixed(2),
      longestTaskMedianMs: +median(results.map((r) => r.longTaskMaxMs)).toFixed(2),
    },
    results,
  };
  const serialized = JSON.stringify(report, null, 2);
  if (OUTPUT) writeFileSync(OUTPUT, serialized);
  else console.log(serialized);
} finally {
  if (browser) await browser.close();
  server.close();
}
