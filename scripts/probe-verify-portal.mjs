/**
 * 程序化验证探针（fix/v1.0.1-ui-polish 第二轮）：不依赖目视截图，直接断言 DOM 几何与
 * computed style，验证四项修复的因果链：
 *  1) 模型下拉 / Select 弹层 / ctx-tip：portal 到 document.body（祖先链无 backdrop-filter
 *     的 backdrop root）且自身 backdrop-filter 生效 → 液态玻璃模糊真实可用；
 *  2) 气泡：user 气泡 min-width ≥120px，头部行单行（高度 ≤ 1.6×行高）；
 *  3) 输入坞：底行控件统一 32px 高、底缘对齐差 ≤1px、全部在 composer-shell 内；
 *  4) Generate 胶囊：portal 到 body 的浮窗（不在输入卡片流内），浮于输入坞上方、水平居中。
 * 复用 e2e-ui-polish.mjs 的 harness（静态服务器 + seed + Edge 无头）。
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
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
const fails = [];
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  (${detail})` : ''}`);
  if (!ok) fails.push(what);
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
});

const seed = () => {
  // 注意：本函数经 evaluateOnNewDocument 序列化执行，所有依赖必须定义在函数体内（无闭包）
  const t0 = Date.now() - 60000;
  const msg = (id, conv, parent, role, content, at, extra = {}) => ({
    id, conversation_id: conv, parent_id: parent, role, content,
    reasoning: '', token_count: role === 'assistant' ? 6 : null,
    partial: false, error: null, created_at: at, ...extra,
  });
  try {
    localStorage.setItem('easyui_mock_providers', JSON.stringify([
      { id: 'p-mock-1', name: 'DeepSeek Mock', base_url: 'https://api.deepseek.com',
        api_format: 'openai-chat', has_key: true,
        models: [{ id: 'deepseek-reasoner', enabled: true }, { id: 'deepseek-chat', enabled: true }],
        created_at: 1, updated_at: 1 },
    ]));
    localStorage.setItem('easyui_mock_conversations', JSON.stringify([
      { id: 'c-zh-1', title: '短回复演示', provider_id: 'p-mock-1', model: 'deepseek-reasoner',
        preset_id: null, overrides: {}, pinned: false, reasoning_enabled: true,
        created_at: t0, updated_at: t0 + 4000 },
    ]));
    localStorage.setItem('easyui_mock_messages', JSON.stringify([
      msg('m1', 'c-zh-1', null, 'user', '好', t0 + 100),
      msg('m2', 'c-zh-1', 'm1', 'assistant',
        '这是一段足够长的回复文本，用来触发气泡的最大宽度约束：液态玻璃设计语言强调层次与材质，'
        + '内容列在宽窗口下上限为 56rem，气泡列最大占内容列的百分之八十五，'
        + '在窄窗口下则随聊天区宽度按比例收缩，保证长文本始终拥有舒适的阅读宽度。\n\n```\n'
        + 'A'.repeat(240) + '\n```', t0 + 200, { stats: { ttft_ms: 780, total_ms: 5230, finish_reason: 'stop' } }),
      msg('m3', 'c-zh-1', 'm2', 'user', '再来一个', t0 + 300),
      msg('m3a', 'c-zh-1', 'm3', 'assistant', '好的。', t0 + 350),
      msg('m4', 'c-zh-1', 'm3a', 'user',
        '这是一条足够长的用户消息，'.repeat(12) + '应当一直铺到气泡列的最大宽度才换行。', t0 + 400),
    ]));
  } catch {}
  document.cookie =
    'easyui_prefs=' + encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN' })) +
    ';path=/;max-age=31536000;SameSite=Lax';
};

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(seed);
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
await sleep(1200);
await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '短回复演示');
  el?.click();
});
await sleep(700);

/* ---------- 1) 模型下拉：portal + backdrop-filter 生效 + 定位在触发器下方 ---------- */
await page.evaluate(() => {
  const el = document.querySelector('[aria-label="选择模型"]');
  el?.click();
});
await sleep(400);
const pop = await page.evaluate(() => {
  const el = document.querySelector('body > [role="listbox"].glass-pop');
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  // 祖先链（应只有 body）中是否有 backdrop-filter（backdrop root 会令子层模糊失效）
  let a = el.parentElement, blurAncestor = false;
  while (a && a !== document.documentElement) {
    if (getComputedStyle(a).backdropFilter !== 'none') blurAncestor = true;
    a = a.parentElement;
  }
  const trigger = document.querySelector('[aria-label="选择模型"]');
  const tr = trigger?.getBoundingClientRect();
  return {
    parent: el.parentElement?.tagName,
    backdrop: cs.backdropFilter,
    blurAncestor,
    rect: { top: r.top, left: r.left, w: r.width, h: r.height },
    triggerBottom: tr?.bottom,
    triggerLeft: tr?.left,
    vw: innerWidth, vh: innerHeight,
  };
});
check(!!pop, '模型下拉 portal 直挂 body', pop ? `parent=${pop.parent}` : '未找到 body>[role=listbox].glass-pop');
if (pop) {
  check(pop.backdrop && pop.backdrop !== 'none', '下拉 backdrop-filter 生效', `backdrop=${pop.backdrop}`);
  check(!pop.blurAncestor, '下拉祖先链无 backdrop root');
  check(pop.rect.top >= pop.triggerBottom - 2, '下拉位于触发器下方', `pop.top=${pop.rect.top.toFixed(0)} trig.bottom=${pop.triggerBottom?.toFixed(0)}`);
  check(Math.abs(pop.rect.left - pop.triggerLeft) < 4, '下拉左缘与触发器对齐');
  check(pop.rect.left >= 0 && pop.rect.top >= 0 && pop.rect.left + pop.rect.w <= pop.vw && pop.rect.top + pop.rect.h <= pop.vh, '下拉不溢出视口');
}
await page.keyboard.press('Escape');
await sleep(300);

