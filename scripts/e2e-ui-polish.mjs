/**
 * Easy WebUI — v1.0.1 UI 修复走查截图脚本（fix/v1.0.1-ui-polish）。
 * 复用 e2e-chat-ux.mjs 的 harness（puppeteer-core + 系统 Edge 无头 + 进程内静态服务器服 dist/）。
 *
 * 产出 build/e2e-shots/50-*.png ~ 57-*.png（不入库；docs/screenshots 仅保留 README 引用的 8 张精选图）：
 * - 50 模型下拉打开且背后有聊天文字（浮层 portal 到 body，生产构建玻璃模糊生效、不透字）；
 * - 51 短回复气泡（user 7.5rem / assistant 12rem 最小宽度，头部行单行不折行）；
 * - 52 生成中"思考中…"状态气泡；
 * - 53/54 新输入坞（中文单行 / 多行：容器整体增高、底行控件钉底右下角）；
 * - 55/56 新输入坞（英文单行 / 多行）；
 * - 57 Generate Response 胶囊（portal 浮窗，浮于输入坞上方 12px 居中，Ctrl/Cmd+R 触发）。
 * 脚本退出即关闭浏览器与服务器，不留后台进程。
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
// 走查截图输出到 build/e2e-shots（不入库）：docs/screenshots 仅保留 README 引用的 8 张精选图
const OUT = 'build/e2e-shots';
mkdirSync(OUT, { recursive: true });

/* 进程内静态服务器服务 dist/（脚本退出即释放端口） */
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
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}/`;
console.log(`serving dist/ at ${BASE}`);

const errors = [];
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  // 不加 --disable-gpu：软件合成下 backdrop-filter 不参与实际渲染（计算样式仍在），
  // 本脚本要截取"模糊真实生效"的目视证据，需保留 GPU/ANGLE 合成路径
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 预置数据：mock 平台 + 两个短回复演示会话（中/英各一），lang 由参数传入页面上下文 */
const seed = (lang) => {
  const t0 = Date.now() - 60000;
  const msg = (id, conv, parent, role, content, at) => ({
    id,
    conversation_id: conv,
    parent_id: parent,
    role,
    content,
    reasoning: '',
    token_count: role === 'assistant' ? 6 : null,
    partial: false,
    error: null,
    created_at: at,
  });
  try {
    localStorage.setItem(
      'easyui_mock_providers',
      JSON.stringify([
        {
          id: 'p-mock-1',
          name: 'DeepSeek Mock',
          base_url: 'https://api.deepseek.com',
          api_format: 'openai-chat',
          has_key: true,
          models: [
            { id: 'deepseek-reasoner', enabled: true },
            { id: 'deepseek-chat', enabled: true },
          ],
          created_at: 1,
          updated_at: 1,
        },
      ]),
    );
    localStorage.setItem(
      'easyui_mock_conversations',
      JSON.stringify([
        {
          id: 'c-zh-1',
          title: '短回复演示',
          provider_id: 'p-mock-1',
          model: 'deepseek-reasoner',
          preset_id: null,
          overrides: {},
          pinned: false,
          reasoning_enabled: true,
          created_at: t0,
          updated_at: t0 + 4000,
        },
        {
          id: 'c-en-1',
          title: 'Short replies',
          provider_id: 'p-mock-1',
          model: 'deepseek-reasoner',
          preset_id: null,
          overrides: {},
          pinned: false,
          reasoning_enabled: true,
          created_at: t0 + 1000,
          updated_at: t0 + 3000,
        },
      ]),
    );
    localStorage.setItem(
      'easyui_mock_messages',
      JSON.stringify([
        msg('m-zh-u1', 'c-zh-1', null, 'user', '好', t0 + 100),
        msg('m-zh-a1', 'c-zh-1', 'm-zh-u1', 'assistant', '你好！', t0 + 200),
        msg('m-zh-u2', 'c-zh-1', 'm-zh-a1', 'user', '在吗', t0 + 300),
        msg('m-zh-a2', 'c-zh-1', 'm-zh-u2', 'assistant', '在的，有什么可以帮你？', t0 + 400),
        msg('m-zh-u3', 'c-zh-1', 'm-zh-a2', 'user', '讲个笑话', t0 + 500),
        msg('m-zh-a3', 'c-zh-1', 'm-zh-u3', 'assistant', '为什么程序员喜欢黑暗？因为光会吸引 bug。', t0 + 600),
        msg('m-zh-u4', 'c-zh-1', 'm-zh-a3', 'user', '再一个', t0 + 700),
        msg('m-zh-a4', 'c-zh-1', 'm-zh-u4', 'assistant', '暂时没有更多了。', t0 + 800),
        msg('m-zh-u5', 'c-zh-1', 'm-zh-a4', 'user', '好吧', t0 + 900),
        msg('m-zh-a5', 'c-zh-1', 'm-zh-u5', 'assistant', '随时恭候。', t0 + 1000),
        msg('m-en-u1', 'c-en-1', null, 'user', 'Hi', t0 + 1100),
        msg('m-en-a1', 'c-en-1', 'm-en-u1', 'assistant', 'Hello!', t0 + 1200),
        msg('m-en-u2', 'c-en-1', 'm-en-a1', 'user', 'OK', t0 + 1300),
        msg('m-en-a2', 'c-en-1', 'm-en-u2', 'assistant', 'Sure, happy to help.', t0 + 1400),
      ]),
    );
  } catch {}
  document.cookie =
    'easyui_prefs=' +
    encodeURIComponent(JSON.stringify({ theme: 'light', lang })) +
    ';path=/;max-age=31536000;SameSite=Lax';
};

const newSeededPage = async (lang) => {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('pageerror', (e) => errors.push(`pageerror(${lang}): ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error(${lang}): ${m.text()}`);
  });
  await page.evaluateOnNewDocument(seed, lang);
  return page;
};

const clickExact = (page, text) =>
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

const clickAria = (page, label) =>
  page.evaluate((l) => {
    const el = document.querySelector('[aria-label="' + l + '"]');
    if (!el) return false;
    el.click();
    return true;
  }, label);

const must = (ok, what) => {
  if (!ok) throw new Error(`未找到可交互元素: ${what}`);
  console.log(`click: ${what}`);
};

/* 输入坞多行草稿：逐行 Shift+Enter 换行（真实键事件，React 受控组件可感知） */
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
  /* ================= 中文（light） ================= */
  const zh = await newSeededPage('zh-CN');
  const shotZh = async (name) => {
    await zh.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`shot: ${name}`);
  };
  await zh.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);

  // 51 短回复气泡（最小宽度：单字 user / 短句 assistant 均不逐字竖排）
  must(await clickExact(zh, '短回复演示'), '侧栏会话「短回复演示」');
  await sleep(700);
  await shotZh('51-bubble-short-zh');

  // 50 模型下拉：滚动消息列表，让首条 assistant 气泡（左对齐）正好移到下拉弹层正后方
  // （玻璃模糊生效、不透字的目视证据），截图后滚回底部继续后续输入坞走查
  await zh.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (!list) return;
    const groups = list.querySelectorAll('.group');
    const target = groups[1] ?? groups[0]; // groups[1] = 首条 assistant 气泡
    if (!target) return;
    const delta = target.getBoundingClientRect().top - list.getBoundingClientRect().top;
    list.scrollTop += delta - 40; // 气泡顶距列表顶 40px → 与下拉弹层（高 ~200px）垂直重叠
  });
  await sleep(300);
  must(await clickAria(zh, '选择模型'), '模型选择器');
  await sleep(500);
  await shotZh('50-model-picker-blur-zh');
  await zh.keyboard.press('Escape');
  await sleep(300);
  await zh.evaluate(() => {
    const list = document.querySelector('[aria-label="消息列表"]');
    if (list) list.scrollTop = list.scrollHeight;
  });
  await sleep(200);

  // 53 输入坞单行 → 54 多行（容器增高、底行钉底）
  await typeDraft(zh, ['你好，世界！']);
  await sleep(250);
  await shotZh('53-composer-single-zh');
  await typeDraft(zh, ['第二行：容器随输入整体增高，', '底行控件始终钉在卡片底部。']);
  await sleep(300);
  await shotZh('54-composer-multi-zh');

  // 52 发送多行草稿 → 生成中"思考中…"状态（流式全程标题，窗口充裕）
  must(await clickAria(zh, '发送消息'), '发送消息');
  await zh.waitForFunction(() => document.body.innerText.includes('思考中'), { timeout: 8000 });
  await shotZh('52-bubble-thinking-zh');
  await zh.waitForFunction(() => !document.querySelector('[aria-label="停止生成"]'), {
    timeout: 40000,
  });
  await sleep(400);
  await zh.close();

  /* ================= English（light） ================= */
  const en = await newSeededPage('en-US');
  const shotEn = async (name) => {
    await en.screenshot({ path: `${OUT}/${name}.png` });
    console.log(`shot: ${name}`);
  };
  await en.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);
  must(await clickExact(en, 'Short replies'), 'sidebar conv "Short replies"');
  await sleep(700);

  // 55 单行 → 56 多行
  await typeDraft(en, ['Hello there.']);
  await sleep(250);
  await shotEn('55-composer-single-en');
  await typeDraft(en, ['Second line: the card grows as a whole,', 'controls stay pinned to the bottom row.']);
  await sleep(300);
  await shotEn('56-composer-multi-en');

  // 57 Generate Response 胶囊：末条为 user 消息时出现在底行右下角（流内、不跨边界）
  const en2 = await newSeededPage('en-US');
  await en2.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);
  await en2.evaluate(() => {
    const msgs = JSON.parse(localStorage.getItem('easyui_mock_messages') ?? '[]');
    const conv = JSON.parse(localStorage.getItem('easyui_mock_conversations') ?? '[]')[0];
    msgs.push({
      id: 'm-en-u3', conversation_id: conv.id, parent_id: 'm-en-a2', role: 'user',
      content: 'One more please', reasoning: '', token_count: null, partial: false,
      error: null, created_at: Date.now() - 30000,
    });
    localStorage.setItem('easyui_mock_messages', JSON.stringify(msgs));
  });
  await en2.reload({ waitUntil: 'networkidle0' });
  await sleep(1000);
  await en2.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Short replies');
    el?.click();
  });
  await sleep(700);
  await en2.screenshot({ path: `${OUT}/57-composer-generate-en.png` });
  console.log('shot: 57-composer-generate-en');
  await en2.close();

  console.log('FLOW_OK');
} catch (e) {
  errors.push(`flow: ${e.message}`);
}

await browser.close();
server.close();
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('E2E_CLEAN');
