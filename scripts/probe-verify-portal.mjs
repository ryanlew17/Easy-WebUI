/**
 * 程序化验证探针：不依赖目视截图，直接断言 DOM 几何与
 * computed style，验证四项修复的因果链：
 *  1) 模型下拉 / Select 弹层 / ctx-tip：portal 到 document.body（祖先链无 backdrop-filter
 *     的 backdrop root）且自身 backdrop-filter 生效 → 液态玻璃模糊真实可用；
 *  2) 气泡：user 最小宽度 3rem、头部单行；assistant 使用开放阅读排版；
 *  3) 输入坞：玻璃边缘光表示焦点，底行控件统一 32px 高且不越界；
 *  4) Generate 胶囊：portal 到 body 的浮窗（不在输入卡片流内），浮于输入坞上方、水平居中。
 * 复用 e2e-ui-polish.mjs 的 harness（静态服务器 + seed + Edge 无头）。
 */
import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const EDGE = process.env.EASYUI_BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
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
        + '内容列在宽窗口下上限为 52rem，气泡列最大占内容列的百分之八十五，'
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
  const scene = document.querySelector('.composer-shell')?.closest('[data-glass-state]');
  return {
    parent: el.parentElement?.tagName,
    backdrop: cs.backdropFilter,
    glassActive: el.dataset.glassActive,
    sceneState: scene?.dataset.glassState,
    sceneReason: scene?.dataset.glassReason,
    sceneSurfaces: scene?.dataset.glassSurfaces,
    sceneRect: scene ? (() => { const r = scene.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })() : null,
    blurAncestor,
    rect: { top: r.top, left: r.left, w: r.width, h: r.height },
    triggerBottom: tr?.bottom,
    triggerLeft: tr?.left,
    vw: innerWidth, vh: innerHeight,
  };
});
check(!!pop, '模型下拉 portal 直挂 body', pop ? `parent=${pop.parent}` : '未找到 body>[role=listbox].glass-pop');
if (pop) {
  check(pop.glassActive === 'true' || (pop.backdrop && pop.backdrop !== 'none'), '下拉真实折射或 CSS 材质生效', `active=${pop.glassActive} backdrop=${pop.backdrop} scene=${pop.sceneState}/${pop.sceneReason} surfaces=${pop.sceneSurfaces} surface=${JSON.stringify(pop.rect)} root=${JSON.stringify(pop.sceneRect)}`);
  check(!pop.blurAncestor, '下拉祖先链无 backdrop root');
  check(pop.rect.top >= pop.triggerBottom - 2, '下拉位于触发器下方', `pop.top=${pop.rect.top.toFixed(0)} trig.bottom=${pop.triggerBottom?.toFixed(0)}`);
  check(Math.abs(pop.rect.left - pop.triggerLeft) < 4, '下拉左缘与触发器对齐');
  check(pop.rect.left >= 0 && pop.rect.top >= 0 && pop.rect.left + pop.rect.w <= pop.vw && pop.rect.top + pop.rect.h <= pop.vh, '下拉不溢出视口');
}
await page.keyboard.press('Escape');
await sleep(300);
const afterModelClose = await page.evaluate(() => ({
  surfaces: Number(document.querySelector('.composer-shell').closest('[data-glass-state]').dataset.glassSurfaces),
  maps: Number(document.querySelector('.composer-shell').closest('[data-glass-state]').dataset.glassMaps),
}));
check(afterModelClose.surfaces === 0, '最终 CSS 路径不注册任何折射表面', JSON.stringify(afterModelClose));

