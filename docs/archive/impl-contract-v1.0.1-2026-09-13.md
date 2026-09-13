# Easy WebUI — 实现契约（供实施子代理遵循）

> 本文件是 `prd.md`（产品需求文档）的可执行化补充。冲突时以 `prd.md` 为准；本文件规定的是**跨进程接口与共享类型**，两端（electron/ 与 src/）必须严格一致。
> 项目根目录 = `E:\AI_Coding\Web_Dev\Frontend\EasyWebUI`（prd.md 所在处）。

---

## 0. 工程与脚本

- 包管理：npm。Node ≥ 18。
- `package.json` scripts：
  - `dev`: `vite` —— **纯 Web 预览**（Kimi Work 预览依赖此命令），Vite 默认转发 `--host/--port`，不要拦截 CLI 参数。
  - `dev:electron`: `concurrently -k "vite" "wait-on tcp:5173 && cross-env VITE_DEV_SERVER_URL=http://localhost:5173 electron ."`（Electron 主进程入口编译见下）。
  - `build`: `tsc -p tsconfig.web.json --noEmit && vite build && tsc -p tsconfig.electron.json`
  - `test`: `vitest run`
  - `typecheck`: `tsc -p tsconfig.web.json --noEmit && tsc -p tsconfig.electron.json --noEmit`
- 三份 tsconfig：`tsconfig.json`（基础 + references）、`tsconfig.web.json`（src/ + shared/，DOM lib，strict）、`tsconfig.electron.json`（electron/ + shared/，module commonjs，outDir `dist-electron`，types node）。
- Electron 主进程用 TypeScript 编写，构建到 `dist-electron/`；开发期可用 `tsx`/`esbuild` 直接加载（任选，写入 README 说明）。**简化允许**：`dev:electron` 若实现成本高，可只保证 `build` 产出正确 + `npm run dev` Web 预览可用，README 说明桌面端启动方式。
- 关键依赖（版本写 ^ 合理稳定版即可）：
  - 运行时：react@18, react-dom@18, zustand, i18next, react-i18next, react-markdown, remark-gfm, highlight.js, dompurify, @types/dompurify(dev), js-tiktoken, zod
  - Electron 侧：electron(dev), better-sqlite3, @types/better-sqlite3(dev), adm-zip（备份 zip，纯 JS 免原生编译）, electron-builder(dev, 只写配置不必须跑)
  - 工程：vite, @vitejs/plugin-react, typescript, tailwindcss@3, postcss, autoprefixer, vitest, concurrently, wait-on, cross-env
- `vite.config.ts`：`base: './'`（Electron file:// 加载需要相对路径），root 默认，plugins react，server.port 5173。构建输出 `dist/`。渲染进程代码**不得 import** electron/ 下任何模块；共享代码全部放 `shared/`。

## 1. 共享类型（`shared/types.ts`，两端唯一事实来源）

