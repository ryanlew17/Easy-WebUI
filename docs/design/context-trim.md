# 上下文裁剪与计量

> 权威范围：发送载荷的 token 估算、预算、溢出策略、单条截断和输入坞用量计算。
> 何时读取：修改 `electron/gateway/trim.ts`、上下文预算或计量控件之前。
> 代码事实来源：`electron/gateway/trim.ts`、`shared/params.ts`、`src/pages/chat/Composer.tsx`。
> 最后更新：2026-11-22

会话历史在数据库中完整保存；裁剪只影响发送载荷。参数来源见 `./params.md`。

## 1. 主进程发送预算

- token 优先使用 `js-tiktoken`（cl100k_base）；失败时回退 `ceil(字符数 / 3)`。
- 上下文上限取 `context_window` 与已知模型上限的较小值；模型上限未知时使用 `context_window`。
- 可用预算 = 上下文上限 − 输出预留 − 256 安全余量。
- 输出预留在 `limit_response_length` 开启时为 `max_tokens`，否则为 4096；缺省按开启处理以兼容旧调用。

## 2. 溢出策略

| `context_overflow` | 行为 |
| --- | --- |
| `rolling` | 成对丢弃最老 user/assistant，至少保留最后一条 |
| `truncate_middle` | 保留系统提示、最老一轮和尽量新的尾部；头尾仍超预算时退化为丢头并截断最后一条 |
| `stop` | 不裁剪；超预算返回 `overflow: true`，编排在写 assistant 占位前抛 `context_overflow` 并阻断发送 |

rolling 和 truncate_middle 遇到单条消息超预算时进行二分截断，标记 `truncated: true`，并通过 `onChatError` 发送 `context_truncated` 警告，不阻断发送。

## 3. 渲染进程用量估算

输入坞用量是本地预览，不调用 IPC，也不替代主进程发送预算：

- 已用 = 激活路径消息的 `token_count` + system prompt + 当前草稿；缺少 `token_count` 时按约 4 字符/token 估算。
- 显示预算取 `resolveParams` 后的 `context_window`。
- 用量控件的位置、警告色、浮层和渐隐规则分别见 `./ui-liquid-glass.md` 与 `./popover.md`。