/* ---------- 2) 气泡：user 最小宽度 3rem；头部行单行 ---------- */
const bubbles = await page.evaluate(() => {
  const list = document.querySelector('[aria-label="消息列表"]');
  return [...(list?.querySelectorAll('.row-surface') ?? [])].map((b) => {
    const header = b.querySelector(':scope > div > div');
    return {
      w: b.getBoundingClientRect().width,
      minWidth: getComputedStyle(b).minWidth,
      headerH: header?.getBoundingClientRect().height ?? 0,
      text: b.textContent.slice(0, 12),
    };
  });
});
const userBubble = bubbles[0]; // '好'
check(bubbles.length >= 2, '找到对话气泡', `count=${bubbles.length}`);
if (userBubble) check(userBubble.minWidth === '48px', 'user 气泡使用 3rem 最小宽度且短回复不折行', `min=${userBubble.minWidth} w=${userBubble.w.toFixed(0)} text=${userBubble.text}`);
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
    const host = gen.closest('[data-anchored-popover]') ?? gen.closest('.glass-pop');
    const hr = host?.getBoundingClientRect();
    const gr = gen.getBoundingClientRect();
    pill = {
      singleSurface: gen.classList.contains('glass') && !gen.closest('.glass-pop'),
      portalParent: host?.parentElement?.tagName,
      backdrop: getComputedStyle(gen.classList.contains('glass') ? gen : host).backdropFilter,
      glassActive: (gen.classList.contains('glass') ? gen : host)?.dataset.glassActive,
      hostRect: hr ? { top: hr.top, bottom: hr.bottom, left: hr.left, right: hr.right } : null,
      h: gr.height,
      centerX: gr.left + gr.width / 2,
      inShell: shell.contains(gen),
    };
  }
  const geometry = (element) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left, right: rect.right, width: rect.width, height: rect.height,
      radius: style.borderRadius, shape: style.cornerShape,
    };
  };
  const send = shell.querySelector('[aria-label="发送消息"]');
  const context = shell.querySelector('.ctx-ring');
  return {
    send: geometry(send),
    context: geometry(context),
    sendGap: send && context ? send.getBoundingClientRect().left - context.getBoundingClientRect().right : null,
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
  check(composer.send && Math.abs(composer.send.width - composer.send.height) <= 1
    && composer.send.radius === '50%'
    && !['squircle', 'superellipse(2)'].includes(composer.send.shape),
  '发送按钮为真正的圆形，不使用 squircle 方钮', JSON.stringify(composer.send));
  check(composer.context?.height === 32 && composer.context?.radius === '999px'
    && composer.sendGap >= 24,
  '上下文用量与思考同组，发送键独立靠右', JSON.stringify({ context: composer.context, sendGap: composer.sendGap }));
  check(!!composer.gen, 'Generate 胶囊出现');
  if (composer.gen) {
    check(composer.gen.singleSurface, 'Generate 按钮自身是唯一玻璃胶囊，无浮层壳套按钮');
    check(composer.gen.portalParent === 'BODY', 'Generate 胶囊 portal 直挂 body（模糊生效前提）', `parent=${composer.gen.portalParent}`);
    check(composer.gen.glassActive === 'true' || (composer.gen.backdrop && composer.gen.backdrop !== 'none'), 'Generate 胶囊真实折射或 CSS 材质生效', `active=${composer.gen.glassActive} backdrop=${composer.gen.backdrop}`);
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

/* ---------- 5) 液态玻璃焦点：内嵌边缘光，不使用普通外描边 ---------- */
await page.click('.composer-input');
const taAudit = await page.evaluate(() => {
  const el = document.activeElement;
  const shell = el.closest('.composer-shell');
  const frame = document.querySelector('.composer-focus-frame');
  const shellStyle = getComputedStyle(shell);
  const frameStyle = frame ? getComputedStyle(frame) : null;
  return {
    frameExists: !!frame,
    frameRadius: frameStyle?.borderRadius,
    frameShadow: frameStyle?.boxShadow,
    frameOutline: frameStyle?.outlineStyle,
    frameOverflow: frameStyle?.overflow,
    shellStyle: shellStyle.outlineStyle,
    shellShadow: shellStyle.boxShadow,
    inputStyle: getComputedStyle(el).outlineStyle,
  };
});
check(taAudit.frameExists && taAudit.frameRadius === '16px'
  && taAudit.frameOutline === 'none' && taAudit.frameOverflow === 'visible'
  && taAudit.shellShadow.includes('inset'),
'输入坞使用内嵌玻璃边缘光，不扩展布局', JSON.stringify(taAudit));
check(taAudit.shellStyle === 'none' && taAudit.inputStyle === 'none',
  '壳与 textarea 不绘制普通焦点描边', JSON.stringify(taAudit));
await page.keyboard.press('Tab'); // 真实键盘事件 → 下一控件 :focus-visible
const btnAudit = await page.evaluate(() => {
  const el = document.activeElement;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { name: el.getAttribute('aria-label') ?? el.className.slice(0, 24), style: cs.outlineStyle, shadow: cs.boxShadow, rect: { w: r.width, h: r.height } };
});
check(btnAudit.style === 'none' && btnAudit.shadow.includes('inset'),
  `${btnAudit.name} 使用内嵌玻璃焦点反馈`, JSON.stringify(btnAudit));

/* ---------- 6) 选择模式：复选框左对齐 + 首个图标与气泡顶对齐 ---------- */
await page.click('.composer-input');
await page.type('.composer-input', '保留草稿');
await page.evaluate(() => {
  document.querySelector('[aria-label="消息列表"] .row-surface')?.scrollIntoView({ block: 'center' });
});
await sleep(250);
await page.click('[aria-label="消息列表"] .row-surface', { button: 'right' });
await sleep(500);
const selAudit = await page.evaluate(() => {
  const boxes = [...document.querySelectorAll('.msg-in .checkbox')];
  if (!boxes.length) return null;
  const rows = [...document.querySelectorAll('.msg-in')];
  const lefts = boxes.map((b) => b.getBoundingClientRect().left);
  const cb = boxes[0].getBoundingClientRect();
  const bubbleElement = boxes[0].closest('.msg-in').querySelector('.row-surface');
  const bubble = bubbleElement.getBoundingClientRect();
  const selectedStyle = getComputedStyle(bubbleElement);
  const toolbar = document.querySelector('.selection-toolbar');
  const generate = [...document.querySelectorAll('button')]
    .find((button) => /Generate Response|生成回复/.test(button.textContent));
  const dock = document.querySelector('.composer-dock');
  return {
    toolbarParent: toolbar?.parentElement?.tagName,
    generateVisible: !!generate && generate.getBoundingClientRect().width > 0,
    dockVisibility: dock ? getComputedStyle(dock).visibility : null,
    selectedOutline: selectedStyle.outlineStyle,
    selectedShadow: selectedStyle.boxShadow,
    selectedBackground: selectedStyle.backgroundColor,
    count: boxes.length,
    leftSpread: Math.max(...lefts) - Math.min(...lefts),
    justify: getComputedStyle(rows[0]).justifyContent,
    firstTopDelta: cb.top - bubble.top, // 应 ≈ 气泡 padding-top(10px)
  };
});
check(!!selAudit && selAudit.count >= 3, '选择模式复选框出现', `count=${selAudit?.count}`);
if (selAudit) {
  check(selAudit.toolbarParent === 'BODY' && !selAudit.generateVisible && selAudit.dockVisibility === 'hidden',
    '选择模式使用唯一底部工具栏并隐藏 Generate/输入坞', JSON.stringify(selAudit));
  check(selAudit.selectedOutline === 'none' && selAudit.selectedShadow.includes('inset'),
    '气泡选中使用软底/内环，不外借键盘焦点语言', JSON.stringify(selAudit));
  check(selAudit.leftSpread <= 1.5, '复选框全部左侧对齐（漂移 ≤1.5px）', `spread=${selAudit.leftSpread.toFixed(1)}px`);
  check(['flex-start', 'flow-start'].includes(selAudit.justify), '选择模式行一律左起（用户气泡不右推复选框）', `justify=${selAudit.justify}`);
  check(selAudit.firstTopDelta >= 8 && selAudit.firstTopDelta <= 12, '首个复选框与气泡内容顶对齐', `Δ=${selAudit.firstTopDelta.toFixed(1)}px`);
}

/* ---------- 7) 内容列自适应：上限 52rem(832px)，气泡 ≤85% 列宽 ---------- */
const colAudit = await page.evaluate(() => {
  const col = document.querySelector('[aria-label="消息列表"] .message-column');
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
  check(colAudit.colMaxWidth === '832px', '内容列上限 52rem（832px）', `max=${colAudit.colMaxWidth}`);
  check(
    colAudit.bubbleWidth >= colAudit.colWidth * 0.84 && colAudit.bubbleWidth <= colAudit.colWidth * 0.85 + 1,
    '长文本气泡顶到 85% 列宽（随聊天区自适应）',
    `bubble=${colAudit.bubbleWidth.toFixed(0)} col=${colAudit.colWidth.toFixed(0)}`,
  );
}

/* ---------- 8) 气泡恒 ≤ 聊天区宽：列表无横向滚动条 ---------- */
const overflowAudit = await page.evaluate(() => {
  const list = document.querySelector('[aria-label="消息列表"]');
  const cs = getComputedStyle(list);
  return {
    clientW: list.clientWidth,
    scrollW: list.scrollWidth,
    hScrollbar: list.scrollWidth > list.clientWidth + 1,
    scrollPaddingTop: cs.scrollPaddingTop,
    scrollPaddingBottom: cs.scrollPaddingBottom,
  };
});
check(!overflowAudit.hScrollbar, '消息列表无横向滚动条', `scroll=${overflowAudit.scrollW} client=${overflowAudit.clientW}`);
check(overflowAudit.scrollPaddingTop === '80px' && overflowAudit.scrollPaddingBottom === '176px',
  '滚动安全区避开浮动顶栏与输入坞',
  `${overflowAudit.scrollPaddingTop}/${overflowAudit.scrollPaddingBottom}`);

/* ---------- 9) 统计默认紧凑，完整详情可展开且无图标堆叠 ---------- */
const statsAudit = await page.evaluate(() => {
  const stats = document.querySelector('.message-stats');
  if (!stats) return null;
  const summary = stats.querySelector('summary');
  const before = summary?.innerText ?? '';
  stats.open = true;
  return { before, after: stats.innerText, svgCount: stats.querySelectorAll('svg').length };
});
check(!!statsAudit && /tok\/s/.test(statsAudit.before) && /tokens/.test(statsAudit.before),
  '统计摘要仅保留速率与 tokens', statsAudit?.before);
if (statsAudit) {
  check(/TTFT/.test(statsAudit.after) && /总用时/.test(statsAudit.after) && /结束原因/.test(statsAudit.after),
    '完整统计可通过 details 展开');
  check(statsAudit.svgCount === 0, '统计行不再堆叠五组图标');
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
const restoredComposer = await page.evaluate(() => ({
  draft: document.querySelector('.composer-input')?.value,
  visibility: getComputedStyle(document.querySelector('.composer-dock')).visibility,
}));
check(restoredComposer.draft === '保留草稿' && restoredComposer.visibility === 'visible',
  '退出选择模式恢复输入坞并保留草稿', JSON.stringify(restoredComposer));
const userAlign = await page.evaluate(() => {
  const col = document.querySelector('[aria-label="消息列表"] .message-column');
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

/* ---------- @req REQ-2026-006 Track C：临时表面生命周期与双层缩放 ---------- */
const glassProbeCycles = Number(process.env.EASYUI_GLASS_PROBE_CYCLES ?? '30');
for (let cycle = 0; cycle < glassProbeCycles; cycle++) {
  await page.click('[aria-label="选择模型"]');
  await sleep(300);
  await page.keyboard.press('Escape');
  await sleep(180);
  const counts = await page.evaluate(() => ({
    surfaces: Number(document.querySelector('.composer-shell').closest('[data-glass-state]').dataset.glassSurfaces),
    pixels: Number(document.querySelector('.composer-shell').closest('[data-glass-state]').dataset.glassMapPixels),
  }));
  if (counts.surfaces !== 0 || counts.pixels > 4_000_000) {
    check(false, `第 ${cycle + 1} 次模型开关后表面/像素恢复`, JSON.stringify(counts));
    break;
  }
  if (cycle === glassProbeCycles - 1) check(true, `${glassProbeCycles} 次模型开关后表面数量恢复且像素不越界`, JSON.stringify(counts));
}

for (const zoom of [0.5, 2.5]) {
  await page.evaluate((value) => {
    document.documentElement.style.zoom = String(value);
    document.documentElement.style.setProperty('--app-zoom', String(value));
  }, zoom);
  await page.evaluate(() => document.querySelector('[aria-label="选择模型"]').click());
  await sleep(500);
  const geometry = await page.evaluate(() => {
    const el = document.querySelector('body > [role="listbox"]');
    const scene = document.querySelector('.composer-shell').closest('[data-glass-state]');
    if (!el) return { missing: true, state: scene?.dataset.glassState, reason: scene?.dataset.glassReason, vw: innerWidth, vh: innerHeight };
    const r = el.getBoundingClientRect();
    const trigger = document.querySelector('[aria-label="选择模型"]').getBoundingClientRect();
    const sr = scene?.getBoundingClientRect();
    const failures = [...document.querySelectorAll('[data-glass-error]')].map((node) => ({ role: node.dataset.glassRole, error: node.dataset.glassError }));
    return { active: el?.dataset.glassActive, backdrop: el ? getComputedStyle(el).backdropFilter : null, state: scene?.dataset.glassState, reason: scene?.dataset.glassReason, failures, sceneRect: sr ? { left: sr.left, top: sr.top, right: sr.right, bottom: sr.bottom } : null, left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight, triggerLeft: trigger.left, styleLeft: el?.style.left, styleTop: el?.style.top };
  });
  check(geometry.active !== 'true' && geometry.backdrop !== 'none' && geometry.left >= -1 && geometry.top >= -1
    && geometry.right <= geometry.vw + 1 && geometry.bottom <= geometry.vh + 1,
  `应用缩放 ${zoom * 100}% 临时折射几何一致`, JSON.stringify(geometry));
  await page.keyboard.press('Escape');
  await sleep(180);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
    document.documentElement.style.removeProperty('--app-zoom');
  });
}
const cdp = await page.createCDPSession();
for (const scale of [0.67, 2]) {
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: scale });
  await page.evaluate(() => document.querySelector('[aria-label="选择模型"]').click());
  await sleep(500);
  const geometry = await page.evaluate(() => {
    const el = document.querySelector('body > [role="listbox"]');
    const scene = document.querySelector('.composer-shell').closest('[data-glass-state]');
    if (!el) return { missing: true, state: scene?.dataset.glassState, reason: scene?.dataset.glassReason, vw: innerWidth, vh: innerHeight };
    const r = el.getBoundingClientRect();
    return { active: el?.dataset.glassActive, backdrop: el ? getComputedStyle(el).backdropFilter : null, state: scene?.dataset.glassState, reason: scene?.dataset.glassReason, left: r.left, top: r.top, right: r.right, bottom: r.bottom, vw: innerWidth, vh: innerHeight };
  });
  check(geometry.active !== 'true' && geometry.backdrop !== 'none' && geometry.left >= -1 && geometry.top >= -1
    && geometry.right <= geometry.vw + 1 && geometry.bottom <= geometry.vh + 1,
  `浏览器缩放 ${scale * 100}% 临时折射几何一致`, JSON.stringify(geometry));
  await page.keyboard.press('Escape');
  await sleep(180);
}
await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });

