/**
 * 共享类型 —— 两端（electron/ 与 src/）唯一事实来源。
 * 严格对应 docs/contracts/impl-contract.md（共享类型与 EasyUiApi 契约）；字段变更必须同步两端。
 */

import type { ParamOverrides, ParamOverridesPatch, ParamPreset, ParamValues } from './params';

export type { ContextOverflow, ParamOverrides, ParamOverridesPatch, ParamPreset, ParamValues } from './params';

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
  id: string; // uuid v4
  name: string;
  base_url: string; // 已去末尾 '/'
  api_format: ApiFormat;
  has_key: boolean; // 渲染进程只看布尔，永不见密钥/密文
  models: ProviderModel[];
  created_at: number;
  updated_at: number;
}

export interface ProviderDraft {
  // 新建/编辑表单
  name: string;
  base_url: string;
  api_format: ApiFormat;
  api_key?: string; // 仅本次传输，主进程立即加密，永不落盘明文
}

export interface Conversation {
  id: string;
  title: string;
  provider_id: string | null;
  model: string | null;
  /** 选中的用户预设；null = 全局预设（默认） */
  preset_id: string | null;
  /** 会话级参数覆盖（只含与预设基线不等的键；schema v2 起，替代旧 SessionParams） */
  overrides: ParamOverrides;
  pinned: boolean;
  /** 会话级思考开关（schema v3）：true = 默认思考（请求不附加参数）；false = 按 api_format 附加关闭参数 */
  reasoning_enabled: boolean;
  created_at: number;
  updated_at: number;
}

/** 单条消息的生成统计（schema v3 起落库；continue 续写会累计 total_ms 与 token_count） */
export interface MessageStats {
  /** reasoning 阶段耗时（首 reasoning delta → 首 content delta / 流结束）；无 reasoning 缺省 */
  reasoning_ms?: number;
  /** 首 token 时间（请求发出 → 首个 delta，reasoning 或 content 先到为准）；非流式 = total_ms */
  ttft_ms?: number;
  /** 总生成耗时（请求发出 → 流结束/中止）；continue 续写累加 */
  total_ms?: number;
  /** 结束原因（finish_reason，原文保留，如 stop / length / tool_calls） */
  finish_reason?: string;
}

/** 分支信息：仅当该消息存在同级分支（同一 parent 下 >1 个子消息）时由 listMessages 填充 */
export interface BranchInfo {
  /** 当前激活分支在同级中的序号（从 1 开始，按 created_at,rowid 排序） */
  index: number;
  /** 同级分支总数 */
  count: number;
  /** 同级分支消息 id 列表（按序；UI 切换时传目标 id 给 switchBranch） */
  ids: string[];
}

export interface Message {
  id: string;
  conversation_id: string;
  /** 父消息 id（树形分支模型，schema v3）；会话首条消息为 null */
  parent_id: string | null;
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: string; // DeepSeek 等 reasoning_content 落库于此
  token_count: number | null;
  partial: boolean;
  error?: { code: string; message: string } | null; // 已脱敏
  stats?: MessageStats;
  /** 分支元数据（仅 listMessages 路径上且有分支时存在） */
  branch?: BranchInfo;
  created_at: number;
}

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ApiError {
  code: string;
  message: string; // 必须已过 redact()
}

export interface ChatChunk {
  delta?: string;
  reasoning_delta?: string;
  finishReason?: string;
  usage?: Usage;
  error?: ApiError;
}

export interface GeneralSettings {
  language: 'zh-CN' | 'en-US' | 'system';
  theme: 'light' | 'dark' | 'system';
  auto_title: boolean;
  enter_send: boolean; // true=Enter 发送
  /** 指定用于生成会话标题的模型；null = 回退用各会话当前模型（见 shared/title.ts） */
  title_provider_id: string | null;
  title_model: string | null;
  /** 界面缩放因子（CSS zoom，0.5~2.5 步长 0.1；1 = 100%） */
  zoom: number;
  /** 界面字体栈；空串 = 默认字体栈（注入安全：字符白名单见 shared/appearance.ts） */
  font_ui: string;
  /** 代码块字体栈；空串 = 默认等宽栈 */
  font_code: string;
  /** 界面字号 px（rem 基准，10~24 整数）；null = 默认 16px（范围约束见 shared/appearance.ts） */
  font_ui_size: number | null;
  /** 代码块字号 px（6~40 整数）；null = 默认（跟随 Markdown 样式内置值） */
  font_code_size: number | null;
  /** 代码块背景/高亮主题；auto = 跟随页面主题 */
  code_theme: 'light' | 'dark' | 'auto';
  /** 启动时自动检查更新（Electron 独占语义；web 预览持久化但不生效） */
  auto_update: boolean;
  /** 更新通道包含预发布版本（beta）；配合 auto_update / 手动检查 */
  update_beta: boolean;
}

