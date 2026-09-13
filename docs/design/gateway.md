# Provider Gateway（协议适配层）行为总览

> 适用范围：主进程协议适配层的职责边界、统一接口、超时/重试/错误处理行为。payload/SSE/Header/参数映射的可执行细节在 `../contracts/protocol-mapping.md`。
> 何时读取：改 `electron/gateway/` 任何文件之前（先读本文再读契约）；排查请求链路问题时。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §6 + 原 docs/impl-contract.md §5（通用要求部分）

## 1. 职责

主进程模块，渲染进程不持有明文密钥、不直接请求服务商（CORS 由主进程 `net.fetch` 绕过）。渲染进程只提供"平台 id + 模型名 + 参数"，主进程查库解密密钥后发请求。

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
- HTTP 非 2xx：读响应体 `error.message` 统一映射 `ApiError{code,message}`；**任何错误对象序列化前过 `redact()`**（密钥 → `前3字符***`，见 `./security.md`）。
- 三种格式（`openai-chat` / `openai-responses` / `anthropic`）各自的 payload、SSE 事件、鉴权头、参数映射、URL 拼接（joinUrl）见 `../contracts/protocol-mapping.md`。
- 协议差异（top_k、system 字段位置、penalty 语义、思考开关载荷）在适配层内部消化，UI 仅提示。
- 发送前的上下文裁剪在 `gateway/trim.ts`（纯函数，行为见 `./context-trim.md`）。
