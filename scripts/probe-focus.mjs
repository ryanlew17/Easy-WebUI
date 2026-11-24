import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

// @req REQ-2026-006：玻璃焦点、实色降级、强制色边界与输入内嵌边缘光的深浅主题回归。
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
const isOpaque = (color) => color?.startsWith('rgb(')
  || (color?.startsWith('rgba(') && Number(color.match(/[\d.]+(?=\))/)?.[0]) >= 0.99);
const seed = (theme) => {
  const at = 1767225600000;
  const msg = (id, parent, role, content, offset) => ({
    id, conversation_id: 'c1', parent_id: parent, role, content, reasoning: '',
    token_count: null, partial: false, error: null, created_at: at + offset,
    stats: role === 'assistant' ? { ttft_ms: 20, total_ms: 100, finish_reason: 'stop' } : null,
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
    msg('m2', 'm1', 'assistant', `你好\n\n\`\`\`ts\nconst value = "${'x'.repeat(180)}";\n\`\`\``, 1),
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
    await page.keyboard.press('Tab');
    const passiveFocus = await page.evaluate(() => {
      const read = (selector) => {
        const el = document.querySelector(selector);
        el?.focus();
        const style = getComputedStyle(el);
        return { outline: style.outlineStyle, shadow: style.boxShadow };
      };
      const primary = read('.app-sidebar .btn-accent');
      const ghost = read('.workspace-topbar .model-picker-trigger');
      const conversationButton = document.querySelector('.conversation-row > button');
      conversationButton?.focus();
      const rowStyle = getComputedStyle(conversationButton.closest('.conversation-row'));
      const conversationStyle = getComputedStyle(conversationButton);
      const row = { outline: rowStyle.outlineStyle, shadow: rowStyle.boxShadow };
      const conversation = { outline: conversationStyle.outlineStyle, shadow: conversationStyle.boxShadow };
      const summary = document.querySelector('.message-stats-summary');
      summary?.focus();
      const summaryStyle = getComputedStyle(summary);
      return {
        primary,
        ghost,
        row,
        conversation,
        summary: { outline: summaryStyle.outlineStyle, shadow: summaryStyle.boxShadow, radius: summaryStyle.borderRadius },
        onAccent: (() => {
          const sample = document.createElement('span');
          sample.style.color = 'var(--on-accent)';
          document.body.append(sample);
          const color = getComputedStyle(sample).color;
          sample.remove();
          return color;
        })(),
      };
    });
    check(passiveFocus.primary.outline === 'none' && passiveFocus.primary.shadow.includes('inset')
      && passiveFocus.primary.shadow.includes(passiveFocus.onAccent),
    `${theme} filled primary button uses inverse inner light`, JSON.stringify(passiveFocus.primary));
    check(passiveFocus.ghost.outline === 'none' && passiveFocus.ghost.shadow.includes('inset'),
      `${theme} ordinary button uses inner glass light`, JSON.stringify(passiveFocus.ghost));
    check(passiveFocus.row.outline === 'none' && passiveFocus.row.shadow.includes('inset')
      && passiveFocus.conversation.outline === 'none' && passiveFocus.conversation.shadow === 'none',
    `${theme} conversation focus belongs to the whole glass row`, JSON.stringify(passiveFocus));
    check(passiveFocus.summary.outline === 'none' && passiveFocus.summary.shadow.includes('inset')
      && Number.parseFloat(passiveFocus.summary.radius) >= 8,
    `${theme} stats summary uses rounded glass focus`, JSON.stringify(passiveFocus.summary));
    await page.screenshot({ path: `${OUT}/44-control-focus-${theme}.png` });
    for (const [name, selector] of [
      ['46-primary', '.app-sidebar .btn-accent'],
      ['47-ghost', '.workspace-topbar .model-picker-trigger'],
      ['48-conversation', '.conversation-row > button'],
    ]) {
      await page.evaluate((target) => document.querySelector(target)?.focus(), selector);
      await sleep(120);
      await page.screenshot({ path: `${OUT}/${name}-${theme}.png` });
    }
    let preFocused = false;
    for (let i = 0; i < 80; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.matches('.md pre'))) {
        preFocused = true;
        break;
      }
    }
    const preFocus = await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return {
        isPre: el.matches('.md pre'),
        focusVisible: el.matches(':focus-visible'),
        scrollable: el.scrollWidth > el.clientWidth,
        outline: style.outlineStyle,
        shadow: style.boxShadow,
      };
    });
    check(preFocused && preFocus.isPre && preFocus.focusVisible && preFocus.scrollable
      && preFocus.outline === 'none' && preFocus.shadow.includes('inset'),
    `${theme} scrollable code block has inner glass focus`, JSON.stringify(preFocus));
    await page.screenshot({ path: `${OUT}/49-code-focus-${theme}.png` });
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
        shellShadow: shellStyle.boxShadow,
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
      && composer.frameOutline === 'none' && composer.shellOutline === 'none'
      && composer.shellShadow.includes('inset') && composer.shellOverflow === 'hidden',
    `${theme} composer focus lights its glass edge without an outline`, JSON.stringify(composer));
    check(composer.frameMatchesShell, `${theme} focus wrapper adds no layout size`);
    check(composer.generateGap !== null && composer.generateGap >= 8,
      `${theme} Generate clears the composer edge light`, `gap=${composer.generateGap}`);
    await page.screenshot({ path: `${OUT}/40-composer-focus-${theme}.png` });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-transparency', value: 'reduce' }]);
    await sleep(400);
    const reduced = await page.evaluate(() => {
      const shell = document.querySelector('.composer-shell');
      const topbar = document.querySelector('.workspace-topbar');
      return {
        media: matchMedia('(prefers-reduced-transparency: reduce)').matches,
        modalToken: getComputedStyle(document.documentElement).getPropertyValue('--surface-modal-bg'),
        surfaces: [shell, topbar].map((el) => {
          const style = getComputedStyle(el);
          return { background: style.backgroundColor, backdrop: style.backdropFilter };
        }),
      };
    });
    check(reduced.media && reduced.surfaces.every((surface) => isOpaque(surface.background) && surface.backdrop === 'none'),
      `${theme} reduced transparency uses opaque readable chrome`, JSON.stringify(reduced));
    await page.screenshot({ path: `${OUT}/42-reduced-transparency-${theme}.png` });
    await page.emulateMediaFeatures([]);
    await page.emulateMediaFeatures([{ name: 'forced-colors', value: 'active' }]);
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '走查')?.click();
    });
    await sleep(300);
    await page.keyboard.press('Tab');
    await page.focus('.composer-input');
    const forced = await page.evaluate(() => {
      const frame = document.querySelector('.composer-focus-frame');
      const input = document.querySelector('.app-sidebar .input-surface');
      const button = document.querySelector('.workspace-topbar .model-picker-trigger');
      const shell = document.querySelector('.composer-shell');
      const selected = document.querySelector('.conversation-row:has([aria-current="true"])');
      return {
        frame: frame ? getComputedStyle(frame).outlineStyle : null,
        inputBorder: input ? getComputedStyle(input).borderTopWidth : null,
        buttonBorder: button ? getComputedStyle(button).borderTopWidth : null,
        shellBorder: shell ? getComputedStyle(shell).borderTopWidth : null,
        selectedOutline: selected ? getComputedStyle(selected).outlineWidth : null,
        selectedBackground: selected ? getComputedStyle(selected).backgroundColor : null,
        bodyColor: getComputedStyle(document.body).color,
        selectedColor: selected ? getComputedStyle(selected.querySelector('button')).color : null,
        selectedDateColor: selected ? getComputedStyle(selected.querySelector('button > span:last-child')).color : null,
      };
    });
    check(forced.frame === 'solid', `${theme} forced colors keeps an outline focus fallback`, String(forced.frame));
    check([forced.inputBorder, forced.buttonBorder, forced.shellBorder, forced.selectedOutline]
      .every((width) => Number.parseFloat(width) >= 1),
    `${theme} forced colors exposes real control boundaries and selection`, JSON.stringify(forced));
    check(forced.selectedColor === forced.bodyColor && forced.selectedDateColor === forced.bodyColor,
      `${theme} forced colors keeps the selected conversation readable`, JSON.stringify(forced));
    await page.screenshot({ path: `${OUT}/43-forced-colors-${theme}.png` });
    for (let i = 0; i < 80; i += 1) {
      await page.keyboard.press('Tab');
      if (await page.evaluate(() => document.activeElement?.matches('.md pre'))) break;
    }
    const forcedPre = await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return { isPre: el.matches('.md pre'), outline: style.outlineStyle, width: style.outlineWidth };
    });
    check(forcedPre.isPre && forcedPre.outline === 'solid' && Number.parseFloat(forcedPre.width) >= 2,
      `${theme} forced colors gives scrollable code a system focus outline`, JSON.stringify(forcedPre));
    await page.screenshot({ path: `${OUT}/50-forced-code-focus-${theme}.png` });
    // @req REQ-2026-006：About 发布说明区是 div[role=region][tabindex=0]，强制色下只有系统轮廓可依赖
    const forcedRegion = await page.evaluate(() => {
      const host = document.querySelector('.app-stage') ?? document.body;
      const el = document.createElement('div');
      el.className = 'input-surface';
      el.setAttribute('role', 'region');
      el.tabIndex = 0;
      host.appendChild(el);
      el.focus();
      const style = getComputedStyle(el);
      const result = { outline: style.outlineStyle, width: style.outlineWidth };
      el.remove();
      return result;
    });
    check(forcedRegion.outline === 'solid' && Number.parseFloat(forcedRegion.width) >= 2,
      `${theme} forced colors gives scrollable regions a system focus outline`, JSON.stringify(forcedRegion));
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
    check(input.isInput && input.outline === 'none' && input.shadow.includes('inset'),
      `${theme} focused input replaces its gray boundary with inner glass light`, JSON.stringify(input));
    await page.screenshot({ path: `${OUT}/41-settings-input-focus-${theme}.png` });
    await page.emulateMediaFeatures([{ name: 'forced-colors', value: 'active' }]);
    await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.querySelector('[aria-label="打开设置"]')?.click());
    await sleep(400);
    await page.evaluate(() => {
      [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent.trim() === '通用')?.click();
    });
    await sleep(250);
    const forcedSegments = await page.evaluate(() => {
      const selected = document.querySelector('.seg-option[aria-pressed="true"]');
      return {
        color: selected ? getComputedStyle(selected).color : null,
        bodyColor: getComputedStyle(document.body).color,
      };
    });
    check(forcedSegments.color === forcedSegments.bodyColor,
      `${theme} forced colors keeps selected segment text readable`, JSON.stringify(forcedSegments));
    await page.screenshot({ path: `${OUT}/45-forced-segments-${theme}.png` });
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