```ts
export type ApiFormat = 'openai-chat' | 'openai-responses' | 'anthropic';

export interface ModelCheck {
  status: 'ok' | 'fail' | 'unknown';
  latency_ms?: number;
  checked_at?: number;
  error?: string; // 已脱敏
}
export interface ProviderModel {
  id: string;
  display_name?: string;
  enabled: boolean;
  last_check?: ModelCheck;
}
export interface Provider {
  id: string;               // uuid v4
  name: string;
  base_url: string;         // 已去末尾 '/'
  api_format: ApiFormat;
  has_key: boolean;         // 渲染进程只看布尔，永不见密钥/密文
  models: ProviderModel[];
  created_at: number;
  updated_at: number;
}
export interface ProviderDraft { // 新建/编辑表单
  name: string; base_url: string; api_format: ApiFormat; api_key?: string; // api_key 仅本次传输，主进程立即加密，永不落盘明文
}

// —— 模型参数与预设（schema v2，LM Studio 式；实现见 shared/params.ts，两端共用纯逻辑）——
// 语义：会话生效参数 = 全局预设参数 ←(覆盖) 选中用户预设参数 ←(覆盖) 会话 overrides。
// 会话只存 overrides（Partial）；写入时与基线等值的键自动删除（等值修剪），修改判定用值比较。
export interface ParamValues {
  system_prompt: string;
  temperature: number;                    // 0..2
  limit_response_length: boolean;         // 开 → 发送 max_tokens
  max_tokens: number;                     // 1..128000
  context_overflow: 'rolling' | 'truncate_middle' | 'stop';
  stop_strings: string[];                 // 空数组不发
  top_k: number;                          // 0..500，0=不发送
  repeat_penalty_enabled: boolean;
  repeat_penalty: number;                 // 0..2；openai 系映射 frequency_penalty = value-1 且仅 >1 时传
  presence_penalty_enabled: boolean;
  presence_penalty: number;               // -2..2
  top_p_enabled: boolean;
  top_p: number;                          // 0..1
  min_p_enabled: boolean;
  min_p: number;                          // 0..1
  structured_output_enabled: boolean;
  structured_output_schema: string;       // JSON Schema 文本；不可解析发送前报 invalid_json_schema
  context_window: number;                 // token 数
  stream: boolean;
}
export const FACTORY_DEFAULTS: ParamValues = { system_prompt: '', temperature: 0.8, limit_response_length: false, max_tokens: 1000, context_overflow: 'truncate_middle', stop_strings: [], top_k: 64, repeat_penalty_enabled: false, repeat_penalty: 1.0, presence_penalty_enabled: false, presence_penalty: 0, top_p_enabled: false, top_p: 1.0, min_p_enabled: false, min_p: 0, structured_output_enabled: false, structured_output_schema: '', context_window: 128000, stream: true };
export interface ParamPreset { id: string; name: string; is_global: boolean; params: ParamValues; created_at: number; updated_at: number }
export const GLOBAL_PRESET_ID = 'global'; // 全局预设常驻、不可删除、不可改名
export type ParamOverrides = Partial<ParamValues>;
/** updateConversation 的 params patch：值传 null 表示删除该 override 键（垃圾桶/重置语义） */
export type ParamOverridesPatch = { [K in keyof ParamValues]?: ParamValues[K] | null };

export interface Conversation {
  id: string; title: string;
  provider_id: string | null; model: string | null;
  preset_id: string | null;      // null = 全局预设；引用被删预设时由主进程回落 null
  overrides: ParamOverrides;     // 只存与"全局←选中预设"基线不等的键
  pinned: boolean;
  created_at: number; updated_at: number;
}
export interface Message {
  id: string; conversation_id: string;
  parent_id: string | null;  // 树形分支模型（schema v3，见 §11）；会话首条为 null
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: string;        // DeepSeek 等 reasoning_content 落库于此
  token_count: number | null;
  partial: boolean;
  error?: { code: string; message: string } | null; // 已脱敏
  stats?: MessageStats;      // reasoning_ms / ttft_ms / total_ms / finish_reason（§11.4）
  branch?: BranchInfo;       // 仅 listMessages 激活路径上且有同级分支时填充 {index,count,ids}
  created_at: number;
}

export interface Usage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
export interface ApiError { code: string; message: string } // message 必须已过 redact()
export interface ChatChunk { delta?: string; reasoning_delta?: string; finishReason?: string; usage?: Usage; error?: ApiError }

export interface GeneralSettings {
  language: 'zh-CN' | 'en-US' | 'system';
  theme: 'light' | 'dark' | 'system';
  auto_title: boolean;
  enter_send: boolean; // true=Enter 发送
  /** 指定标题生成模型；null = 回退用各会话当前模型（解析优先级见 shared/title.ts resolveTitleTarget） */
  title_provider_id: string | null;
  title_model: string | null;
  /** 界面缩放因子（CSS zoom，0.5~2.5 步长 0.1；1 = 100%；web/Electron 同一路径） */
  zoom: number;
  /** 界面字体栈；空串 = 默认字体栈（字符白名单消毒见 shared/appearance.ts sanitizeFontStack） */
  font_ui: string;
  /** 代码块字体栈；空串 = 默认等宽栈 */
  font_code: string;
  /** 代码块背景/高亮主题；auto = 跟随页面主题（documentElement data-code-theme） */
  code_theme: 'light' | 'dark' | 'auto';
}
export const DEFAULT_SETTINGS: GeneralSettings = { language: 'system', theme: 'system', auto_title: true, enter_send: true, title_provider_id: null, title_model: null, zoom: 1, font_ui: '', font_code: '', code_theme: 'auto' };

export interface EncryptionStatus { method: 'safeStorage' | 'machine-fallback'; available: boolean }
export interface BackupFileInfo { filename: string; path: string; size: number; created_at: number; includes_keys: boolean }
export interface BackupManifest { app_version: string; schema_version: number; includes_keys: boolean; kdf?: { algo: 'scrypt'; N: number; r: number; p: number; salt_b64: string }; created_at: number }
export interface ImportResult { providers: number; conversations: number; messages: number; presets: number; skipped: number }

export interface PresetProvider { key: string; label: string; base_url: string; api_format: ApiFormat; homepage?: string }
```

