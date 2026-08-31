/**
 * Easy WebUI — 会话 UX 走查脚本（feat/ui-motion-overhaul，树形分支 + LM Studio 式交互）。
 * 复用 e2e-ui-motion.mjs 的 harness（puppeteer-core + 系统 Edge 无头 + 进程内静态服务器服 dist/）。
 *
 * 产出 docs/screenshots/30-chat-*.png ~ 34-chat-*.png，并断言关键交互：
 * - regenerate 后出现分支导航 ‹ 2/2 ›；
 * - ‹ 切换后内容变化（mock 备用文案）；
 * - 选择模式计数正确（已选 2 条）、Esc 退出；
 * - Think 切换写入会话（localStorage reasoning_enabled）；
 * - Generate Response 触发生成（出现停止按钮）。
 * 脚本退出即关闭浏览器与服务器，不留后台进程。
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'docs/screenshots';
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
const asserts = [];
const ok = (cond, what) => {
  asserts.push(`${cond ? 'PASS' : 'FAIL'}: ${what}`);
  if (!cond) errors.push(`assert: ${what}`);
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});

/* 预置数据：一个启用了 deepseek-reasoner 的平台 + zh-CN/light 偏好（免走平台表单） */
await page.evaluateOnNewDocument(() => {
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
  } catch {}
  document.cookie =
    'easyui_prefs=' +
    encodeURIComponent(JSON.stringify({ theme: 'light', lang: 'zh-CN' })) +
    ';path=/;max-age=31536000;SameSite=Lax';
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`shot: ${name}`);
};

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

/** 悬浮到最后一条 assistant 气泡（让操作行显现），再点其中指定 aria-label 的按钮 */
const clickBubbleAction = async (label) => {
  const found = await page.evaluate((l) => {
    const groups = [...document.querySelectorAll('.group')].filter((el) =>
      el.querySelector('[role="toolbar"]'),
    );
    const g = groups[groups.length - 1];
    if (!g) return false;
    const btn = g.querySelector(`[aria-label="${l}"]`);
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
  return found;
};

const hoverLastBubble = async () => {
  const sel = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.group')].filter((el) =>
      el.querySelector('[role="toolbar"]'),
    );
    const g = groups[groups.length - 1];
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 60) };
  });
  if (sel) await page.mouse.move(sel.x, sel.y);
  await sleep(350); // opacity 过渡 --dur-fast
};

const waitGenerationDone = () =>
  page.waitForFunction(() => !document.querySelector('[aria-label="停止生成"]'), {
    timeout: 40000,
  });

const lastBubbleText = () =>
  page.evaluate(() => {
    const groups = [...document.querySelectorAll('.group')].filter((el) =>
      el.querySelector('[role="toolbar"]'),
    );
    const g = groups[groups.length - 1];
    return g ? g.textContent : '';
  });

const must = (cond, what) => {
  if (!cond) throw new Error(`未找到可交互元素: ${what}`);
  console.log(`click: ${what}`);
};

