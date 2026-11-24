/**
 * 一键生成 README 与 REQ-2026-006 视觉验收截图（中文界面）：
 *   node scripts/shot.mjs                 → docs/screenshots/
 *   node scripts/shot.mjs --out <dir>     → 指定输出目录
 * 流程：进程内静态服务器服务 dist/ → Edge 无头逐状态走查截图 → 退出即清理。
 * 前 8 张保留 README 既有用途；09-15 补充滚动、Toast、选择模式和设置标签；
 * 09b 验证真实内容/顶栏交叠，16-17 覆盖 960×720 设置与完整会话；
 * 18-22 补充深色设置的五个标签。
 * seed 时间固定；逐张断言主题、语言、缩放和最终 CSS 降级状态。
 */
import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const EDGE = process.env.EASYUI_BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let fp = normalize(join('dist', urlPath === '/' ? 'index.html' : urlPath));
  if (!fp.startsWith('dist') || !existsSync(fp) || !statSync(fp).isFile()) fp = 'dist/index.html';
  res.setHeader('content-type', MIME[extname(fp)] ?? 'application/octet-stream');
  createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
});

/* mock 数据 + 主题 cookie（evaluateOnNewDocument 序列化执行，依赖须在函数体内） */
const seed = (lang, withConversation) => {
  const t0 = 1767225600000;
  const msg = (id, conv, parent, role, content, at, extra = {}) => ({
    id, conversation_id: conv, parent_id: parent, role, content,
    reasoning: id === 'm1a1' ? '用户在测试思考链路，先简短回应即可。' : '',
    token_count: role === 'assistant' ? 86 : null,
    partial: false, error: null, created_at: at, stats: null, ...extra,
  });
  // assistant 统计（截图展示气泡内统计行）
  const st = { ttft_ms: 640, total_ms: 4100, finish_reason: 'stop' };
  try {
    localStorage.setItem('easyui_mock_providers', JSON.stringify([
      { id: 'p-mock-1', name: 'DeepSeek Mock', base_url: 'https://api.deepseek.com',
        api_format: 'openai-chat', has_key: true,
        models: [{ id: 'deepseek-reasoner', enabled: true }, { id: 'deepseek-chat', enabled: true }],
        created_at: 1, updated_at: 1 },
    ]));
    localStorage.removeItem('easyui_mock_active_leaves');
    if (withConversation) {
      localStorage.setItem('easyui_mock_conversations', JSON.stringify([
        { id: 'c-zh-1', title: '液态玻璃走查', provider_id: 'p-mock-1', model: 'deepseek-reasoner',
          preset_id: null, overrides: {}, pinned: false, reasoning_enabled: true,
          created_at: t0, updated_at: t0 + 4000 },
      ]));
      localStorage.setItem('easyui_mock_messages', JSON.stringify([
        msg('m1', 'c-zh-1', null, 'user', '好', t0 + 100),
        msg('m1a1', 'c-zh-1', 'm1', 'assistant', '你好！有什么可以帮你？', t0 + 200, { stats: st }),
        msg('m2', 'c-zh-1', 'm1a1', 'user', '讲个笑话', t0 + 300),
        msg('m2a1', 'c-zh-1', 'm2', 'assistant', '为什么程序员喜欢黑暗？因为光会吸引 bug。', t0 + 400, { stats: st }),
        msg('m3', 'c-zh-1', 'm2a1', 'user', '再讲一个长的', t0 + 500),
        msg('m3a1', 'c-zh-1', 'm3', 'assistant',
          '有一个 SQL 查询走进了一家酒吧，走近两张 table，问：能 JOIN 你们吗？\n\n bartender 说：抱歉，我们这里不欢迎没有 INDEX 的查询——你上次来把整张表都扫了一遍。', t0 + 600, { stats: st }),
        msg('m4', 'c-zh-1', 'm3a1', 'user', '再来一个', t0 + 700),
      ]));
    } else {
      localStorage.removeItem('easyui_mock_conversations');
      localStorage.removeItem('easyui_mock_messages');
    }
  } catch {}
  if (!document.cookie.includes('easyui_prefs=')) {
    document.cookie =
      'easyui_prefs=' + encodeURIComponent(JSON.stringify({ theme: 'light', lang })) +
      ';path=/;max-age=31536000;SameSite=Lax';
  }
};

