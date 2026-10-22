# Easy WebUI — 实现契约（跨进程接口）

> 适用范围：`shared/types.ts` 镜像说明、渲染进程桥接 API（`window.easyui.*` / mock 桥）、事件通道、IPC 错误编码、预置供应商数据、Mock 桥行为契约。
> 何时读取：新增/修改任何 IPC 方法、共享类型、preload 白名单、mock 桥实现之前；排查两端行为不一致时。
> 关联需求：无（变更需求先落 `../requirements/`，再改本契约）。
> 最后更新：2026-09-13
> 来源：原 docs/impl-contract.md §0–§4/§6（§3/§5 → protocol-mapping.md，§7–§11 → design/ 与 testing/；原文存档于 `../archive/impl-contract-v1.0.1-2026-09-13.md`）

---

## 0. 角色与优先级

- 本文件规定**跨进程接口与共享类型**，`electron/` 与 `src/` 两端必须严格一致。
- 工程与脚本、目录结构见 `../architecture.md`；协议适配细节见 [protocol-mapping.md](./protocol-mapping.md)；数据库结构见 [db-schema.md](./db-schema.md)；备份格式见 [backup-format.md](./backup-format.md)。
- 与 `../prd.md`（产品定位、边界、非目标）冲突时以 prd.md 为准；本文件未覆盖处遵循"最小惊讶原则"并在代码注释中说明取舍。
- **`shared/types.ts` 是最终事实来源**：本 §1/§2 是其文档镜像（已对齐 v1.0.1 真实接口面，含 v0.1.1 数据目录/在线升级与 v1.0.0 树形分支全部方法）。字段变更必须同步两端与本文件。

## 1. 共享类型（`shared/types.ts`，两端唯一事实来源）

