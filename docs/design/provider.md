# 模型平台管理（Provider）

> 适用范围：平台的增删改查、预置模板、模型列表拉取、连通性检测、API 格式自动探测的当前行为。
> 何时读取：改设置页平台管理 UI、`fetchModels`/`testModel`/`detectFormat` 相关主进程或 mock 逻辑之前。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §3；字段契约见 `../contracts/impl-contract.md` §1/§5

## 1. 数据字段

每个"平台"（Provider）包含（类型定义见 contracts）：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID v4 |
| `name` | 用户自定义名称，如"OpenAI 官方""DeepSeek 中转" |
| `base_url` | API 地址；存储时去掉末尾 `/`（端点拼接见 `../contracts/protocol-mapping.md` §1） |
| `api_format` | 枚举：`openai-chat` / `openai-responses` / `anthropic` |
| `api_key_cipher` | **加密后**的密钥密文，永不存明文；**只在主进程 DB 中存在**，渲染进程拿到的是 `has_key: boolean` |
| `models` | 已启用模型列表：`{ id, display_name?, enabled, last_check? }`，`last_check: { status, latency_ms?, checked_at?, error? }` |
| `created_at` / `updated_at` | 时间戳 |

## 2. 交互流程

**新增/编辑平台**（模态框）：

1. 12 家**预置模板**作为快捷填充（点选自动填 base_url/format，名称可改，不预写数据库；模板表见 `../contracts/impl-contract.md` §5）；也支持完全自定义。
2. 填写名称、API 地址、API 密钥，选择响应格式（默认 `openai-chat`，提供"自动探测"，见 §4）。
3. 点击**"检测模型列表"**：openai 系 `GET /v1/models` + Bearer 头；anthropic 加 `x-api-key` + `anthropic-version` 头。超时 15s；失败在输入框下方给可读错误（状态码 + 服务商 message，**密钥已脱敏**）。支持用未保存的草稿密钥直接拉取。
4. 成功后弹出模型复选列表，勾选写入 `models`（`enabled: true`）。
5. **列表获取失败允许"手动添加模型"**（直接输入模型 ID）——很多中转站屏蔽列表接口，这是硬性要求。

**连接检测**：

- 单模型"检测"与"全部检测"（主进程并发 = 4，逐个事件回报 `model:check`）。
- 检测 = 最小开销请求：`messages=[{role:'user',content:'ping'}]`、`max_tokens=1`、非流式。
- 结果持久化到 `last_check`：绿色圆点 + 延迟毫秒数 / 红色圆点 + 悬浮错误详情。

**删除保护**：删除平台需确认，提示"该平台的 N 个会话将保留，但需重新指定模型"（`affectedConversations`）。

## 3. 密钥流转

`ProviderDraft.api_key` 仅在新建/编辑的本次 IPC 传输中出现，主进程立即加密落库；渲染进程任何时刻只见 `has_key`。加解密与脱敏规则见 `./security.md`。

## 4. 格式自动探测（尽力而为，可失败）

按顺序尝试：

1. Bearer 头 `GET /v1/models` → 成功则 `openai-chat`；
2. 换 `x-api-key` + `anthropic-version` 头 → 成功则 `anthropic`。

均失败保持用户选择并提示"无法自动识别，请手动选择"。探测只是辅助，**不阻断保存**。
