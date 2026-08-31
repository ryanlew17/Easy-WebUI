/**
 * Easy WebUI — 临时浏览器验证脚本（不进交付依赖树的运行时路径）。
 * 用系统 Edge 无头模式走通核心流程并截图到 docs/screenshots/。
 * 前提：vite dev server 已在 5173 端口运行（由外层命令起停）。
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.E2E_BASE ?? 'http://localhost:5173/';
const OUT = 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

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

// 固定首启语言/主题（模拟中文用户 Cookie 偏好），保证选择器确定性
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

/** 点击“文本完全相等”的可见元素；无精确匹配时回退到“包含该文本的最短可见按钮/元素” */
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

/** 在指定 aria-label 的 role="group" 内点击精确文本按钮（用于消歧同名选项，如主题/代码块背景各有"深色"） */
const clickInGroup = (groupLabel, text) =>
  page.evaluate(
    ([g, t]) => {
      const group = document.querySelector('[role="group"][aria-label="' + g + '"]');
      if (!group) return false;
      const hit = [...group.querySelectorAll('button')].find(
        (el) => el.textContent.trim() === t,
      );
      if (!hit) return false;
      hit.click();
      return true;
    },
    [groupLabel, text],
  );

const must = (ok, what) => {
  if (!ok) throw new Error(`未找到可点击元素: ${what}`);
  console.log(`click: ${what}`);
};