```ts
export type ApiFormat = 'openai-chat' | 'openai-responses' | 'anthropic';

export interface ModelCheck {
  status: 'ok' | 'fail' | 'unknown';
  latency_ms?: number;
  checked_at?: number;
  error?: string; // 已脱敏
}
export interface ProviderModel { id: string; display_name?: string; enabled: boolean; last_check?: ModelCheck }
export interface Provider {
  id: string;               // uuid v4
  name: string;
  base_url: string;         // 已去末尾 '/'
  api_format: ApiFormat;
  has_key: boolean;         // 渲染进程只看布尔，永不见密钥/密文
  models: ProviderModel[];
  created_at: number; updated_at: number;
}
export interface ProviderDraft { // 新建/编辑表单
  name: string; base_url: string; api_format: ApiFormat; api_key?: string; // api_key 仅本次传输，主进程立即加密，永不落盘明文
}

// —— 模型参数与预设（schema v2，LM Studio 式；实现见 shared/params.ts，两端共用纯逻辑）——
// 语义：会话生效参数 = 全局预设参数 ←(覆盖) 选中用户预设参数 ←(覆盖) 会话 overrides。
// 会话只存 overrides（Partial）；写入时与基线等值的键自动删除（等值修剪），修改判定用值比较。
// ParamValues 全量字段与取值范围见 ../design/params.md（行为）与 shared/params.ts（代码）。
export type ParamOverrides = Partial<ParamValues>;
/** updateConversation 的 params patch：值传 null 表示删除该 override 键（垃圾桶/重置语义） */
export type ParamOverridesPatch = { [K in keyof ParamValues]?: ParamValues[K] | null };
export interface ParamPreset { id: string; name: string; is_global: boolean; params: ParamValues; created_at: number; updated_at: number }
export const GLOBAL_PRESET_ID = 'global'; // 全局预设常驻、不可删除、不可改名

export interface Conversation {
  id: string; title: string;
  provider_id: string | null; model: string | null;
  preset_id: string | null;      // null = 全局预设；引用被删预设时由主进程回落 null
  overrides: ParamOverrides;     // 只存与"全局←选中预设"基线不等的键
  pinned: boolean;
  reasoning_enabled: boolean;    // 会话级思考开关（schema v3）：false = 按 api_format 附加关闭载荷
  created_at: number; updated_at: number;
}

// —— 树形分支消息（schema v3，行为语义见 ../design/message-tree.md）——
export interface Message {
  id: string; conversation_id: string;
  parent_id: string | null;  // 会话首条为 null
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: string;        // DeepSeek 等 reasoning_content 落库于此
  token_count: number | null; // 落库缓存
  partial: boolean;
  error?: { code: string; message: string } | null; // 已脱敏
  stats?: MessageStats;      // reasoning_ms / ttft_ms / total_ms / finish_reason
  branch?: BranchInfo;       // 仅 listMessages 激活路径上且有同级分支时填充
  created_at: number;
}
export interface MessageStats {
  reasoning_ms?: number;     // 首 reasoning delta → 首 content delta / 流结束；无 reasoning 缺省
  ttft_ms?: number;          // 请求发出 → 首个 delta（reasoning 或 content 先到为准）；非流式 = total_ms
  total_ms?: number;         // 请求发出 → 流结束/中止；continue 续写累加
  finish_reason?: string;    // 原文保留（stop / length / tool_calls…）
}
export interface BranchInfo { index: number /* 1 起，按 created_at,rowid */; count: number; ids: string[] }

export interface Usage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
export interface ApiError { code: string; message: string } // message 必须已过 redact()
export interface ChatChunk { delta?: string; reasoning_delta?: string; finishReason?: string; usage?: Usage; error?: ApiError }

export interface GeneralSettings {
  language: 'zh-CN' | 'en-US' | 'system';
  theme: 'light' | 'dark' | 'system';
  auto_title: boolean;
  enter_send: boolean;          // true=Enter 发送
  title_provider_id: string | null; // 指定标题生成模型；null = 回退各会话当前模型（shared/title.ts resolveTitleTarget）
  title_model: string | null;
  zoom: number;                 // 界面缩放因子（CSS zoom，0.5~2.5 步长 0.1）
  font_ui: string;              // 界面字体栈；空串 = 默认（字符白名单消毒见 shared/appearance.ts）
  font_code: string;            // 代码块字体栈；空串 = 默认等宽栈
  font_ui_size: number | null;  // 10~24 px 整数；null = 16px（rem 基准）
  font_code_size: number | null;// 6~40 px 整数；null = 默认
  code_theme: 'light' | 'dark' | 'auto';
  auto_update: boolean;         // 启动自检（Electron 独占语义；web 预览持久化但不生效）
  update_beta: boolean;         // 更新通道包含 GitHub 预发布
}
export const DEFAULT_SETTINGS: GeneralSettings = { language:'system', theme:'system', auto_title:true, enter_send:true,
  title_provider_id:null, title_model:null, zoom:1, font_ui:'', font_code:'', font_ui_size:null, font_code_size:null,
  code_theme:'auto', auto_update:true, update_beta:false };

export interface EncryptionStatus { method: 'safeStorage' | 'machine-fallback'; available: boolean }
export type DataPathSource = 'default' | 'portable' | 'custom'; // 数据目录来源（../design/storage.md）
export interface SystemInfo {
  dataPath: string; dataPathSource: DataPathSource;
  isPortable: boolean;   // web 预览恒 false
  isElectron: boolean;   // web 预览恒 false；桌面独占功能据此判定
  version: string; encryption: EncryptionStatus; platform: string;
}
export type DataDirMigrationResult =
  | { status: 'migrated';  needsRestart: true;  path: string } // 已完整复制当前数据到新路径
  | { status: 'switched';  needsRestart: true;  path: string } // 目标已有数据/空目录，仅写指针
  | { status: 'noop';      needsRestart: false; path: string }; // 同目录无操作

// —— 在线升级（真实实现 electron/updater.ts；行为见 ../design/ux-guidelines.md「关于页与在线升级」）——
export interface UpdateInfo { version: string; release_notes: string /* 纯文本，UI 固定高度滚动 */; published_at?: string; size?: number }
export type UpdateCheckResult =
  | { status: 'available'; info: UpdateInfo }
  | { status: 'none' }
  | { status: 'unavailable'; reason: string }; // not_configured | web_preview | …（机器可读码）
export interface UpdateProgress { percent: number /* 0~100 */; transferred: number; total: number }
export type UpdateDownloadResult = { verified: true };
export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available' | 'downloading' | 'downloaded'; info: UpdateInfo }; // 主进程权威态

export interface BackupFileInfo { filename: string; path: string; size: number; created_at: number; includes_keys: boolean }
export interface BackupManifest { app_version: string; schema_version: number; includes_keys: boolean;
  kdf?: { algo: 'scrypt'; N: number; r: number; p: number; salt_b64: string }; created_at: number } // 详见 backup-format.md
export interface ImportResult { providers: number; conversations: number; messages: number; presets: number; skipped: number }

export interface PresetProvider { key: string; label: string; base_url: string; api_format: ApiFormat; homepage?: string }
```

