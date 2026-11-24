# 协议映射契约（Provider Gateway → 三种 API 格式）

> 适用范围：`openai-chat` / `openai-responses` / `anthropic` 三种格式的请求 payload、SSE 事件、鉴权 Header、参数映射、URL 拼接（joinUrl）、协议层错误码。实现位于 `electron/gateway/`。
> 何时读取：修改协议适配器、新增参数映射、排查某服务商请求/流式解析问题之前。
> 关联需求：无（协议相关需求先落 `../requirements/`）。
> 最后更新：2026-11-25
> 来源：原 prd.md §6 + 原 docs/impl-contract.md §3/§5（重复内容已合并去重；历史原文见 Git 记录）

适配层统一接口见 `electron/gateway/api.ts`（`AdapterChatInput` / `ProtocolAdapter`），输出为 `shared/types.ts` 的 `ChatChunk`；行为总览见 `../design/gateway.md`。本文只定义三种格式的映射，不镜像类型定义。

## 1. URL 拼接（`gateway/url.ts`，joinUrl）

早期设计稿写的是 `{base}/v1/chat/completions`，但大量国内服务商 base 已含版本段（`/v1` `/v3` `/v4`）或 Anthropic 兼容前缀（`/anthropic`）。按"最小惊讶原则"实现（以 `electron/gateway/url.ts` 代码为准）：

```
const base = rawBase.replace(/\/+$/, '');
const versioned = /\/v\d+$/.test(base);   // 仅 /vN 结尾视为已带版本段
return versioned ? `${base}${path}` : `${base}/v1${path}`;
// openai-chat:      joinUrl(base, '/chat/completions')、joinUrl(base, '/models')
// openai-responses: joinUrl(base, '/responses')、joinUrl(base, '/models')
// anthropic:        joinUrl(base, '/messages')、joinUrl(base, '/models')
//   → api.anthropic.com → /v1/messages；api.xiaomimimo.com/anthropic → /anthropic/v1/messages ✓
```

- **`/anthropic` 兼容前缀不算版本段**：Anthropic Messages API 真实路径是 `{base}/v1/messages`，因此该类 base 仍补 `/v1`（与官方 SDK 行为一致）。
- 已知局限：base 含版本段但不在末尾（罕见）时不识别，保持简单规则优先。

## 2. `openai-chat`（Chat Completions）

- `POST …/chat/completions`，`Authorization: Bearer`。
- payload `{model, messages, stream, temperature, top_p?, max_tokens?, stop?, presence_penalty?, frequency_penalty?, response_format?}`。
- SSE 解析：`data:` 行、`[DONE]` 终止、`choices[0].delta.content`；`choices[0].delta.reasoning_content` → `reasoning_delta`。流内 `{"error":{...}}` 事件不得静默忽略，须脱敏后抛出（@req REQ-2026-002）。
- 关闭思考（`reasoningOff`）：附加 `thinking:{type:'disabled'}`。

## 3. `openai-responses`（Responses API）

- `POST …/responses`；system 角色抽为顶层 `instructions`；assistant 历史用 `output_text`；`max_output_tokens`。
- payload `{model, input:[{role,content:[{type:'input_text',text}]}…], temperature, stream, max_output_tokens?, top_p?, text?}`。
- 流式事件 `response.output_text.delta` / `response.completed` / `response.failed`。
- 关闭思考：`reasoning:{effort:'none'}`。
- **不支持** top_k / min_p / penalties / stop，静默丢弃。

## 4. `anthropic`（Messages API）

- `POST …/messages`，Header `x-api-key` + `anthropic-version: 2023-06-01`。
- **`system` 是顶层字符串字段**，messages 不含 system 角色。
- **`max_tokens` 必填**：`limit_response_length` 开用其值，关用 4096 兜底；`top_k`（>0 才传）、`top_p`（enabled）、`stop_sequences`（非空）。
- 流式 `content_block_delta` → `delta.text`、`message_stop` 终止。
- 关闭思考：`thinking:{type:'disabled'}`。
- **不支持** structured / min_p / presence / repeat，静默省略。

## 5. 参数映射统一规则

入参为 resolveParams 后的生效 `ParamValues`：

- `temperature` 总是发送；`top_p` 仅 `top_p_enabled`；`max_tokens` 仅 `limit_response_length` 开；`stop`/`stop_sequences` 仅 `stop_strings` 非空；`presence_penalty` 仅 `presence_penalty_enabled`。
- `repeat_penalty_enabled 且值 > 1` → openai 系 `frequency_penalty = value − 1`（近似语义，代码注释注明取舍）；≤1 不发送。
- `top_k`（>0 才发送）用于 anthropic 与 OpenRouter；**仅 OpenRouter**（base_url host 含 `openrouter.ai`）额外支持 `min_p`(enabled) 与 `repetition_penalty`(=repeat_penalty，enabled)。
- `structured_output_enabled` → openai `response_format` / responses `text.format`（json_schema strict，name=`easyui_output`）；schema 不可解析在 buildRequest 阶段抛 `invalid_json_schema`（请求不发出）。
- 协议差异处理原则：适配层**静默丢弃**目标协议不支持的参数，UI 仅做"当前协议不生效"提示，不强制报错。

## 6. 协议层错误码

超时、重试、非 2xx 映射与 `redact()` 的统一行为见 `../design/gateway.md`，本文不重复。协议适配层产生的错误码：

`invalid_json_schema`、`context_overflow`（stop 策略超预算，由编排层 `chat.ts` 在落库 assistant 占位前抛出）、`context_truncated`（单条截断警告）。
