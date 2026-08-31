/**
 * 一键生成 README 截图（8 张，中文界面）：
 *   node scripts/shot.mjs                 → docs/screenshots/
 *   node scripts/shot.mjs --out <dir>     → 指定输出目录
 * 流程：进程内静态服务器服务 dist/ → Edge 无头逐状态走查截图 → 退出即清理。
 * 状态：欢迎页 / 设置 / 新增平台弹窗(聚焦密钥框) / 模型下拉模糊 / 聊天浅色 /
 *       多行输入坞+生成胶囊 / 深色聊天 / 生成中思考态。
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : 'docs/screenshots';
mkdirSync(OUT, { recursive: true });

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
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
});

/* mock 数据 + 主题 cookie（evaluateOnNewDocument 序列化执行，依赖须在函数体内） */
const seed = (lang, withConversation) => {
  const t0 = Date.now() - 60000;
  const msg = (id, conv, parent, role, content, at, extra = {}) => ({
    id, conversation_id: conv, parent_id: parent, role, content,
    reasoning: id === 'm1a1' ? '用户在测试思考链路，先简短回应即可。' : '',
    token_count: role === 'assistant' ? 86 : null,
    partial: false, error: null, created_at: at, stats: null, ...extra,
  });
  // assistant 统计（截图展示气泡内统计行）
  const st = { ttft_ms: 640, total_ms: 4100, finish_reason: 'stop' };
  try {
    localStorage.setItem('easyui_mock_providers', JSON.stringify([
      { id: 'p-mock-1', name: 'DeepSeek Mock', base_url: 'https://api.deepseek.com',
        api_format: 'openai-chat', has_key: true,
        models: [{ id: 'deepseek-reasoner', enabled: true }, { id: 'deepseek-chat', enabled: true }],
        created_at: 1, updated_at: 1 },
    ]));
    if (withConversation) {
      localStorage.setItem('easyui_mock_conversations', JSON.stringify([
        { id: 'c-zh-1', title: '液态玻璃走查', provider_id: 'p-mock-1', model: 'deepseek-reasoner',
          preset_id: null, overrides: {}, pinned: false, reasoning_enabled: true,
          created_at: t0, updated_at: t0 + 4000 },
      ]));
      localStorage.setItem('easyui_mock_messages', JSON.stringify([
        msg('m1', 'c-zh-1', null, 'user', '好', t0 + 100),
        msg('m1a1', 'c-zh-1', 'm1', 'assistant', '你好！有什么可以帮你？', t0 + 200, { stats: st }),
        msg('m2', 'c-zh-1', 'm1a1', 'user', '讲个笑话', t0 + 300),
        msg('m2a1', 'c-zh-1', 'm2', 'assistant', '为什么程序员喜欢黑暗？因为光会吸引 bug。', t0 + 400, { stats: st }),
        msg('m3', 'c-zh-1', 'm2a1', 'user', '再讲一个长的', t0 + 500),
        msg('m3a1', 'c-zh-1', 'm3', 'assistant',
          '有一个 SQL 查询走进了一家酒吧，走近两张 table，问：能 JOIN 你们吗？\n\n bartender 说：抱歉，我们这里不欢迎没有 INDEX 的查询——你上次来把整张表都扫了一遍。', t0 + 600, { stats: st }),
        msg('m4', 'c-zh-1', 'm3a1', 'user', '再来一个', t0 + 700),
      ]));
    } else {
      localStorage.removeItem('easyui_mock_conversations');
      localStorage.removeItem('easyui_mock_messages');
    }
  } catch {}
  document.cookie =
    'easyui_prefs=' + encodeURIComponent(JSON.stringify({ theme: 'light', lang })) +
    ';path=/;max-age=31536000;SameSite=Lax';
};

const newPage = async (lang, withConversation) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  await page.evaluateOnNewDocument(seed, lang, withConversation);
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);
  return page;
};