export const DEFAULT_SETTINGS: GeneralSettings = {
  language: 'system',
  theme: 'system',
  auto_title: true,
  enter_send: true,
  title_provider_id: null,
  title_model: null,
  zoom: 1,
  font_ui: '',
  font_code: '',
  font_ui_size: null,
  font_code_size: null,
  code_theme: 'auto',
  auto_update: true,
  update_beta: false,
};

export interface EncryptionStatus {
  method: 'safeStorage' | 'machine-fallback';
  available: boolean;
}

/** 数据目录来源：default=安装版用户目录；portable=便携版 exe 旁工作目录；custom=用户自选 */
export type DataPathSource = 'default' | 'portable' | 'custom';

export interface SystemInfo {
  dataPath: string;
  dataPathSource: DataPathSource;
  /** true = 便携版（exe 旁工作目录）；web 预览恒 false */
  isPortable: boolean;
  /** true = Electron 桌面应用；false = web 预览（升级/数据目录改为桌面独占） */
  isElectron: boolean;
  version: string;
  encryption: EncryptionStatus;
  platform: string;
}

/** 数据目录变更结果（setDataDir） */
export type DataDirMigrationResult =
  /** 已把当前数据完整复制到新路径；重启后生效 */
  | { status: 'migrated'; needsRestart: true; path: string }
  /** 目标路径已有 Easy WebUI 数据（直接采用）或为空目录；已写指针，重启后生效 */
  | { status: 'switched'; needsRestart: true; path: string }
  /** 目标路径与当前数据目录相同：无操作 */
  | { status: 'noop'; needsRestart: false; path: string };

/* ---------- 在线升级（0.1.1 仅桩实现 + 接口预留；真实实现接线点见 electron/updater.ts） ---------- */

export interface UpdateInfo {
  version: string;
  /** release information / commit message，纯文本，UI 固定高度滚动展示 */
  release_notes: string;
  published_at?: string;
  /** 字节数（可选，用于下载进度展示） */
  size?: number;
}

export type UpdateCheckResult =
  | { status: 'available'; info: UpdateInfo }
  /** 已是最新版 */
  | { status: 'none' }
  /** 未配置更新源 / web 预览 / 不支持；reason 为机器可读码（not_configured | web_preview | ...） */
  | { status: 'unavailable'; reason: string };

export interface UpdateProgress {
  /** 0~100 */
  percent: number;
  transferred: number;
  total: number;
}

/** 下载并校验完成；失败 reject（错误码跨进程编码见 shared/errors.ts） */
export type UpdateDownloadResult = { verified: true };

/** 升级状态机（主进程权威态；渲染进程经 updateGetState 同步挂载前错过的进度） */
export type UpdateState =
  | { phase: 'idle' }
  | { phase: 'available' | 'downloading' | 'downloaded'; info: UpdateInfo };

export interface BackupFileInfo {
  filename: string;
  path: string;
  size: number;
  created_at: number;
  includes_keys: boolean;
}

export interface BackupManifest {
  app_version: string;
  schema_version: number;
  includes_keys: boolean;
  kdf?: { algo: 'scrypt'; N: number; r: number; p: number; salt_b64: string };
  created_at: number;
}

export interface ImportResult {
  providers: number;
  conversations: number;
  messages: number;
  presets: number;
  skipped: number;
}

export interface PresetProvider {
  key: string;
  label: string;
  base_url: string;
  api_format: ApiFormat;
  homepage?: string;
}

/**
 * 渲染进程桥接 API（docs/contracts/impl-contract.md，EasyUiApi 契约）—— preload 的 contextBridge 与
 * Web 预览 mock（src/bridge/mock.ts）都必须完整实现本接口。
 */
export interface EasyUiApi {
  // —— 平台管理 ——
  listProviders(): Promise<Provider[]>;
  createProvider(draft: ProviderDraft): Promise<Provider>;
  updateProvider(
    id: string,
    patch: Partial<ProviderDraft> & { models?: ProviderModel[] },
  ): Promise<Provider>;
  deleteProvider(id: string): Promise<{ affectedConversations: number }>;
  getPresets(): Promise<PresetProvider[]>;
  /** 拉取远程模型列表（可用 draft 带未保存的 key，或 providerId 用已存 key） */
  fetchModels(input: { providerId?: string; draft?: ProviderDraft }): Promise<string[]>;
  /** 单模型连通性检测：messages=[{role:'user',content:'ping'}], max_tokens=1, 非流式 */
  testModel(providerId: string, modelId: string): Promise<ModelCheck>;
  /** 全部检测，主进程并发=4，逐个通过 onModelCheck 事件回报 */
  testAllModels(providerId: string): Promise<void>;
  /** 格式自动探测：先 Bearer 试 /v1/models，再 anthropic 头试；均失败返回 null */
  detectFormat(input: {
    base_url: string;
    api_key?: string;
    providerId?: string;
  }): Promise<ApiFormat | null>;

