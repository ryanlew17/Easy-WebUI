# Easy WebUI — 实现契约（跨进程接口）

> 适用范围：跨进程契约的代码事实来源索引、事件通道、IPC 错误编码、Web 预览 Mock 桥行为。
> 何时读取：新增/修改任何 IPC 方法、共享类型、preload 白名单、mock 桥实现之前；排查两端行为不一致时。
> 关联需求：无（变更需求先落 `../requirements/`，再改本契约）。
> 最后更新：2026-11-02

## 1. 事实来源与安全红线

接口契约以**代码为唯一事实来源**，本文不镜像类型定义；改契约 = 改代码 + 同步本文件相关章节。

| 契约 | 事实来源 |
| --- | --- |
| 共享类型（`Provider` / `Conversation` / `Message` / `GeneralSettings` / `EasyUiApi` / 更新与备份类型等） | `shared/types.ts` |
| IPC 通道名常量 + 全部入参 zod schema | `shared/ipc.ts`（schema）与 `shared/ipc-constants.ts`（无 zod 的通道/上限常量，preload 与 mock 复用） |
| 参数取值范围与 overrides 语义 | `shared/params.ts` + `../design/params.md` |
| 预置供应商模板（12 家，端点已核实，仅快捷填充不预写库） | `shared/presets.ts` |
| 错误编码实现 | `shared/errors.ts` |

- preload 以 `contextBridge.exposeInMainWorld('easyui', …)` 暴露 `EasyUiApi`；Web 预览由 `src/bridge/mock.ts` 完整实现（§4）。所有方法返回 Promise；主进程 handle 端对每个 payload 逐一 zod 校验。
- **安全红线**：`Provider` 不含 `api_key_cipher` 字段（主进程 DAO 查询时剥离，渲染进程只见 `has_key` 布尔，永不见密钥/密文）；任何错误对象抛给渲染进程前必过 `redact()`。详见 `../design/security.md`。

## 2. 事件通道（`webContents.send`）

| 通道 | 载荷 | 触发 |
| --- | --- | --- |
| `chat:delta` | `{ conversationId, messageId, delta, reasoning_delta? }` | 流式增量（content 与 reasoning 分流） |
| `chat:done` | `{ conversationId, messageId, message }` | 生成完成（含中止 `partial`、失败 `error` 落库后） |
| `chat:error` | `{ conversationId, messageId, error }` | 流中错误 / `context_truncated` 警告 |
| `model:check` | `{ providerId, modelId, check }` | testAllModels 逐个回报 |
| `title:updated` | `{ conversationId, title }` | 标题生成成功（自动 + 手动） |
| `title:failed` | `{ conversationId, error }` | 自动标题重试用尽 |
| `update:available` | `UpdateInfo` | 启动自检发现新版（仅广播；下载由用户知情触发） |
| `update:progress` | `UpdateProgress` | 下载进度 |

preload 用 `ipcRenderer.on` 转发并返回 unsubscribe。渲染进程消费注意（现状快照）：`App.tsx` 订阅 `title:updated` → `useConversationsStore.applyTitle`（同步 bump `updated_at` 保持排序一致）；`chat:done` 只做本地 `touchLocal` 重排序，**不整表 refetch**（避免 listConversations 旧快照晚到把新标题盖回空串的竞态）。

## 3. IPC 错误码跨进程编码（`shared/errors.ts`）

invoke 拒绝时 Electron 只序列化 `Error.message`（自定义 `.code` 丢失）。约定：

- 主进程 `handle` 包装统一 catch → `redact()` → `throw new Error('EASYUI_ERR:' + JSON.stringify({ code, message }))`。
- code 推导：显式 `.code` 优先 → ZodError 报 `invalid_input` → 裸 code 作 message 的历史抛法 → 兜底 `unknown`。
- 渲染进程一律用 `parseIpcError(err): ApiError` 解码（识别前缀 / 自带 `.code` / 裸 code message / 兜底 `unknown`），任何消费点不得直接读 `err.code` / `err.message`。
- 已知错误码（非穷尽）：`invalid_input`、`invalid_json_schema`（结构化 schema 不可解析，请求不发出）、`context_overflow`（stop 策略超预算）、`context_truncated`（单条截断警告）、`preset_not_found`、`global_preset_readonly`、`generation_in_progress`、`nothing_to_generate`、`title_model_unavailable`、`title_no_user_message`、`electron_only`。

## 4. Web 预览 Mock 桥（`src/bridge/`）

- `src/bridge/index.ts`：`export function getApi(): EasyUiApi` —— 若 `window.easyui` 存在则返回之，否则返回 `mockApi`。UI 代码只依赖 `getApi()`，不感知差异；Electron 下 preload 注入失败而降级 mock 时必须 `console.warn` 明示数据不会写入应用数据库，避免静默改用 localStorage（@req REQ-2026-001）。
- `src/bridge/mock.ts`：用 localStorage（key 前缀 `easyui_mock_`）实现**完整** `EasyUiApi`：
  - 平台/会话/消息/**参数预设** CRUD（presets 存 `easyui_mock_presets`，首访补建全局预设；loadConversations 对旧版 params 形状做 `migrateLegacyParams` 迁移）、设置、备份函数返回空/成功桩。
  - **API key 只存内存 Map，不落 localStorage**（REQ-2026-001：web 预览也可能填真实密钥）；`updateProvider` 换 host 清密钥、`base_url` 仅 http/https 禁 userinfo，均与主进程同规则。
  - `fetchModels` 返回几个假模型；`testModel` 300~900ms 随机延迟后 90% 成功。
  - `sendMessage` 以 setInterval 模拟流式输出一段内置 Markdown 演示回复（含代码块、列表、表格、reasoning 折叠块），支持 `stopGeneration`；演示回复中英各一段，按当前 i18n 语言选择。
  - 桌面独占功能的 mock 语义：`pickDataDir` → null、`setDataDir` → reject `electron_only`、升级恒 `unavailable/web_preview`（`localStorage.easyui_mock_update='1'` 演示完整链路）。
- **行为同步红线**：主进程逻辑的行为修复必须同步修 mock 桥（含分支删除路径恢复等），两端语义一致。`npm run dev` 纯浏览器必须可完整演示 UI。
