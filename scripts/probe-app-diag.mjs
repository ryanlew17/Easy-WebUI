/* 深度诊断：安装版应用中 .glass-pop 的 backdrop-filter 为何不生效（只读）。 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'build', 'e2e-shots'); // 走查探针截图不入库，docs/screenshots 仅保留 README 精选图
const EXE = 'C:/Users/Ryan/AppData/Local/Programs/easy-webui/Easy WebUI.exe';
const DEBUG_URL = 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EXE, ['--remote-debugging-port=9333'], { stdio: ['ignore', 'pipe', 'pipe'] });
async function waitEndpoint() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${DEBUG_URL}/json/version`); if (r.ok) return; } catch {}
    await sleep(500);
  }
  throw new Error('调试端口未就绪');
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
  await page.waitForFunction(() => window.easyui !== undefined, { timeout: 20000 });
  await sleep(1200);

  const diag = await page.evaluate(() => {
    const root = document.documentElement;
    const rcs = getComputedStyle(root);
    const vars = {};
    for (const v of ['--glass-bg-pop', '--glass-blur-pop', '--glass-saturate-pop', '--glass-bg-modal', '--glass-blur-modal', '--glass-bg', '--glass-blur']) {
      vars[v] = rcs.getPropertyValue(v);
    }
    // 构造一个测试元素验证 backdrop-filter 支持
    const test = document.createElement('div');
    test.style.cssText = 'position:fixed;top:0;left:0;width:10px;height:10px;backdrop-filter:blur(40px);-webkit-backdrop-filter:blur(40px);';
    document.body.appendChild(test);
    const tcs = getComputedStyle(test);
    const support = { bf: tcs.backdropFilter, wbf: tcs.webkitBackdropFilter };
    test.remove();
    return {
      dataTheme: root.getAttribute('data-theme'),
      zoom: root.style.zoom || '(unset)',
      vars,
      support,
      cssSupports: {
        bf: CSS.supports('backdrop-filter', 'blur(1px)'),
        wbf: CSS.supports('-webkit-backdrop-filter', 'blur(1px)'),
      },
      ua: navigator.userAgent,
    };
  });
  console.log(JSON.stringify(diag, null, 2));

  // 打开模型下拉（让下方有文字：先在消息区滚出有内容的区域），截取下拉浮层与背后文字交叠处
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-haspopup') === 'listbox');
    if (b) b.click();
  });
  await sleep(500);
  const dd = await page.evaluate(() => {
    const el = document.querySelector('[role="listbox"].glass-pop, .glass-pop[role="listbox"]') || document.querySelector('.glass-pop.pop-layer');
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { bf: cs.backdropFilter, wbf: cs.webkitBackdropFilter, bg: cs.backgroundColor, cls: el.className };
  });
  console.log('open dropdown:', JSON.stringify(dd));

  await browser.disconnect();
} finally {
  child.kill('SIGTERM');
  await sleep(800);
  try { process.kill(child.pid, 'SIGKILL'); } catch {}
}
console.log('DIAG_DONE');