  // —— 会话与消息 ——
  listConversations(): Promise<Conversation[]>;
  createConversation(): Promise<Conversation>;
  /**
   * patch.params 为 overrides 合并语义（不再是完整 SessionParams）：
   * 值传 null 删除该 override 键；新值与当前预设基线相等时主进程自动修剪（不存等值 override）。
   */
  updateConversation(
    id: string,
    patch: Partial<
      Pick<Conversation, 'title' | 'pinned' | 'provider_id' | 'model' | 'preset_id' | 'reasoning_enabled'>
    > & {
      params?: ParamOverridesPatch;
    },
  ): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;
  /**
   * 返回会话当前激活路径的消息序列（从根到 active_leaf 沿 parent_id 上溯后反转；
   * active_leaf 为空 = 最新一条消息为叶）。路径上有分支的消息带 branch 元数据。
   */
  listMessages(conversationId: string): Promise<Message[]>;
  /**
   * 切换分支：messageId = 目标同级分支消息 id（取自 branch.ids）。
   * 主进程把激活叶切到该分支最深后代（分叉处取最新子），返回新路径（同 listMessages）。
   */
  switchBranch(input: { conversationId: string; messageId: string }): Promise<Message[]>;
  /** 原地更新消息内容（assistant 编辑 / user 编辑不重发场景）；不触发重新生成 */
  updateMessageContent(input: {
    conversationId: string;
    messageId: string;
    content: string;
  }): Promise<Message>;
  /**
   * 批量删除消息（单个删除 = ids 长度 1）：删除各节点及其整个子树；
   * 激活叶在被删子树内时回退到被删节点的最近存活祖先。返回新路径（同 listMessages）。
   */
  deleteMessages(input: { conversationId: string; ids: string[] }): Promise<Message[]>;
  /**
   * 手动触发标题生成（✨ 按钮）：强制覆盖现有标题，忽略 auto_title 开关与
   * 标题是否为空；20s 超时 + 失败后重试 1 次。成功返回更新后的 Conversation
   * （同时广播 title:updated）；失败 reject（title_model_unavailable 等）。
   */
  generateTitle(conversationId: string): Promise<Conversation>;
  /** 标题生成成功（自动 + 手动路径都会广播）：侧栏即时刷新 */
  onTitleUpdated(cb: (p: { conversationId: string; title: string }) => void): () => void;
  /** 自动路径最终失败（重试用尽；不阻断对话）：渲染进程 toast 警告 */
  onTitleFailed(
    cb: (p: { conversationId: string; error: ApiError }) => void,
  ): () => void;

  // —— 参数预设 ——
  /** 全局预设恒在首位（is_global=true, id='global'） */
  listParamPresets(): Promise<ParamPreset[]>;
  createParamPreset(input: { name: string; params: ParamValues }): Promise<ParamPreset>;
  /** 全局预设只允许改 params（改 name 报错） */
  updateParamPreset(id: string, patch: { name?: string; params?: ParamValues }): Promise<ParamPreset>;
  /** 全局预设不可删；引用被删预设的会话 preset_id 置 null */
  deleteParamPreset(id: string): Promise<void>;
  /** 全局预设参数重置为工厂默认 */
  resetGlobalPreset(): Promise<ParamPreset>;

