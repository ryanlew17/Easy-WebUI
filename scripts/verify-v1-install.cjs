// v1.0.0 安装版验证：版本号 + 真实数据 v3 迁移完整性 + 截图
const { spawn, execSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const child = spawn(
    'C:\\Users\\Ryan\\AppData\\Local\\Programs\\easy-webui\\Easy WebUI.exe',
    ['--remote-debugging-port=9556', '--no-first-run'],
    { stdio: 'ignore', detached: true },
  );
  child.unref();
  let browser;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:9556/json/version');
      if (r.ok) {
        browser = await puppeteer.connect({
          browserURL: 'http://127.0.0.1:9556',
          defaultViewport: null,
        });
        break;
      }
    } catch {}
    await sleep(500);
  }
  if (!browser) throw new Error('debug port not ready');
  let page;
  for (let i = 0; i < 30; i++) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes('index.html'));
    if (page) break;
    await sleep(500);
  }
  await page.waitForFunction(() => window.easyui !== undefined, { timeout: 20000 });
  const info = await page.evaluate(() => window.easyui.getSystemInfo());
  console.log('systemInfo.version =', info.version);
  if (info.version !== '1.0.0') throw new Error('版本不对: ' + info.version);
  const providers = await page.evaluate(() => window.easyui.listProviders());
  const convs = await page.evaluate(() => window.easyui.listConversations());
  console.log(
    'providers =',
    providers.length,
    '| conversations =',
    convs.length,
    '| reasoning_enabled =',
    convs.map((c) => c.reasoning_enabled),
  );
  if (!providers.length || !convs.length) throw new Error('数据丢失!');
  const msgs = await page.evaluate((id) => window.easyui.listMessages(id), convs[0].id);
  const chainOk = msgs.every((m, i) => (i === 0 ? m.parent_id === null : m.parent_id === msgs[i - 1].id));
  console.log('conv[0] messages =', msgs.length, '| parent链完整 =', chainOk);
  if (msgs.length > 0 && !chainOk) throw new Error('parent 链损坏');
  await page.screenshot({ path: 'docs/screenshots/40-v1.0.0-installed.png' });
  console.log('INSTALL_TEST_OK');
  await browser.disconnect();
  execSync('taskkill /F /IM "Easy WebUI.exe"', { stdio: 'ignore' });
})().catch((e) => {
  console.error('INSTALL_TEST_FAIL:', e.message);
  try {
    execSync('taskkill /F /IM "Easy WebUI.exe"', { stdio: 'ignore' });
  } catch {}
  process.exit(1);
});
