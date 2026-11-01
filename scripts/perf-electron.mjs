import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { measurementIdentity } from './perf-identity.mjs';

const ROOT = process.cwd();
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function waitForDevTools(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Electron DevTools endpoint timeout')), 15000);
    const onData = (data) => {
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(data.toString());
      if (!match) return;
      clearTimeout(timer);
      child.stderr.off('data', onData);
      resolve(match[1]);
    };
    child.stderr.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Electron exited before DevTools was ready (${code})`));
    });
  });
}

for (let run = 0; run < 3; run++) {
  const tempRoot = fs.mkdtempSync(path.join(ROOT, 'build', 'req003-electron-'));
  const appDir = path.join(tempRoot, 'app');
  fs.mkdirSync(path.join(appDir, 'build'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'dist'), path.join(appDir, 'dist'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'dist-electron'), path.join(appDir, 'dist-electron'), {
    recursive: true,
  });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(appDir, 'package.json'));
  fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(appDir, 'build', 'icon.png'));

  const start = performance.now();
  const child = spawn(
    ELECTRON,
    [
      appDir,
      '--remote-debugging-port=0',
      `--user-data-dir=${path.join(tempRoot, 'user-data')}`,
      '--no-first-run',
    ],
    {
      cwd: appDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        EASYUI_MOCK_UPDATE: '1',
        NODE_PATH: [path.join(ROOT, 'node_modules'), process.env.NODE_PATH]
          .filter(Boolean)
          .join(path.delimiter),
      },
    },
  );
  const devToolsEndpoint = waitForDevTools(child);
  let output = '';
  child.stdout.on('data', (data) => (output += data));
  child.stderr.on('data', (data) => (output += data));
  let browser;
  let completed = false;
  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: await devToolsEndpoint,
      defaultViewport: null,
    });
    let page;
    for (let attempt = 0; attempt < 100 && !page; attempt++) {
      page = (await browser.pages()).find((candidate) => candidate.url().includes('dist/index.html'));
      if (!page) await sleep(50);
    }
    if (!page) throw new Error('Electron application page not found');
    await page.waitForFunction(
      () => window.easyui !== undefined && document.querySelector('textarea, button') !== null,
      { timeout: 10000 },
    );
    const info = await page.evaluate(() => window.easyui.getSystemInfo());
    if (path.resolve(info.dataPath) !== path.join(appDir, 'data')) {
      throw new Error(`benchmark escaped isolated data dir: ${info.dataPath}`);
    }
    results.push({
      run: run + 1,
      interactiveMs: +(performance.now() - start).toFixed(2),
      isolatedData: true,
    });
    completed = true;
    await browser.disconnect();
  } finally {
    try {
      await browser?.disconnect();
    } catch {
      // CDP 已断开
    }
    try {
      execFileSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
    } catch {
      // 进程已退出
    }
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(5000)]);
    }
    fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    if (!completed) {
      throw new Error(`Electron cold start run ${run + 1} failed: ${output.slice(-1500)}`);
    }
  }
}

const sorted = results.map((result) => result.interactiveMs).sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      kind: 'req003-electron-cold-start',
      environment: {
        ...measurementIdentity(),
        platform: process.platform,
        release: os.release(),
        cpu: os.cpus()[0]?.model ?? 'unknown',
        electron: '45.2.1',
        updateChannel: 'deterministic mock (no external update request)',
        dataDir: 'isolated temporary app and userData under build/',
      },
      summary: {
        runs: results.length,
        medianMs: sorted[1],
        maxMs: sorted[2],
        budgetMs: 3000,
        withinBudget: sorted[2] < 3000,
      },
      results,
    },
    null,
    2,
  ),
);
