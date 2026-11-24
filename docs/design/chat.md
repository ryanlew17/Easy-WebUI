# 对话与生成

> 权威范围：生成编排、流式渲染、取消与失败、思考开关、生成统计。
> 何时读取：修改 `electron/chat.ts`、消息流式状态或 Composer 生成行为之前。
> 代码事实来源：`electron/chat.ts`、`src/store/messages.ts`、`shared/reasoning.ts`。
> 最后更新：2026-11-25

页面骨架和视觉规格见 `./ui-liquid-glass.md`；分支位置见 `./message-tree.md`；参数合成见 `./params.md`。

## 1. 生成生命周期

发送、重生成和续写共用主进程编排：

1. 按消息树规则写入或定位消息。
2. 按 `./context-trim.md` 组装发送载荷，经 `./gateway.md` 的适配层请求模型。
3. 通过 `chat:delta` 分流 `reasoning` 与 `content`，结束或失败时落库 assistant 状态。

- 同会话同一时间只允许一个生成，冲突报 `generation_in_progress`。
- 生成时禁用输入并显示停止；取消调用 `AbortController.abort()`，已收内容以 `partial: true` 落库。
- 请求失败时保留已收内容并记录脱敏错误，气泡提供重试；重试复用同一 user 消息，不生成重复记录。
- 后台 `run()` 必须捕获尾部 DAO/广播异常并记录脱敏日志，避免未处理 Promise 拒绝。
- `generateResponse` 仅允许激活叶为 user 时生成 assistant 子消息，否则报 `nothing_to_generate`。

## 2. 流式渲染

- 等待首包时显示 typing 指示器，首个 delta 后替换为正文。
- delta 进入增量缓冲，每 50ms flush；pending 按 `conversationId` 定向更新，未变化气泡通过稳定引用和 memo 避免重复 Markdown/高亮。
- 生成期代码块保持纯文本，完成后按需加载语言并高亮；聊天始终禁止 raw HTML，安全边界见 `./security.md`。

## 3. 思考开关

`reasoning_enabled` 是会话级设置，新会话默认开启，标题生成不受其影响。

- 开启：使用模型默认行为，不附加参数。
- 关闭：`shared/reasoning.ts` 的 `reasoningOffPayload()` 按格式生成载荷：openai-chat 为 `thinking:{type:'disabled'}`，openai-responses 为 `reasoning:{effort:'none'}`，anthropic 为 `thinking:{type:'disabled'}`；`AdapterChatInput.reasoningOff` 负责透传。
- `modelSupportsReasoning(modelId)` 只确认已知不支持名单；未知模型按支持处理并显示开关。

## 4. 生成统计

以请求发出为 `t0`：

| 指标 | 定义 |
| --- | --- |
| `ttft_ms` | 首个 reasoning/content delta − t0；非流式等于总用时 |
| `reasoning_ms` | 出现过 reasoning 时为首 content delta − t0，否则为流结束时间 |
| `total_ms` | 结束、中止或失败 − t0；中止和失败也落库 |

- reasoning 标题显示思考时长；完成后默认显示 tok/s、tokens 和“详情”标签，其余指标通过原生 `<details>` 展开。
- tok/s = `token_count / max(total_ms − ttft_ms, 1ms)`；时长格式化使用 `formatDurationMs`。
- 续写不新建消息，delta 追加到原消息；`total_ms` 和 `token_count` 累加，保留首段 `ttft_ms`，`finish_reason` 取本次值。