## 2. 渲染进程桥接 API（`EasyUiApi`，`window.easyui.*`）

preload 用 `contextBridge.exposeInMainWorld('easyui', …)` 暴露；Web 预览由 `src/bridge/mock.ts` 完整实现（§6）。**所有方法返回 Promise**（ipcRenderer.invoke）；主进程 handle 端对每个 payload 用 zod 校验。

```ts
export interface EasyUiApi {
  // —— 平台管理 ——
  listProviders(): Promise<Provider[]>;
  createProvider(draft: ProviderDraft): Promise<Provider>;
  updateProvider(id: string, patch: Partial<ProviderDraft> & { models?: ProviderModel[] }): Promise<Provider>;
  deleteProvider(id: string): Promise<{ affectedConversations: number }>;
  getPresets(): Promise<PresetProvider[]>;            // §5 预置供应商模板（快捷填充，不预写库）
  /** 拉取远程模型列表（可用 draft 带未保存的 key，或 providerId 用已存 key） */
  fetchModels(input: { providerId?: string; draft?: ProviderDraft }): Promise<string[]>;
  /** 单模型连通性检测：messages=[{role:'user',content:'ping'}], max_tokens=1, 非流式；结果持久化 last_check */
  testModel(providerId: string, modelId: string): Promise<ModelCheck>;
  /** 全部检测，主进程并发=4，逐个通过 onModelCheck 事件回报 */
  testAllModels(providerId: string): Promise<void>;
  /** 格式自动探测：先 Bearer 试 /v1/models，再 anthropic 头试；均失败返回 null（不阻断保存） */
  detectFormat(input: { base_url: string; api_key?: string; providerId?: string }): Promise<ApiFormat | null>;

  // —— 会话与消息（树形分支语义详见 ../design/message-tree.md）——
  listConversations(): Promise<Conversation[]>;
  createConversation(): Promise<Conversation>;
  /** patch.params 为 overrides 合并语义：值传 null 删除该键；与当前预设基线等值时自动修剪。
   *  preset_id 必须存在（否则报 preset_not_found，null 表示全局预设）。 */
  updateConversation(id: string, patch: Partial<Pick<Conversation,
    'title'|'pinned'|'provider_id'|'model'|'preset_id'|'reasoning_enabled'>> & { params?: ParamOverridesPatch }): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  /** 激活路径消息序列（根 → active_leaf 上溯反转；active_leaf 空 = 最新一条为叶）；分支消息带 branch 元数据 */
  listMessages(conversationId: string): Promise<Message[]>;
  /** 切换分支：messageId 取自 branch.ids；激活叶 = 目标分支最深后代（分叉取最新子）。返回新路径 */
  switchBranch(input: { conversationId: string; messageId: string }): Promise<Message[]>;
  /** 原地更新消息内容（assistant 编辑 / user 编辑不重发）；不触发生成 */
  updateMessageContent(input: { conversationId: string; messageId: string; content: string }): Promise<Message>;
  /** 批量删除（单个 = ids 长 1）：各节点整个子树连删（事务）；激活叶在被删子树内时回退最近存活祖先。返回新路径 */
  deleteMessages(input: { conversationId: string; ids: string[] }): Promise<Message[]>;
  /** 手动标题生成（✨）：强制覆盖，忽略 auto_title；20s 超时 + 重试 1 次；详见 ../design/title.md */
  generateTitle(conversationId: string): Promise<Conversation>;
  onTitleUpdated(cb: (p: { conversationId: string; title: string }) => void): () => void; // 自动+手动成功都广播
  onTitleFailed(cb: (p: { conversationId: string; error: ApiError }) => void): () => void; // 自动路径重试用尽

  // —— 参数预设 ——
  listParamPresets(): Promise<ParamPreset[]>; // 全局预设恒在首位（id='global'，缺失时主进程兜底补建）
  createParamPreset(input: { name: string; params: ParamValues }): Promise<ParamPreset>;
  /** 全局预设只允许改 params（改名报 global_preset_readonly） */
  updateParamPreset(id: string, patch: { name?: string; params?: ParamValues }): Promise<ParamPreset>;
  /** 删除全局预设报 global_preset_readonly；引用被删预设的会话 preset_id 回落 null */
  deleteParamPreset(id: string): Promise<void>;
  /** 全局预设参数重置为工厂默认（设置页「恢复默认」） */
  resetGlobalPreset(): Promise<ParamPreset>;

  // —— 对话生成（编排行为详见 ../design/chat.md）——
  /** 发送用户消息并开始生成：user 的 parent = 当前激活叶；siblingOf（编辑后重发）时 parent = 该消息的
   *  parent_id → 开新分支，原分支保留。生成中（同会话单生成锁）拒绝 generation_in_progress。 */
  sendMessage(input: { conversationId: string; content: string; siblingOf?: string }): Promise<{ userMessageId: string | null; assistantMessageId: string }>;
  /** 激活叶精确设为指定消息（branch 按钮："在此消息之后分叉"）。返回新路径 */
  setActiveLeaf(input: { conversationId: string; messageId: string }): Promise<Message[]>;
  /** 重新生成指定 assistant：其 parent 下新建同级分支（不删旧分支），激活叶切到新分支 */
  regenerateMessage(input: { conversationId: string; messageId: string }): Promise<{ assistantMessageId: string }>;
  /** 续写：不建行，delta 追加到同一消息；total_ms/token_count 累计，ttft 保留首段值 */
  continueMessage(input: { conversationId: string; messageId: string }): Promise<void>;
  /** 激活叶为 user 时直接生成 assistant（Generate Response）；否则报 nothing_to_generate */
  generateResponse(input: { conversationId: string }): Promise<{ assistantMessageId: string }>;
  stopGeneration(conversationId: string): Promise<void>;
  onChatDelta(cb: (p: { conversationId: string; messageId: string; delta: string; reasoning_delta?: string }) => void): () => void;
  onChatDone(cb: (p: { conversationId: string; messageId: string; message: Message }) => void): () => void;
  onChatError(cb: (p: { conversationId: string; messageId: string; error: ApiError }) => void): () => void;
  onModelCheck(cb: (p: { providerId: string; modelId: string; check: ModelCheck }) => void): () => void;

  // —— 通用设置 / 系统信息 ——
  getSettings(): Promise<GeneralSettings>;
  setSettings(patch: Partial<GeneralSettings>): Promise<GeneralSettings>;
  getSystemInfo(): Promise<SystemInfo>;

  // —— 数据目录（Electron 独占；web mock：pickDataDir→null，setDataDir→reject electron_only）——
  pickDataDir(): Promise<string | null>;  // 系统目录选择框；取消返回 null
  setDataDir(input: { path: string }): Promise<DataDirMigrationResult>; // 校验链与迁移语义见 ../design/storage.md
  relaunchApp(): Promise<void>;           // app.relaunch + exit；web mock 为 no-op
  openExternal(url: string): Promise<void>; // 仅放行 http(s)（zod openExternalSchema）；web mock 用 window.open 且过同一白名单（REQ-2026-001）

  // —— 在线升级（Electron 独占；web mock 恒 unavailable/web_preview，localStorage.easyui_mock_update='1' 可演示）——
  updateCheck(): Promise<UpdateCheckResult>;     // 网络/配置失败不 reject，以 status 表达
  updateDownload(): Promise<UpdateDownloadResult>; // 进度经 onUpdateProgress；sha512 校验内建
  updateInstall(): Promise<void>;                // quitAndInstall(true,true) 静默+重启
  updateGetState(): Promise<UpdateState>;        // 主进程权威态；About 页挂载时同步
  onUpdateProgress(cb: (p: UpdateProgress) => void): () => void;
  onUpdateAvailable(cb: (info: UpdateInfo) => void): () => void; // 启动自检发现新版（全局监听弹气泡）

  // —— 备份（格式见 backup-format.md；UX 流程见 ../design/storage.md）——
  listBackups(): Promise<BackupFileInfo[]>;
  createBackup(input: { includeKeys: boolean; password?: string }): Promise<BackupFileInfo>;
  restoreBackup(input: { path: string; password?: string; mode: 'merge' | 'overwrite' }): Promise<ImportResult>;
  deleteBackup(filename: string): Promise<void>;
  openBackupsDir(): Promise<void>;
  pickBackupFile(): Promise<string | null>; // dialog.showOpenDialog 过滤 .zip
}
```

