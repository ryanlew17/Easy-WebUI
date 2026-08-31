/* 探针：CSS zoom 是否杀死 backdrop-filter（Chromium/Edge 无头）。输出三张裁剪截图人工对比。 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'screenshots');

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  body { margin:0; font-family: sans-serif; background: linear-gradient(135deg,#dfefff,#ffe9f6); }
  .behind { position:absolute; top:40px; left:40px; font-size:28px; line-height:1.4; color:#222; }
  .panel { position:absolute; top:30px; left:30px; width:420px; height:160px;
    background: rgba(255,255,255,0.55);
    backdrop-filter: blur(40px) saturate(200%);
    -webkit-backdrop-filter: blur(40px) saturate(200%);
    border:1px solid rgba(255,255,255,.6); border-radius:16px; }
</style></head><body>
  <div class="behind">锐利的背景文字 SHARP TEXT 12345<br>第二行背景文字 MORE TEXT 67890<br>第三行背景文字 THIRD LINE ABCDEF</div>
  <div class="panel"></div>
</body></html>`;

const browser = await puppeteer.launch({
  headless: true,
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  args: ['--force-device-scale-factor=1'],
});
const page = await browser.newPage();
await page.setViewport({ width: 520, height: 260, deviceScaleFactor: 1 });
await page.setContent(HTML, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: path.join(out, 'probe-a-zoom1.png') });

await page.evaluate(() => { document.documentElement.style.zoom = '1.5'; });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: path.join(out, 'probe-b-csszoom15.png') });

await page.evaluate(() => { document.documentElement.style.zoom = ''; });
const client = await page.createCDPSession();
await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.5 });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: path.join(out, 'probe-c-pagezoom15.png') });

await browser.close();
console.log('PROBE_DONE');
