/**
 * Easy WebUI — UI/动效改造走查脚本（feat/ui-motion-overhaul）。
 * 复用 e2e-preview.mjs 的 harness（puppeteer-core + 系统 Edge 无头 + vite dev server 5173）。
 * 产出 docs/screenshots/20-ui-*.png ~ 27-ui-*.png，并对 InfoTip 做视口内几何断言
 * （zoom=1 与 zoom=2 两档，回归右缘溢出 bug）。
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

/* 进程内静态服务器服务 dist/（避免常驻 dev server；脚本退出即释放端口） */
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
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/`;
console.log(`serving dist/ at ${BASE}`);

const errors = [];
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

await page.evaluateOnNewDocument(() => {
  document.cookie =
    'easyui_prefs=' +
    encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN' })) +
    ';path=/;max-age=31536000;SameSite=Lax';
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot: ${name}`);
};

const clickExact = (text) =>
  page.evaluate((t) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const els = [...document.querySelectorAll('button, [role="tab"]')].filter(visible);
    let hit = els.filter((el) => el.textContent.trim() === t);
    if (hit.length === 0) {
      hit = els
        .filter((el) => el.textContent.trim().includes(t))
        .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
    }
    if (hit.length === 0) return false;
    hit[0].click();
    return true;
  }, text);

const clickAria = (label) =>
  page.evaluate((l) => {
    const el = document.querySelector('[aria-label="' + l + '"]');
    if (!el) return false;
    el.click();
    return true;
  }, label);

const must = (ok, what) => {
  if (!ok) throw new Error(`未找到可点击元素: ${what}`);
  console.log(`click: ${what}`);
};

/** 在右栏参数面板钉住一个 ⓘ 并断言 tooltip 完整落在视口内，返回其矩形 */
const pinInfoTipAndAssert = async (tag) => {
  const clicked = await page.evaluate(() => {
    const panel = [...document.querySelectorAll('h2')].find(
      (h) => h.textContent.trim() === '会话参数',
    );
    if (!panel) return false;
    const col = panel.closest('.relative.flex');
    if (!col) return false;
    const btn = [...col.querySelectorAll('button')].find((el) => el.textContent.trim() === 'ⓘ');
    if (!btn) return false;
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return true;
  });
  must(clicked, `ⓘ InfoTip（${tag}）`);
  await sleep(400); // 入场动画 150ms + rAF 二次测量
  const geo = await page.evaluate(() => {
    const tip = document.querySelector('[role="tooltip"]');
    if (!tip) return null;
    const r = tip.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, iw: window.innerWidth, ih: window.innerHeight };
  });
  if (!geo) throw new Error(`tooltip 未出现（${tag}）`);
  const eps = 1.5;
  if (geo.left < -eps || geo.top < -eps || geo.right > geo.iw + eps || geo.bottom > geo.ih + eps) {
    throw new Error(
      `tooltip 溢出视口（${tag}）: ${JSON.stringify(geo)}`,
    );
  }
  console.log(`infotip-in-viewport OK（${tag}）: ${JSON.stringify(geo)}`);
  return geo;
};

try {
  // 1. 首屏 → 空态 CTA → 新增平台 → DeepSeek 预置 → 检测 → 全选 → 保存
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);
  must(await clickExact('添加第一个模型平台'), '空态CTA');
  await sleep(700);
  must(await clickExact('新增平台'), '新增平台');
  await sleep(500);
  must(await clickExact('DeepSeek'), '预置 DeepSeek');
  await sleep(300);
  must(await clickExact('检测模型列表'), '检测模型列表');
  await sleep(1800);
  must(await clickExact('全选'), '全选');
  must(await clickExact('确认'), '确认勾选');
  await sleep(300);
  must(await clickExact('保存平台'), '保存平台');
  await sleep(400);
  // 保存成功 toast（4.5s 生命周期内截图）
  await shot('26-ui-toast');

  // 2. 设置页 light（平台管理 tab 当前已有内容）
  await sleep(800);
  await shot('22-ui-settings-light');

  // 3. 回会话页 → 新建会话 → 选模型 → 发消息 → 等生成完成
  must(await clickAria('返回会话页'), '返回会话页');
  await sleep(700);
  must(await clickExact('新建会话'), '新建会话');
  await sleep(600);
  must(await clickAria('选择模型'), '模型选择器');
  await sleep(500);
  const picked = await page.evaluate(() => {
    const opt = document.querySelector('[role="option"]');
    if (!opt) return false;
    opt.click();
    return true;
  });
  must(picked, '第一个模型选项');
  await sleep(400);
  await page.click('[aria-label="消息输入区"]');
  await page.type('[aria-label="消息输入区"]', '你好，请用 Markdown 展示一段代码和一个表格。');
  must(await clickAria('发送消息'), '发送消息');
  await page.waitForFunction(() => !document.querySelector('[aria-label="停止生成"]'), {
    timeout: 30000,
  });
  await sleep(500);
  await shot('20-ui-chat-light');

  // 4. 打开预设下拉（玻璃浮层新视觉）
  must(await clickAria('选择预设'), '预设下拉');
  await sleep(400);
  await shot('24-ui-dropdown-pop');
  await page.keyboard.press('Escape');
  await sleep(350);

  // 5. InfoTip：右栏右缘场景，zoom=1 几何断言
  await pinInfoTipAndAssert('zoom=1 右栏');
  await shot('25-ui-infotip-rightedge');
  await page.keyboard.press('Escape');
  await sleep(300);

  // 6. InfoTip：zoom=200%（应用同款 CSS zoom + 补偿变量）几何断言
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
    document.documentElement.style.setProperty('--app-zoom', '2');
  });
  await sleep(400);
  await pinInfoTipAndAssert('zoom=2 右栏');
  await shot('27-ui-infotip-zoom200');
  await page.keyboard.press('Escape');
  await sleep(300);
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
    document.documentElement.style.removeProperty('--app-zoom');
  });
  await sleep(400);

  // 7. 深色主题：设置页 + 聊天页
  must(await clickAria('打开设置'), '打开设置');
  await sleep(700);
  must(await clickExact('通用'), '通用标签');
  await sleep(500);
  const darkClicked = await page.evaluate(() => {
    const group = document.querySelector('[role="group"][aria-label="主题"]');
    if (!group) return false;
    const hit = [...group.querySelectorAll('button')].find((el) => el.textContent.trim() === '深色');
    if (!hit) return false;
    hit.click();
    return true;
  });
  must(darkClicked, '深色主题');
  await sleep(600);
  await shot('23-ui-settings-dark');
  must(await clickAria('返回会话页'), '返回会话页(dark)');
  await sleep(800);
  await shot('21-ui-chat-dark');

  console.log('FLOW_OK');
} catch (e) {
  errors.push(`flow: ${e.message}`);
  try {
    await shot('99-ui-failure');
  } catch {}
}

await browser.close();
server.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('E2E_CLEAN');