## 2. 渲染进程桥接 API（`window.easyui.*`）

preload 用 `contextBridge.exposeInMainWorld('easyui', …)` 暴露。**所有方法返回 Promise**（ipcRenderer.invoke）。主进程 handle 端对每个 payload 用 zod 校验。

```ts
export interface EasyUiApi {
  // —— 平台管理 ——
  listProviders(): Promise<Provider[]>;
  createProvider(draft: ProviderDraft): Promise<Provider>;
  updateProvider(id: string, patch: Partial<ProviderDraft> & { models?: ProviderModel[] }): Promise<Provider>;
  deleteProvider(id: string): Promise<{ affectedConversations: number }>;
  getPresets(): Promise<PresetProvider[]>;
  /** 拉取远程模型列表（可用 draft 带未保存的 key，或 providerId 用已存 key） */
  fetchModels(input: { providerId?: string; draft?: ProviderDraft }): Promise<string[]>;
  /** 单模型连通性检测：发送 messages=[{role:'user',content:'ping'}], max_tokens=1, 非流式；结果持久化到 last_check */
  testModel(providerId: string, modelId: string): Promise<ModelCheck>;
  /** 全部检测，主进程并发=4，逐个通过 onModelCheck 事件回报 */
  testAllModels(providerId: string): Promise<void>;
  /** 格式自动探测：先 Bearer 试 /v1/models，再 anthropic 头试；均失败返回 null */
  detectFormat(input: { base_url: string; api_key?: string; providerId?: string }): Promise<ApiFormat | null>;

  // —— 会话与消息 ——
  listConversations(): Promise<Conversation[]>;
  createConversation(): Promise<Conversation>;
  /** params 语义（schema v2）：合并进会话 overrides——值与基线（全局←选中预设）相等时该键被删除
   * （等值修剪）；值传 null 显式删除该 override 键。preset_id 必须存在（否则报 preset_not_found，
   * null 表示全局预设）。返回更新后的完整 Conversation。 */
  updateConversation(id: string, patch: Partial<Pick<Conversation, 'title' | 'pinned' | 'provider_id' | 'model' | 'preset_id'>> & { params?: ParamOverridesPatch }): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  listMessages(conversationId: string): Promise<Message[]>;
  /** 手动触发标题生成（侧栏 ✨）：强制覆盖现有标题，忽略 auto_title 与 title 是否为空。
   *  主进程：resolveTitleTarget 解析模型（设置完整指定优先 → 会话模型回退；都无或
   *  provider 不存在/无密钥 → 抛 title_model_unavailable；无 user 消息 → title_no_user_message），
   *  单次尝试 20s 超时，失败间隔 800ms 重试 1 次；成功返回更新后的 Conversation
  *  并广播 title:updated；失败 reject（错误码经 EASYUI_ERR: 编码，见上文 IPC 错误码约定）。 */
  generateTitle(conversationId: string): Promise<Conversation>;
  /** 标题生成成功（自动 + 手动路径都广播）→ 侧栏即时刷新 */
  onTitleUpdated(cb: (p: { conversationId: string; title: string }) => void): () => void;
  /** 自动路径重试用尽仍失败 → 渲染进程 toast 警告（三段式，不阻断对话） */
  onTitleFailed(cb: (p: { conversationId: string; error: ApiError }) => void): () => void;

  // —— 参数预设 ——
  listPresets(): Promise<ParamPreset[]>; // 始终含全局预设（id='global'，缺失时主进程兜底补建）
  createParamPreset(input: { name: string; params: ParamValues }): Promise<ParamPreset>;
  /** 全局预设仅可改 params；对其改名报 global_preset_readonly */
  updateParamPreset(id: string, patch: { name?: string; params?: ParamValues }): Promise<ParamPreset>;
  /** 删除全局预设报 global_preset_readonly；引用它的会话 preset_id 回落 null */
  deleteParamPreset(id: string): Promise<void>;

  // —— 对话生成 ——
  /** 发送用户消息并开始生成。主进程：落库 user 消息→裁剪组装→调适配层→流式回推→落库 assistant 消息（partial/error 语义见 prd.md §4.4）。返回值含 userMessageId 与 assistantMessageId。 */
  sendMessage(input: { conversationId: string; content: string; regenerate?: boolean; fromMessageId?: string }): Promise<{ userMessageId: string | null; assistantMessageId: string }>;
  stopGeneration(conversationId: string): Promise<void>;
  /** 事件订阅，均返回取消订阅函数 */
  onChatDelta(cb: (p: { conversationId: string; messageId: string; delta: string; reasoning_delta?: string }) => void): () => void;
  onChatDone(cb: (p: { conversationId: string; messageId: string; message: Message }) => void): () => void;
  onChatError(cb: (p: { conversationId: string; messageId: string; error: ApiError }) => void): () => void;
  onModelCheck(cb: (p: { providerId: string; modelId: string; check: ModelCheck }) => void): () => void;

  // —— 通用设置 / 系统信息 ——
  getSettings(): Promise<GeneralSettings>;
  setSettings(patch: Partial<GeneralSettings>): Promise<GeneralSettings>;
  getSystemInfo(): Promise<{ dataPath: string; version: string; encryption: EncryptionStatus; platform: string }>;

  // —— 备份 ——
  listBackups(): Promise<BackupFileInfo[]>;
  createBackup(input: { includeKeys: boolean; password?: string }): Promise<BackupFileInfo>;
  restoreBackup(input: { path: string; password?: string; mode: 'merge' | 'overwrite' }): Promise<ImportResult>;
  deleteBackup(filename: string): Promise<void>;
  openBackupsDir(): Promise<void>;
  pickBackupFile(): Promise<string | null>; // dialog.showOpenDialog 过滤 .zip
}
```

