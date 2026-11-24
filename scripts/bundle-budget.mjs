import './node-version-guard.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

// @req REQ-2026-006：首屏按 HTML 实际引用计算，懒加载引擎单独计量。
const args = process.argv.slice(2);
const value = (name) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const baseline = value('--baseline');
const candidate = value('--candidate') ?? 'dist';
const budget = 50 * 1024;
if (!baseline) throw new Error('Usage: node scripts/bundle-budget.mjs --baseline <dir> [--candidate dist]');

function initialScripts(root) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sources = new Set();
  for (const match of html.matchAll(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g)) sources.add(match[1]);
  for (const match of html.matchAll(/<link\b[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g)) sources.add(match[1]);
  return [...sources];
}
function size(root, relative) {
  const file = path.join(root, relative.replace(/^\.\//, ''));
  return gzipSync(fs.readFileSync(file), { level: 9 }).byteLength;
}
function total(root, files) {
  return files.reduce((sum, file) => sum + size(root, file), 0);
}

const baselineFiles = initialScripts(baseline);
const candidateFiles = initialScripts(candidate);
const baselineBytes = total(baseline, baselineFiles);
const candidateBytes = total(candidate, candidateFiles);
const lazy = fs.readdirSync(path.join(candidate, 'assets'))
  .filter((file) => /^(?:dom|gpu|map-encoder)[^/]*\.js$/.test(file))
  .map((file) => ({ file, gzipBytes: size(candidate, `assets/${file}`) }));
const result = {
  baseline: { files: baselineFiles, gzipBytes: baselineBytes },
  candidate: { files: candidateFiles, gzipBytes: candidateBytes },
  deltaGzipBytes: candidateBytes - baselineBytes,
  budgetGzipBytes: budget,
  withinBudget: candidateBytes - baselineBytes <= budget,
  engineLazyChunks: lazy,
};
console.log(JSON.stringify(result, null, 2));
if (!result.withinBudget) process.exit(1);