const newPage = async (lang, withConversation) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  await page.evaluateOnNewDocument(seed, lang, withConversation);
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);
  return page;
};

const shot = (page, name, expected = {}) => async () => {
  const actual = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    lang: document.documentElement.lang,
    zoom: document.documentElement.style.zoom || '1',
    glassState: document.querySelector('.composer-shell')?.closest('[data-glass-state]')?.dataset.glassState,
    glassReason: document.querySelector('.composer-shell')?.closest('[data-glass-state]')?.dataset.glassReason,
  }));
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) throw new Error(`${name}: expected ${key}=${value}, actual ${actual[key]}`);
  }
  if (actual.glassState && actual.glassState !== 'fallback') throw new Error(`${name}: unexpected Track C state ${actual.glassState}`);
  if (actual.glassState && actual.glassReason !== 'filter-budget') throw new Error(`${name}: unexpected fallback reason ${actual.glassReason}`);
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      try { if (animation.effect?.getTiming().iterations !== Infinity) animation.finish(); } catch {}
    }
  });
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot: ${name} ${JSON.stringify(actual)}`);
};
const clickExact = (page, text) =>
  page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, [role="tab"]')].filter(
      (el) => el.getBoundingClientRect().width > 0,
    );
    const hit = els.filter((el) => el.textContent.trim() === t).length
      ? els.filter((el) => el.textContent.trim() === t)
      : els
          .filter((el) => el.textContent.trim().includes(t))
          .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
    if (!hit.length) return false;
    hit[0].click();
    return true;
  }, text);
const clickAria = (page, label) =>
  page.evaluate((l) => {
    const el = document.querySelector(`[aria-label="${l}"]`);
    if (!el) return false;
    el.click();
    return true;
  }, label);
const must = (ok, what) => {
  if (!ok) throw new Error(`未找到: ${what}`);
  console.log(`click: ${what}`);
};

const typeDraft = async (page, lines) => {
  await page.click('.composer-input');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
    await page.type('.composer-input', lines[i]);
  }
};

const checkSurface = async (page, selector, label) => {
  const geometry = await page.evaluate((target) => {
    const el = document.querySelector(target);
    if (!el) return null;
    const style = getComputedStyle(el);
    const edge = getComputedStyle(el, '::before');
    return {
      radius: style.borderRadius, shape: style.cornerShape,
      edgeRadius: edge.borderRadius, edgeShape: edge.cornerShape,
    };
  }, selector);
  const ok = geometry?.radius === '16px'
    && ['squircle', 'superellipse(2)'].includes(geometry.shape)
    && geometry.radius === geometry.edgeRadius
    && geometry.shape === geometry.edgeShape;
  console.log(`${ok ? 'PASS' : 'FAIL'} surface ${label}: ${JSON.stringify(geometry)}`);
  if (!ok) errors.push(`surface geometry: ${label}`);
};
const checkBottom = async (page, selector, label) => {
  const bottom = await page.evaluate((target) => {
    const el = document.querySelector(target);
    return el ? innerHeight - el.getBoundingClientRect().bottom : null;
  }, selector);
  const ok = bottom !== null && Math.abs(bottom - 16) <= 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} bottom ${label}: ${bottom}`);
  if (!ok) errors.push(`bottom baseline: ${label}`);
};

const recordCheck = (condition, label, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) errors.push(label);
};