**安全红线**：`Provider` 类型里没有 `api_key_cipher` 字段，主进程 DAO 查询时剥离；任何错误对象 throw 给渲染进程前过 `redact()`（密钥替换为 `key.slice(0,3) + '***'` 模式）。详见 `../design/security.md`。

## 3. 事件通道（`webContents.send`）

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

## 4. IPC 错误码跨进程编码（`shared/errors.ts`）

invoke 拒绝时 Electron 只序列化 `Error.message`（自定义 `.code` 丢失）。约定：

- 主进程 `handle` 包装统一 catch → `redact()` → `throw new Error('EASYUI_ERR:' + JSON.stringify({ code, message }))`。
- code 推导：显式 `.code` 优先 → ZodError 报 `invalid_input` → 裸 code 作 message 的历史抛法 → 兜底 `unknown`。
- 渲染进程一律用 `parseIpcError(err): ApiError` 解码（识别前缀 / 自带 `.code` / 裸 code message / 兜底 `unknown`），任何消费点不得直接读 `err.code` / `err.message`。
- 已知错误码（非穷尽）：`invalid_input`、`invalid_json_schema`（结构化 schema 不可解析，请求不发出）、`context_overflow`（stop 策略超预算）、`context_truncated`（单条截断警告）、`preset_not_found`、`global_preset_readonly`、`generation_in_progress`、`nothing_to_generate`、`title_model_unavailable`、`title_no_user_message`、`electron_only`。