try {
  // 1. 首屏：无平台引导空状态（交错入场动画完成后截图）
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);
  await shot('01-welcome-empty');

  // 2. 空态 CTA 直达设置页
  must(await clickExact('添加第一个模型平台'), '空态CTA');
  await sleep(700);
  await shot('02-settings-providers-empty');

  // 3. 新增平台 → 预置供应商
  must(await clickExact('新增平台'), '新增平台');
  await sleep(600);
  await shot('03-provider-modal-presets');

  // 4. 选 DeepSeek 预置 → 检测模型列表 → 全选 → 确认 → 保存
  must(await clickExact('DeepSeek'), '预置 DeepSeek');
  await sleep(300);
  must(await clickExact('检测模型列表'), '检测模型列表');
  await sleep(1800);
  await shot('04-fetch-models');
  must(await clickExact('全选'), '全选');
  must(await clickExact('确认'), '确认勾选');
  await sleep(300);
  must(await clickExact('保存平台'), '保存平台');
  await sleep(900);
  await shot('05-provider-saved');

  // 5. 平台卡片：全部检测（mock 随机延迟 300~900ms × N，并发 4）
  must(await clickExact('全部检测'), '全部检测');
  await sleep(3500);
  await shot('06-test-all-results');

  // 6. 返回会话页 → 新建会话 → 选模型
  must(await clickAria('返回会话页'), '返回会话页');
  await sleep(600);
  must(await clickExact('新建会话'), '新建会话');
  await sleep(600);
  must(await clickAria('选择模型'), '模型选择器');
  await sleep(500);
  await shot('07-model-picker');
  const picked = await page.evaluate(() => {
    const opt = document.querySelector('[role="option"]');
    if (!opt) return false;
    opt.click();
    return true;
  });
  must(picked, '第一个模型选项');
  await sleep(400);

  // 7. 发送消息 → 流式（typing 指示器 → 增量渲染）
  await page.click('[aria-label="消息输入区"]');
  await page.type('[aria-label="消息输入区"]', '你好，请用 Markdown 展示一段代码和一个表格。');
  must(await clickAria('发送消息'), '发送消息');
  await sleep(1500);
  await shot('08-streaming');
  // 等生成结束（停止按钮消失）
  await page.waitForFunction(
    () => !document.querySelector('[aria-label="停止生成"]'),
    { timeout: 30000 },
  );
  await sleep(400);
  await shot('09-chat-done-params');

  // 7a. ⓘ 悬停浮窗：点击第一个 ⓘ（钉住态）→ role="tooltip" 玻璃浮层出现；Esc 关闭
  const tipClicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(
      (el) => el.textContent.trim() === 'ⓘ',
    );
    if (!btn) return false;
    btn.click();
    return true;
  });
  must(tipClicked, 'ⓘ InfoTip 按钮');
  await sleep(350);
  const tipVisible = await page.evaluate(() => {
    const tip = document.querySelector('[role="tooltip"]');
    if (!tip) return false;
    const r = tip.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (!tipVisible) throw new Error('ⓘ 点击后浮窗 tooltip 未出现');
  await shot('09b-infotip');
  await page.keyboard.press('Escape');
  await sleep(250);
  const tipGone = await page.evaluate(() => !document.querySelector('[role="tooltip"]'));
  if (!tipGone) throw new Error('Esc 后浮窗 tooltip 未关闭');
  console.log('infotip: pin/tooltip/esc OK');

  // 8. 设置 → 通用 → 深色主题 → English
  must(await clickAria('打开设置'), '打开设置');
  await sleep(600);
  must(await clickExact('通用'), '通用标签');
  await sleep(400);

  // 8a. 界面缩放回归：拖拽稳定性（增量滑块不应失控至极值）+ −/＋ 按钮按 10% 步进
  const readZoom = () =>
    page.evaluate(() => parseFloat(document.documentElement.style.zoom || '1'));
  const sliderSel = '[role="slider"][aria-label="界面缩放"]';
  await page.waitForSelector(sliderSel, { timeout: 5000 });
  const startZoom = await readZoom();
  if (Math.abs(startZoom - 1) > 1e-6) throw new Error(`初始缩放应为 1，实际 ${startZoom}`);
  const box = await (await page.$(sliderSel)).boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // 从轨道中点按下（跳转到 ~150%），再缓慢右拖 +40px（分 8 步、每步留时间让 React 重渲染，
  // 复现「实时缩放改变轨道几何」场景；旧原生滑块在此场景会被放大反馈推到 250%）
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(cx + i * 5, cy);
    await sleep(60);
  }
  const midDragZoom = await readZoom(); // 拖拽中读取，验证实时预览仍在生效
  await page.mouse.up();
  await sleep(400);
  const afterDragZoom = await readZoom();
  console.log(`zoom: drag ${startZoom} → mid ${midDragZoom} → up ${afterDragZoom}`);
  if (afterDragZoom >= 2.5 || afterDragZoom <= 0.5)
    throw new Error(`拖拽失控至极值: ${afterDragZoom}`);
  if (afterDragZoom < 1.5 || afterDragZoom > 2.3)
    throw new Error(`拖拽结果超出预期区间 [1.5, 2.3]: ${afterDragZoom}`);
  if (Math.abs(midDragZoom - afterDragZoom) > 0.2)
    throw new Error(`拖拽中无实时预览或突变: mid=${midDragZoom} up=${afterDragZoom}`);
  // ＋ 按钮：+10%
  must(await clickAria('增大缩放'), '增大缩放按钮');
  await sleep(250);
  const plusZoom = await readZoom();
  if (Math.abs(plusZoom - (afterDragZoom + 0.1)) > 1e-6)
    throw new Error(`＋按钮步进错误: ${afterDragZoom} → ${plusZoom}`);
  // − 按钮连点回 100%（步长 10%，次数由当前值推出，不依赖固定次数）
  for (let i = 0; i < 20; i++) {
    const z = await readZoom();
    if (Math.abs(z - 1) < 1e-6) break;
    must(await clickAria('减小缩放'), '减小缩放按钮');
    await sleep(120);
  }
  const restoredZoom = await readZoom();
  if (Math.abs(restoredZoom - 1) > 1e-6)
    throw new Error(`−按钮未能回到 100%: ${restoredZoom}`);
  console.log('zoom: drag-stable & ±10% buttons OK');

  // 8b. 字号设置：界面字号输入 18 → html font-size 即时生效；✕ 重置回默认
  await page.click('[aria-label="界面字号"]');
  await page.type('[aria-label="界面字号"]', '18');
  await page.keyboard.press('Enter');
  await sleep(350);
  const uiSize = await page.evaluate(() => document.documentElement.style.fontSize);
  if (uiSize !== '18px') throw new Error(`界面字号未生效: "${uiSize}"`);
  const resetClicked = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="重置为默认字号"]');
    if (!btn) return false;
    btn.click();
    return true;
  });
  must(resetClicked, '字号 ✕ 重置按钮');
  await sleep(350);
  const uiSizeAfter = await page.evaluate(() => document.documentElement.style.fontSize);
  if (uiSizeAfter !== '') throw new Error(`字号重置失败: "${uiSizeAfter}"`);
  console.log('font-size: set 18px → reset OK');

  must(await clickInGroup('主题', '深色'), '深色主题');
  await sleep(500);
  must(await clickExact('English'), '切换英文');
  await sleep(700);
  await shot('10-general-dark-en');

  // 8c. 关于页（web 预览）：在线升级卡为桌面独占禁用态
  must(await clickExact('About'), '关于标签');
  await sleep(600);
  const aboutState = await page.evaluate(() => {
    const hasUpdateCard = !!document.querySelector('[aria-label="Online updates"]') ||
      [...document.querySelectorAll('h3')].some((h) => h.textContent.includes('Online updates'));
    const checkBtn = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Check for updates',
    );
    return {
      hasUpdateCard,
      checkDisabled: checkBtn ? checkBtn.disabled : null,
      hasVersion: [...document.querySelectorAll('p,span,td')].some((el) =>
        el.textContent.includes('0.1.1'),
      ),
    };
  });
  if (!aboutState.hasUpdateCard) throw new Error('关于页缺少在线升级卡');
  if (aboutState.checkDisabled !== true) throw new Error('web 预览下检查更新按钮应为禁用态');
  if (!aboutState.hasVersion) throw new Error('关于页未显示 0.1.1 版本号');
  await shot('11-about-dark-en');
  console.log('about: version card & electron-only update card OK');

  // 9. 备份管理（英文深色下）
  must(await clickExact('Backup'), '备份标签');
  await sleep(500);
  await shot('12-backup-dark-en');

  // 10. 回到会话页看深色英文聊天气泡
  must(await clickAria('Back to chat'), '返回会话页(EN)');
  await sleep(800);
  await shot('13-chat-dark-en');

  console.log('FLOW_OK');
} catch (e) {
  errors.push(`flow: ${e.message}`);
  try {
    await shot('99-failure');
  } catch {}
}

await browser.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('E2E_CLEAN');
