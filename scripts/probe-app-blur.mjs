/* 视觉探针：驱动真实安装版 Easy WebUI，打开下拉/弹窗截图，验证 backdrop-filter 是否生效（只读，不写数据）。 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build', 'e2e-shots'); // 走查探针截图不入库，docs/screenshots 仅保留 README 精选图
const EXE = 'C:/Users/Ryan/AppData/Local/Programs/easy-webui/Easy WebUI.exe';
const DEBUG_URL = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EXE, ['--remote-debugging-port=9333'], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

async function waitEndpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${DEBUG_URL}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('调试端口未就绪\n' + log.slice(-2000));
}

try {
  await waitEndpoint();
  const browser = await puppeteer.connect({ browserURL: DEBUG_URL, defaultViewport: null });
  let page = null;
  for (let i = 0; i < 40; i++) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes('index.html'));
    if (page) break;
    await sleep(500);
  }
  if (!page) throw new Error('未找到应用页面');
  await page.waitForFunction(() => window.easyui !== undefined, { timeout: 20000 });
  await sleep(1500);

  const zoom = await page.evaluate(() => document.documentElement.style.zoom || '(unset)');
  const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('zoom =', zoom, '| theme =', theme);

  // 1) 聊天页模型选择器下拉（悬浮于消息区上方）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => x.getAttribute('aria-haspopup') === 'listbox');
    if (b) b.click();
  });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, 'probe-app-modelpicker.png') });
  await page.keyboard.press('Escape');
  await sleep(400);

  // 2) 会话参数面板的选择框下拉（若有）
  const opened = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => x.getAttribute('aria-haspopup') === 'listbox' && /溢出|Overflow|Truncate|Rolling|Stop/i.test(x.textContent || ''));
    if (b) { b.click(); return true; }
    return false;
  });
  if (opened) {
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, 'probe-app-select.png') });
    await page.keyboard.press('Escape');
    await sleep(400);
  } else {
    console.log('未找到溢出策略下拉（可能未在聊天页或无会话）');
  }

  // 3) backdrop-filter 计算样式确认
  const probe = await page.evaluate(() => {
    const el = document.querySelector('.glass-pop') || document.querySelector('.glass-strong');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { backdropFilter: cs.backdropFilter, bg: cs.backgroundColor };
  });
  console.log('glass computed:', JSON.stringify(probe));

  await browser.disconnect();
} finally {
  child.kill('SIGTERM');
  await sleep(800);
  try { process.kill(child.pid, 'SIGKILL'); } catch {}
}
console.log('APP_PROBE_DONE');
