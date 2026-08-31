/**
 * Easy WebUI — Electron 桌面端真实环境冒烟验证（临时脚本，同一命令生命周期内起停）。
 * 通过 --remote-debugging-port 连接真实应用窗口，驱动真实 preload 桥 → 主进程 IPC
 * → SQLite + safeStorage，覆盖 M1（启动建库）/ M2（平台 CRUD）/ M4（密钥红线、备份）。
 * 用法：node scripts/smoke-electron.mjs（脚本自行拉起并结束 Electron 进程）
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = process.cwd();
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const DEBUG_URL = 'http://127.0.0.1:9333';
const FAKE_KEY = 'sk-smoketest1234567890';
const failures = [];
const ok = (name) => console.log(`PASS ${name}`);
const bad = (name, detail) => {
  failures.push(`${name}: ${detail}`);
  console.log(`FAIL ${name}: ${detail}`);
};

// —— 拉起 Electron（生产模式：加载 dist/index.html）——
const child = spawn(ELECTRON, ['.', '--remote-debugging-port=9333', '--no-first-run'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env },
});
let electronLog = '';
child.stdout.on('data', (d) => (electronLog += d));
child.stderr.on('data', (d) => (electronLog += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitDebugEndpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${DEBUG_URL}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(500);
  }
  throw new Error('Electron 调试端口 60×500ms 内未就绪');
}

function scanPlaintext() {
  // 密钥红线：明文不得出现在 db / wal / 日志 / 备份 zip 中（kimi.md §8 / §11.1）
  const dataDir = path.join(ROOT, 'data');
  const targets = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else targets.push(p);
    }
  };
  walk(dataDir);
  for (const p of targets) {
    const buf = fs.readFileSync(p);
    if (buf.includes(Buffer.from(FAKE_KEY, 'utf8'))) {
      bad('密钥明文扫描', `${path.relative(ROOT, p)} 含明文密钥`);
      return;
    }
  }
  ok(`密钥明文扫描（data/ 下 ${targets.length} 个文件均无明文）`);
}

try {
  await waitDebugEndpoint();
  const browser = await puppeteer.connect({ browserURL: DEBUG_URL, defaultViewport: null });
  // 找到应用窗口页面（file:// …/dist/index.html）
  let page = null;
  for (let i = 0; i < 40; i++) {
    const pages = await browser.pages();
    page = pages.find((p) => p.url().includes('dist/index.html'));
    if (page) break;
    await sleep(500);
  }
  if (!page) throw new Error('未找到应用窗口页面');
  await page.waitForFunction(() => window.easyui !== undefined, { timeout: 20000 });
  ok('应用启动，preload 桥 window.easyui 就绪');

  // 1. 系统信息：数据目录 + 加密方式
  const info = await page.evaluate(() => window.easyui.getSystemInfo());
  console.log('  systemInfo =', JSON.stringify(info));
  if (!info.dataPath.endsWith('data')) bad('数据目录', info.dataPath);
  else ok(`数据目录（${info.dataPath}）`);
  if (info.isElectron === true && info.isPortable === false && info.dataPathSource === 'default')
    ok(`数据目录来源（source=${info.dataPathSource}, isPortable=${info.isPortable}）`);
  else bad('数据目录来源字段', JSON.stringify(info));
  if (info.encryption?.method === 'safeStorage') ok('safeStorage 系统级加密可用');
  else bad('safeStorage', `回退为 ${info.encryption?.method}`);

  // 1a. 在线升级桩：未配置更新源时应以 status=unavailable 应答（不 reject）
  const chk = await page.evaluate(() => window.easyui.updateCheck());
  if (chk?.status === 'unavailable' && typeof chk.reason === 'string')
    ok(`在线升级桩应答（reason=${chk.reason}）`);
  else bad('在线升级桩', JSON.stringify(chk));

  // 2. 平台 CRUD（真实 SQLite + 密钥加密落库）
  const provider = await page.evaluate(
    (key) =>
      window.easyui.createProvider({
        name: '冒烟-DeepSeek',
        base_url: 'https://api.deepseek.com',
        api_format: 'openai-chat',
        api_key: key,
      }),
    FAKE_KEY,
  );
  if (provider.has_key === true && !('api_key_cipher' in provider) && !('api_key' in provider))
    ok('创建平台：has_key=true 且无密文/明文泄漏到渲染进程');
  else bad('创建平台', JSON.stringify(provider));

  const providers = await page.evaluate(() => window.easyui.listProviders());
  if (providers.length === 1 && providers[0].id === provider.id) ok('平台列表持久化');
  else bad('平台列表', JSON.stringify(providers));

  // 3. 真实 HTTP 路径：拉取 DeepSeek 模型列表（假密钥 → 预期 401；验证错误映射与脱敏）
  try {
    await page.evaluate((id) => window.easyui.fetchModels({ providerId: id }), provider.id);
    bad('fetchModels', '假密钥竟成功返回模型列表');
  } catch (e) {
    const msg = String(e);
    if (msg.includes(FAKE_KEY)) bad('fetchModels 错误脱敏', msg);
    else ok(`fetchModels 假密钥按预期失败且错误已脱敏（${msg.slice(0, 90)}…）`);
  }

  // 4. 会话 + 发送消息到不可达端点 → 错误管线 + 落库
  const updated = await page.evaluate(
    (id) =>
      window.easyui.updateProvider(id, {
        models: [{ id: 'smoke-model', enabled: true, last_check: { status: 'unknown' } }],
      }),
    provider.id,
  );
  const conv = await page.evaluate(() => window.easyui.createConversation());
  await page.evaluate(
    (c) => window.easyui.updateConversation(c.id, { provider_id: c.pid, model: 'smoke-model' }),
    { id: conv.id, pid: updated.id },
  );
  // 把平台地址改为不可达端点，让 sendMessage 立即失败（确定性，不等超时）
  await page.evaluate(
    (id) => window.easyui.updateProvider(id, { base_url: 'http://127.0.0.1:9/none' }),
    provider.id,
  );
  const { assistantMessageId } = await page.evaluate(
    (cid) => window.easyui.sendMessage({ conversationId: cid, content: 'ping' }),
    conv.id,
  );
  await sleep(3000);
  const msgs = await page.evaluate((cid) => window.easyui.listMessages(cid), conv.id);
  const assistant = msgs.find((m) => m.id === assistantMessageId);
  if (msgs.length === 2 && assistant?.error && !JSON.stringify(assistant.error).includes(FAKE_KEY))
    ok(`发送失败按预期落库为错误消息（code=${assistant.error.code}，已脱敏）`);
  else bad('错误消息落库', JSON.stringify(msgs));

  // 5. 截图真实 Electron 窗口（当前应显示错误卡片 UI）
  await page.screenshot({ path: 'docs/screenshots/13-electron-app.png' });
  ok('窗口截图 docs/screenshots/13-electron-app.png');

  // 6. 备份（含密钥 + 密码）→ 恢复（合并模式）
  const backup = await page.evaluate(
    () => window.easyui.createBackup({ includeKeys: true, password: 'smoke-pass-123' }),
  );
  if (backup?.filename?.endsWith('.zip') && backup.includes_keys === true)
    ok(`含密钥备份已创建（${backup.filename}）`);
  else bad('创建备份', JSON.stringify(backup));
  const restore = await page.evaluate(
    (p) => window.easyui.restoreBackup({ path: p, password: 'smoke-pass-123', mode: 'merge' }),
    backup.path,
  );
  console.log('  restore =', JSON.stringify(restore));
  if (typeof restore?.providers === 'number') ok('备份恢复（merge）执行成功');
  else bad('备份恢复', JSON.stringify(restore));

  // 7. 密钥明文红线扫描（在清理前执行，WAL/日志/备份全扫）
  scanPlaintext();

  // 8. 清理冒烟数据（保留空库，符合 M1 验收形态）
  await page.evaluate(
    (c) => window.easyui.deleteConversation(c),
    conv.id,
  );
  await page.evaluate((id) => window.easyui.deleteProvider(id), provider.id);
  await page.evaluate((f) => window.easyui.deleteBackup(f), backup.filename);
  ok('冒烟数据已清理');

  await browser.disconnect();
} catch (e) {
  bad('流程', e.message);
  console.log('--- electron 输出尾部 ---\n' + electronLog.slice(-2000));
} finally {
  try {
    execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
  } catch {}
}

if (failures.length) {
  console.log(`\nSMOKE_FAILED (${failures.length}):`);
  for (const f of failures) console.log(' - ' + f);
  process.exit(1);
}
console.log('\nSMOKE_ALL_PASS');
