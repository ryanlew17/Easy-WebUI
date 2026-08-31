/**
 * 主进程日志（kimi.md §8.2）：data/logs/app.log，按日轮转，保留 7 天。
 * 纯 fs 实现：写入前检查日期是否跨天，跨天则把 app.log 改名为
 * app-YYYY-MM-DD.log 并新开；启动时清理 7 天前的滚动文件。
 * 所有消息统一过 redactString，Header/body 中的密钥不会进日志。
 */
import fs from 'node:fs';
import path from 'node:path';
import { redactString } from './crypto/redact';

const KEEP_DAYS = 7;

let logsDir: string | null = null;
let currentDate = '';

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD（UTC，够用于轮转）
}

function rotateIfNeeded(): void {
  if (!logsDir) return;
  const t = today();
  if (t === currentDate) return;
  const active = path.join(logsDir, 'app.log');
  if (currentDate && fs.existsSync(active)) {
    // 跨天：把昨天的活动文件归档（同日期已存在则带时间戳后缀）
    const stamp = `${currentDate}`;
    let target = path.join(logsDir, `app-${stamp}.log`);
    if (fs.existsSync(target)) {
      target = path.join(logsDir, `app-${stamp}-${Date.now()}.log`);
    }
    try {
      fs.renameSync(active, target);
    } catch {
      /* 轮转失败不阻断写入 */
    }
  }
  currentDate = t;
}

function cleanupOld(): void {
  if (!logsDir) return;
  const cutoff = Date.now() - KEEP_DAYS * 24 * 3600 * 1000;
  for (const f of fs.readdirSync(logsDir)) {
    if (!/^app-.*\.log$/.test(f)) continue;
    try {
      const stat = fs.statSync(path.join(logsDir, f));
      if (stat.mtimeMs < cutoff) fs.rmSync(path.join(logsDir, f), { force: true });
    } catch {
      /* ignore */
    }
  }
}

export function initLogger(dataDir: string): void {
  logsDir = path.join(dataDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  currentDate = today();
  cleanupOld();
}

export function log(level: 'info' | 'warn' | 'error', message: string, meta?: unknown): void {
  if (!logsDir) return;
  rotateIfNeeded();
  const safeMeta = meta === undefined ? '' : ` ${redactString(safeStringify(meta))}`;
  const line = `${new Date().toISOString()} [${level}] ${redactString(message)}${safeMeta}\n`;
  try {
    fs.appendFileSync(path.join(logsDir, 'app.log'), line, 'utf8');
  } catch {
    /* 日志失败不影响主流程 */
  }
}

function safeStringify(v: unknown): string {
  try {
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return '[unserializable]';
  }
}

export const logger = {
  info: (m: string, meta?: unknown) => log('info', m, meta),
  warn: (m: string, meta?: unknown) => log('warn', m, meta),
  error: (m: string, meta?: unknown) => log('error', m, meta),
};