- 事件通道名（`webContents.send`）：`chat:delta` / `chat:done` / `chat:error` / `model:check` / `title:updated` / `title:failed`。preload 用 `ipcRenderer.on` 转发并返回 unsubscribe。
- **IPC 错误码跨进程编码（`shared/errors.ts`）**：invoke 拒绝时 Electron 只序列化 `Error.message`（自定义 `.code` 丢失）。主进程 `handle` 包装统一 catch → `redact()` → `throw new Error('EASYUI_ERR:' + JSON.stringify({ code, message }))`（code 推导：显式 `.code` 优先 → ZodError 报 `invalid_input` → 裸 code 作 message 的历史抛法 → 兜底 `unknown`）；渲染进程一律用 `parseIpcError(err): ApiError` 解码（识别前缀 / 自带 `.code` / 裸 code message / 兜底 `unknown`），任何消费点不得直接读 `err.code` / `err.message`。
- 自动标题（首轮完成后，需 `auto_title` 开且标题为空）：与手动 `generateTitle` 共用主流程；成功广播 `title:updated`，重试用尽失败广播 `title:failed`（绝不阻断对话）。
  - 渲染进程消费：`App.tsx` 订阅 → `useConversationsStore.applyTitle`（同步 bump `updated_at` 保持与 DB 排序一致）；`chat:done` 只做本地 `touchLocal` 重排序，**不整表 refetch**（避免 listConversations 旧快照晚于 applyTitle 落 set 时把新标题盖回空串的竞态）。空标题占位显示统一走 `src/lib/format.ts displayTitle`（侧栏行 + 消息流顶栏）。
- **安全红线**：`Provider` 类型里没有 `api_key_cipher` 字段，主进程 DAO 查询时剥离；任何错误对象 throw 给渲染进程前过 `redact()`（密钥替换为 `sk-***` 保留前 3 位模式：即 `key.slice(0,3) + '***'`）。

## 3. URL 拼接规则（适配层核心，写代码注释说明取舍）

早期设计稿写的是 `{base}/v1/chat/completions`，但大量国内服务商 base 已含版本段（`/v1` `/v3` `/v4`）或 Anthropic 兼容前缀（`/anthropic`）。按"最小惊讶原则"实现 `joinUrl(base, path)`（规则已收录进 prd.md §6.5）：

```
const base = rawBase.replace(/\/+$/, '');
const versioned = /\/(v\d+|anthropic)$/.test(base);   // 已带版本段则不再叠加
return versioned ? `${base}${path}` : `${base}/v1${path}`;
// openai-chat:      joinUrl(base, '/chat/completions')、joinUrl(base, '/models')
// openai-responses: joinUrl(base, '/responses')、joinUrl(base, '/models')
// anthropic:        joinUrl(base, '/messages')、joinUrl(base, '/models')
//   → api.anthropic.com → /v1/messages；api.xiaomimimo.com/anthropic → /anthropic/v1/messages ✓
```

