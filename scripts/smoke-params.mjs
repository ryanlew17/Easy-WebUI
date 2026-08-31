/**
 * 模型参数+预设系统的临时冒烟脚本（不进交付依赖树）。
 * 自起 dev server（5181/strictPort）→ Edge 无头走通：
 *   建平台→建会话→参数面板五个块→改温度出高亮点→垃圾桶重置→
 *   另存为预设→设置页预设 Tab→恢复出厂默认。
 * 结束时主动杀掉 dev server 进程树。
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';

const NPM = 'C:/Users/Ryan/AppData/Roaming/kimi-desktop/daimon-share/daimon/command-process-owner/bin/npm.cmd';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 5181;
const BASE = `http://localhost:${PORT}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- dev server 生命周期 ---------- */
const dev = spawn(NPM, ['run', 'dev', '--', '--port', String(PORT), '--strictPort'], {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let devLog = '';
dev.stdout.on('data', (d) => (devLog += d));
dev.stderr.on('data', (d) => (devLog += d));

async function killDev() {
  try {
    spawn('taskkill', ['/PID', String(dev.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  } catch {}
  await sleep(500);
}

async function waitForServer(timeoutMs = 40000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error(`dev server 未在 ${timeoutMs}ms 内就绪\n${devLog.slice(-2000)}`);
}

/* ---------- 页面工具 ---------- */
const errors = [];
let page;

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
  console.log(`ok: ${what}`);
};

const setInputValue = (selector, value) =>
  page.evaluate(
    (sel, v) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    selector,
    value,
  );

const dotCount = () => page.evaluate(() => document.querySelectorAll('.param-dot').length);

try {
  await waitForServer();
  console.log('ok: dev server 就绪');

  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1'],
  });
  page = await browser.newPage();
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

  // 1. 建平台（DeepSeek 预置 + mock 检测模型 + 全选保存）
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1000);
  must(await clickExact('添加第一个模型平台'), '空态CTA');
  await sleep(600);
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
  await sleep(900);

  // 2. 建会话 + 选模型
  must(await clickAria('返回会话页'), '返回会话页');
  await sleep(600);
  must(await clickExact('新建会话'), '新建会话');
  await sleep(600);
  must(await clickAria('选择模型'), '模型选择器');
  await sleep(400);
  must(
    await page.evaluate(() => {
      const opt = document.querySelector('[role="option"]');
      if (!opt) return false;
      opt.click();
      return true;
    }),
    '第一个模型选项',
  );
  await sleep(500);

  // 3. 参数面板五个块标题存在
  for (const title of ['预设', '系统提示词', '设置', '采样', '结构化输出']) {
    const found = await page.evaluate((t) => {
      return [...document.querySelectorAll('.param-block-title')].some(
        (el) => el.textContent.trim() === t,
      );
    }, title);
    must(found, `参数块「${title}」`);
  }

  // 4. 改温度 → 高亮圆点出现（override 生效）
  must(await setInputValue('input[aria-label="温度 value"]', '0.5'), '温度数字输入框');
  await sleep(800);
  const dotsAfterEdit = await dotCount();
  if (dotsAfterEdit < 1) throw new Error('改温度后未出现高亮圆点');
  console.log(`ok: 温度 override 高亮圆点 ×${dotsAfterEdit}`);

  // 5. 垃圾桶重置 → 圆点消失（等值修剪/删键）
  must(await clickAria('重置为预设值'), '温度垃圾桶');
  await sleep(800);
  const dotsAfterReset = await dotCount();
  if (dotsAfterReset !== 0) throw new Error(`重置后仍有 ${dotsAfterReset} 个圆点`);
  console.log('ok: 垃圾桶重置后高亮消失');

  // 6. 另存为新预设（当前生效参数快照）
  must(await clickAria('另存为新预设'), '另存为按钮');
  await sleep(300);
  must(await setInputValue('input[placeholder="预设名称…"]', '冒烟预设'), '预设名输入框');
  await page.evaluate(() => {
    const el = document.querySelector('input[placeholder="预设名称…"]');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await sleep(800);
  const savedToast = await page.evaluate(() => document.body.textContent.includes('已保存预设'));
  if (!savedToast) throw new Error('未出现「已保存预设」toast');
  console.log('ok: 另存为预设 toast');
  const selectHasNew = await page.evaluate(() =>
    [...document.querySelectorAll('.param-block select option')].some(
      (o) => o.textContent.trim() === '冒烟预设',
    ),
  );
  if (!selectHasNew) throw new Error('预设下拉中无「冒烟预设」');
  console.log('ok: 预设下拉含新预设');

  // 7. 设置 → 预设 Tab：全局预设编辑 + 恢复出厂默认
  must(await clickAria('打开设置'), '打开设置');
  await sleep(600);
  must(await clickExact('预设'), '预设标签');
  await sleep(600);
  const hasGlobal = await page.evaluate(() => document.body.textContent.includes('全局预设'));
  if (!hasGlobal) throw new Error('预设 Tab 未见「全局预设」');
  console.log('ok: 设置页预设 Tab 渲染全局预设');
  must(await clickAria('恢复出厂默认'), '恢复出厂默认按钮');
  await sleep(400);
  // ConfirmDialog 里确认按钮与区块按钮同文案，点最后一个（对话框后渲染）
  await page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const hits = [...document.querySelectorAll('button')].filter(
      (el) => visible(el) && el.textContent.trim() === '恢复出厂默认',
    );
    if (hits.length > 0) hits[hits.length - 1].click();
  });
  await sleep(800);
  const resetToast = await page.evaluate(() => document.body.textContent.includes('已恢复出厂默认'));
  if (!resetToast) throw new Error('未出现「已恢复出厂默认」toast');
  console.log('ok: 恢复出厂默认 toast');

  await browser.close();
  console.log('SMOKE_OK');
} catch (e) {
  errors.push(`flow: ${e.message}`);
} finally {
  await killDev();
}

if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('SMOKE_CLEAN');
