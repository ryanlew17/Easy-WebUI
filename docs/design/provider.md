# 模型平台

> 权威范围：平台编辑、预置模板、模型列表、连通性检测和格式自动探测。
> 何时读取：修改平台设置页、`fetchModels`、`testModel`、`detectFormat` 或对应 Mock 之前。
> 代码事实来源：`shared/types.ts`、`shared/presets.ts`、`electron/gateway/`。
> 最后更新：2026-11-22

## 1. 数据与密钥边界

Provider、ProviderDraft、模型和检测结果的字段以 `shared/types.ts` 为准。

- `base_url` 存储时去掉末尾 `/`，端点拼接见 `../contracts/protocol-mapping.md`。
- 渲染进程只获得 `has_key: boolean`，不获得 `api_key_cipher`；草稿密钥只用于本次保存或检测。
- `models` 保存启用状态、可选显示名和 `last_check`。密钥加密、换 host 清钥与脱敏规则统一见 `./security.md`。

## 2. 新增与编辑

1. 从 `shared/presets.ts` 的 12 家模板快捷填充，或使用完全自定义配置；点选模板不写数据库。
2. 填写名称、API 地址和密钥，选择响应格式或使用自动探测。
3. “检测模型列表”支持未保存的草稿密钥；成功后在复选列表中勾选启用模型。
4. 列表获取失败时仍可手动输入模型 ID，不因列表接口不可用而阻断保存。
5. 检测失败在表单内显示可读、已脱敏的错误。

## 3. 连通性检测

- 单模型检测和全部检测使用最小请求：user 内容 `ping`、`max_tokens=1`、非流式。
- 主进程检测并发为 4，通过 `model:check` 逐条推送进度，并持久化 `last_check`。
- 状态徽章和交互式危险色遵循 `./ui-liquid-glass.md`，不在本文另定义颜色。

删除平台时通过 `affectedConversations` 提示关联会话会保留但需要重新指定模型；确认规则见 `./ux-guidelines.md`。

## 4. 格式自动探测

依次尝试 Bearer 头的 OpenAI 模型列表请求和 `x-api-key + anthropic-version` 的 Anthropic 请求；成功分别选择 openai-chat 或 anthropic。均失败时保留用户选择并提示手动选择，不阻断保存。