await page.evaluate(() => {
  [...document.querySelectorAll('button')].find((b) => /Generate Response|生成回复/.test(b.textContent))?.click();
});
await sleep(300);
const generateLifecycle = await page.evaluate(() => ({
  surfaces: Number(document.querySelector('.composer-shell').closest('[data-glass-state]').dataset.glassSurfaces),
  generating: !!document.querySelector('[aria-label="停止生成"]'),
  mask: getComputedStyle(document.querySelector('[aria-label="消息列表"]')).maskImage,
}));
check(generateLifecycle.surfaces === 0 && generateLifecycle.generating,
  '最终 CSS 路径在 Generate 启动后仍保持零折射表面', JSON.stringify(generateLifecycle));
check(generateLifecycle.mask === 'none', '流式期间关闭滚动渐隐以降低重算成本', generateLifecycle.mask);
if (generateLifecycle.generating) await page.click('[aria-label="停止生成"]');
await sleep(250);

/* ---------- @req REQ-2026-006 Track B：光学层、模糊预算与偏好降级 ---------- */
const opticsAudit = await page.evaluate(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };
  const blurred = [...document.querySelectorAll('body *')].filter((el) =>
    visible(el) && getComputedStyle(el).backdropFilter !== 'none');
  const surfaces = [...document.querySelectorAll('.glass-optics')].filter(visible);
  return {
    blurCount: blurred.length,
    surfaces: surfaces.map((el) => ({
      beforePointer: getComputedStyle(el, '::before').pointerEvents,
      afterPointer: getComputedStyle(el, '::after').pointerEvents,
      beforeFilter: getComputedStyle(el, '::before').backdropFilter,
      afterFilter: getComputedStyle(el, '::after').backdropFilter,
    })),
  };
});
check(opticsAudit.blurCount <= 5, 'Track B 同屏玻璃模糊层 ≤5', `count=${opticsAudit.blurCount}`);
check(opticsAudit.surfaces.length > 0, 'Track B 光学表面存在', `count=${opticsAudit.surfaces.length}`);
check(opticsAudit.surfaces.every((s) => s.beforePointer === 'none' && s.afterPointer === 'none'),
  '光学伪元素不拦截指针');
