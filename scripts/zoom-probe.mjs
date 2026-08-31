/** 临时实验：CSS zoom 下 getBoundingClientRect / fixed 定位 / innerWidth / visualViewport / clientWidth 的坐标系关系 */
import puppeteer from 'puppeteer-core';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--disable-gpu', '--no-sandbox', '--force-device-scale-factor=1'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto('about:blank');

for (const z of [1, 2, 0.5]) {
  const r = await page.evaluate((zoom) => {
    const el = document.documentElement;
    el.style.zoom = String(zoom);
    el.style.width = `calc(100vw / ${zoom})`;
    el.style.height = `calc(100vh / ${zoom})`;
    document.body.style.margin = '0';
    // 参照按钮：layout left 100 / top 50，width 16
    const btn = document.createElement('button');
    btn.style.cssText = 'position:absolute;left:100px;top:50px;width:16px;height:16px;padding:0;border:1px solid #000;box-sizing:border-box;';
    document.body.appendChild(btn);
    // fixed 探针：style.left = 200
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:200px;top:100px;width:10px;height:10px;background:red;';
    document.body.appendChild(probe);
    const br = btn.getBoundingClientRect();
    const pr = probe.getBoundingClientRect();
    const rootRect = el.getBoundingClientRect();
    const out = {
      zoom,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      vvWidth: window.visualViewport?.width ?? null,
      vvHeight: window.visualViewport?.height ?? null,
      docClientW: el.clientWidth,
      docClientH: el.clientHeight,
      rootRectW: Math.round(rootRect.width * 100) / 100,
      rootRectLeft: rootRect.left,
      btnRectLeft: Math.round(br.left * 100) / 100, // layout 100 → ?
      btnRectWidth: Math.round(br.width * 100) / 100, // offsetWidth 18 → ?
      btnOffsetWidth: btn.offsetWidth,
      probeRectLeft: Math.round(pr.left * 100) / 100, // fixed left:200 → ?
    };
    btn.remove();
    probe.remove();
    el.style.zoom = '';
    el.style.width = '';
    el.style.height = '';
    return out;
  }, z);
  console.log(JSON.stringify(r));
}
await browser.close();
