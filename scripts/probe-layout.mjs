import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

// @req REQ-2026-006：C/I 骨架缩放、覆盖栏、设置导航、长草稿与检查器适配回归。
const CHROME = process.env.EASYUI_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.env.SHOT_OUT ?? 'build/req006-layout-review';
mkdirSync(OUT, { recursive: true });
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
};
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join('dist', urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith('dist') || !existsSync(file) || !statSync(file).isFile()) file = 'dist/index.html';
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const check = (condition, label, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures.push(label);
};
const seed = () => {
  const at = 1767225600000;
  const msg = (id, parent, role, content, offset) => ({
    id, conversation_id: 'c1', parent_id: parent, role, content, reasoning: '',
    token_count: null, partial: false, error: null, created_at: at + offset, stats: null,
  });
  localStorage.removeItem('easyui_mock_active_leaves');
  localStorage.setItem('easyui_mock_providers', JSON.stringify([
    { id: 'p1', name: 'Layout', base_url: 'https://x', api_format: 'openai-chat', has_key: true,
      models: [{ id: 'deepseek-reasoner', enabled: true }], created_at: 1, updated_at: 1 },
  ]));
  localStorage.setItem('easyui_mock_conversations', JSON.stringify([
    { id: 'c1', title: '布局走查', provider_id: 'p1', model: 'deepseek-reasoner', preset_id: null,
      overrides: {}, pinned: false, reasoning_enabled: true, created_at: at, updated_at: at },
  ]));
  localStorage.setItem('easyui_mock_messages', JSON.stringify([
    msg('m1', null, 'user', '第一条消息', 0),
    msg('m2', 'm1', 'assistant', '用于检查消息列与输入坞的可用空间。\n\n'.repeat(24), 1),
    msg('m3', 'm2', 'user', '最后一条消息', 2),
  ]));
  if (!document.cookie.includes('easyui_prefs=')) {
    document.cookie = `easyui_prefs=${encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN', zoom: 1 }))};path=/;max-age=31536000;SameSite=Lax`;
  }
};
const setZoom = async (page, base, width, height, zoom) => {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluate((value) => {
    document.cookie = `easyui_prefs=${encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN', zoom: value }))};path=/;max-age=31536000;SameSite=Lax`;
  }, zoom);
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('.app-frame');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '布局走查')?.click();
  });
  await sleep(180);
};
const checkAboutRepo = async (page, label) => {
  await page.evaluate(() => {
    [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent.trim() === '关于')?.click();
  });
  await sleep(220);
  const result = await page.evaluate(() => {
    const code = document.querySelector('[aria-label="关于"] code');
    if (!code) return null;
    code.scrollIntoView({ block: 'center' });
    const codeRect = code.getBoundingClientRect();
    const actionRect = document.querySelector('[aria-label="打开链接"]')?.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(code);
    const textRects = [...range.getClientRects()];
    return {
      overflowWrap: getComputedStyle(code).overflowWrap,
      textOutside: textRects.some((rect) => rect.left < codeRect.left - 1 || rect.right > codeRect.right + 1),
      actionOverlap: !!actionRect && textRects.some((rect) =>
        Math.min(rect.right, actionRect.right) > Math.max(rect.left, actionRect.left)
        && Math.min(rect.bottom, actionRect.bottom) > Math.max(rect.top, actionRect.top)),
    };
  });
  check(result?.overflowWrap === 'anywhere' && !result.textOutside && !result.actionOverlap,
    `${label} About repository wraps without covering its action`, JSON.stringify(result));
  if (process.env.SHOT_ALL === '1' || failures.some((entry) => entry.startsWith(label))) {
    await page.screenshot({ path: `${OUT}/about-${label}.png` });
  }
};