## 4. 预置供应商（`shared/presets.ts`，`getPresets()` 返回；端点已核实）

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

## 5. 协议适配要点（`electron/gateway/`）

参数映射统一规则（入参为 resolveParams 后的生效 ParamValues）：`temperature` 总是发送；`top_p` 仅 `top_p_enabled`；`max_tokens` 仅 `limit_response_length` 开；`stop`/`stop_sequences` 仅 `stop_strings` 非空；`presence_penalty` 仅 `presence_penalty_enabled`；`repeat_penalty_enabled 且 > 1` → openai 系 `frequency_penalty = value − 1`（近似语义，注释注明）；OpenRouter 专属（仅 base_url host 含 `openrouter.ai`）：`top_k`(>0)、`min_p`(enabled)、`repetition_penalty`(=repeat_penalty，enabled)；`structured_output_enabled` → `response_format`/`text.format` json_schema strict（name=`easyui_output`），schema 不可解析在 buildRequest 阶段抛 `invalid_json_schema`（请求不发出）。

- `openai-chat`：payload `{model, messages, stream, temperature, top_p?, max_tokens?, stop?, presence_penalty?, frequency_penalty?, response_format?}`；SSE 解析 `data:` 行、`[DONE]` 终止、`choices[0].delta.content`；`choices[0].delta.reasoning_content` → `reasoning_delta`。
- `openai-responses`：system 角色抽为顶层 `instructions`；payload `{model, input:[{role,content:[{type:'input_text',text}]}…], temperature, stream, max_output_tokens?, top_p?, text?}`；assistant 历史用 `output_text`；流式事件 `response.output_text.delta` / `response.completed` / `response.failed`。top_k/min_p/penalties/stop 不支持，静默丢弃。
- `anthropic`：顶层 `system` 字符串；messages 不含 system；`max_tokens` 必填（limit 开用其值，关用 4096 兜底）；`top_k`（>0 才传）；`top_p` 仅 enabled；`stop_sequences` 仅非空；流式 `content_block_delta`→`delta.text`、`message_stop` 终止；Header `x-api-key` + `anthropic-version: 2023-06-01`。structured/min_p/presence/repeat 不支持，静默省略。
- 通用：连接超时 15s；流式空闲 60s 判断开自动重试 1 次；非 2xx 读 `error.message` 统一 `ApiError`；所有出口错误过 `redact()`。新增错误码：`invalid_json_schema`（结构化 schema 不可解析）、`context_overflow`（stop 策略下超预算，见下）、`preset_not_found` / `global_preset_readonly`（预设 IPC）。
- 裁剪（`electron/gateway/trim.ts`，纯函数可测）：token 估算优先 `js-tiktoken` cl100k，失败回退 `ceil(chars/3)`；预算 = min(context_window, 模型上限未知则 context_window) − 输出预留 − 256；输出预留 = limit 开 ? max_tokens : 4096（缺省视为开，兼容旧调用）。溢出策略（`context_overflow`）三态：`rolling`（默认，成对丢弃最老 user/assistant，至少保最后一条）；`truncate_middle`（保系统提示+最老一轮+尽量新的尾部，丢中段；头尾仍超预算退化为丢头+截断最后一条）；`stop`（不裁剪，超预算返回 `overflow: true`，由编排层 chat.ts 在落库 assistant 占位前抛 `ApiError{code:'context_overflow'}` 阻断发送）。rolling/truncate_middle 下单条仍超预算 → 二分截断并标记 `truncated: true`（经 `onChatError` 发 `{code:'context_truncated'}` 警告，不阻断）。

## 6. Web 预览 Mock 桥（`src/bridge/`）

