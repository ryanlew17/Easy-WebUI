import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

// @req REQ-2026-006：重构后的共享骨架、四档圆角、统一角形与字段层级。
const EDGE = process.env.EASYUI_BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
};
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join('dist', urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith('dist') || !existsSync(file) || !statSync(file).isFile()) file = 'dist/index.html';
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
});
const failures = [];
const check = (condition, label, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures.push(label);
};
const seed = () => {
  Object.defineProperty(navigator, 'gpu', { get: () => undefined });
  const at = 1767225600000;
  localStorage.setItem('easyui_mock_providers', JSON.stringify([
    { id: 'p', name: 'Visual', base_url: 'https://api.deepseek.com', api_format: 'openai-chat', has_key: true,
      models: [{ id: 'deepseek-chat', enabled: true }], created_at: at, updated_at: at },
  ]));
  localStorage.setItem('easyui_mock_conversations', JSON.stringify([
    { id: 'c', title: 'Visual tokens', provider_id: 'p', model: 'deepseek-chat', preset_id: null,
      overrides: {}, pinned: false, reasoning_enabled: false, created_at: at, updated_at: at },
  ]));
  localStorage.setItem('easyui_mock_messages', JSON.stringify([
    { id: 'm', conversation_id: 'c', parent_id: null, role: 'user', content: 'Visual check',
      reasoning: '', token_count: null, partial: false, error: null, created_at: at },
  ]));
  document.cookie = `easyui_prefs=${encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN' }))};path=/`;
};
const isSquircle = (value) => value === 'squircle' || value === 'superellipse(2)';