check(opticsAudit.surfaces.every((s) => s.beforeFilter === 'none' && s.afterFilter === 'none'),
  '边缘环不新增 backdrop-filter');

await page.hover('.composer-shell');
await sleep(250);
const highlightAudit = await page.evaluate(() => {
  const el = document.querySelector('.composer-highlight');
  const cs = getComputedStyle(el);
  return { opacity: cs.opacity, transform: cs.transform, pointer: cs.pointerEvents };
});
check(Number(highlightAudit.opacity) > 0 && highlightAudit.transform !== 'none',
  '输入坞指针高光通过 transform/opacity 激活', `${highlightAudit.opacity}/${highlightAudit.transform}`);
check(highlightAudit.pointer === 'none', '输入坞高光层不拦截指针');
await page.type('.composer-input', 'x');
await sleep(50);
const inputHighlight = await page.evaluate(() => getComputedStyle(document.querySelector('.composer-highlight')).opacity);
check(Number(inputHighlight) === 0, '输入与高度变化时暂缓高光', inputHighlight);
await sleep(220);
const settledHighlight = await page.evaluate(() => getComputedStyle(document.querySelector('.composer-highlight')).opacity);
check(Number(settledHighlight) > 0, '静止后恢复指针高光', settledHighlight);

const fadeStart = await page.evaluate(() => {
  const list = document.querySelector('[aria-label="消息列表"]');
  list.scrollTop = 0;
  list.dispatchEvent(new Event('scroll'));
  return { top: list.dataset.fadeTop, bottom: list.dataset.fadeBottom, mask: getComputedStyle(list).maskImage };
});
check(fadeStart.top === 'false' && fadeStart.bottom === 'true', '滚动起点只显示下缘渐隐',
  `${fadeStart.top}/${fadeStart.bottom}`);