let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(seed);
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });

  for (const [width, height] of [[960, 600], [1280, 720], [1440, 900], [1920, 1080]]) {
    for (const zoom of [0.5, 1, 1.5, 2, 2.5]) {
      await setZoom(page, base, width, height, zoom);
      const label = `${width}x${height}@${zoom * 100}`;
      const result = await page.evaluate(() => {
        const rect = (el) => el?.getBoundingClientRect() ?? null;
        const overlaps = (a, b) => !!a && !!b
          && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
          && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
        const stage = document.querySelector('.app-stage');
        const column = document.querySelector('.message-column');
        const composer = document.querySelector('.composer-shell');
        const inspector = document.querySelector('.app-inspector');
        const toggle = document.querySelector('.workspace-topbar [aria-label="折叠或展开参数面板"]');
        const controls = [
          document.querySelector('.composer-secondary'),
          document.querySelector('.context-usage'),
          document.querySelector('.composer-dock [aria-label="发送消息"]'),
        ].filter(Boolean);
        const controlRects = controls.map(rect);
        const toggleRect = rect(toggle);
        return {
          stageWidth: stage?.offsetWidth ?? 0,
          columnWidth: column?.offsetWidth ?? 0,
          composerWidth: composer?.offsetWidth ?? 0,
          controlsOverlap: controlRects.some((a, i) => controlRects.slice(i + 1).some((b) => overlaps(a, b))),
          inspectorPosition: inspector ? getComputedStyle(inspector).position : null,
          inspectorVisible: !!rect(inspector)?.width,
          toggleReachable: !!toggleRect && toggleRect.left >= -1 && toggleRect.top >= -1
            && toggleRect.right <= innerWidth + 1 && toggleRect.bottom <= innerHeight + 1,
        };
      });
      check(result.stageWidth >= 160 && result.columnWidth >= 160 && result.composerWidth >= 160,
        `${label} keeps readable layout columns`, JSON.stringify(result));
      check(!result.controlsOverlap && result.toggleReachable,
        `${label} keeps composer controls and navigation reachable`, JSON.stringify(result));
      check(!result.inspectorVisible || result.inspectorPosition !== 'absolute',
        `${label} does not open an overlay inspector by default`, JSON.stringify(result));
      if (process.env.SHOT_ALL === '1' || failures.some((entry) => entry.startsWith(label))) {
        await page.screenshot({ path: `${OUT}/layout-${width}x${height}-${zoom * 100}.png` });
      }
    }
  }

  for (const [width, height, fontSize] of [[1440, 900, 18], [1440, 900, 24], [1280, 720, 20], [1100, 700, 20]]) {
    await setZoom(page, base, width, height, 1);
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, fontSize);
    await sleep(250);
    const label = `${width}x${height}@${fontSize}px-font`;
    const result = await page.evaluate(() => {
      const inspector = document.querySelector('.app-inspector');
      const rect = inspector?.getBoundingClientRect();
      const send = document.querySelector('.composer-dock [aria-label="发送消息"]')?.getBoundingClientRect();
      return {
        position: inspector ? getComputedStyle(inspector).position : null,
        visible: !!rect?.width,
        coversSend: !!rect && !!send && Math.min(rect.right, send.right) > Math.max(rect.left, send.left)
          && Math.min(rect.bottom, send.bottom) > Math.max(rect.top, send.top),
      };
    });
    const expectGrid = width > 64 * fontSize;
    check(result.coversSend === false && (expectGrid ? result.position !== 'absolute' : !result.visible),
      `${label} shares the CSS inspector breakpoint`, JSON.stringify(result));
    if (process.env.SHOT_ALL === '1' || failures.some((entry) => entry.startsWith(label))) {
      await page.screenshot({ path: `${OUT}/font-${fontSize}-${width}x${height}.png` });
    }
  }

  await setZoom(page, base, 1440, 900, 1);
  await page.focus('.composer-input');
  for (let i = 0; i < 10; i += 1) {
    await page.type('.composer-input', `草稿第 ${i + 1} 行`);
    if (i < 9) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
  }
  await page.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (list) list.scrollTop = list.scrollHeight;
  });
  await sleep(250);
  const draft = await page.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    const groups = [...document.querySelectorAll('[aria-label="消息列表"] .group')];
    const last = groups.at(-1)?.getBoundingClientRect();
    const composer = document.querySelector('.composer-shell')?.getBoundingClientRect();
    const dock = document.querySelector('.composer-dock');
    return {
      overlap: last && composer ? last.bottom - composer.top : null,
      paddingBottom: list ? getComputedStyle(list).paddingBottom : null,
      dockHeight: dock?.getBoundingClientRect().height ?? null,
    };
  });
  check(draft.overlap !== null && draft.overlap <= -8,
    '10-line draft leaves the last message reachable above composer', JSON.stringify(draft));
  if (process.env.SHOT_ALL === '1' || !(draft.overlap !== null && draft.overlap <= -8)) {
    await page.screenshot({ path: `${OUT}/draft-occlusion.png` });
  }

  for (const inspectorWidth of [240, 288, 480]) {
    await setZoom(page, base, 1440, 900, 1);
    await page.evaluate((value) => {
      document.cookie = `easyui_prefs=${encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN', zoom: 1, right_width: value }))};path=/;max-age=31536000;SameSite=Lax`;
    }, inspectorWidth);
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '布局走查')?.click();
    });
    await sleep(200);
    const row = await page.evaluate(() => {
      const control = document.querySelector('.app-inspector [aria-label="上下文溢出策略"]');
      const field = control?.closest('.field-row');
      const copy = field?.querySelector('.field-row-copy')?.getBoundingClientRect();
      const controlRect = control?.getBoundingClientRect();
      const model = document.querySelector('.app-inspector .model-picker-trigger > span');
      return {
        inspectorWidth: document.querySelector('.app-inspector')?.offsetWidth ?? 0,
        columns: field ? getComputedStyle(field).gridTemplateColumns : null,
        stacked: !!copy && !!controlRect && controlRect.top >= copy.bottom - 1,
        controlHeight: controlRect?.height ?? 0,
        modelClipped: !!model && model.scrollWidth > model.clientWidth + 1,
      };
    });
    const expectsStack = inspectorWidth <= 288;
    check(row.inspectorWidth === inspectorWidth && row.stacked === expectsStack
      && row.controlHeight <= (inspectorWidth === 240 ? 60 : 42) && !row.modelClipped,
    `inspector ${inspectorWidth}px adapts field rows without crowding`, JSON.stringify(row));
  }

  await page.evaluate(() => {
    document.cookie = `easyui_prefs=${encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'en-US', zoom: 1, right_width: 288 }))};path=/;max-age=31536000;SameSite=Lax`;
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '布局走查')?.click();
  });
  await sleep(200);
  const englishLabel = await page.evaluate(() => {
    const control = document.querySelector('.app-inspector [aria-label="Context overflow strategy"]');
    const label = control?.closest('.field-row')?.querySelector('.field-row-label');
    return { height: label?.getBoundingClientRect().height ?? 0, text: label?.textContent ?? '' };
  });
  check(englishLabel.height > 0 && englishLabel.height <= 42,
    'default inspector keeps the English overflow label compact', JSON.stringify(englishLabel));

  await setZoom(page, base, 480, 300, 1);
  await sleep(250);
  const browserZoom = await page.evaluate(() => {
    const overlaps = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
    const controls = [
      document.querySelector('.composer-secondary'),
      document.querySelector('.context-usage'),
      document.querySelector('.composer-dock [aria-label="发送消息"]'),
    ].filter(Boolean).map((el) => el.getBoundingClientRect());
    const inspector = document.querySelector('.app-inspector');
    return {
      stageWidth: document.querySelector('.app-stage')?.offsetWidth ?? 0,
      columnWidth: document.querySelector('.message-column')?.offsetWidth ?? 0,
      composerWidth: document.querySelector('.composer-shell')?.offsetWidth ?? 0,
      controlsOverlap: controls.some((a, i) => controls.slice(i + 1).some((b) => overlaps(a, b))),
      overlayOpen: !!inspector && getComputedStyle(inspector).position === 'absolute',
    };
  });
  check(browserZoom.stageWidth >= 160 && browserZoom.columnWidth >= 160
    && browserZoom.composerWidth >= 160 && !browserZoom.controlsOverlap && !browserZoom.overlayOpen,
  'browser zoom 200% equivalent viewport keeps the minimum layout usable', JSON.stringify(browserZoom));
  await page.screenshot({ path: `${OUT}/browser-zoom-200-960x600.png` });

  for (const zoom of [2, 2.5]) {
    await setZoom(page, base, 960, 600, zoom);
    await page.evaluate(() => document.querySelector('[aria-label="打开设置"]')?.click());
    await page.waitForSelector('.settings-workspace');
    await sleep(180);
    const settings = await page.evaluate(() => {
      const back = document.querySelector('[aria-label="返回会话页"]')?.getBoundingClientRect();
      const list = document.querySelector('.settings-nav-list');
      const tabs = [...document.querySelectorAll('.settings-nav-item')];
      if (!list) return null;
      const before = list.scrollTop;
      list.scrollTop = list.scrollHeight;
      const after = list.scrollTop;
      const last = tabs.at(-1)?.getBoundingClientRect();
      return {
        backVisible: !!back && back.top >= -1 && back.bottom <= innerHeight + 1,
        canScroll: list.scrollHeight <= list.clientHeight || after > before,
        lastReachable: !!last && last.top >= -1 && last.bottom <= innerHeight + 1,
        overflowY: getComputedStyle(list).overflowY,
        clientHeight: list.clientHeight,
        scrollHeight: list.scrollHeight,
        before,
        after,
      };
    });
    check(settings?.backVisible && settings.canScroll && settings.lastReachable,
      `960x600@${zoom * 100} settings navigation remains operable`, JSON.stringify(settings));
    if (process.env.SHOT_ALL === '1' || !settings?.backVisible || !settings.canScroll || !settings.lastReachable) {
      await page.screenshot({ path: `${OUT}/settings-960x600-${zoom * 100}.png` });
    }
    await checkAboutRepo(page, `960x600@${zoom * 100}`);
  }

  await setZoom(page, base, 1440, 900, 2);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '24px';
    document.querySelector('[aria-label="打开设置"]')?.click();
  });
  await sleep(300);
  await checkAboutRepo(page, '1440x900@200-font24');

  await setZoom(page, base, 960, 600, 1);
  await page.evaluate(() => {
    if (!document.querySelector('.app-inspector')) {
      document.querySelector('.workspace-topbar [aria-label="折叠或展开参数面板"]')?.click();
    }
  });
  await sleep(200);
  const overlay = await page.evaluate(() => {
    const inspector = document.querySelector('.app-inspector');
    if (!inspector) return null;
    const close = inspector.querySelector('[aria-label="折叠或展开参数面板"]')?.getBoundingClientRect();
    return {
      position: getComputedStyle(inspector).position,
      background: getComputedStyle(inspector).backgroundColor,
      closeReachable: !!close && close.top >= -1 && close.bottom <= innerHeight + 1,
    };
  });
  const opaque = overlay?.background.startsWith('rgb(')
    || (overlay?.background.startsWith('rgba(') && Number(overlay.background.match(/[\d.]+(?=\))/)?.[0]) >= 0.99);
  check(overlay?.position === 'absolute' && opaque && overlay.closeReachable,
    'explicitly opened overlay is opaque and closable', JSON.stringify(overlay));
  await page.screenshot({ path: `${OUT}/overlay-960x600-100.png` });

  for (const zoom of [2, 2.5]) {
    await setZoom(page, base, 960, 600, zoom);
    await page.evaluate(() => {
      if (!document.querySelector('.app-inspector')) {
        document.querySelector('.workspace-topbar [aria-label="折叠或展开参数面板"]')?.click();
      }
    });
    await sleep(200);
    const result = await page.evaluate(() => {
      const inspector = document.querySelector('.app-inspector')?.getBoundingClientRect();
      const sidebar = document.querySelector('.app-sidebar')?.getBoundingClientRect();
      const title = document.querySelector('.workspace-topbar > span');
      return {
        sidebarOverlap: !!inspector && !!sidebar ? sidebar.right - inspector.left : null,
        titleVisible: !!title && getComputedStyle(title).display !== 'none',
      };
    });
    check(result.sidebarOverlap !== null && result.sidebarOverlap <= 1 && (zoom < 2.5 || !result.titleVisible),
      `960x600@${zoom * 100} overlay clears the sidebar and prioritizes the model name`, JSON.stringify(result));
    if (process.env.SHOT_ALL === '1' || failures.some((entry) => entry.startsWith(`960x600@${zoom * 100} overlay`))) {
      await page.screenshot({ path: `${OUT}/overlay-960x600-${zoom * 100}.png` });
    }
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error(error);
} finally {
  await browser?.close();
  server.close();
}
if (failures.length) {
  console.error(`LAYOUT_CHECKS_FAIL: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('LAYOUT_CHECKS_PASS');
