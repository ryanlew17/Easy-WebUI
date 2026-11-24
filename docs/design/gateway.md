# Provider Gateway

> 权威范围：主进程请求入口、网络栈、超时重试、响应限制和统一错误行为。
> 何时读取：修改 `electron/gateway/` 或排查服务商请求链路之前。
> 代码事实来源：`electron/gateway/`、`shared/types.ts`、`shared/errors.ts`。
> 最后更新：2026-11-25

## 1. 职责边界

渲染进程只提交平台 ID、模型、消息和生效参数；主进程读取平台、解密密钥并发出请求。渲染进程不得持有明文密钥或直接请求服务商。

生产环境通过 `setGatewayFetch` 注入 Electron `net.fetch`，使用 Chromium 网络栈；测试和工具未注入时使用 `globalThis.fetch`。适配层输入以 `electron/gateway/api.ts` 的 `AdapterChatInput` 为准，输出统一为 `shared/types.ts` 的 `ChatChunk`；适配器同时提供 `listModels()` 和 `testModel()`。

## 2. 请求与资源限制

- 连接超时 15s；流式空闲 60s 自动重试一次，再失败则返回错误。
- 重定向一律使用 `redirect:'manual'` 并拒绝，3xx 映射为 `redirect_rejected`，避免跨源转发密钥和请求体。
- 非流式响应体不超过 16MB，错误体不超过 1MB；SSE 单事件/半行不超过 1M 字符。
- 单会话累计 content + reasoning 不超过 4M 字符；超限中止并按 partial 落库。上述限制统一报 `response_too_large`。

## 3. 适配与错误

- openai-chat、openai-responses、anthropic 的 URL、鉴权、payload、SSE 和参数映射由 `../contracts/protocol-mapping.md` 定义。
- 协议能力差异在适配层内部处理，UI 只提供提示；发送前裁剪规则见 `./context-trim.md`。
- HTTP 非 2xx 读取受限错误体并映射为 `ApiError`。所有错误出口必须执行 `./security.md` 的脱敏、code 白名单和消息截断，不得直接把服务商响应或密钥传给渲染进程。
- 取消、重试、partial 与失败的落库和展示由 `./chat.md` 负责。