const shot = (page, name) => async () => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot: ${name}`);
};
const clickExact = (page, text) =>
  page.evaluate((t) => {
    const els = [...document.querySelectorAll('button, [role="tab"]')].filter(
      (el) => el.getBoundingClientRect().width > 0,
    );
    const hit = els.filter((el) => el.textContent.trim() === t).length
      ? els.filter((el) => el.textContent.trim() === t)
      : els
          .filter((el) => el.textContent.trim().includes(t))
          .sort((a, b) => a.textContent.trim().length - b.textContent.trim().length);
    if (!hit.length) return false;
    hit[0].click();
    return true;
  }, text);
const clickAria = (page, label) =>
  page.evaluate((l) => {
    const el = document.querySelector(`[aria-label="${l}"]`);
    if (!el) return false;
    el.click();
    return true;
  }, label);
const must = (ok, what) => {
  if (!ok) throw new Error(`未找到: ${what}`);
  console.log(`click: ${what}`);
};

const typeDraft = async (page, lines) => {
  await page.click('.composer-input');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      await page.keyboard.down('Shift');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Shift');
    }
    await page.type('.composer-input', lines[i]);
  }
};

try {
  /* 01-03：欢迎页 → 设置 → 弹窗（无会话） */
  const p1 = await newPage('zh-CN', false);
  await clickAria(p1, '搜索');
  await sleep(300); // 搜索框聚焦：焦点环（-1px 骑边界）目视证据
  await shot(p1, '01-welcome-light-zh')();

  must(await clickExact(p1, '设置'), '设置');
  await sleep(700);
  await shot(p1, '02-settings-providers-light-zh')();

  must(await clickExact(p1, '+ 新增平台'), '新增平台');
  await sleep(500);
  await p1.evaluate(() => document.querySelector('[aria-label="API 密钥"]')?.click());
  await sleep(300);
  await shot(p1, '03-provider-modal-light-zh')();
  await p1.close();

  /* 04-06：会话页浅色 */
  const p2 = await newPage('zh-CN', true);
  must(await clickExact(p2, '液态玻璃走查'), '会话');
  await sleep(700);

  // 04：下拉打开 + 首条 assistant 气泡滚到弹层正后方（玻璃模糊证据）
  await p2.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (!list) return;
    const groups = list.querySelectorAll('.group');
    const target = groups[1] ?? groups[0];
    if (!target) return;
    list.scrollTop +=
      target.getBoundingClientRect().top - list.getBoundingClientRect().top - 40;
  });
  await sleep(300);
  must(await clickAria(p2, '选择模型'), '模型选择器');
  await sleep(500);
  await shot(p2, '04-model-picker-blur-zh')();
  await p2.keyboard.press('Escape');
  await sleep(300);
  await p2.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (list) list.scrollTop = list.scrollHeight;
  });
  await sleep(300);

  await shot(p2, '05-chat-light-zh')();

  await typeDraft(p2, ['帮我总结一下上面的对话，', '重点提炼两个最好笑的包袱，', '并解释为什么好笑。']);
  await sleep(400);
  await shot(p2, '06-composer-generate-zh')();

  /* 07：深色（同页切主题） */
  await p2.evaluate(() => {
    document.cookie =
      'easyui_prefs=' + encodeURIComponent(JSON.stringify({ theme: 'dark', lang: 'zh-CN' })) +
      ';path=/;max-age=31536000;SameSite=Lax';
  });
  await p2.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  await shot(p2, '07-chat-dark-zh')();

  /* 08：浅色 + 发送 → 思考中 */
  await p2.evaluate(() => {
    document.cookie =
      'easyui_prefs=' + encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN' })) +
      ';path=/;max-age=31536000;SameSite=Lax';
  });
  await p2.reload({ waitUntil: 'networkidle0' });
  await sleep(1200);
  await typeDraft(p2, ['用一句话解释什么是液态玻璃设计']);
  must(await clickAria(p2, '发送消息'), '发送消息');
  await p2.waitForFunction(() => document.body.innerText.includes('思考中'), { timeout: 8000 });
  await shot(p2, '08-chat-streaming-zh')();
  await p2.waitForFunction(() => !document.querySelector('[aria-label="停止生成"]'), { timeout: 40000 });
  await p2.close();

  console.log('FLOW_OK');
} catch (e) {
  errors.push(`flow: ${e.message}`);
}

await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('E2E_CLEAN');