- `src/bridge/index.ts`：`export function getApi(): EasyUiApi` —— 若 `window.easyui` 存在则返回之，否则返回 `mockApi`。
- `src/bridge/mock.ts`：用 localStorage（key 前缀 `easyui_mock_`）实现**完整** `EasyUiApi`：平台/会话/消息/**参数预设** CRUD（presets 存 `easyui_mock_presets`，首访补建全局预设；loadConversations 对旧版 params 形状做 migrateLegacyParams 迁移）、设置、备份函数返回空/成功桩；`fetchModels` 返回几个假模型；`testModel` 300~900ms 随机延迟后 90% 成功；`sendMessage` 以 setInterval 模拟流式输出一段内置 Markdown 演示回复（含代码块、列表、表格、reasoning 折叠块），支持 `stopGeneration`。
- 目的：`npm run dev` 纯浏览器可完整演示 UI；UI 代码只依赖 `getApi()`，不感知差异。
- mock 演示回复需中英各一段，按当前 i18n 语言选择。

## 7. UI 设计综合约束（来自设计调研，叠加在 prd.md §5 之上）

- 玻璃模糊层同屏 ≤5：左栏顶栏、消息流顶栏、输入坞、右栏顶栏、模态框；**列表行/气泡不用 blur**，用半透明纯色。
- 发丝边框：栏间分隔用 `0.5px` `var(--glass-border)`，禁止卡片套卡片；用留白+字重+分隔线分层。
- 动效（全部尊重 `prefers-reduced-motion`）：
  - 按钮 150ms 颜色过渡 + `active: scale(0.98)`；
  - 悬浮态按 prd.md §5.1：亮度 +4%、200ms `var(--ease-interactive)`；
  - 面板折叠/模态出现 300ms `cubic-bezier(0.22,1,0.36,1)`；
  - 空状态/引导卡片用交错入场：元素 `opacity:0→1, translateY(8px→0)`，`transition-delay: calc(var(--stagger) * 90ms)`，仅首屏一次；
  - 流式编排：发送 → 助手气泡内三点 typing 指示器 → 首个 delta 到达替换为正文（渲染节流 50ms）→ 完成。
- 字体栈（必须含中文，禁纯拉丁显示字体渲染中文）：`font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`；代码：`ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace`。不用任何网络字体（CSP `default-src 'self'` 也不允许）。
- 中文不用 italic；强调用字重/颜色。
- 焦点可见性：所有可交互元素 `:focus-visible` 2px 描边 `var(--accent)`、offset 2px；全部控件可 Tab 到达，aria-label 走 i18n。
- 窗口背景：柔和多段径向渐变 + 细噪点（CSS/SVG data-URI 生成，不用外链图），深浅主题各一套，保证玻璃有内容可折射。

## 8. 验收命令（必须全绿）

```bash
npm install            # better-sqlite3/electron 若因网络失败，可用 --ignore-scripts 保底（Web 预览不依赖原生模块）
npm run typecheck      # 两个 tsconfig 都无错
npm test               # vitest：gateway 三协议（流式/非流式/错误分支，mock fetch）、trim、redact、备份含密钥/不含密钥 roundtrip
npm run build          # vite build 成功
npm run dev            # 浏览器打开即三栏 UI，mock 下可完整走通：预设建平台→检测模型→建会话→流式对话→改参数→切主题/语言
```

## 9. i18n 要求

`src/i18n/zh-CN.json`、`en-US.json` 键名点分层级（`chat.input.placeholder`、`settings.providers.add` …）。**一切用户可见字符串**（含 aria-label、错误文案、确认框）走 `t()`，子代理交付前自查无硬编码残留。错误文案三段式：发生了什么/可能原因/建议操作。

---

## 10. v0.1.1 增量契约（数据目录 / 字号 / InfoTip / 关于与在线升级）

### 10.1 数据目录（electron/paths.ts + storage-migrate.ts）

- 解析优先级：**自定义指针 → 便携 exe 旁 data/ → 安装版 userData/data**。
  - 便携判定：打包且存在 `PORTABLE_EXECUTABLE_DIR`（electron-builder portable 运行时注入；修复「便携版数据落 %TEMP% 解包目录」）。
  - 安装版默认从 exe 旁 `data/` 改为 `userData/data`（修复 NSIS 重装清空安装目录丢数据）；`build.nsis.deleteAppDataOnUninstall = false`。
  - 指针文件：便携 → 便携根目录 `easywebui-data-dir.json`；安装版 → `userData/data-dir-pointer.json`。内容 `{"dataDir": "..."}`。
- 启动顺序：`resolveDataDir` → `migrateStorageDir`（旧目录抢救：dir 无 easyui.db 时从 legacyDirs 首个含 db 的目录整体复制；布局 marker `storage-layout.json`，当前 `STORAGE_LAYOUT_VERSION = 1`，扩展点 = LAYOUT_STEPS 数组）→ `openDatabase`。
- `system:set-data-dir`：校验链 `invalid_dir → noop(同目录) → dir_inside_current(子/父目录) → dir_not_writable`；目标已有数据 → `switched`（仅写指针）；否则 `wal_checkpoint(TRUNCATE)` + `cpSync` 全量复制 → `migrated`。成功均 `needsRestart: true`，渲染层提示重启，`system:relaunch` 执行 `app.relaunch()+exit(0)`。任何路径不删除旧数据。
- `SystemInfo` 扩展：`dataPathSource: 'default'|'portable'|'custom'`、`isPortable`、`isElectron`（web mock 恒 false，桌面独占功能据此判定）。

### 10.2 外观新键（GeneralSettings）

`font_ui_size: number|null`（10–24 px 整数，null=16px，改 rem 基准即时生效）、`font_code_size: number|null`（6–40 px，null=默认，经 `--font-code-size` 作用于代码块/行内代码/kbd）、`auto_update: boolean`（默认 true）、`update_beta: boolean`（默认 false）。字号归一化走 `shared/appearance.ts` 的 `parseFontSize`（非法 → null → UI 拒绝并 toast）。防 FOUC 内联脚本同步首帧应用（改脚本必重算 CSP sha256）。

### 10.3 InfoTip（controls.tsx）

参数 ⓘ 说明一律用 `InfoTip`：hover/focus/click 三态显隐；浮层 `createPortal` 到 body + fixed 定位（宿主滚动容器 overflow-y-auto 会裁切容器内绝对定位浮层），按视口余量自动上/下翻转，横向钳制视口内；钉住态 Esc/点外关闭。

### 10.4 关于页与在线升级（v0.1.1 起为真实实现，GitHub Releases 通道）

- 设置第五个 tab `about`：版本/协议/作者/GitHub + 在线升级卡。
- 升级卡状态机：`checking → available（自动转 downloading）→ downloading → downloaded → install`；
  `none`/`unavailable`/失败一律通知气泡。下载完成态必须带备份警告文案与安装确认弹窗。
- 主进程权威状态机（`updater.getState()`，IPC `update:get-state`）：About 页挂载时同步，
  错过 `update:available` 事件也能恢复 UI；available 态自动续下载。
- 主进程 electron/updater.ts：真实通道 = electron-updater + GitHub provider
  （`build.publish` → `ryanlew17/Easy-WebUI`，打包嵌入 app-update.yml）；
  `autoDownload=false`（下载由渲染层触发），`allowPrerelease ← settings.update_beta`；
  sha512 校验内建于 downloadUpdate；install = `quitAndInstall(true, true)`（静默 + 重启，
  DB 由 main.ts 的 before-quit 钩子关闭）。版本比较用本文件的 compareSemver（导出于 updater.ts）。
- 启动自检：`settings.auto_update` 开启时 check()，发现 available → 广播 `update:available`
  （App.tsx 全局监听弹气泡；下载不在主进程自动触发，带宽动作须用户知情 —— About 页状态机接管）。
- 运行形态分支：打包版真实流程；dev/未打包 → `unavailable/dev_mode`；
  `EASYUI_MOCK_UPDATE=1` → mock 演示通道（虚构 patch+1 + 2s 假进度），vitest 同通道可测
  （electron-updater 懒加载 require，测试环境永不拉起 electron）。
- web mock：`localStorage.easyui_mock_update='1'` 演示完整链路；默认 `unavailable/web_preview`。
- 外链：`system:open-external` 仅放行 http(s)（zod `openExternalSchema`）。
- 发布流程：见 README「发布新版本（在线升级通道）」——Release 需上传 latest.yml +
  Setup.exe + blockmap；beta = GitHub pre-release 勾选。

## 11. v1.0.0 增量契约（对话体验：树形分支 / 生成统计 / 思考开关 / 上下文计量）

### 11.1 树形分支模型（schema v3）

- messages 新增列：`parent_id TEXT`（会话首条为 NULL）、`reasoning_ms / ttft_ms / total_ms INTEGER`、
  `finish_reason TEXT`；conversations 新增 `active_leaf_id TEXT`、`reasoning_enabled INTEGER NOT NULL DEFAULT 1`。
- v2→v3 迁移按 (created_at, rowid) 回填 parent 链；`backfillParentLinks()` 幂等，
  旧备份（schema_version<3）恢复后复用同一函数回填。
- **激活路径**：`listMessages` 返回从根到 active_leaf（空 = 最新一条）的线性序列；
  路径上同 parent 子消息数 >1 的消息填充 `branch={index(1 起), count, ids}`（同级按 created_at,rowid）。
- **操作语义**：
  - `sendMessage({conversationId, content, siblingOf?})`：新 user 消息 parent = 当前激活叶；
    `siblingOf` 时 parent = 该消息的 parent_id（user 编辑后重发 = 新分支，原分支保留）。
  - `setActiveLeaf({conversationId, messageId})`：branch 按钮语义——"在此消息之后分叉聊天"，
    之后 sendMessage 即在其下开辟新分支。
  - `regenerateMessage({conversationId, messageId})`：目标 assistant 的 parent 下新建同级分支
    （**不删除旧分支**），激活叶切到新分支。
  - `switchBranch({conversationId, messageId})`：激活叶 = 目标分支的最深后代（分叉取最新子）。
  - `continueMessage({conversationId, messageId})`：不建行；delta 追加到同一消息
    （chat:delta 的 messageId 不变）；content/token_count 对总内容重计、total_ms 累加、
    ttft 保留首段值、finish_reason 取本次。
  - `generateResponse({conversationId})`：激活叶为 user 时直接生成 assistant 子消息
    （Generate Response 按钮）；否则报 nothing_to_generate。
  - `updateMessageContent`：原地改内容（assistant 编辑 / 不重发场景），不触发生成。
  - `deleteMessages({conversationId, ids})`：各节点子树连删（事务）；
    active_leaf 在被删子树内时回退到最近存活祖先，全删光置 NULL；
    同级只剩 1 支后自然无 branch 元数据（UI 不渲染 ‹1/1›）。

### 11.2 思考开关（reasoning_enabled，shared/reasoning.ts）

- 会话级开关，新会话默认 true（DB 列默认值）。
- true = 模型默认思考，**请求不附加任何参数**；false = 按 api_format 附加关闭载荷：
  openai-chat `thinking:{type:'disabled'}`；openai-responses `reasoning:{effort:'none'}`；
  anthropic `thinking:{type:'disabled'}`（统一由 `reasoningOffPayload()` 产出，AdapterChatInput.reasoningOff 透传）。
- 能力判定 `modelSupportsReasoning(modelId)`：保守的"确认不支持"模式名单（gpt-3.5/gpt-4o/
  moonshot-v1/llama/mistral/gemma 等）；**未知一律按支持处理**（按钮显示）。标题生成不受影响。

### 11.3 气泡操作与 UI（LM Studio 对齐）

- user/assistant 气泡均有 branch/copy/edit/delete 四个 icon 按钮（生成中全部禁用）；
  assistant 额外有 regenerate/continue。操作按钮一律 icon（controls.tsx `IconButton`，
  icons.tsx 统一 SVG 图标库；未来新增按钮同规约）。
- delete 弹确认框；右键任一气泡进入批量选择模式：气泡左侧统一复选框、隐藏其余操作、
  分支导航暂隐藏，底部浮层显示已选计数 + 删除 + 退出（Esc 亦可）。
- 分支导航 `‹ n/N ›` 出现在有分支的气泡操作行旁（count>1 才渲染）。

### 11.4 生成统计（MessageStats）与计时口径

- 口径：t0 = 请求发出；ttft = 首个 delta（reasoning/content 先到为准）− t0（非流式 = total）；
  reasoning_ms = 首 content delta（无则流结束）− t0（仅当出现过 reasoning）；
  total_ms = 结束/中止/失败 − t0（中止/失败同样落库）。
- 展示：reasoning 折叠块标题「Thought for XX.XXs / 思考了 XX.XX 秒」；完成后统计行
  tok/s（= token_count / max(total−ttft,1ms)）、tokens、TTFT、总用时、finish_reason；
  ≥60s 显示 Xm XXs（`formatDurationMs`，双语）。

### 11.5 上下文计量（渲染进程本地计算，无 IPC）

- 用量 = 激活路径消息 token_count（缺省 4 字符≈1 token 估算）+ system_prompt + 输入草稿估算；
  预算 = resolveParams 生效参数的 context_window。
- 输入坞发送键左侧环形进度（>80% 转 warning 色），悬停浮层三行明细（会话 tokens / 窗口 / 已用%）。
- 激活叶为 user 且无生成中 → 输入坞上方浮出「生成回复 (Ctrl+R) / Generate Response」胶囊，
  不与输入框交互；快捷键 Ctrl/Cmd+R 仅按钮可见时生效。