try {
  /* 01-03：欢迎页 → 设置 → 弹窗（无会话） */
  const p1 = await newPage('zh-CN', false);
  await clickAria(p1, '搜索');
  await sleep(300); // 搜索框聚焦：焦点环（-1px 骑边界）目视证据
  await shot(p1, '01-welcome-light-zh')();
  recordCheck(await p1.evaluate(() => !!document.querySelector('.inspector-empty')),
    'empty inspector provides guidance');
  recordCheck(await p1.evaluate(() => !!document.querySelector('.empty-state .empty-state-content')
    && !document.querySelector('.empty-state .row-surface')),
  'welcome uses an open empty state without a card shell');
  const welcomeGuidance = await p1.evaluate(() => ({
    description: document.querySelector('.empty-state p')?.textContent ?? '',
    modelControlVisible: !!document.querySelector('[aria-label="选择模型"]'),
  }));
  recordCheck(welcomeGuidance.modelControlVisible || !/选择(?:一个)?模型/.test(welcomeGuidance.description),
    'welcome only directs users to controls available in the empty state', welcomeGuidance.description);

  must(await clickExact(p1, '设置'), '设置');
  await sleep(700);
  await shot(p1, '02-settings-providers-light-zh')();
  const providerPolish = await p1.evaluate(() => {
    const toolbar = document.querySelector('.provider-card .provider-actions');
    const key = document.querySelector('.provider-key-badge');
    const remove = document.querySelector('.provider-delete-action');
    return {
      icons: toolbar?.querySelectorAll('.icon-button').length ?? 0,
      keyDot: !!key?.querySelector('[data-status-dot]'),
      deleteNeutral: !!remove && getComputedStyle(remove).color === getComputedStyle(document.body).color,
    };
  });
  recordCheck(providerPolish.icons === 4 && providerPolish.keyDot && providerPolish.deleteNeutral,
    'provider row uses icon actions and neutral status badge', JSON.stringify(providerPolish));

  must(await clickExact(p1, '+ 新增平台'), '新增平台');
  await sleep(500);
  await p1.evaluate(() => document.querySelector('[aria-label="API 密钥"]')?.click());
  await sleep(300);
  await shot(p1, '03-provider-modal-light-zh')();
  await checkSurface(p1, '.modal-panel', 'modal');
  await p1.close();

  /* 04-06：会话页浅色 */
  const p2 = await newPage('zh-CN', true);
  must(await clickExact(p2, '液态玻璃走查'), '会话');
  await sleep(700);

  // 04：下拉打开 + 首条 assistant 气泡滚到弹层正后方（玻璃模糊证据）
  await p2.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (!list) return;
    const groups = list.querySelectorAll('.group');
    const target = groups[1] ?? groups[0];
    if (!target) return;
    list.scrollTop +=
      target.getBoundingClientRect().top - list.getBoundingClientRect().top - 40;
  });
  await sleep(300);
  must(await clickAria(p2, '选择模型'), '模型选择器');
  await sleep(500);
  await shot(p2, '04-model-picker-blur-zh')();
  await checkSurface(p2, 'body > [role="listbox"].glass-pop', 'model popover');
  await p2.keyboard.press('Escape');
  await sleep(300);
  await p2.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (list) list.scrollTop = list.scrollHeight;
  });
  await sleep(300);

  await shot(p2, '05-chat-light-zh')();
  await checkSurface(p2, '.composer-shell', 'composer');
  await checkBottom(p2, '.composer-shell', 'composer');

  must(await clickAria(p2, '上下文溢出策略'), '上下文溢出策略');
  await sleep(200);
  const optionLabels = await p2.evaluate(() => {
    const triggerLabel = document.querySelector('button[aria-label="上下文溢出策略"] > span');
    const popupLabels = [...document.querySelectorAll('body > [role="listbox"] [role="option"] > span:first-child')];
    return [triggerLabel, ...popupLabels].filter(Boolean).map((el) => ({
      text: el.textContent,
      clipped: el.scrollWidth > el.clientWidth + 1,
      textOverflow: getComputedStyle(el).textOverflow,
    }));
  });
  recordCheck(optionLabels.length === 4
    && optionLabels.every((label) => !label.clipped && label.textOverflow !== 'ellipsis'),
  'long parameter options remain fully readable in the trigger and popup', JSON.stringify(optionLabels));
  await p2.keyboard.press('Escape');
  await sleep(200);

  await typeDraft(p2, ['帮我总结一下上面的对话，', '重点提炼两个最好笑的包袱，', '并解释为什么好笑。']);
  await sleep(400);
  await shot(p2, '06-composer-generate-zh')();

  /* 07：深色（同页切主题） */
  await p2.evaluate(() => {
    document.cookie =
      'easyui_prefs=' + encodeURIComponent(JSON.stringify({ theme: 'dark', lang: 'zh-CN' })) +
      ';path=/;max-age=31536000;SameSite=Lax';
  });
  await p2.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  await shot(p2, '07-chat-dark-zh')();

  /* 08：浅色 + 发送 → 思考中 */
  await p2.evaluate(() => {
    document.cookie =
      'easyui_prefs=' + encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN' })) +
      ';path=/;max-age=31536000;SameSite=Lax';
  });
  await p2.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  await typeDraft(p2, ['用一句话解释什么是液态玻璃设计']);
  must(await clickAria(p2, '发送消息'), '发送消息');
  await p2.waitForFunction(() => document.body.innerText.includes('思考中'), { timeout: 8000 });
  await shot(p2, '08-chat-streaming-zh')();
  await p2.waitForFunction(() => !document.querySelector('[aria-label="停止生成"]'), { timeout: 40000 });

  /* 09：滚动上/下缘（固定位置与主题，渐隐不遮挡阅读） */
  await p2.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (list) list.scrollTop = Math.max(0, (list.scrollHeight - list.clientHeight) / 2);
  });
  await sleep(300);
  await shot(p2, '09-chat-scroll-edges-zh')();
  const scrollFade = await p2.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (!list) return null;
    return {
      top: list.dataset.fadeTop,
      bottom: list.dataset.fadeBottom,
      mask: getComputedStyle(list).maskImage,
    };
  });
  recordCheck(scrollFade?.top === 'true' && scrollFade.bottom === 'true'
    && scrollFade.mask.includes('40px'),
  'scroll fades use a 2.5rem readability band', JSON.stringify(scrollFade));

  const chromeTarget = await p2.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    const topbar = document.querySelector('.workspace-topbar');
    const target = [...document.querySelectorAll('.bubble-user')]
      .find((el) => el.textContent.includes('再讲一个长的'));
    if (!list || !topbar || !target) return false;
    const before = list.scrollTop;
    const delta = target.getBoundingClientRect().top - topbar.getBoundingClientRect().top - 6;
    list.scrollTop += delta;
    return { before, delta, after: list.scrollTop, height: list.clientHeight, scrollHeight: list.scrollHeight };
  });
  must(chromeTarget, '顶栏透底目标存在');
  console.log(`chrome-scroll ${JSON.stringify(chromeTarget)}`);
  await sleep(300);
  const chromeOverlap = await p2.evaluate(() => {
    const topbar = document.querySelector('.workspace-topbar')?.getBoundingClientRect();
    const target = [...document.querySelectorAll('.bubble-user')]
      .find((el) => el.textContent.includes('再讲一个长的'))?.getBoundingClientRect();
    if (!topbar || !target) return null;
    return {
      scrollTop: document.querySelector('[aria-label="消息列表"]')?.scrollTop,
      topbar: { top: topbar.top, bottom: topbar.bottom },
      target: { top: target.top, bottom: target.bottom },
      pixels: Math.max(0, Math.min(topbar.bottom, target.bottom) - Math.max(topbar.top, target.top)),
    };
  });
  must(chromeOverlap && chromeOverlap.pixels >= 24, `顶栏与真实内容交叠 ${JSON.stringify(chromeOverlap)}`);
  await shot(p2, '09b-chat-chrome-refraction-zh')();

  /* 10：分支操作 Toast（真实状态反馈，非静态摆拍） */
  must(await p2.evaluate(() => {
    const button = document.querySelector('button[title*="分叉聊天"]');
    if (!button) return false;
    button.click();
    return true;
  }), '分支操作');
  await p2.waitForSelector('.toast-item', { timeout: 5000 });
  await shot(p2, '10-chat-toast-zh')();
  await checkSurface(p2, '.toast-item', 'toast');
  await checkBottom(p2, '.toast-item', 'toast');

  /* 11：选择模式工具栏与复选框 */
  await sleep(3200);
  await p2.click('[aria-label="消息列表"] .row-surface', { button: 'right' });
  await p2.waitForSelector('[role="toolbar"].glass-pop', { timeout: 5000 });
  await shot(p2, '11-chat-selection-zh')();
  await checkSurface(p2, '.selection-toolbar', 'selection toolbar');
  await checkBottom(p2, '.selection-toolbar', 'selection toolbar');
  must(await clickExact(p2, '退出'), '退出选择模式');

  /* 12-15：设置五个标签中的通用 / 预设 / 备份 / 关于（平台管理见 02） */
  must(await clickExact(p2, '设置'), '设置');
  await sleep(500);
  must(await clickExact(p2, '通用'), '通用标签');
  await sleep(300);
  await shot(p2, '12-settings-general-zh')();
  must(await clickExact(p2, '预设'), '预设标签');
  await sleep(300);
  await shot(p2, '13-settings-presets-zh')();
  recordCheck(await p2.evaluate(() => document.querySelectorAll('[aria-label="预设"] > .row-surface').length === 0),
    'presets remove the outer card shells');
  must(await clickExact(p2, '备份'), '备份标签');
  await sleep(300);
  await shot(p2, '14-settings-backup-zh')();
  recordCheck(await p2.evaluate(() => !document.querySelector('[aria-label="备份管理"] .row-surface')
    && !!document.querySelector('.backup-create svg')),
  'backup empty state and create action use the shared visual language');
  must(await clickExact(p2, '关于'), '关于标签');
  await sleep(300);
  await shot(p2, '15-settings-about-zh')();
  const aboutLayout = await p2.evaluate(() => {
    const about = document.querySelector('[aria-label="关于"]');
    return {
      hairlines: about?.querySelectorAll('.hairline').length ?? -1,
      rows: about?.querySelectorAll('.field-row').length ?? 0,
    };
  });
  recordCheck(aboutLayout.hairlines === 0 && aboutLayout.rows >= 7,
    'about uses shared field rows and no hairlines', JSON.stringify(aboutLayout));

  await p2.setViewport({ width: 960, height: 720 });
  must(await clickExact(p2, '通用'), '窄窗口通用标签');
  await sleep(350);
  await shot(p2, '16-settings-general-compact-zh')();

  await p2.setViewport({ width: 1440, height: 900 });
  await p2.evaluate(() => {
    document.cookie = 'easyui_prefs=' + encodeURIComponent(JSON.stringify({ theme: 'dark', lang: 'zh-CN' }))
      + ';path=/;max-age=31536000;SameSite=Lax';
  });
  await p2.reload({ waitUntil: 'networkidle0' });
  await sleep(800);
  must(await clickExact(p2, '设置'), '深色设置入口');
  await sleep(500);
  must(await clickExact(p2, '通用'), '深色通用标签');
  await sleep(250);
  await shot(p2, '18-settings-general-dark-zh')();
  must(await clickExact(p2, '平台管理'), '深色平台标签');
  await sleep(250);
  await shot(p2, '19-settings-providers-dark-zh')();
  must(await clickExact(p2, '预设'), '深色预设标签');
  await sleep(250);
  await shot(p2, '20-settings-presets-dark-zh')();
  must(await clickExact(p2, '备份管理'), '深色备份标签');
  await sleep(250);
  await shot(p2, '21-settings-backup-dark-zh')();
  must(await clickExact(p2, '关于'), '深色关于标签');
  await sleep(250);
  await shot(p2, '22-settings-about-dark-zh')();
  await p2.close();

  const compact = await newPage('zh-CN', true);
  await compact.setViewport({ width: 960, height: 720 });
  must(await clickExact(compact, '液态玻璃走查'), '窄窗口完整会话');
  await sleep(500);
  await compact.evaluate(() => {
    const button = document.querySelector('button[title="会话参数"]');
    if (button?.getAttribute('aria-pressed') === 'true') button.click();
  });
  await sleep(300);
  await shot(compact, '17-chat-compact-zh')();
  await compact.close();

  console.log('FLOW_OK');
} catch (e) {
  errors.push(`flow: ${e.message}`);
}

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('E2E_CLEAN');
