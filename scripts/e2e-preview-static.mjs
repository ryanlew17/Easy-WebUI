/** 一次性包装器：进程内静态服务 dist/ + 以 E2E_BASE 跑既有 e2e-preview.mjs 回归，子进程退出即释放 */
import puppeteer from 'puppeteer-core';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { spawn } from 'node:child_process';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let fp = normalize(join('dist', urlPath === '/' ? 'index.html' : urlPath));
  if (!fp.startsWith('dist') || !existsSync(fp) || !statSync(fp).isFile()) fp = 'dist/index.html';
  res.setHeader('content-type', MIME[extname(fp)] ?? 'application/octet-stream');
  createReadStream(fp).pipe(res);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
console.log(`serving dist/ at ${base}`);

/*
 * 玻璃模糊防回归断言（生产构建专查）：
 * 历史上 Vite 生产构建的 CSS 压缩曾把 .glass-* 双声明中的无前缀 backdrop-filter 丢掉，
 * 而现代 Chromium 已不支持 -webkit-backdrop-filter → 安装版所有玻璃模糊计算值为 none。
 * 此处向页面插入一个 .glass-pop 元素，直接断言计算样式不是 none（dev 不压缩，只有 dist 能暴露）。
 */
const blurCheck = await (async () => {
  const browser = await puppeteer.launch({
    executablePath: EDGE,
    headless: true,
    args: ['--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(base, { waitUntil: 'networkidle0', timeout: 30000 });
    return await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'glass-pop';
      probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:4rem;height:4rem;';
      document.body.appendChild(probe);
      const bf = getComputedStyle(probe).backdropFilter;
      probe.remove();
      return bf;
    });
  } finally {
    await browser.close();
  }
})();
if (!blurCheck || blurCheck === 'none') {
  console.error(
    `BLUR_ASSERT_FAIL: .glass-pop 计算样式 backdropFilter="${blurCheck}"（应为 blur(...)）—— 生产构建又丢了无前缀 backdrop-filter`,
  );
  server.close();
  process.exit(1);
}
console.log(`blur assert: .glass-pop backdropFilter = ${blurCheck} OK`);

const child = spawn(process.execPath, ['scripts/e2e-preview.mjs'], {
  env: { ...process.env, E2E_BASE: base },
  stdio: 'inherit',
});
child.on('exit', (code) => {
  server.close();
  process.exit(code ?? 1);
});
