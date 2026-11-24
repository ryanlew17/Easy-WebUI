import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { compositeColor, contrastRatio, parseCssColor } from './lib/contrast.mjs';

// @req REQ-2026-006：Minor 视觉状态、几何、键盘与对比度回归。
const CHROME = process.env.EASYUI_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = 'build/req006-minor-review';
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = normalize(join('dist', path === '/' ? 'index.html' : path));
  if (!file.startsWith('dist') || !existsSync(file) || !statSync(file).isFile()) file = 'dist/index.html';
  res.setHeader('content-type', MIME[extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
});
const failures = [];
const check = (condition, label, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures.push(label);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const seed = () => {
  const at = 1767225600000;
  const model = 'deepseek-reasoner-with-a-very-long-model-name-for-title-generation';
  localStorage.setItem('easyui_mock_providers', JSON.stringify([
    { id: 'p', name: 'Minor', base_url: 'https://x', api_format: 'openai-chat', has_key: true,
      models: [{ id: model, enabled: true }], created_at: 1, updated_at: 1 },
  ]));
  localStorage.setItem('easyui_mock_conversations', JSON.stringify([
    { id: 'c', title: '用于检查完整标题的 Minor 会话', provider_id: 'p', model, preset_id: null,
      overrides: {}, pinned: false, reasoning_enabled: true, created_at: at, updated_at: at },
  ]));
  localStorage.setItem('easyui_mock_messages', JSON.stringify([
    { id: 'm1', conversation_id: 'c', parent_id: null, role: 'user', content: '第一条', reasoning: '', token_count: null, partial: false, error: null, created_at: at, stats: null },
    { id: 'm2', conversation_id: 'c', parent_id: 'm1', role: 'assistant', content: '长消息\n\n'.repeat(24), reasoning: '', token_count: 20, partial: false, error: null, created_at: at + 1, stats: { ttft_ms: 20, total_ms: 100, finish_reason: 'stop' } },
    { id: 'm3', conversation_id: 'c', parent_id: 'm2', role: 'user', content: '最后一条', reasoning: '', token_count: null, partial: false, error: null, created_at: at + 2, stats: null },
  ]));
  if (!document.cookie.includes('easyui_prefs=')) {
    document.cookie = `easyui_prefs=${encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN' }))};path=/`;
  }
};
const openConversation = async (page) => {
  await page.evaluate(() => [...document.querySelectorAll('button')].find((el) => el.textContent.includes('Minor 会话'))?.click());
  await sleep(250);
};

let browser;
try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(seed);
  await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(600);
  await openConversation(page);

  const initial = await page.evaluate(() => {
    const column = document.querySelector('.message-column');
    const composer = document.querySelector('.composer-shell');
    const separator = document.querySelector('.app-inspector [role="separator"]');
    const inspector = document.querySelector('.app-inspector');
    const generate = document.querySelector('.generate-response-button');
    const sidebarTitle = document.querySelector('.conversation-row [aria-current="true"]');
    const topbarTitle = document.querySelector('.workspace-topbar > span');
    const cr = column?.getBoundingClientRect();
    const sr = composer?.getBoundingClientRect();
    const dr = separator?.getBoundingClientRect();
    const ir = inspector?.getBoundingClientRect();
    return {
      messageGap: column ? getComputedStyle(column).rowGap : null,
      leftDelta: cr && sr ? Math.abs(cr.left - sr.left) : null,
      rightDelta: cr && sr ? Math.abs(cr.right - sr.right) : null,
      dividerHit: dr && ir ? Math.max(0, Math.min(dr.right, ir.right) - Math.max(dr.left, ir.left)) : null,
      separatorTabIndex: separator?.getAttribute('tabindex'),
      separatorValue: separator?.getAttribute('aria-valuenow'),
      generateRadius: generate ? getComputedStyle(generate).borderRadius : null,
      topbarModelShape: getComputedStyle(document.querySelector('.workspace-topbar .model-picker-trigger')).cornerShape,
      sidebarTitleAttr: sidebarTitle?.getAttribute('title'),
      topbarTitleAttr: topbarTitle?.getAttribute('title'),
      fullTitle: '用于检查完整标题的 Minor 会话',
      statsHasDetailsLabel: document.querySelector('.message-stats summary')?.textContent.includes('详情') ?? false,
      systemPromptLabels: [...document.querySelectorAll('.app-inspector .param-block-title, .app-inspector .field-row-label')]
        .filter((el) => el.textContent.trim() === '系统提示词').length,
    };
  });
  check(Number.parseFloat(initial.messageGap) <= 16, 'M-7 message gap stays compact', initial.messageGap);
  check(initial.leftDelta <= 3 && initial.rightDelta <= 3, 'M-6 composer aligns with message column', JSON.stringify(initial));
  check(initial.dividerHit >= 12, 'M-4 divider keeps a 12px effective pointer target', String(initial.dividerHit));
  check(initial.separatorTabIndex === '0' && Number(initial.separatorValue) >= 240, 'M-29 divider exposes keyboard semantics', JSON.stringify(initial));
  check(Number.parseFloat(initial.generateRadius) >= 999, 'M-9 Generate keeps capsule radius', initial.generateRadius);
  check(['initial', 'superellipse(1)'].includes(initial.topbarModelShape), 'm-4 topbar model picker uses a true capsule', initial.topbarModelShape);
  check(initial.sidebarTitleAttr === initial.fullTitle && initial.topbarTitleAttr === initial.fullTitle,
    'M-24 truncated titles expose full text', JSON.stringify(initial));
  check(initial.statsHasDetailsLabel, 'M-23 collapsed stats expose a visible details affordance');
  check(initial.systemPromptLabels === 1, 'M-14 system prompt heading is not duplicated', String(initial.systemPromptLabels));

  await page.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (list) list.scrollTop = (list.scrollHeight - list.clientHeight) / 2;
  });
  await sleep(200);
  const mask = await page.evaluate(() => getComputedStyle(document.querySelector('.message-scroll')).maskImage);
  check(mask.includes('72px') && mask.includes('40px'), 'm-5 top fade extends past the topbar while bottom stays 2.5rem', mask);

  await page.evaluate(() => document.querySelector('.app-inspector [role="separator"]')?.focus());
  const widthBefore = await page.evaluate(() => document.querySelector('.app-inspector')?.offsetWidth ?? 0);
  await page.keyboard.press('ArrowRight');
  await sleep(150);
  const widthAfter = await page.evaluate(() => document.querySelector('.app-inspector')?.offsetWidth ?? 0);
  check(Math.abs(widthAfter - widthBefore) >= 10, 'M-29 arrow keys resize the inspector', `${widthBefore}→${widthAfter}`);

  await page.evaluate(() => {
    const shell = document.querySelector('.composer-shell');
    if (shell) shell.style.height = '220px';
  });
  await sleep(250);
  const resizedAnchorGap = await page.evaluate(() => {
    const shell = document.querySelector('.composer-shell')?.getBoundingClientRect();
    const generate = document.querySelector('.generate-response-button')?.getBoundingClientRect();
    return shell && generate ? shell.top - generate.bottom : null;
  });
  check(resizedAnchorGap >= 8, 'M-8 Generate observes anchor resize without scroll', String(resizedAnchorGap));
  await page.evaluate(() => {
    const shell = document.querySelector('.composer-shell');
    if (shell) shell.style.removeProperty('height');
  });
  await sleep(200);

  await page.focus('.composer-input');
  for (let i = 0; i < 10; i += 1) {
    await page.type('.composer-input', `M${i}`);
    if (i < 9) {
      await page.keyboard.down('Shift'); await page.keyboard.press('Enter'); await page.keyboard.up('Shift');
    }
  }
  await sleep(300);
  const tall = await page.evaluate(() => {
    const shell = document.querySelector('.composer-shell')?.getBoundingClientRect();
    const generate = document.querySelector('.generate-response-button')?.getBoundingClientRect();
    const input = document.querySelector('.composer-input');
    const style = getComputedStyle(input);
    return {
      generateGap: shell && generate ? shell.top - generate.bottom : null,
      contentHeight: input.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom),
      lineHeight: Number.parseFloat(style.lineHeight),
    };
  });
  check(tall.generateGap >= 8, 'M-8 Generate follows composer growth', JSON.stringify(tall));
  check(Math.abs(tall.contentHeight / tall.lineHeight - Math.round(tall.contentHeight / tall.lineHeight)) < 0.08,
    'M-10 composer maximum shows whole lines only', JSON.stringify(tall));

  await page.click('.app-inspector [aria-label="上下文溢出策略"]');
  const pointerFocus = await page.evaluate(() => {
    const el = document.querySelector('.app-inspector [aria-label="上下文溢出策略"]');
    return { focusVisible: el.matches(':focus-visible'), shadow: getComputedStyle(el).boxShadow };
  });
  check(!pointerFocus.focusVisible && pointerFocus.shadow !== 'none', 'M-12 pointer focus retains input boundary', JSON.stringify(pointerFocus));
  await page.keyboard.press('Escape');

  await page.evaluate(() => document.querySelector('[aria-label="消息列表"] .bubble-surface')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  await sleep(250);
  await page.click('[aria-label="删除所选"]');
  await sleep(250);
  const layers = await page.evaluate(() => ({
    toolbar: Number(getComputedStyle(document.querySelector('.selection-toolbar')).zIndex),
    modal: Number(getComputedStyle(document.querySelector('.modal-overlay')).zIndex),
  }));
  check(layers.modal > layers.toolbar, 'M-3 confirmation modal stays above selection toolbar', JSON.stringify(layers));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '取消')?.click());
  await sleep(250);

  const checkbox = await page.evaluate(() => {
    const box = document.querySelector('[aria-label="消息列表"] [role="checkbox"]');
    box?.scrollIntoView({ block: 'center' });
    const wrap = box?.parentElement?.getBoundingClientRect();
    const before = box?.getAttribute('aria-checked');
    return { wrap: wrap ? { x: wrap.x, y: wrap.y, w: wrap.width, h: wrap.height } : null, before };
  });
  if (checkbox.wrap) {
    await page.mouse.click(checkbox.wrap.x + 2, checkbox.wrap.y + checkbox.wrap.h / 2);
    await sleep(150);
  }
  const checkboxAfter = await page.evaluate(() => document.querySelector('[aria-label="消息列表"] [role="checkbox"]')?.getAttribute('aria-checked'));
  check(checkbox.wrap?.w >= 24 && checkbox.before !== checkboxAfter, 'M-25 full checkbox wrapper toggles selection', JSON.stringify({ ...checkbox, after: checkboxAfter }));
  await page.keyboard.press('Escape');

  await page.evaluate(() => document.querySelector('[aria-label="打开设置"]')?.click());
  await sleep(400);
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent.trim() === '通用')?.click());
  await sleep(300);
  const selected = await page.evaluate(() => getComputedStyle(document.querySelector('.settings-nav-item[aria-selected="true"]')).backgroundColor);
  await page.hover('.settings-nav-item[aria-selected="true"]');
  await sleep(200);
  const selectedHover = await page.evaluate(() => getComputedStyle(document.querySelector('.settings-nav-item[aria-selected="true"]')).backgroundColor);
  check(selected === selectedHover, 'M-2 hover preserves selected navigation state', `${selected}→${selectedHover}`);

  await page.evaluate(() => {
    const toggle = document.querySelector('[aria-label="自动生成会话标题"]');
    if (toggle?.getAttribute('aria-checked') === 'false') toggle.click();
  });
  await sleep(250);
  const titleModel = await page.evaluate(() => {
    const row = [...document.querySelectorAll('.settings-content .field-row')]
      .find((el) => el.textContent.includes('标题生成模型'));
    const control = row?.querySelector('.field-row-control')?.getBoundingClientRect();
    const picker = row?.querySelector('.model-picker-root');
    const rect = picker?.getBoundingClientRect();
    return {
      controlLeft: control?.left ?? null,
      pickerLeft: rect?.left ?? null,
      present: !!picker,
      switches: [...document.querySelectorAll('.settings-content [role="switch"]')].map((el) => ({ label: el.getAttribute('aria-label'), checked: el.getAttribute('aria-checked') })),
      hasTitleRow: !!row,
    };
  });
  check(titleModel.present && titleModel.pickerLeft >= titleModel.controlLeft - 1,
    'M-15 long title model stays inside its control column', JSON.stringify(titleModel));
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('.settings-content .field-row')]
      .find((el) => el.textContent.includes('标题生成模型'));
    row?.querySelector('[aria-label="选择模型"]')?.click();
  });
  await sleep(250);
  const popoverMargin = await page.evaluate(() => {
    const pop = document.querySelector('body > [role="listbox"]')?.getBoundingClientRect();
    return pop ? innerWidth - pop.right : null;
  });
  check(popoverMargin >= 8, 'M-16 popover keeps a visible viewport margin', String(popoverMargin));
  await page.keyboard.press('Escape');
  const shortcutPadding = await page.evaluate(() => getComputedStyle(document.querySelector('.shortcut-table td')).paddingTop);
  check(Number.parseFloat(shortcutPadding) >= 8, 'M-33 shortcut table padding is not overridden', shortcutPadding);

  const lightContrast = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const fixture = document.createElement('div');
    fixture.className = 'md';
    fixture.innerHTML = '<pre><code><span class="hljs-string">s</span><span class="hljs-comment">c</span><span class="hljs-number">n</span><span class="hljs-attr">a</span><span class="hljs-keyword">k</span></code></pre>';
    document.querySelector('.settings-content')?.appendChild(fixture);
    const result = {
      canvas: root.getPropertyValue('--surface-canvas-bg'),
      controlBorder: root.getPropertyValue('--control-border'),
      background: getComputedStyle(fixture.querySelector('pre')).backgroundColor,
      syntax: [...fixture.querySelectorAll('span')].map((el) => ({ name: el.className, color: getComputedStyle(el).color })),
    };
    fixture.remove();
    return result;
  });
  const lightCanvas = parseCssColor(lightContrast.canvas);
  const lightBorder = compositeColor(parseCssColor(lightContrast.controlBorder), lightCanvas);
  check(contrastRatio(lightBorder, lightCanvas) >= 3, 'M-18 light control boundaries reach 3:1',
    contrastRatio(lightBorder, lightCanvas).toFixed(2));
  const lightCodeBackground = compositeColor(parseCssColor(lightContrast.background), lightCanvas);
  for (const sample of lightContrast.syntax) {
    const ratio = contrastRatio(parseCssColor(sample.color), lightCodeBackground);
    check(ratio >= 4.5, `M-17 light syntax ${sample.name} reaches text contrast`, ratio.toFixed(2));
  }

  await page.evaluate(() => {
    [...document.querySelectorAll('[role="group"][aria-label="主题"] button')].find((el) => el.textContent.trim() === '深色')?.click();
  });
  await sleep(350);
  const contrast = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const sw = document.querySelector('.switch[data-on="true"]');
    const input = document.querySelector('.settings-content .input-surface');
    const fixture = document.createElement('div');
    fixture.className = 'md';
    fixture.innerHTML = '<pre><code><span class="hljs-string">s</span><span class="hljs-comment">c</span><span class="hljs-number">n</span><span class="hljs-attr">a</span><span class="hljs-keyword">k</span></code></pre>';
    document.querySelector('.settings-content')?.appendChild(fixture);
    const codeBackground = getComputedStyle(fixture.querySelector('pre')).backgroundColor;
    const syntax = [...fixture.querySelectorAll('span')].map((el) => ({ name: el.className, color: getComputedStyle(el).color }));
    fixture.remove();
    return {
      switchTrack: sw ? getComputedStyle(sw).backgroundColor : null,
      switchThumb: sw ? getComputedStyle(sw, '::after').backgroundColor : null,
      controlBorder: root.getPropertyValue('--control-border'),
      canvas: root.getPropertyValue('--surface-canvas-bg'),
      inputBackground: input ? getComputedStyle(input).backgroundColor : null,
      codeBackground,
      syntax,
    };
  });
  if (contrast.switchTrack && contrast.switchThumb) {
    const ratio = contrastRatio(parseCssColor(contrast.switchThumb), parseCssColor(contrast.switchTrack));
    check(ratio >= 3, 'M-1 dark switch thumb has non-text contrast', ratio.toFixed(2));
  }
  if (contrast.controlBorder && contrast.canvas) {
    const canvas = parseCssColor(contrast.canvas);
    const border = compositeColor(parseCssColor(contrast.controlBorder), canvas);
    const ratio = contrastRatio(border, canvas);
    check(ratio >= 3, 'M-18 input and checkbox boundaries reach 3:1', ratio.toFixed(2));
  }
  if (contrast.codeBackground) {
    const background = compositeColor(parseCssColor(contrast.codeBackground), parseCssColor('#101216'));
    for (const sample of contrast.syntax) {
      const ratio = contrastRatio(parseCssColor(sample.color), background);
      check(ratio >= 4.5, `M-17 syntax ${sample.name} reaches text contrast`, ratio.toFixed(2));
    }
  }

  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent.trim() === '关于')?.click());
  await sleep(300);
  const about = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[aria-label="关于"] .field-row')];
    const rights = rows.map((row) => row.querySelector('.field-row-control')?.getBoundingClientRect().right ?? 0);
    const scroll = document.querySelector('.settings-scroll');
    const repo = document.querySelector('[aria-label="关于"] code');
    return {
      aligned: rights.every((right) => Math.abs(right - rights[0]) <= 1),
      rights,
      overflow: scroll ? scroll.scrollHeight - scroll.clientHeight : null,
      repoClipped: repo ? repo.scrollWidth > repo.clientWidth + 1 : null,
      repoHeight: repo?.getBoundingClientRect().height ?? null,
    };
  });
  check(about.aligned && about.overflow <= 1, 'M-21 About rows align without a tiny overflow', JSON.stringify(about));
  check(about.repoClipped === false && about.repoHeight <= 28,
    'm-11 About repository name remains fully visible on one natural line', JSON.stringify(about));

  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent.trim() === '平台管理')?.click());
  await sleep(300);
  const testIcon = await page.evaluate(() => document.querySelector('.provider-actions button')?.innerHTML.includes('M2.5 11a5.5') ?? false);
  check(testIcon, 'M-34 provider test uses a connectivity icon rather than regenerate');
  await page.evaluate(() => {
    const button = document.querySelector('.provider-actions [aria-label="编辑"]');
    window.__minorInvoker = button;
    button?.focus();
    button?.click();
  });
  await sleep(300);
  const presetVisible = await page.evaluate(() => document.querySelector('.modal-panel')?.textContent.includes('预置供应商') ?? false);
  check(!presetVisible, 'M-28 editing a provider cannot silently overwrite its URL from presets');
  await page.evaluate(() => document.querySelector('[aria-label="关闭对话框"]')?.click());
  await sleep(300);
  const focusState = await page.evaluate(() => ({
    returned: document.activeElement === window.__minorInvoker,
    active: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
    invokerConnected: window.__minorInvoker?.isConnected ?? false,
  }));
  check(focusState.returned, 'M-32 modal returns focus to its invoker', JSON.stringify(focusState));

  await page.evaluate(() => document.querySelector('.provider-actions [aria-label="展开"]')?.click());
  await sleep(200);
  await page.evaluate(() => document.querySelector('.provider-card li [aria-label^="检测模型"]')?.click());
  const testingFeedback = await page.evaluate(() => ({
    spinner: !!document.querySelector('.provider-card li .spinner'),
    label: document.querySelector('.provider-card li button:last-child')?.getAttribute('aria-label') ?? '',
  }));
  check(testingFeedback.spinner && testingFeedback.label.includes('检测中'),
    'M-11 model testing exposes visible and accessible busy feedback', JSON.stringify(testingFeedback));
  await sleep(1000);

  await page.evaluate(() => {
    document.cookie = `easyui_prefs=${encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'en-US' }))};path=/`;
  });
  await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(400);
  await openConversation(page);
  const timestamp = await page.evaluate(() => ({
    height: document.querySelector('.conversation-row [aria-current="true"] > span:last-child')?.getBoundingClientRect().height ?? 0,
    text: document.querySelector('.conversation-row [aria-current="true"] > span:last-child')?.textContent ?? '',
    newLabel: document.querySelector('[aria-label="New conversation"]')?.textContent ?? '',
  }));
  check(timestamp.height <= 20, 'M-19 English sidebar timestamp stays on one line', JSON.stringify(timestamp));
  check(timestamp.newLabel.includes('New conversation'), 'M-20 English conversation terminology is consistent', timestamp.newLabel);
  await page.screenshot({ path: `${OUT}/minor-settings.png` });
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error(error);
} finally {
  await browser?.close();
  server.close();
}
if (failures.length) {
  console.error(`MINOR_CHECKS_FAIL: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('MINOR_CHECKS_PASS');
