/**
 * 在线增量更新真实链路测试（本机安装版 → GitHub Releases）。
 * 分阶段执行（每阶段独立调用，规避单命令超时；下载在主进程内进行，断连不中断）：
 *   node scripts/test-live-update.mjs prepare   启动安装版 → 开 beta 通道 → 检查更新
 *   node scripts/test-live-update.mjs download  触发下载并轮询状态至 downloaded（幂等）
 *   node scripts/test-live-update.mjs install   确认安装（应用退出并静默升级后自动重启）
 *   node scripts/test-live-update.mjs verify    重启后验证版本号与数据完整性
 * 调试端口 9555；脚本结束时尽量恢复现场（杀调试实例）。
 */
import { spawn, execSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const EXE = 'C:\\Users\\Ryan\\AppData\\Local\\Programs\\easy-webui\\Easy WebUI.exe';
const DEBUG_URL = 'http://127.0.0.1:9555';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mode = process.argv[2];

function killAll() {
  try {
    execSync('taskkill /F /IM "Easy WebUI.exe"', { stdio: 'ignore' });
  } catch {}
}

async function launch() {
  const child = spawn(EXE, ['--remote-debugging-port=9555', '--no-first-run'], {
    stdio: 'ignore',
    detached: true, // 独立进程组：脚本退出后应用存活（下载在主进程继续）
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${DEBUG_URL}/json/version`);
      if (r.ok) return child;
    } catch {}
    await sleep(500);
  }
  throw new Error('debug port not ready');
}

async function connect() {
  const browser = await puppeteer.connect({ browserURL: DEBUG_URL, defaultViewport: null });
  let page = null;
  for (let i = 0; i < 30; i++) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes('index.html'));
    if (page) break;
    await sleep(500);
  }
  if (!page) throw new Error('app page not found');
  await page.waitForFunction(() => window.easyui !== undefined, { timeout: 20000 });
  return { browser, page };
}

try {
  if (mode === 'prepare') {
    killAll();
    await sleep(1000);
    const child = await launch();
    const { browser, page } = await connect();
    const info = await page.evaluate(() => window.easyui.getSystemInfo());
    console.log('INSTALLED systemInfo =', JSON.stringify(info));
    if (info.version !== '0.1.1') throw new Error(`安装版版本应为 0.1.1，实际 ${info.version}`);
    await page.evaluate(() => window.easyui.setSettings({ update_beta: true }));
    const s = await page.evaluate(() => window.easyui.getSettings());
    console.log('beta channel =', s.update_beta);
    const chk = await page.evaluate(() => window.easyui.updateCheck());
    console.log('updateCheck =', JSON.stringify(chk));
    if (chk.status !== 'available') throw new Error('未发现 beta 更新: ' + JSON.stringify(chk));
    if (chk.info.version !== '0.1.2-beta.1') throw new Error('意外版本: ' + chk.info.version);
    console.log('PREPARE_OK');
    await browser.disconnect();
    child.unref();
  } else if (mode === 'download') {
    // 自给自足：如 9555 不通则先启动应用（上一阶段实例可能已退出）
    try {
      await fetch(`${DEBUG_URL}/json/version`);
    } catch {
      killAll();
      await sleep(1000);
      await launch();
    }
    const { browser, page } = await connect();
    // 幂等：idle → 先 check（beta 开关已持久化）；downloading/downloaded → 续等
    let st0 = await page.evaluate(() => window.easyui.updateGetState());
    if (st0.phase === 'idle') {
      const chk = await page.evaluate(() => window.easyui.updateCheck());
      console.log('re-check =', JSON.stringify(chk));
      if (chk.status !== 'available') throw new Error('未发现更新: ' + JSON.stringify(chk));
      st0 = { phase: 'available' };
    }
    if (st0.phase === 'available') {
      await page.evaluate(() => {
        window.__dlResult = null;
        window.easyui
          .updateDownload()
          .then((r) => (window.__dlResult = { ok: true, r }))
          .catch((e) => (window.__dlResult = { ok: false, e: String(e) }));
      });
      console.log('download started');
    } else {
      console.log('phase =', st0.phase, '（续等，不重复触发）');
    }
    for (let i = 0; i < 55; i++) {
      await sleep(5000);
      const st = await page.evaluate(() => window.easyui.updateGetState());
      const dl = await page.evaluate(() => window.__dlResult);
      if (dl && !dl.ok) throw new Error('下载失败: ' + dl.e);
      if (st.phase === 'downloaded') {
        console.log('DOWNLOAD_OK', JSON.stringify(st.info));
        await browser.disconnect();
        process.exit(0);
      }
      if (i % 6 === 0) console.log('  …downloading', st.phase);
    }
    console.log('DOWNLOAD_PENDING（仍在进行，重跑本阶段继续等）');
    await browser.disconnect();
    process.exit(2);
  } else if (mode === 'install') {
    const { browser, page } = await connect();
    const st = await page.evaluate(() => window.easyui.updateGetState());
    if (st.phase !== 'downloaded') throw new Error('未下载完成: ' + st.phase);
    await page.evaluate(() => window.easyui.updateInstall());
    console.log('INSTALL_TRIGGERED（应用将退出并静默升级，随后自动重启）');
    await browser.disconnect();
    process.exit(0);
  } else if (mode === 'verify') {
    // 升级重启后的实例无调试端口：杀掉后重新以调试端口启动
    killAll();
    await sleep(1000);
    const child = await launch();
    const { browser, page } = await connect();
    const info = await page.evaluate(() => window.easyui.getSystemInfo());
    console.log('UPDATED systemInfo =', JSON.stringify(info));
    if (info.version !== '0.1.2-beta.1') throw new Error(`升级后版本应为 0.1.2-beta.1，实际 ${info.version}`);
    const providers = await page.evaluate(() => window.easyui.listProviders());
    console.log('UPDATED providers =', providers.length, '个');
    if (!Array.isArray(providers) || providers.length === 0)
      throw new Error('升级后数据丢失：providers 为空');
    const convs = await page.evaluate(() => window.easyui.listConversations());
    console.log('UPDATED conversations =', convs.length, '个');
    await page.screenshot({ path: 'docs/screenshots/15-live-updated.png' });
    console.log('VERIFY_OK');
    await browser.disconnect();
    killAll();
    child.unref();
    process.exit(0);
  } else {
    console.log('usage: prepare|download|install|verify');
    process.exit(64);
  }
} catch (e) {
  console.error('LIVE_UPDATE_FAIL:', e.message);
  process.exit(1);
}
