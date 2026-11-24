# 会话标题

> 权威范围：自动/手动标题生成、目标模型解析、重试和标题事件。
> 何时读取：修改 `shared/title.ts`、主进程标题流程或侧栏生成标题操作之前。
> 代码事实来源：`shared/title.ts`、`electron/chat.ts`、`src/store/conversations.ts`。
> 最后更新：2026-11-22

## 1. 目标模型

`resolveTitleTarget` 优先使用设置中的 `title_provider_id + title_model`，缺省回退到会话当前模型。模型缺失、provider 不存在或无密钥时报 `title_model_unavailable`；没有 user 消息时报 `title_no_user_message`。

## 2. 自动与手动生成

- 自动生成在首轮对话完成、`auto_title` 开启且标题为空时触发；单次 20s 超时，间隔 800ms 重试一次。
- 自动成功广播 `title:updated` 并更新 `updated_at`；失败广播 `title:failed` 并提示，不阻断对话。
- 侧栏手动生成强制覆盖现有标题，忽略 `auto_title` 和标题是否为空；成功返回更新后的 Conversation 并广播同一事件，失败按标准 IPC 错误 reject。
- 渲染进程通过 `applyTitle` 消费 `title:updated`；`chat:done` 只做本地排序更新，不整表 refetch，避免旧快照覆盖新标题。事件契约见 `../contracts/impl-contract.md`。

空标题统一经 `displayTitle` 显示占位文本。标题生成不受会话思考开关影响。
