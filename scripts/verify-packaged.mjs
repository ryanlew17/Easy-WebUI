/**
 * 打包产物（release/win-unpacked/Easy WebUI.exe）启动验证：拉起真实 exe，
 * 经远程调试确认 preload 桥与系统信息，截图后结束进程并清理便携数据目录。
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const exe = path.resolve('release/win-unpacked/Easy WebUI.exe');
const child = spawn(exe, ['--remote-debugging-port=9444', '--no-first-run'], {
  cwd: path.dirname(exe),
});
let log = '';
child.stderr.on('data', (d) => (log += d));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9444/json/version');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(500);
  }
  if (!ready) throw new Error('debug port not ready: ' + log.slice(-500));

  const browser = await puppeteer.connect({
    browserURL: 'http://127.0.0.1:9444',
    defaultViewport: null,
  });
  let page = null;
  for (let i = 0; i < 30; i++) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes('index.html'));
    if (page) break;
    await sleep(500);
  }
  if (!page) throw new Error('app page not found');
  await page.waitForFunction(() => window.easyui !== undefined, { timeout: 15000 });

  const info = await page.evaluate(() => window.easyui.getSystemInfo());
  console.log('PACKAGED systemInfo =', JSON.stringify(info));
  const providers = await page.evaluate(() => window.easyui.listProviders());
  console.log('PACKAGED providers =', JSON.stringify(providers));
  await sleep(1500);
  await page.screenshot({ path: 'docs/screenshots/14-electron-packaged.png' });
  console.log('PACKAGED_APP_OK');
  await browser.disconnect();
} finally {
  try {
    execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
  } catch {}
  // 清理便携模式在 exe 旁生成的 data/，保持产物目录干净
  const dataDir = path.resolve('release/win-unpacked/data');
  if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
}
