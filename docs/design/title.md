# 会话标题生成

> 适用范围：自动标题（首轮对话后）与手动标题（侧栏 ✨）的触发条件、模型解析、重试与事件广播。
> 何时读取：改 `shared/title.ts`、标题生成主流程、侧栏 ✨ 按钮之前。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §4.8 + 原 docs/impl-contract.md §2（generateTitle 注释）；API 见 `../contracts/impl-contract.md` §2

## 1. 模型解析（`resolveTitleTarget`，`shared/title.ts`）

设置页完整指定（`title_provider_id` + `title_model`）优先 → 回退用会话当前模型。都没有、或 provider 不存在/无密钥 → 抛 `title_model_unavailable`；无 user 消息 → `title_no_user_message`。

## 2. 自动标题

- 触发：首轮对话完成后（`auto_title` 开且标题为空）。
- 用解析出的模型生成极简短标题；单次 20s 超时、间隔 800ms 重试 1 次。
- 成功广播 `title:updated`（侧栏即时刷新，同步 bump `updated_at` 保持排序一致）；失败广播 `title:failed`（toast 警告，**绝不阻断对话**）。
- 渲染进程消费：`App.tsx` 订阅 → `useConversationsStore.applyTitle`；`chat:done` 只做本地 `touchLocal` 重排序，不整表 refetch（避免旧快照竞态，见 `../contracts/impl-contract.md` §3）。

## 3. 手动标题

- 侧栏 ✨ 强制覆盖现有标题，忽略 `auto_title` 与标题是否为空；错误码同 §1。
- 成功返回更新后的 Conversation 并广播 `title:updated`；失败 reject（`EASYUI_ERR:` 编码）。

## 4. 展示

空标题占位统一走 `displayTitle`（`src/lib/format.ts`，侧栏行 + 消息流顶栏）。标题生成不受会话思考开关影响（见 `./chat.md` §3）。
