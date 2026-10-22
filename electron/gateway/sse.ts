/**
 * SSE 解析器（可复用；docs/contracts/protocol-mapping.md，SSE 事件）。
 *
 * 要点：
 * - 半行缓冲：网络分块可能切断一行，先攒在 buf，遇到 '\n' 才成行；
 * - 按 SSE 规范：`data:` 行可多条（以 '\n' 连接），空行派发一个事件；
 * - `:` 开头的注释行（keep-alive 心跳）忽略；
 * - 空闲超时：每次 read 起 idleMs 定时器，超时抛 StreamIdleError（上层据此重试）；
 * - signal 取消时 reader.cancel() 并向上抛。
 */
import { StreamIdleError } from './errors';
import { ResponseBodyTooLargeError } from './read';
import type { ReadableStreamReadResult } from 'node:stream/web';

export const DEFAULT_STREAM_IDLE_MS = 60_000;
/**
 * 单个 SSE 事件（及半行缓冲）的字符上限（@req REQ-2026-001 C2）：
 * 恶意端点可发送永不换行/永不空行的流使 buf/eventData 无限增长。
 */
export const MAX_SSE_EVENT_CHARS = 1_000_000;

export async function* iterateSse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
  idleMs: number = DEFAULT_STREAM_IDLE_MS,
  maxEventChars: number = MAX_SSE_EVENT_CHARS,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  let eventData: string[] = [];
  let eventChars = 0; // 当前事件已累积字符（含 data: 多行），配 maxEventChars 使用

  const flushEvent = (): string | null => {
    if (eventData.length === 0) return null;
    const data = eventData.join('\n');
    eventData = [];
    eventChars = 0;
    return data;
  };

  const processLine = function* (lineRaw: string): Generator<string> {
    let line = lineRaw;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line === '') {
      const ev = flushEvent();
      if (ev !== null) yield ev;
      return;
    }
    if (line.startsWith(':')) return; // 注释 / 心跳
    if (line.startsWith('data:')) {
      eventChars += line.length;
      if (eventChars > maxEventChars) {
        throw new ResponseBodyTooLargeError(`sse event exceeds ${maxEventChars} chars`);
      }
      eventData.push(line.slice(5).replace(/^ /, ''));
    }
    // event:/id:/retry: 行忽略——三种协议的事件类型都在 data JSON 内
  };

  try {
    // abort 监听只挂一次（避免长流式中每次 read 都累积 once 监听器）
    let abortReject: ((e: unknown) => void) | undefined;
    const abortPromise = signal
      ? new Promise<never>((_, reject) => {
          abortReject = reject;
        })
      : null;
    if (signal) {
      if (signal.aborted) {
        abortReject?.(signal.reason ?? new DOMException('aborted', 'AbortError'));
      } else {
        signal.addEventListener(
          'abort',
          () => abortReject?.(signal.reason ?? new DOMException('aborted', 'AbortError')),
          { once: true },
        );
      }
    }

    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new StreamIdleError(`stream idle for ${idleMs}ms`)), idleMs);
      });

      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race(
          abortPromise ? [reader.read(), idle, abortPromise] : [reader.read(), idle],
        );
      } finally {
        if (timer) clearTimeout(timer);
      }

      if (result.done) {
        const rest = decoder.decode(); // flush 解码器尾部
        if (rest) buf += rest;
        if (buf.length > 0) yield* processLine(buf);
        const ev = flushEvent();
        if (ev !== null) yield ev;
        return;
      }

      buf += decoder.decode(result.value, { stream: true });
      // 永不换行的流会让 buf 无限增长：半行也纳入单事件上限
      if (buf.length > maxEventChars) {
        throw new ResponseBodyTooLargeError(`sse line exceeds ${maxEventChars} chars`);
      }
      let idx: number;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        yield* processLine(line);
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* 已关闭 */
    }
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
