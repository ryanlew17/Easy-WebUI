import './node-version-guard.mjs';
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

// @req REQ-2026-006：StrictMode 下弹窗打开不抢回焦点，真正关闭后仍返回触发控件。
const CHROME = process.env.EASYUI_BROWSER_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = 'build/req006-final-review';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failures = [];
const check = (condition, label, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!condition) failures.push(label);
};
const dev = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  shell: false,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let devLog = '';
dev.stdout.on('data', (data) => { devLog += data; });
dev.stderr.on('data', (data) => { devLog += data; });
let browser;
const killDev = async () => {
  if (dev.killed) return;
  try {
    spawn('taskkill', ['/PID', String(dev.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
  } catch {}
  await sleep(500);
};
try {
  const start = Date.now();
  let ready = false;
  while (Date.now() - start < 40000) {
    try {
      const response = await fetch(BASE);
      if (response.ok) { ready = true; break; }
    } catch {}
    await sleep(300);
  }
  if (!ready) throw new Error(`dev server 未就绪\n${devLog.slice(-2000)}`);
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--force-device-scale-factor=1'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('easyui_mock_providers', '[]');
    localStorage.setItem('easyui_mock_conversations', '[]');
    localStorage.setItem('easyui_mock_messages', '[]');
  });
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1000);
  await page.evaluate(() => document.querySelector('[aria-label="打开设置"]')?.click());
  await sleep(600);
  const opened = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('新增平台'));
    if (!button) return false;
    window.__modalInvoker = button;
    button.focus();
    button.click();
    return true;
  });
  check(opened, 'dev modal invoker exists');
  await sleep(200);
  const readFocus = () => page.evaluate(() => {
    const active = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    return {
      open: !!dialog,
      inModal: !!(dialog && dialog.contains(active)),
      label: active?.getAttribute('aria-label') ?? active?.textContent?.trim().slice(0, 20),
    };
  });
  const early = await readFocus();
  await sleep(700);
  const settled = await readFocus();
  check(early.open && early.inModal && settled.inModal,
    'N-7 StrictMode keeps focus inside an open modal', JSON.stringify({ early, settled }));
  for (let i = 0; i < 2; i += 1) {
    await page.keyboard.press('Tab');
    await sleep(120);
    const focused = await readFocus();
    check(focused.inModal, `N-7 Tab ${i + 1} stays inside the modal`, JSON.stringify(focused));
  }
  await page.screenshot({ path: `${OUT}/modal-dev-open.png` });
  await page.keyboard.press('Escape');
  await sleep(700);
  const returned = await page.evaluate(() => ({
    closed: !document.querySelector('[role="dialog"]'),
    returned: document.activeElement === window.__modalInvoker,
    label: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim(),
  }));
  check(returned.closed && returned.returned,
    'N-7 real modal close restores the original invoker', JSON.stringify(returned));
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
  console.error(error);
} finally {
  await browser?.close();
  await killDev();
}
if (failures.length) {
  console.error(`MODAL_DEV_CHECKS_FAIL: ${failures.join(' | ')}`);
  process.exit(1);
}
console.log('MODAL_DEV_CHECKS_PASS');