/* ---------- 2) 气泡：user min-width ≥120px；头部行单行 ---------- */
const bubbles = await page.evaluate(() => {
  const list = document.querySelector('[aria-label="消息列表"]');
  return [...(list?.querySelectorAll('.row-surface') ?? [])].map((b) => {
    const header = b.querySelector(':scope > div > div');
    return {
      w: b.getBoundingClientRect().width,
      headerH: header?.getBoundingClientRect().height ?? 0,
      text: b.textContent.slice(0, 12),
    };
  });
});
const userBubble = bubbles[0]; // '好'
check(bubbles.length >= 2, '找到对话气泡', `count=${bubbles.length}`);
if (userBubble) check(userBubble.w >= 120, 'user 气泡最小宽度 ≥120px', `w=${userBubble.w.toFixed(0)} text=${userBubble.text}`);
check(bubbles.every((b) => b.headerH <= 18), '所有气泡头部行单行（≤18px）', bubbles.map((b) => b.headerH.toFixed(0)).join(','));

/* ---------- 3)+4) 输入坞：底行控件统一 2rem、底对齐、不越出卡片；Generate 胶囊浮于上方 ---------- */
/* 种子末条为 user 消息 → Generate 胶囊（液态玻璃浮窗）浮于输入卡片上方居中 */
const composer = await page.evaluate(() => {
  const shell = document.querySelector('.composer-shell');
  if (!shell) return null;
  const sr = shell.getBoundingClientRect();
  const row = shell.querySelector(':scope > div.flex'); // 底行
  const ctrls = [...(row?.querySelectorAll('button, .ctx-ring') ?? [])]
    .filter((c) => c.getBoundingClientRect().width > 0);
  const gen = [...document.querySelectorAll('button')].find((b) => /Generate Response|生成回复/.test(b.textContent));
  let pill = null;
  if (gen) {
    const host = gen.closest('.glass-pop');
    const hr = host?.getBoundingClientRect();
    const gr = gen.getBoundingClientRect();
    pill = {
      portalParent: host?.parentElement?.tagName,
      backdrop: host ? getComputedStyle(host).backdropFilter : null,
      hostRect: hr ? { top: hr.top, bottom: hr.bottom, left: hr.left, right: hr.right } : null,
      h: gr.height,
      centerX: gr.left + gr.width / 2,
      inShell: shell.contains(gen),
    };
  }
  return {
    shell: { top: sr.top, bottom: sr.bottom, left: sr.left, right: sr.right, centerX: sr.left + sr.width / 2 },
    ctrls: ctrls.map((c) => {
      const r = c.getBoundingClientRect();
      return { h: r.height, bottom: r.bottom, right: r.right, label: c.getAttribute('aria-label') ?? c.className.slice(0, 20) };
    }),
    gen: pill,
  };
});
check(!!composer, '输入坞底行存在');
if (composer) {
  const heights = composer.ctrls.map((c) => c.h);
  check(heights.every((h) => Math.abs(h - 32) <= 1), '底行控件统一 32px 高', heights.map((h) => h.toFixed(0)).join(','));
  const bottoms = composer.ctrls.map((c) => c.bottom);
  check(Math.max(...bottoms) - Math.min(...bottoms) <= 1, '底行控件底缘对齐差 ≤1px', (Math.max(...bottoms) - Math.min(...bottoms)).toFixed(2));
  check(composer.ctrls.every((c) => c.right <= composer.shell.right + 1), '控件均在卡片内（不越出右缘）');
  check(!!composer.gen, 'Generate 胶囊出现');
  if (composer.gen) {
    check(composer.gen.portalParent === 'BODY', 'Generate 胶囊 portal 直挂 body（模糊生效前提）', `parent=${composer.gen.portalParent}`);
    check(composer.gen.backdrop && composer.gen.backdrop !== 'none', 'Generate 胶囊 backdrop-filter 生效', `backdrop=${composer.gen.backdrop}`);
    check(!composer.gen.inShell, 'Generate 胶囊为浮窗（不在输入卡片流内）');
    check(composer.gen.hostRect.bottom <= composer.shell.top + 1, 'Generate 胶囊浮于输入坞上方', `pill.bottom=${composer.gen.hostRect.bottom?.toFixed(0)} shell.top=${composer.shell.top.toFixed(0)}`);
    check(Math.abs(composer.gen.centerX - composer.shell.centerX) <= 2, 'Generate 胶囊水平居中于输入卡片', `Δ=${Math.abs(composer.gen.centerX - composer.shell.centerX).toFixed(1)}`);
  }
}

