# Provider Gateway（协议适配层）行为总览

> 适用范围：主进程协议适配层的职责边界、统一接口、超时/重试/错误处理行为。payload/SSE/Header/参数映射的可执行细节在 `../contracts/protocol-mapping.md`。
> 何时读取：改 `electron/gateway/` 任何文件之前（先读本文再读契约）；排查请求链路问题时。
> 关联需求：REQ-2026-001（2026-10 安全审计修复）。
> 最后更新：2026-10-22
> 来源：原 prd.md §6 + 原 docs/impl-contract.md §5（通用要求部分）

## 1. 职责

主进程模块，渲染进程不持有明文密钥、不直接请求服务商（CORS 由主进程 `net.fetch` 绕过）。渲染进程只提供"平台 id + 模型名 + 参数"，主进程查库解密密钥后发请求。

**HTTP 栈**（REQ-2026-001）：生产环境经 `setGatewayFetch` 注入 Electron `net.fetch`（Chromium 网络栈——Brotli/gzip 解压不进 Node 主进程）；未注入时回落 `globalThis.fetch`（vitest/工具场景）。

统一接口（`AdapterChatInput` 含 `reasoningOff` 透传）：

```ts
interface ChatRequest {
  providerId: string; model: string;
  messages: { role: 'system'|'user'|'assistant'; content: string }[];
  params: ParamValues;            // resolveParams 后的生效参数
  stream: boolean; reasoningOff?: boolean;
  signal: AbortSignal;
}
interface ChatChunk { delta?: string; reasoning_delta?: string; finishReason?: string; usage?: Usage; error?: ApiError }
// 统一出口：chat(req): AsyncIterable<ChatChunk>；另提供 listModels() / testModel()
```

## 2. 通用行为

- **连接超时 15s**；流式空闲 60s 无数据自动重试 1 次，再失败报错（UI 给"重试"按钮，见 `./chat.md` §2）。
- **重定向一律拒绝**（`redirect: 'manual'`，3xx → `redirect_rejected`；REQ-2026-001：LLM API 无合法重定向，跨源 307/308 会转发 `x-api-key` 与请求体）。
- **响应大小硬上限**（REQ-2026-001）：非流式 body ≤ 16MB、错误体 ≤ 1MB（`gateway/read.ts`），SSE 单事件/半行 ≤ 1M 字符（`sse.ts`），会话累计 content+reasoning ≤ 4M 字符（`chat.ts`，超限中止并按 partial 落库）——统一报 `response_too_large`。
- HTTP 非 2xx：读响应体 `error.message` 统一映射 `ApiError{code,message}`；**任何错误对象序列化前过 `redact()`**（密钥 → `前3字符***`，见 `./security.md`）；服务商可控的 error `code`/`type` 经 `sanitizeErrorCode` 脱敏截断（≤128 字符白名单字符集）。
- 三种格式（`openai-chat` / `openai-responses` / `anthropic`）各自的 payload、SSE 事件、鉴权头、参数映射、URL 拼接（joinUrl）见 `../contracts/protocol-mapping.md`。
- 协议差异（top_k、system 字段位置、penalty 语义、思考开关载荷）在适配层内部消化，UI 仅提示。
- 发送前的上下文裁剪在 `gateway/trim.ts`（纯函数，行为见 `./context-trim.md`）。
