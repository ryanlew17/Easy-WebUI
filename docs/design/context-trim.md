# 上下文裁剪与计量

> 适用范围：发送前的消息组装、token 估算、预算计算、三种溢出策略、单条截断、渲染进程上下文计量环。
> 何时读取：改 `electron/gateway/trim.ts`、上下文预算逻辑、输入坞计量环之前。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §4.3 + 原 docs/impl-contract.md §5（裁剪条目）

发送前在主进程组装消息（`gateway/trim.ts`，纯函数可测）。**会话历史在 DB 中永久完整保存，裁剪只影响发送载荷。**

## 1. 估算器

- 优先 `js-tiktoken`（cl100k_base）；任何失败回退 `ceil(字符数 / 3)`（中文偏保守）。

## 2. 预算

- 预算 = `min(context_window, 模型上限未知则 context_window)` − 输出预留 − 256（安全余量）。
- 输出预留 = `limit_response_length` 开 ? `max_tokens` : 4096（缺省视为开，兼容旧调用）。

## 3. 溢出策略三态（`context_overflow`）

| 策略 | 行为 |
| --- | --- |
| `rolling`（默认） | 成对丢弃最老 user/assistant，至少保最后一条 |
| `truncate_middle` | 保系统提示 + 最老一轮 + 尽量新的尾部，丢中段；头尾仍超预算退化为丢头 + 截断最后一条 |
| `stop` | 不裁剪，超预算返回 `overflow: true`，由编排层 `chat.ts` 在落库 assistant 占位前抛 `ApiError{code:'context_overflow'}` 阻断发送 |

## 4. 单条消息超预算

rolling / truncate_middle 下单条消息本身超预算 → 二分截断并标记 `truncated: true`（经 `onChatError` 发 `{code:'context_truncated'}` 警告，**不阻断**）。

## 5. 上下文计量（渲染进程本地计算，无 IPC）

- 用量 = 激活路径消息 `token_count`（缺省按 4 字符 ≈ 1 token 估算）+ system_prompt + 输入草稿估算。
- 预算 = 生效参数（resolveParams）的 `context_window`。
- 展示：输入坞发送键左侧环形进度（>80% 转 warning 色），悬停浮层三行明细（会话 tokens / 窗口 / 已用%）。