/* ---------- ctx-tip：悬停上下文环 → tooltip portal 到 body 且带 backdrop-filter ---------- */
await page.hover('.ctx-ring');
await sleep(400);
const tip = await page.evaluate(() => {
  const el = [...document.querySelectorAll('body > [role="tooltip"].glass-pop')].find((t) => t.textContent.includes('%'));
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { backdrop: cs.backdropFilter, parent: el.parentElement?.tagName };
});
check(!!tip, '上下文环悬停明细 portal 到 body');
if (tip) check(tip.backdrop !== 'none', 'ctx-tip backdrop-filter 生效', `backdrop=${tip.backdrop}`);

/* ---------- 5) 焦点环内化：聚焦不外扩（负偏移画在元素内部，不压邻居/不溢出卡片） ---------- */
await page.click('.composer-input');
const taAudit = await page.evaluate(() => {
  const el = document.activeElement;
  const cs = getComputedStyle(el);
  return { name: 'composer-textarea', offset: cs.outlineOffset, style: cs.outlineStyle };
});
check(taAudit.offset === '-1px', 'composer-textarea 焦点环 -1px（骑边界）', `offset=${taAudit.offset}`);
check(taAudit.style !== 'none', 'composer-textarea 聚焦显示焦点环', `style=${taAudit.style}`);
await page.keyboard.press('Tab'); // 真实键盘事件 → 下一控件 :focus-visible
const btnAudit = await page.evaluate(() => {
  const el = document.activeElement;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { name: el.getAttribute('aria-label') ?? el.className.slice(0, 24), offset: cs.outlineOffset, style: cs.outlineStyle, rect: { w: r.width, h: r.height } };
});
check(btnAudit.offset === '-1px', `${btnAudit.name} 键盘焦点环 -1px（骑边界）`, `offset=${btnAudit.offset}`);

/* ---------- 6) 选择模式：复选框左对齐 + 首个图标与气泡顶对齐 ---------- */
await page.click('[aria-label="消息列表"] .row-surface', { button: 'right' });
await sleep(500);
const selAudit = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.msg-in .checkbox')];
  if (!boxes.length) return null;
  const rows = [...document.querySelectorAll('.msg-in')];
  const lefts = boxes.map((b) => b.getBoundingClientRect().left);
  const cb = boxes[0].getBoundingClientRect();
  const bubble = boxes[0].closest('.msg-in').querySelector('.row-surface').getBoundingClientRect();
  return {
    count: boxes.length,
    leftSpread: Math.max(...lefts) - Math.min(...lefts),
    justify: getComputedStyle(rows[0]).justifyContent,
    firstTopDelta: cb.top - bubble.top, // 应 ≈ 气泡 padding-top(10px)
  };
});
check(!!selAudit && selAudit.count >= 3, '选择模式复选框出现', `count=${selAudit?.count}`);
if (selAudit) {
  check(selAudit.leftSpread <= 1.5, '复选框全部左侧对齐（漂移 ≤1.5px）', `spread=${selAudit.leftSpread.toFixed(1)}px`);
  check(selAudit.justify === 'flex-start', '选择模式行一律左起（用户气泡不右推复选框）', `justify=${selAudit.justify}`);
  check(selAudit.firstTopDelta >= 8 && selAudit.firstTopDelta <= 12, '首个复选框与气泡内容顶对齐', `Δ=${selAudit.firstTopDelta.toFixed(1)}px`);
}