## 5. 预置供应商（`shared/presets.ts`，`getPresets()` 返回；端点已核实）

| key | label | base_url | api_format |
|---|---|---|---|
| openai | OpenAI | `https://api.openai.com` | openai-chat |
| anthropic | Anthropic | `https://api.anthropic.com` | anthropic |
| openrouter | OpenRouter | `https://openrouter.ai/api` | openai-chat |
| deepseek | DeepSeek | `https://api.deepseek.com` | openai-chat |
| kimi | Kimi (Moonshot AI) | `https://api.moonshot.cn` | openai-chat |
| bigmodel | 智谱 (Bigmodel) | `https://open.bigmodel.cn/api/paas/v4` | openai-chat |
| xiaomimimo | 小米 (Xiaomi MiMo) | `https://api.xiaomimimo.com/v1` | openai-chat |
| minimax | MiniMax | `https://api.minimaxi.com/v1` | openai-chat |
| siliconflow | 硅基流动 (SiliconFlow) | `https://api.siliconflow.cn/v1` | openai-chat |
| modelscope | 魔搭 (ModelScope) | `https://api-inference.modelscope.cn/v1` | openai-chat |
| volcengine | 火山引擎 (Ark) | `https://ark.cn-beijing.volces.com/api/v3` | openai-chat |
| alibailian | 阿里云百炼 (Alibaba Cloud Bailian) | `https://dashscope.aliyuncs.com/compatible-mode/v1` | openai-chat |

预置只作为"新增平台"表单的快捷模板（点选后自动填充 base_url/format，名称可改），**不预写数据库**。

## 6. Web 预览 Mock 桥（`src/bridge/`）

- `src/bridge/index.ts`：`export function getApi(): EasyUiApi` —— 若 `window.easyui` 存在则返回之，否则返回 `mockApi`。UI 代码只依赖 `getApi()`，不感知差异。
- `src/bridge/mock.ts`：用 localStorage（key 前缀 `easyui_mock_`）实现**完整** `EasyUiApi`：
  - 平台/会话/消息/**参数预设** CRUD（presets 存 `easyui_mock_presets`，首访补建全局预设；loadConversations 对旧版 params 形状做 `migrateLegacyParams` 迁移）、设置、备份函数返回空/成功桩。
  - **API key 只存内存 Map，不落 localStorage**（REQ-2026-001：web 预览也可能填真实密钥）；`updateProvider` 换 host 清密钥、`base_url` 仅 http/https 禁 userinfo，均与主进程同规则。
  - `fetchModels` 返回几个假模型；`testModel` 300~900ms 随机延迟后 90% 成功。
  - `sendMessage` 以 setInterval 模拟流式输出一段内置 Markdown 演示回复（含代码块、列表、表格、reasoning 折叠块），支持 `stopGeneration`；演示回复中英各一段，按当前 i18n 语言选择。
  - 桌面独占功能的 mock 语义：`pickDataDir` → null、`setDataDir` → reject `electron_only`、升级恒 `unavailable/web_preview`（`localStorage.easyui_mock_update='1'` 演示完整链路）。
- **行为同步红线**：主进程逻辑的行为修复必须同步修 mock 桥（含分支删除路径恢复等），两端语义一致。`npm run dev` 纯浏览器必须可完整演示 UI。
