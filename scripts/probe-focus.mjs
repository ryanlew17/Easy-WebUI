import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

// @req REQ-2026-006：焦点载体、胶囊避让与输入面单环的深浅主题回归。
const CHROME = process.env.EASYUI_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = process.env.SHOT_OUT ?? 'build/req006-focus-review';
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
const seed = (theme) => {
  const at = 1767225600000;
  const msg = (id, parent, role, content, offset) => ({
    id, conversation_id: 'c1', parent_id: parent, role, content, reasoning: '',
    token_count: null, partial: false, error: null, created_at: at + offset, stats: null,
  });
  localStorage.removeItem('easyui_mock_active_leaves');
  localStorage.setItem('easyui_mock_providers', JSON.stringify([
    { id: 'p1', name: 'M', base_url: 'https://x', api_format: 'openai-chat', has_key: true,
      models: [{ id: 'deepseek-reasoner', enabled: true }], created_at: 1, updated_at: 1 },
  ]));
  localStorage.setItem('easyui_mock_conversations', JSON.stringify([
    { id: 'c1', title: '走查', provider_id: 'p1', model: 'deepseek-reasoner', preset_id: null,
      overrides: {}, pinned: false, reasoning_enabled: true, created_at: at, updated_at: at },
  ]));
  localStorage.setItem('easyui_mock_messages', JSON.stringify([
    msg('m1', null, 'user', '好', 0),
    msg('m2', 'm1', 'assistant', '你好', 1),
    msg('m3', 'm2', 'user', '继续', 2),
  ]));
  document.cookie = `easyui_prefs=${encodeURIComponent(JSON.stringify({ theme, lang: 'zh-CN' }))};path=/;max-age=31536000;SameSite=Lax`;
};

let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--force-device-scale-factor=1'],
  });
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(seed, theme);
    await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
    await sleep(800);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '走查')?.click();
    });
    await sleep(500);
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.classList.contains('composer-input'))) break;
    }
    await sleep(300);
    const composer = await page.evaluate(() => {
      const shell = document.querySelector('.composer-shell');
      const frame = document.querySelector('.composer-focus-frame');
      const input = document.querySelector('.composer-input');
      const generate = document.querySelector('.generate-response-button');
      const shellStyle = getComputedStyle(shell);
      const frameStyle = frame ? getComputedStyle(frame) : null;
      const shellRect = shell.getBoundingClientRect();
      const frameRect = frame?.getBoundingClientRect();
      const generateRect = generate?.getBoundingClientRect();
      return {
        active: document.activeElement === input,
        shellOutline: shellStyle.outlineStyle,
        shellOverflow: shellStyle.overflow,
        frameExists: !!frame,
        frameOverflow: frameStyle?.overflow,
        frameShadow: frameStyle?.boxShadow,
        frameOutline: frameStyle?.outlineStyle,
        frameMatchesShell: !!frameRect
          && Math.abs(frameRect.top - shellRect.top) < 1
          && Math.abs(frameRect.left - shellRect.left) < 1
          && Math.abs(frameRect.width - shellRect.width) < 1
          && Math.abs(frameRect.height - shellRect.height) < 1,
        generateGap: generateRect ? shellRect.top - generateRect.bottom : null,
      };
    });
    check(composer.active, `${theme} keyboard focus reaches composer`);
    check(composer.frameExists && composer.frameOverflow === 'visible'
      && composer.frameShadow !== 'none' && composer.frameShadow !== undefined
      && composer.shellOutline === 'none' && composer.shellOverflow === 'hidden',
    `${theme} focus ring lives on an unclipped wrapper`, JSON.stringify(composer));
    check(composer.frameMatchesShell, `${theme} focus wrapper adds no layout size`);
    check(composer.generateGap !== null && composer.generateGap >= 8,
      `${theme} Generate clears the composer focus ring`, `gap=${composer.generateGap}`);
    await page.screenshot({ path: `${OUT}/40-composer-focus-${theme}.png` });
    await page.emulateMediaFeatures([{ name: 'forced-colors', value: 'active' }]);
    const forced = await page.evaluate(() => {
      const frame = document.querySelector('.composer-focus-frame');
      return frame ? getComputedStyle(frame).outlineStyle : null;
    });
    check(forced === 'solid', `${theme} forced colors keeps an outline focus fallback`, String(forced));
    await page.emulateMediaFeatures([]);

    await page.evaluate(() => document.querySelector('[aria-label="打开设置"]')?.click());
    await sleep(500);
    await page.evaluate(() => {
      [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent.trim() === '通用')?.click();
    });
    await sleep(300);
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.classList.contains('input-surface'))) break;
    }
    await sleep(250);
    const input = await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return {
        isInput: el.classList.contains('input-surface'),
        outline: style.outlineStyle,
        shadow: style.boxShadow,
      };
    });
    check(input.isInput && input.outline === 'solid' && input.shadow === 'none',
      `${theme} focused input has one outline and no default shadow`, JSON.stringify(input));
    await page.screenshot({ path: `${OUT}/41-settings-input-focus-${theme}.png` });
    await page.close();
  }
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error(error);
} finally {
  await browser?.close();
  server.close();
}
if (failures.length) {
  console.error(`FOCUS_CHECKS_FAIL: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('FOCUS_CHECKS_PASS');