const fadeEnd = await page.evaluate(() => {
  const list = document.querySelector('[aria-label="消息列表"]');
  list.scrollTop = list.scrollHeight;
  list.dispatchEvent(new Event('scroll'));
  return { top: list.dataset.fadeTop, bottom: list.dataset.fadeBottom, mask: getComputedStyle(list).maskImage };
});
check(fadeEnd.top === 'true' && fadeEnd.bottom === 'false', '滚动终点只显示上缘渐隐',
  `${fadeEnd.top}/${fadeEnd.bottom}`);
const fadeFocus = await page.evaluate(() => {
  const list = document.querySelector('[aria-label="消息列表"]');
  list.querySelector('button')?.focus();
  return { focused: list.matches(':focus-within'), mask: getComputedStyle(list).maskImage };
});
check(fadeFocus.focused && fadeFocus.mask === 'none', '列表内焦点出现时移除渐隐', fadeFocus.mask);
await page.evaluate(() => document.activeElement?.blur());

await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await page.mouse.move(0, 0);
await sleep(100);
const reducedMotion = await page.evaluate(() => getComputedStyle(document.querySelector('.composer-highlight')).display);
check(reducedMotion === 'none', 'reduced motion 移除高光跟随层', reducedMotion);

await page.emulateMediaFeatures([
  { name: 'prefers-reduced-motion', value: 'no-preference' },
  { name: 'prefers-reduced-transparency', value: 'reduce' },
]);
await sleep(100);
const reducedTransparency = await page.evaluate(() => ({
  backdrop: getComputedStyle(document.querySelector('.composer-shell')).backdropFilter,
  optics: getComputedStyle(document.querySelector('.composer-shell'), '::before').display,
  mask: getComputedStyle(document.querySelector('[aria-label="消息列表"]')).maskImage,
}));
check(reducedTransparency.backdrop === 'none' && reducedTransparency.optics === 'none'
  && reducedTransparency.mask === 'none', 'reduced transparency 移除模糊与装饰光学层',
  JSON.stringify(reducedTransparency));

await page.emulateMediaFeatures([
  { name: 'prefers-reduced-transparency', value: 'no-preference' },
  { name: 'forced-colors', value: 'active' },
]);
await sleep(100);
const forcedColors = await page.evaluate(() => ({
  active: matchMedia('(forced-colors: active)').matches,
  optics: getComputedStyle(document.querySelector('.composer-shell'), '::before').display,
  border: getComputedStyle(document.querySelector('.composer-shell')).borderTopColor,
  mask: getComputedStyle(document.querySelector('[aria-label="消息列表"]')).maskImage,
}));
check(forcedColors.active && forcedColors.optics === 'none' && forcedColors.mask === 'none',
  'forced colors 移除装饰并保留实体边界', JSON.stringify(forcedColors));
check(forcedColors.border !== 'rgba(0, 0, 0, 0)', 'forced colors 表面边界可见', forcedColors.border);

await browser.close();
server.close();
if (fails.length) {
  console.log(`\n${fails.length} 项失败: ${fails.join(' | ')}`);
  process.exit(1);
}
console.log('\nALL_CHECKS_PASS');