  // —— 对话生成（树形分支模型，schema v3） ——
  /**
   * 发送用户消息并开始生成：user 消息的 parent = 当前激活叶（即"branch after this message"
   * 的落点）；assistant 占位消息为其子。消息创建后即返回 id，流式进度经事件推送。
   * 生成中（同会话锁）拒绝 generation_in_progress。
   */
  sendMessage(input: {
    conversationId: string;
    content: string;
    /**
     * 以指定消息的"同级分支"身份插入新 user 消息（parent = 该消息的 parent_id）：
     * 用于 user 消息编辑后重发（编辑产生新分支，原分支保留）。缺省 = parent 为当前激活叶。
     */
    siblingOf?: string;
  }): Promise<{ userMessageId: string | null; assistantMessageId: string }>;
  /**
   * 把激活叶精确设为指定消息（branch 按钮："Branch chat after this message"）；
   * 之后 sendMessage 即在该消息下开辟新分支。返回新路径（同 listMessages）。
   */
  setActiveLeaf(input: { conversationId: string; messageId: string }): Promise<Message[]>;
  /**
   * 重新生成指定 assistant 消息：在其 parent 下新建同级分支消息（不删除旧分支），
   * 激活叶切到新分支；流式事件同 sendMessage。
   */
  regenerateMessage(input: {
    conversationId: string;
    messageId: string;
  }): Promise<{ assistantMessageId: string }>;
  /**
   * 续写指定 assistant 消息：不新建气泡，delta 追加到同一消息；
   * total_ms 与 token_count 累计，finish_reason 取最后一次运行。事件 messageId 不变。
   */
  continueMessage(input: { conversationId: string; messageId: string }): Promise<void>;
  /**
   * 当激活叶为 user 消息时直接生成 assistant 回复（Generate Response 按钮）；
   * 不与输入框交互。激活叶非 user 时报 nothing_to_generate。
   */
  generateResponse(input: { conversationId: string }): Promise<{ assistantMessageId: string }>;
  stopGeneration(conversationId: string): Promise<void>;
  /** 事件订阅，均返回取消订阅函数 */
  onChatDelta(
    cb: (p: {
      conversationId: string;
      messageId: string;
      delta: string;
      reasoning_delta?: string;
    }) => void,
  ): () => void;
  onChatDone(
    cb: (p: { conversationId: string; messageId: string; message: Message }) => void,
  ): () => void;
  onChatError(
    cb: (p: { conversationId: string; messageId: string; error: ApiError }) => void,
  ): () => void;
  onModelCheck(
    cb: (p: { providerId: string; modelId: string; check: ModelCheck }) => void,
  ): () => void;

  // —— 通用设置 / 系统信息 ——
  getSettings(): Promise<GeneralSettings>;
  setSettings(patch: Partial<GeneralSettings>): Promise<GeneralSettings>;
  getSystemInfo(): Promise<SystemInfo>;

  // —— 数据目录（Electron 独占；web mock：pickDataDir→null，setDataDir→reject electron_only） ——
  /** 弹系统目录选择框；用户取消返回 null */
  pickDataDir(): Promise<string | null>;
  /**
   * 变更数据存储路径：主进程校验（可写、非当前目录子/同目录、不含非法锁定），
   * 目标为空 → 完整复制当前数据；目标已有数据 → 直接采用；随后写入路径指针文件。
   * 成功均 needsRestart:true —— 渲染进程提示「重启后生效」，用户确认后调 relaunchApp()。
   */
  setDataDir(input: { path: string }): Promise<DataDirMigrationResult>;
  /** 重启应用（app.relaunch + exit）；web mock 为 no-op */
  relaunchApp(): Promise<void>;
  /** 用系统浏览器打开 http(s) 外链（关于页 GitHub 链接）；web mock 用 window.open */
  openExternal(url: string): Promise<void>;

  // —— 在线升级（Electron 独占；web mock 恒 unavailable/web_preview） ——
  /** 检查更新；网络/配置失败不 reject——以 status 表达，只有参数级错误才 reject */
  updateCheck(): Promise<UpdateCheckResult>;
  /** 拉取已发现的更新包并校验；进度经 onUpdateProgress 推送，完成 resolve {verified:true} */
  updateDownload(): Promise<UpdateDownloadResult>;
  /** 安装已下载的更新（quitAndInstall，静默安装并重启）；失败 reject */
  updateInstall(): Promise<void>;
  /** 主进程权威升级状态（About 页挂载时同步，错过 update:available 事件也能恢复 UI） */
  updateGetState(): Promise<UpdateState>;
  /** 下载进度事件订阅，返回取消订阅函数 */
  onUpdateProgress(cb: (p: UpdateProgress) => void): () => void;
  /** 启动自动检查发现新版本时广播（About 页未挂载时由全局监听弹通知气泡） */
  onUpdateAvailable(cb: (info: UpdateInfo) => void): () => void;

  // —— 备份 ——
  listBackups(): Promise<BackupFileInfo[]>;
  createBackup(input: { includeKeys: boolean; password?: string }): Promise<BackupFileInfo>;
  restoreBackup(input: {
    path: string;
    password?: string;
    mode: 'merge' | 'overwrite';
  }): Promise<ImportResult>;
  deleteBackup(filename: string): Promise<void>;
  openBackupsDir(): Promise<void>;
  pickBackupFile(): Promise<string | null>;
}