/* ---------- 7) 内容列自适应：上限 4xl(896px)，气泡 ≤85% 列宽 ---------- */
const colAudit = await page.evaluate(() => {
  const col = document.querySelector('[aria-label="消息列表"] .max-w-7xl');
  if (!col) return null;
  const cr = col.getBoundingClientRect();
  const long = [...col.querySelectorAll('.group > .row-surface')].sort(
    (a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width,
  )[0];
  return {
    colWidth: cr.width,
    colMaxWidth: getComputedStyle(col).maxWidth,
    bubbleWidth: long?.getBoundingClientRect().width ?? 0,
  };
});
check(!!colAudit, '消息内容列存在');
if (colAudit) {
  check(colAudit.colMaxWidth === '1280px', '内容列上限 80rem（1280px）', `max=${colAudit.colMaxWidth}`);
  check(
    colAudit.bubbleWidth >= colAudit.colWidth * 0.84 && colAudit.bubbleWidth <= colAudit.colWidth * 0.85 + 1,
    '长文本气泡顶到 85% 列宽（随聊天区自适应）',
    `bubble=${colAudit.bubbleWidth.toFixed(0)} col=${colAudit.colWidth.toFixed(0)}`,
  );
}

/* ---------- 8) 气泡恒 ≤ 聊天区宽：列表无横向滚动条 ---------- */
const overflowAudit = await page.evaluate(() => {
  const list = document.querySelector('[aria-label="消息列表"]');
  return {
    clientW: list.clientWidth,
    scrollW: list.scrollWidth,
    hScrollbar: list.scrollWidth > list.clientWidth + 1,
  };
});
check(!overflowAudit.hScrollbar, '消息列表无横向滚动条', `scroll=${overflowAudit.scrollW} client=${overflowAudit.clientW}`);

/* ---------- 9) 统计行图标墨迹居中（16 视口，理想中心 8,8；防字形错位回归） ---------- */
const glyphAudit = await page.evaluate(() => {
  const stats = document.querySelector('[aria-label="消息列表"] .flex-wrap');
  if (!stats) return null;
  return [...stats.children].map((it) => {
    const b = it.querySelector('svg').getBBox();
    return {
      text: it.textContent.trim().slice(0, 12),
      offY: Math.abs(b.y + b.height / 2 - 8),
      offX: Math.abs(b.x + b.width / 2 - 8),
    };
  });
});
check(!!glyphAudit && glyphAudit.length >= 4, '统计行图标存在', `count=${glyphAudit?.length}`);
if (glyphAudit) {
  const worst = glyphAudit.reduce((a, b) => (a.offY > b.offY ? a : b));
  check(
    glyphAudit.every((g) => g.offY <= 1 && g.offX <= 1),
    '统计行图标墨迹中心居中（偏移 ≤1 单位）',
    `worst=${worst.text}: offY=${worst.offY.toFixed(2)}`,
  );
}

/* ---------- 10) 用户气泡右对齐 + 长用户消息顶满 85% 上限 ----------
 * 回归：wrapper fit-content 与 group 的百分比 max-width 曾引发 intrinsic 循环，
 * group 左对齐 → 用户气泡不贴右、看似提前换行。先退出选择模式（其气泡跟在复选框后） */
await page.evaluate(() => {
  const bar = [...document.querySelectorAll('[role="toolbar"]')].find((t) =>
    String(t.className).includes('glass-pop'),
  );
  const exit = [...(bar?.querySelectorAll('button') ?? [])].find((b) => b.textContent.includes('退出'));
  exit?.click();
});
await sleep(400);
const userAlign = await page.evaluate(() => {
  const col = document.querySelector('[aria-label="消息列表"] .max-w-7xl');
  const colR = col.getBoundingClientRect().right;
  const colW = col.getBoundingClientRect().width;
  const users = [...document.querySelectorAll('[aria-label="消息列表"] .msg-in')]
    .filter((r) => r.querySelector('.group')?.classList.contains('items-end'))
    .map((r) => r.querySelector('.row-surface').getBoundingClientRect());
  const long = users.sort((a, b) => b.width - a.width)[0];
  return {
    count: users.length,
    rightAligned: users.every((u) => Math.abs(u.right - colR) <= 1),
    longWidth: long ? Math.round(long.width) : 0,
    cap: Math.round(colW * 0.85),
  };
});
check(userAlign.count >= 2, '用户气泡采样充足', `count=${userAlign.count}`);
check(userAlign.rightAligned, '用户气泡全部右缘对齐聊天区列右缘');
check(
  Math.abs(userAlign.longWidth - userAlign.cap) <= 2,
  '长用户消息顶满 85% 列宽（不再提前换行）',
  `bubble=${userAlign.longWidth} cap=${userAlign.cap}`,
);

await browser.close();
server.close();
if (fails.length) {
  console.log(`\n${fails.length} 项失败: ${fails.join(' | ')}`);
  process.exit(1);
}
console.log('\nALL_CHECKS_PASS');
