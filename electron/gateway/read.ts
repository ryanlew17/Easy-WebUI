/**
 * 响应体限额读取（@req REQ-2026-001 C2/M3）。
 *
 * 背景：网关消费的是"用户可自建/可被入侵"的 provider 端点响应——压缩炸弹、
 * 超大 body、无 content-length 的无限供给都必须有硬上限。所有非流式消费点
 * （listModels / toApiError / 三个适配器的非流式分支）统一走这里。
 *
 * 本模块刻意不 import errors.ts（errors.ts 的 toApiError 要用本模块，避免循环依赖）：
 * 抛 ResponseBodyTooLargeError（自带 code），由 normalizeError 提取 .code 归一化。
 */

export class ResponseBodyTooLargeError extends Error {
  code = 'response_too_large';
  constructor(message = 'response body too large') {
    super(message);
    this.name = 'ResponseBodyTooLargeError';
  }
}

/** 非流式响应体上限（模型列表/非流式聊天响应） */
export const MAX_NONSTREAM_BYTES = 16 * 1024 * 1024;
/** 错误响应体上限（toApiError 读取错误详情用，更小） */
export const MAX_ERROR_BYTES = 1 * 1024 * 1024;

/** 鸭子类型：真实 Response 与测试假对象都只需满足这个面 */
export interface LimitedResponseLike {
  headers?: { get(name: string): string | null };
  body?: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

export async function readTextWithLimit(
  res: LimitedResponseLike,
  maxBytes: number = MAX_NONSTREAM_BYTES,
): Promise<string> {
  const declared = Number(res.headers?.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ResponseBodyTooLargeError(`response exceeds limit (content-length ${declared} > ${maxBytes})`);
  }
  if (!res.body) {
    // 无 body 流（测试假对象等）：text() 后按字节数兜底检查
    const t = await res.text();
    if (Buffer.byteLength(t, 'utf8') > maxBytes) {
      throw new ResponseBodyTooLargeError(`response exceeds limit (${maxBytes} bytes)`);
    }
    return t;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          /* 已关闭 */
        }
        throw new ResponseBodyTooLargeError(`response exceeds limit (${maxBytes} bytes)`);
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
  const all = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder('utf-8').decode(all);
}

export async function readJsonWithLimit(
  res: LimitedResponseLike,
  maxBytes: number = MAX_NONSTREAM_BYTES,
): Promise<unknown> {
  return JSON.parse(await readTextWithLimit(res, maxBytes));
}