let browser;
let fallbackBrowser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const audit = async (instance, disabled) => {
    const prefix = disabled ? 'fallback' : 'native';
    const page = await instance.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluateOnNewDocument(seed);
    await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === 'Visual tokens')?.click();
    });
    await page.waitForSelector('.composer-shell');
    await page.waitForSelector('.input-surface');
    await page.focus('.composer-input');
    const result = await page.evaluate(() => {
      const style = (selector) => {
        const element = document.querySelector(selector);
        return element ? getComputedStyle(element) : null;
      };
      const composer = style('.composer-shell');
      const input = style('.input-surface');
      const icon = style('.icon-btn');
      const composerInput = style('.composer-input');
      const param = style('.param-block');
      const userBubble = style('.bubble-surface');
      const accentSample = document.createElement('div');
      accentSample.style.background = 'var(--accent-soft)';
      document.body.append(accentSample);
      const accentBackground = getComputedStyle(accentSample).backgroundColor;
      accentSample.remove();
      const stage = document.querySelector('.app-stage');
      const scroll = document.querySelector('.message-scroll');
      return {
        supports: CSS.supports('corner-shape', 'squircle'),
        sharedFrame: !!document.querySelector('.app-frame'),
        sharedSidebar: !!document.querySelector('.app-sidebar'),
        stageLeft: stage?.getBoundingClientRect().left ?? null,
        scrollStartsBehindChrome: !!stage && !!scroll
          && Math.abs(stage.getBoundingClientRect().top - scroll.getBoundingClientRect().top) < 1,
        composerShape: composer?.cornerShape,
        opticalShape: getComputedStyle(document.querySelector('.composer-shell'), '::before').cornerShape,
        opticalRadius: getComputedStyle(document.querySelector('.composer-shell'), '::before').borderRadius,
        inputShape: input?.cornerShape,
        iconShape: icon?.cornerShape,
        composerRadius: composer?.borderRadius,
        inputRadius: input?.borderRadius,
        iconRadius: icon?.borderRadius,
        inputSize: input?.fontSize,
        inputLeading: input?.lineHeight,
        inputBorder: input?.borderTopStyle,
        inputShadow: input?.boxShadow,
        inputOutline: composerInput?.outlineStyle,
        hostFocusOutline: composer?.outlineStyle,
        hostFocusShadow: composer?.boxShadow,
        frameFocusShadow: getComputedStyle(document.querySelector('.composer-focus-frame')).boxShadow,
        frameFocusOutline: getComputedStyle(document.querySelector('.composer-focus-frame')).outlineStyle,
        frameOverflow: getComputedStyle(document.querySelector('.composer-focus-frame')).overflow,
        frameMatchesShell: (() => {
          const frame = document.querySelector('.composer-focus-frame');
          const shell = document.querySelector('.composer-shell');
          if (!frame || !shell) return false;
          const a = frame.getBoundingClientRect();
          const b = shell.getBoundingClientRect();
          return Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1
            && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
        })(),
        paramBackground: param?.backgroundColor,
        paramShadow: param?.boxShadow,
        userBubbleBackground: userBubble?.backgroundColor,
        accentBackground,
        sendCursor: style('[aria-label="发送消息"]')?.cursor,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    check(result.supports === !disabled, `${prefix} corner-shape capability`, String(result.supports));
    check(result.sharedFrame && result.sharedSidebar, `${prefix} uses the shared application frame`);
    check(result.scrollStartsBehindChrome, `${prefix} message content extends behind floating chrome`);
    check(result.composerRadius === '16px' && result.inputRadius === '12px' && result.iconRadius === '8px',
      `${prefix} uses the four-step radius contract`,
      `${result.composerRadius}/${result.inputRadius}/${result.iconRadius}`);
    if (disabled) {
      check(!isSquircle(result.composerShape) && !isSquircle(result.inputShape) && !isSquircle(result.iconShape),
        `${prefix} consistently falls back to circular rounded corners`);
    } else {
      check(isSquircle(result.composerShape) && isSquircle(result.inputShape) && isSquircle(result.iconShape),
        `${prefix} consistently uses squircle geometry`,
        `${result.composerShape}/${result.inputShape}/${result.iconShape}`);
    }
    check(result.opticalShape === result.composerShape && result.opticalRadius === result.composerRadius,
      `${prefix} optical outline inherits the host corner geometry`,
      `${result.opticalShape}/${result.composerShape} ${result.opticalRadius}/${result.composerRadius}`);
    check(result.inputSize === '13px' && result.inputLeading === '19.5px', `${prefix} control typography tokens applied`,
      `${result.inputSize}/${result.inputLeading}`);
    check(result.inputBorder === 'none' && result.inputShadow !== 'none',
      `${prefix} input uses one inset boundary without an outer border`);
    // @req REQ-2026-006：液态玻璃焦点内嵌于材质边缘；forced-colors 才使用系统色描边。
    check(result.inputOutline === 'none' && result.hostFocusOutline === 'none'
      && result.frameFocusOutline === 'none' && result.hostFocusShadow?.includes('inset')
      && result.frameOverflow === 'visible' && result.frameMatchesShell,
      `${prefix} composer focus lights the glass edge without an outline`,
      `shell=${result.hostFocusShadow}/${result.hostFocusOutline} input=${result.inputOutline}`);
    await page.emulateMediaFeatures([{ name: 'forced-colors', value: 'active' }]);
    const forcedFrameOutline = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.composer-focus-frame')).outlineStyle);
    await page.emulateMediaFeatures([]);
    check(forcedFrameOutline === 'solid', `${prefix} forced colors keeps a wrapper outline fallback`,
      String(forcedFrameOutline));
    check((result.paramBackground === 'rgba(0, 0, 0, 0)' || result.paramBackground === 'transparent')
      && result.paramShadow === 'none', `${prefix} parameter groups do not nest cards`);
    check(result.userBubbleBackground !== result.accentBackground,
      `${prefix} user bubble is distinct from selection accent`);
    check(result.sendCursor === 'not-allowed', `${prefix} disabled control exposes disabled state`);
    check(!result.horizontalOverflow, `${prefix} visual token pass has no horizontal overflow`);

    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '设置')?.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await page.evaluate(() => {
      [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent.trim() === '通用')?.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
    const settings = await page.evaluate(() => {
      const controls = [...document.querySelectorAll('.field-row-control')]
        .map((el) => el.getBoundingClientRect().right)
        .filter((right) => right > 0);
      return {
        workspace: !!document.querySelector('.settings-workspace'),
        stageLeft: document.querySelector('.app-stage')?.getBoundingClientRect().left ?? null,
        navigationTabs: document.querySelectorAll('.settings-nav [role="tab"]').length,
        hairlines: document.querySelectorAll('.settings-workspace .hairline').length,
        nestedCards: document.querySelectorAll('.settings-workspace .row-surface').length,
        controlEdgesAligned: controls.length >= 2 && controls.every((right) => Math.abs(right - controls[0]) <= 1),
        controlCount: controls.length,
      };
    });
    check(settings.workspace && settings.stageLeft === result.stageLeft,
      `${prefix} settings preserves the chat workspace origin`);
    check(settings.navigationTabs === 5, `${prefix} settings uses the shared navigation rail`);
    check(settings.workspace && settings.hairlines === 0 && settings.nestedCards === 0,
      `${prefix} settings removes hairlines and nested group cards`);
    check(settings.controlEdgesAligned, `${prefix} settings controls share one trailing edge`,
      `${settings.controlCount} measured controls`);
    await page.close();
  };

  browser = await puppeteer.launch({ executablePath: EDGE, headless: true,
    args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  await audit(browser, false);
  const fallbackExecutable = process.env.EASYUI_FALLBACK_BROWSER_PATH
    ?? 'build/req006-browsers/chrome/win64-138.0.7204.168/chrome-win64/chrome.exe';
  fallbackBrowser = await puppeteer.launch({ executablePath: fallbackExecutable, headless: true,
    args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  await audit(fallbackBrowser, true);
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error(error);
} finally {
  await browser?.close();
  await fallbackBrowser?.close();
  server.close();
}
if (failures.length) {
  console.error(`VISUAL_TOKEN_CHECKS_FAIL: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('VISUAL_TOKEN_CHECKS_PASS');