try {
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(1200);

  // 新建会话 → 选模型 → 发消息 → 等生成完成
  must(await clickExact('新建会话'), '新建会话');
  await sleep(600);
  must(await clickAria('选择模型'), '模型选择器');
  await sleep(500);
  const picked = await page.evaluate(() => {
    const opt = [...document.querySelectorAll('[role="option"]')].find((o) =>
      o.textContent.includes('deepseek-reasoner'),
    );
    if (!opt) return false;
    opt.click();
    return true;
  });
  must(picked, 'deepseek-reasoner 选项');
  await sleep(400);
  await page.click('[aria-label="消息输入区"]');
  await page.type('[aria-label="消息输入区"]', '你好，请介绍一下你自己。');
  must(await clickAria('发送消息'), '发送消息');
  await waitGenerationDone();
  await sleep(600);

  /* ---- 30: regenerate → 分支导航 ‹ 2/2 › + 操作行 hover 态 ---- */
  await hoverLastBubble();
  must(await clickBubbleAction('重新生成'), 'regenerate 按钮');
  console.log('regenerate clicked, waiting…');
  await waitGenerationDone();
  await sleep(600);
  const branchInfo = await page.evaluate(() => {
    const nav = document.querySelector('[role="group"][aria-label^="分支"]');
    return nav ? nav.textContent : null;
  });
  ok(branchInfo && branchInfo.includes('2/2'), `regenerate 后出现分支导航（实际: ${branchInfo}）`);
  await hoverLastBubble();
  await shot('30-chat-actions-branch');

  /* ---- 31: reasoning 计时标题 + 统计行 ---- */
  const statsInfo = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      thought: /思考了 \d+\.\d{2} 秒/.test(body),
      tokPerSec: /tok\/s/.test(body),
      ttft: /TTFT \d+\.\d{2}s/.test(body) || /TTFT/.test(body),
      total: /总用时/.test(body),
      finish: /结束原因：stop/.test(body),
    };
  });
  ok(statsInfo.thought, 'reasoning 块标题含「思考了 X.XX 秒」');
  ok(statsInfo.tokPerSec, '统计行含 tok/s');
  ok(statsInfo.ttft, '统计行含 TTFT');
  ok(statsInfo.total, '统计行含总用时');
  ok(statsInfo.finish, '统计行含结束原因 stop');
  await hoverLastBubble();
  await shot('31-chat-reasoning-stats');

  /* ---- 34: ‹ 切换分支 → 内容变化（分支 2 = mock 备用文案「分支 B」，切回 1 = 主文案） ---- */
  const beforeSwitch = await lastBubbleText();
  must(await clickBubbleAction('上一分支'), '‹ 上一分支');
  await sleep(500);
  const afterSwitch = await lastBubbleText();
  console.log(
    `branch text: before=${JSON.stringify(beforeSwitch.slice(0, 40))} after=${JSON.stringify(afterSwitch.slice(0, 40))}`,
  );
  ok(
    beforeSwitch.includes('分支 B') &&
      !afterSwitch.includes('分支 B') &&
      beforeSwitch !== afterSwitch,
    '切换分支后内容变化（分支 2 备用文案 → 分支 1 主文案）',
  );
  const branchInfo2 = await page.evaluate(() => {
    const nav = document.querySelector('[role="group"][aria-label^="分支"]');
    return nav ? nav.textContent : null;
  });
  ok(branchInfo2 && branchInfo2.includes('1/2'), `切换后导航显示 1/2（实际: ${branchInfo2}）`);
  await hoverLastBubble();
  await shot('34-chat-branch-switched');

  /* ---- 32: 右键进入选择模式 → 勾选 2 条 → 计数断言 → Esc 退出 ---- */
  const bubbleBox = await page.evaluate(() => {
    const groups = [...document.querySelectorAll('.group')].filter((el) =>
      el.querySelector('[role="toolbar"]'),
    );
    const g = groups[groups.length - 1];
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 30 };
  });
  if (!bubbleBox) throw new Error('气泡定位失败（右键）');
  await page.mouse.click(bubbleBox.x, bubbleBox.y, { button: 'right' });
  await sleep(400);
  // 复选框查询必须限定消息列表（右栏参数面板也有 role=checkbox 的控件）
  const msgBoxSel = '[aria-label="消息列表"] [role="checkbox"]';
  const checkboxCount = await page.evaluate(
    (sel) => document.querySelectorAll(sel).length,
    msgBoxSel,
  );
  ok(checkboxCount >= 2, `选择模式出现复选框（${checkboxCount} 个）`);
  // 右键已选中最后一条；再勾选第一条（不同消息）凑够 2 条
  await page.evaluate((sel) => {
    const boxes = [...document.querySelectorAll(sel)];
    if (boxes[0]) boxes[0].click();
  }, msgBoxSel);
  await sleep(300);
  const countText = await page.evaluate(() => {
    const bar = [...document.querySelectorAll('[role="toolbar"]')].find((el) =>
      el.textContent.includes('已选'),
    );
    return bar ? bar.textContent : null;
  });
  ok(countText && countText.includes('已选 2 条'), `选择计数正确（实际: ${countText}）`);
  await shot('32-chat-select-mode');
  await page.keyboard.press('Escape');
  await sleep(400);
  const selState = await page.evaluate((sel) => ({
    checkboxes: document.querySelectorAll(sel).length,
    bar: !!document.querySelector('.glass-pop [aria-label="删除所选"]'),
  }), msgBoxSel);
  console.log(`after Esc: ${JSON.stringify(selState)}`);
  ok(selState.checkboxes === 0, 'Esc 退出选择模式（复选框消失）');

  /* ---- 33: 输入坞（Think 开/关、上下文环悬停浮层、Generate Response） ---- */
  // Think 初始开 → 悬停上下文环 → 截图
  const ringBox = await page.evaluate(() => {
    const ring = document.querySelector('.ctx-ring');
    if (!ring) return null;
    const r = ring.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!ringBox) throw new Error('上下文环未渲染');
  await page.mouse.move(ringBox.x, ringBox.y);
  await sleep(400);
  const tipVisible = await page.evaluate(() => {
    const tip = document.querySelector('.ctx-tip');
    if (!tip) return false;
    return getComputedStyle(tip).visibility === 'visible';
  });
  ok(tipVisible, '上下文环悬停浮层可见');
  await shot('33-chat-composer-ring-tip');
  // 移开 → Think 点击关闭 → 断言写会话 → 截图
  await page.mouse.move(720, 400);
  must(await clickAria('切换思考模式'), 'Think 胶囊（关闭）');
  await sleep(400);
  const thinkOff = await page.evaluate(() => {
    const convs = JSON.parse(localStorage.getItem('easyui_mock_conversations') ?? '[]');
    return convs.length > 0 && convs.every((c) => c.reasoning_enabled === false);
  });
  ok(thinkOff, 'Think 关闭写入会话（reasoning_enabled=false）');
  await shot('33b-chat-composer-think-off');
  must(await clickAria('切换思考模式'), 'Think 胶囊（重新打开）');
  await sleep(300);

  // Generate Response：点最后一条 user 消息的 branch（setActiveLeaf 到 user）→ 按钮浮出
  const branchOnUser = await page.evaluate(() => {
    const toolbars = [...document.querySelectorAll('[role="toolbar"][aria-label="消息操作"]')];
    // user 气泡：操作行里没有「重新生成」按钮
    for (let i = toolbars.length - 1; i >= 0; i--) {
      const tb = toolbars[i];
      if (tb.querySelector('[aria-label="重新生成"]')) continue;
      const btn = tb.querySelector('[aria-label="在此消息之后分叉聊天"]');
      if (btn) {
        btn.click();
        return true;
      }
    }
    return false;
  });
  must(branchOnUser, 'user 消息 branch 按钮（setActiveLeaf）');
  await sleep(500);
  const genVisible = await page.evaluate(
    () => !!document.querySelector('[aria-label="✨ 生成回复 (Ctrl+R)"]'),
  );
  ok(genVisible, 'Generate Response 按钮浮出');
  await shot('33c-chat-generate-response');
  must(await clickAria('✨ 生成回复 (Ctrl+R)'), 'Generate Response 点击');
  await sleep(400);
  const stopVisible = await page.evaluate(
    () => !!document.querySelector('[aria-label="停止生成"]'),
  );
  ok(stopVisible, 'Generate Response 触发生成（停止按钮出现）');
  await waitGenerationDone();
  await sleep(500);
  const genGone = await page.evaluate(
    () => !document.querySelector('[aria-label="✨ 生成回复 (Ctrl+R)"]'),
  );
  ok(genGone, '生成完成后 Generate Response 隐藏（激活叶=assistant）');

  console.log('FLOW_OK');
} catch (e) {
  errors.push(`flow: ${e.message}`);
  try {
    await shot('99-chat-failure');
  } catch {}
}

await browser.close();
server.close();
console.log('ASSERTS:\n' + asserts.join('\n'));
if (errors.length) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('E2E_CLEAN');
