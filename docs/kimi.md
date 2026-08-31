# Easy WebUI — 设计文档（Kimi Work 实施指南）

> 本文件面向 AI 编码代理（Kimi Work），作为项目的唯一事实来源（single source of truth）。实施过程中如需求与本文件冲突，以本文件为准；如本文件未覆盖，遵循"最小惊讶原则"并在代码注释中说明取舍。

---

## 1. 项目概述

**Easy WebUI** 是一款面向 PC 端的轻量级、本地优先（local-first）的多平台大模型对话客户端。它对标 Open WebUI / SillyTavern 的核心对话能力，但刻意保持小巧：不内置插件市场、不做 RAG、不做多用户与权限体系，目标是"下载即用、三分钟接入任意服务商"。

### 1.1 核心价值

- **一个页面，接入所有主流服务商**：OpenAI 及兼容接口、Anthropic 及兼容接口、各类中转/聚合站。
- **本地优先**：所有数据保存在本地磁盘（项目根目录 `data/`），无云端同步、无遥测。
- **密钥安全**：API 密钥永不明文落盘，备份时可选择排除密钥。

### 1.2 目标用户

- 拥有多个 API 渠道（官方 / 中转 / 本地推理端点）的个人开发者与重度 AI 用户。
- 对 Open WebUI 的体积与部署复杂度不满、只需要"纯粹对话 + 参数控制"的用户。

### 1.3 非目标（明确不做）

以下功能本期**不实现**，需求出现时应拒绝或延后：

- 多用户、账号体系、服务端部署（单机单用户）。
- RAG / 知识库 / 文件解析（仅预留纯文本附件的扩展点）。
- 插件系统、函数调用（Function Calling 的可视化编排）。
- 图像生成、语音、移动端适配（响应式只需保证窗口缩小到 960px 仍可用，不做手机布局）。
- 在线更新器（首版手动下载替换即可）。

---

## 2. 技术栈与总体架构

### 2.1 技术选型

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 外壳 | **Electron**（最新稳定版） | PC 桌面分发；渲染进程浏览器直连多数 API 会遇到 CORS，主进程可转发请求；提供 `safeStorage` 系统级密钥加密 |
| 前端 | Vite + React 18 + TypeScript（strict） | 生态成熟、AI 代理实现成本最低 |
| 样式 | Tailwind CSS 3 + CSS 自定义属性 | 液态玻璃效果与双主题均依赖设计令牌（design tokens） |
| 存储 | **better-sqlite3**（主进程，WAL 模式） | 单文件、事务、查询快；满足"高效数据结构"要求 |
| 网络 | 主进程 `net.fetch`（Node 18+ fetch） | 绕过 CORS，统一 SSE 流式处理 |
| 国际化 | i18next + react-i18next | 两份 JSON 语言包，够用且简单 |
| 状态 | Zustand | 轻量，避免 Redux 样板 |
| Markdown 渲染 | react-markdown + remark-gfm + highlight.js（按需加载） | 代码块高亮与复制按钮 |

> 备选方案：若构建体积敏感可换 Tauri，但 Electron 生态与 `safeStorage` 更稳，默认不更换。

### 2.2 进程架构

```
┌────────────────────────── Electron Main Process ──────────────────────────┐
│  Window 管理 │ SQLite 数据层 │ 加密服务(safeStorage) │ Provider Gateway     │
│              │              │                       │ (协议适配 + 请求转发) │
└──────────────┴──────────────┴───────────────────────┴──────────┬───────────┘
                                 │  IPC（invoke/handle，流式用 webContents.send）
┌────────────────────────────── Renderer Process ───────────────────────────┐
│  React UI（会话页 / 设置页）│ Zustand Store │ i18n │ Cookie 偏好           │
└────────────────────────────────────────────────────────────────────────────┘
```

**关键约束**：

1. **所有出站 API 请求必须经由主进程 Provider Gateway 转发**，渲染进程不持有明文密钥、不直接请求服务商。渲染进程只拿到"平台 id + 模型名 + 参数"，主进程查库解密密钥后发请求。
2. 流式响应通过 `webContents.send('chat:delta', payload)` 推送，渲染进程增量渲染；取消操作通过 IPC 调 `AbortController.abort()`。
3. IPC 接口必须做输入校验（zod 或手写 guard），不信任渲染进程传入的任何字段。
4. `nodeIntegration: false`、`contextIsolation: true`，通过 `contextBridge` 暴露白名单 API（`window.easyui.*`）。

### 2.3 目录结构

```
easy-webui/
├── kimi.md                  # 本文件
├── package.json
├── electron/
│   ├── main.ts              # 主进程入口
│   ├── preload.ts           # contextBridge
│   ├── db/                  # SQLite schema、迁移、DAO
│   ├── crypto/              # 密钥加密封装
│   ├── gateway/             # 协议适配层（见 §6）
│   └── backup/              # 备份导入导出
├── src/                     # 渲染进程
│   ├── components/          # 通用组件（GlassCard、Modal、Slider…）
│   ├── pages/
│   │   ├── chat/            # 会话页（三栏）
│   │   └── settings/        # 设置页（平台管理 / 通用 / 备份）
│   ├── i18n/                # zh-CN.json / en-US.json
│   ├── store/               # Zustand
│   └── styles/              # tokens.css、玻璃拟态工具类
├── data/                    # 用户数据根目录（见 §7，随包内置空目录说明）
└── tests/
```

---

## 3. 功能规格：模型平台管理（Provider）

### 3.1 数据字段

每个"平台"（Provider）包含：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID v4 |
| `name` | 用户自定义名称，如"OpenAI 官方""DeepSeek 中转" |
| `base_url` | API 地址，如 `https://api.openai.com`；存储时去掉末尾 `/` |
| `api_format` | 响应格式枚举：`openai-chat`（Chat Completions）/ `openai-responses`（Responses API）/ `anthropic`（Messages API） |
| `api_key_cipher` | **加密后**的密钥密文（见 §8），永不存明文 |
| `models` | 已勾选启用的模型列表（数组，见下） |
| `created_at` / `updated_at` | 时间戳 |

`models` 数组元素：`{ id, display_name?, enabled, last_check: { status: 'ok'|'fail'|'unknown', latency_ms?, checked_at?, error? } }`。

### 3.2 交互流程

**新增平台**：

1. 用户填写名称、API 地址、API 密钥，选择响应格式（默认 `openai-chat`，提供"自动探测"按钮——见 §3.3）。
2. 点击**"检测模型列表"**：
   - `openai-chat` / `openai-responses`：请求 `GET {base_url}/v1/models`，Header `Authorization: Bearer <key>`。
   - `anthropic`：请求 `GET {base_url}/v1/models`，Header `x-api-key: <key>`、`anthropic-version: 2023-06-01`。
   - 请求超时 15s；失败时在输入框下方给出可读错误（HTTP 状态码 + 服务商返回的 message，**密钥字段在错误展示中必须脱敏**）。
3. 成功后在弹层/下拉中列出全部模型 ID，**复选框勾选**需要的模型，确认后写入 `models`（`enabled: true`）。
4. 列表获取失败时允许"手动添加模型"（输入模型 ID），保证兼容不实现 `/models` 的端点（这是硬性要求，很多中转站屏蔽了列表接口）。

**连接检测**：

- 对已勾选模型提供单个"检测"按钮与"全部检测"按钮。
- 检测 = 发送一条最小开销请求：`messages=[{role:'user', content:'ping'}]`，`max_tokens=1`，非流式。
- 结果显示在模型行内：绿色圆点 + 延迟毫秒数；失败显示红色圆点 + 悬浮错误详情。检测结果持久化到 `last_check`。
- "全部检测"并发数限制为 4，避免触发限流。

### 3.3 格式自动探测（尽力而为，可失败）

按顺序尝试：① `GET /v1/models` 用 Bearer 头 → 成功则 `openai-chat`；② 换 `x-api-key` + `anthropic-version` 头 → 成功则 `anthropic`。均失败时保持用户选择并提示"无法自动识别，请手动选择"。探测只是辅助，不阻断保存。

---

## 4. 功能规格：对话与参数

### 4.1 会话页布局（三栏）

- **左栏**：会话列表（新建、重命名、删除、置顶、按更新时间排序、搜索标题）。
- **中栏**：消息流 + 输入区。支持 Markdown 渲染、代码块复制、消息重生成（regenerate）、单条消息编辑后分叉、停止生成。
- **右栏**（可折叠）：当前会话的参数面板。

### 4.2 会话级参数（全部持久化到该会话）

| 参数 | 类型 / 范围 | 说明 |
| --- | --- | --- |
| 使用模型 | `provider_id + model_id` | 会话内可随时切换；切换不回溯修改历史消息 |
| 系统提示词 | 多行文本 | 为空则不注入 |
| 最大输出 token | int，1–128000 | 映射到各协议的 `max_tokens` |
| 上下文窗口长度 | int（token 数） | 触发裁剪策略，见 §4.3 |
| 温度 temperature | float，0–2 | |
| top_p | float，0–1 | |
| top_k | int，0–500，0 = 不传 | **仅 Anthropic 协议支持**；其他协议下 UI 置灰并标注"当前协议不支持" |
| 重复惩罚 | float，0–2，0 = 不传 | 映射：OpenAI 系 → `frequency_penalty`（转换 `penalty = value - 1`，仅当 value > 1 时传正差值；实现时在适配层注明近似语义）；Anthropic 不支持则忽略并忽略告警 |
| 流式传输 | bool，默认开 | |

**协议差异处理原则**：适配层静默丢弃目标协议不支持的参数，但在会话参数面板用"ⓘ"提示该参数对当前协议不生效。不做强制报错。

### 4.3 上下文裁剪算法

发送前在主进程组装消息：

1. 用估算器计算每条消息 token 数。估算器：`cl100k_base` 近似（可直接用 `js-tiktoken`）；失败时回退 `ceil(字符数 / 3)`（中文偏保守值）。
2. 预算 = `min(上下文窗口长度, 模型已知上限)` − `最大输出 token` − 256（安全余量）。
3. **滑动窗口裁剪**：始终保留系统提示词 + 最近的消息，从最早的用户/助手对开始成对丢弃，直到总 token ≤ 预算。被裁剪的消息**不从数据库删除**，只是本次请求不带。
4. 当单条消息本身就超预算时，截断该消息并提示用户。

> 会话历史在 DB 中永久完整保存，裁剪只影响发送载荷。

### 4.4 生成控制

- 流式期间：输入框禁用、显示"停止"按钮；取消后主进程 abort，并把已收到的部分内容落库（标记 `partial: true`）。
- 请求失败：消息以气泡内错误卡片呈现（状态码 + 脱敏后的服务商错误信息），提供"重试"按钮；重试复用同一条用户消息，不产生重复记录。
- 单个会话同一时间只允许一个进行中的生成。

---

## 5. UI 设计规格：Apple 液态玻璃（Liquid Glass）

### 5.1 视觉令牌

在 `tokens.css` 中定义 CSS 变量，深浅两套主题：

```css
:root[data-theme="light"] {
  --glass-bg: rgba(255, 255, 255, 0.55);
  --glass-border: rgba(255, 255, 255, 0.65);
  --glass-blur: 24px;
  --glass-saturate: 180%;
  --text-primary: rgba(0, 0, 0, 0.85);
  --accent: #0a84ff;
  /* … */
}
:root[data-theme="dark"] {
  --glass-bg: rgba(30, 30, 32, 0.55);
  --glass-border: rgba(255, 255, 255, 0.12);
  --text-primary: rgba(255, 255, 255, 0.92);
  --accent: #0a84ff;
  /* … */
}
```

**玻璃卡片**统一样式（工具类 `.glass`）：

- `background: var(--glass-bg)`，`backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate))`。
- `border: 0.5px solid var(--glass-border)`，圆角 16px（面板级）/ 12px（控件级）/ 999px（胶囊按钮）。
- 阴影：浅色主题 `0 8px 32px rgba(0,0,0,0.08)`；深色主题 `0 8px 32px rgba(0,0,0,0.4)`。
- 悬浮态：亮度 +4%、位移 -1px，过渡 200ms `cubic-bezier(0.32, 0.72, 0, 1)`（Apple 风格缓动）。

**性能红线**：

- `backdrop-filter` 是昂贵渲染操作。同屏玻璃层不超过 5 处；滚动列表项**不**使用模糊，改用半透明纯色。
- 用 `@supports not (backdrop-filter: blur(1px))` 提供降级：不透明度提升至 0.92。
- 窗口背景铺一层柔和的渐变/噪点，保证玻璃有内容可"折射"。

### 5.2 主题

- 浅色 / 深色 / 跟随系统三档，设置即时生效（切换 `data-theme` 属性）。
- 主题切换过渡 300ms，但 `prefers-reduced-motion` 下禁用过渡。

### 5.3 缩放鲁棒性（硬指标）

用户会用 Ctrl+滚轮缩放页面，布局必须稳健：

- 全部尺寸使用 `rem`（根字号 16px），**禁止**以 `px` 写死容器宽高；仅边框线宽允许 px。
- 三栏布局用 CSS Grid：`grid-template-columns: minmax(200px, 260px) 1fr minmax(240px, 320px)`，中栏自适应收缩。
- 缩放 67%–200% 区间内逐一目检：无横向滚动条、无文字溢出截断（长模型名 `text-overflow: ellipsis`）、模态框不超出视口（`max-height: 90vh` + 内部滚动）。
- 输入组件（滑块、数字框）的最小可点击区域 ≥ 32×32px。

### 5.4 页面设置 Cookie 持久化

以下**轻量 UI 偏好**写入 Cookie（其余业务数据一律走 SQLite，不放 Cookie）：

- `theme`（light / dark / system）、`lang`（zh-CN / en-US）、`sidebar_collapsed`、`右栏宽度`。

约定：

- 单 Cookie 名 `easyui_prefs`，值为 `encodeURIComponent(JSON.stringify(obj))`，体积 < 2KB。
- 过期 365 天，`SameSite=Lax`，**不**设 `HttpOnly`（前端需要读写）；绝不含任何敏感信息。
- Electron 中通过 `session.defaultSession.cookies` 读写，并提供 `localStorage` 兜底读取（Cookie 异常时不白屏）。
- 启动时渲染进程在挂载前同步读取 Cookie 决定初始主题与语言，避免闪烁（FOUC）。

### 5.5 国际化

- 语言包 `src/i18n/zh-CN.json` 与 `en-US.json`，键名用点分层级（`chat.input.placeholder`）。
- 所有面向用户的字符串**禁止硬编码**，包括错误提示、按钮 aria-label。
- 默认语言：首次启动读取系统 locale，命中中文则 zh-CN，否则 en-US；用户切换后写入 Cookie。
- 数字、时间用 `Intl.NumberFormat` / `Intl.DateTimeFormat` 按当前语言格式化。

---

## 6. 协议适配层（Provider Gateway）

主进程模块，对上层暴露统一接口：

```ts
interface ChatRequest {
  providerId: string; model: string;
  messages: { role: 'system'|'user'|'assistant'; content: string }[];
  params: SessionParams; stream: boolean;
  signal: AbortSignal;
}
interface ChatChunk { delta?: string; finishReason?: string; usage?: Usage; error?: ApiError }
// 统一出口：async function* chat(req: ChatRequest): AsyncIterable<ChatChunk>
```

### 6.1 `openai-chat`（Chat Completions）

- `POST {base}/v1/chat/completions`，`Authorization: Bearer`。
- 参数映射：`temperature`、`top_p`、`max_tokens`、`stream`、`frequency_penalty`。
- 流式解析 SSE：`data:` 行，`[DONE]` 结束，取 `choices[0].delta.content`。
- reasoning 字段（`reasoning_content`，DeepSeek 等）若存在则以可折叠块渲染。

### 6.2 `openai-responses`（Responses API）

- `POST {base}/v1/responses`，payload：`{ model, input: [...], max_output_tokens, temperature, top_p, stream }`。
- `input` 需把 `system` 角色转为顶层 `instructions` 字段。
- 流式事件取 `response.output_text.delta` 的 `delta`；`response.completed` 结束；`response.failed` 转错误。
- 检测模型列表同样走 `GET /v1/models`。

### 6.3 `anthropic`（Messages API）

- `POST {base}/v1/messages`，Header：`x-api-key`、`anthropic-version: 2023-06-01`。
- payload：`{ model, system: <字符串>, messages: [user/assistant…], max_tokens, temperature, top_p, top_k, stream }`。注意：**`system` 是顶层字段而非消息**；messages 中不得含 system 角色。
- 流式事件：`content_block_delta`（`delta.type === 'text_delta'`）取 `delta.text`；`message_stop` 结束。
- `max_tokens` 为必填，缺省给 4096 并提示。

### 6.4 通用要求

- 全部请求超时：连接 15s；流式空闲 60s 无数据视为断开并重试 1 次，再失败则报错。
- HTTP 非 2xx：读取响应体中的 `error.message`（OpenAI 结构）或 `error.message`（Anthropic 结构），统一映射为 `{ code, message }`；**任何错误对象序列化前对密钥做脱敏替换**。
- 适配层对每个格式提供 `listModels()` 与 `testModel(model)` 两个方法供 §3 使用。

---

## 7. 本地数据存储

### 7.1 位置与结构

用户数据根目录默认为可执行文件旁的 `data/`（便携模式）；若不可写（如安装到 Program Files），回退到 `app.getPath('userData')`，并在设置页显示实际路径。结构：

```
data/
├── easyui.db           # SQLite 主库（WAL 模式）
├── easyui.db-wal / -shm
├── keyring.bin         # safeStorage 不可用时的回退密钥材料（见 §8）
└── backups/            # 备份文件默认输出位置
```

### 7.2 SQLite Schema

启用 `PRAGMA journal_mode = WAL`、`foreign_keys = ON`。用迁移表 `schema_migrations` 管理版本，启动时自动升级。

```sql
CREATE TABLE providers (
  id TEXT PRIMARY KEY,            -- uuid
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_format TEXT NOT NULL CHECK(api_format IN ('openai-chat','openai-responses','anthropic')),
  api_key_cipher BLOB,            -- 密文，可空（允许先建后填）
  models_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);

CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
  model TEXT,
  params_json TEXT NOT NULL DEFAULT '{}',   -- §4.2 全部参数
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_conv_updated ON conversations(updated_at DESC);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('system','user','assistant')),
  content TEXT NOT NULL,
  token_count INTEGER,             -- 落库时估算并缓存，供裁剪算法使用
  partial INTEGER NOT NULL DEFAULT 0,
  error_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_msg_conv ON messages(conversation_id, created_at);
```

- 标题自动生成：首轮对话完成后，用当前模型以 ≤20 token 总结标题（可在通用设置中关闭）。
- 消息搜索（v1.1 可选项）：FTS5 虚拟表 `messages_fts`，随消息写入同步更新。

### 7.3 备份与恢复

设置页提供"备份管理"区块：

**导出**：

1. 用户点击"创建备份"，弹窗勾选：**☑ 包含 API 密钥（使用密码加密）/ ☐ 不包含 API 密钥**（默认不含）。
2. 备份文件 `easyui-backup-YYYYMMDD-HHmm.zip`：
   - `data.json`：providers、conversations、messages、通用设置的全量导出（JSON，UTF-8）。
   - `manifest.json`：`{ app_version, schema_version, includes_keys, kdf?, created_at }`。
3. **不含密钥**（默认）：导出时 `api_key_cipher` 字段置 `null`。恢复后这些平台可正常使用其余配置，仅需补填密钥。
4. **含密钥**：弹窗要求输入备份密码（≥8 位，二次确认）。用 scrypt（N=2^15, r=8, p=1）从密码派生 32 字节密钥，AES-256-GCM 加密"解密后的密钥明文列表"，密文与 salt、nonce 一并入包。**绝不允许把 safeStorage 密文直接导出**（它绑定本机，换了机器无法解密）。

**恢复**：

- 选择 zip → 解析 manifest → 若 `includes_keys` 则要求输入备份密码 → 校验 `schema_version` ≤ 当前版本 → 事务内执行导入。
- 提供两种模式：**合并**（按 id 存在则跳过，默认）与**覆盖**（先清空对应表再导入，需二次确认并自动先做一份临时备份）。
- 恢复完成后重载数据层并提示结果统计（导入平台 X、会话 Y、消息 Z）。

**备份列表**：显示 `backups/` 下文件（时间、大小、是否含密钥），支持打开所在目录与删除。

---

## 8. 安全设计

1. **密钥存储**：
   - 首选 Electron `safeStorage.encryptString(plaintext)` → Base64 存 `providers.api_key_cipher`（Windows 走 DPAPI，macOS 走 Keychain，Linux 走系统密钥环）。
   - `safeStorage.isEncryptionAvailable() === false` 时：用机器指纹（`machineId` + 用户名）经 scrypt 派生密钥做 AES-256-GCM，密钥材料存 `keyring.bin`（权限 600），并在设置页常驻黄色提示"当前系统不支持系统级加密，密钥以弱保护方式存储"。
   - **密钥明文只允许存在于主进程内存的请求组装瞬间**，不出现在：日志、错误消息、IPC 返回、渲染进程、备份默认导出。
2. **日志**：主进程日志写 `data/logs/app.log`（按日轮转，保留 7 天），所有请求日志只记录 URL 与状态码，Header 与 body 中的密钥字段经统一 `redact()` 函数替换为 `sk-***`（保留前 3 位便于辨认）。
3. **渲染进程安全**：CSP `default-src 'self'`；不加载远程脚本；Markdown 渲染前经 DOMPurify 消毒，防 XSS（模型输出不可信）。
4. **隐私**：零遥测、零自动上报；唯一的出站请求是用户配置的服务商端点。

---

## 9. 其他设计规范

- **空状态**：无平台时，会话页中栏显示引导卡片（"添加第一个模型平台"按钮直达设置页）；无会话时显示快捷开始。
- **快捷键**：`Ctrl/Cmd+N` 新会话、`Ctrl/Cmd+,` 设置、`Enter` 发送 / `Shift+Enter` 换行、`Esc` 停止生成。快捷键表写进设置页。
- **错误文案规范**：三段式——发生了什么 / 可能原因 / 建议操作。例如："连接失败（HTTP 401）。密钥可能无效或已过期。请在平台设置中检查 API 密钥。"
- **删除保护**：删除平台、会话、备份均需确认对话框；删除平台时提示"该平台的 N 个会话将保留，但需重新指定模型"。
- **性能预算**：冷启动到可交互 < 3s；加载 1 万条消息的会话首屏 < 500ms（消息列表虚拟滚动，react-virtuoso）；流式渲染节流 50ms。
- **可访问性**：所有交互控件可 Tab 到达；主题对比度 ≥ WCAG AA（4.5:1）。
- **测试**：协议适配层必须有单元测试（mock fetch 覆盖三种格式的流式与非流式、错误分支）；加解密与备份导入导出需集成测试；裁剪算法用固定 token 计数器做纯函数测试。
- **构建**：electron-builder 输出 Windows（nsis + portable）与 macOS（dmg）产物；Linux AppImage 尽力而为。

---

## 10. 里程碑

| 里程碑 | 内容 | 验收要点 |
| --- | --- | --- |
| M1 骨架与数据层 | Electron + Vite + TS 脚手架、SQLite schema 与迁移、IPC 骨架 | 空应用启动，`data/easyui.db` 自动创建 |
| M2 平台管理 | 平台 CRUD、模型列表检测、勾选、连接检测、协议探测 | 接入真实 OpenAI 兼容端点完成全流程 |
| M3 对话核心 | 三格式适配层、流式渲染、参数面板、上下文裁剪 | 三种协议各完成一轮流式对话；超窗裁剪正确 |
| M4 安全与备份 | safeStorage 加密、日志脱敏、备份导出/导入（含/不含密钥） | 密钥全文检索不出现在 db 与日志；两种备份模式恢复成功 |
| M5 UI 打磨 | 液态玻璃视觉、深浅主题、缩放 67%–200% 目检、i18n 双语 | 设计走查通过，切换语言无硬编码残留 |
| M6 加固与发布 | 单元/集成测试、性能预算核验、安装包构建 | CI 全绿，产出 Win/mac 安装包 |

---

## 11. 给实施代理的硬性约束清单（TL;DR）

1. API 密钥**永不明文落盘**、永不进渲染进程；备份默认**不含**密钥，含密钥时必须密码加密（scrypt + AES-256-GCM）。
2. 所有服务商请求走主进程 Gateway；渲染进程不见密钥、不直面 CORS。
3. 协议差异（top_k、system 字段位置、penalty 语义）在适配层内部消化，UI 仅做提示。
4. UI 偏好用 Cookie（`easyui_prefs`），业务数据用 SQLite，二者不混用。
5. 全部尺寸用 rem，缩放 67%–200% 不许破版；同屏玻璃模糊层 ≤ 5。
6. 所有用户可见字符串走 i18n，禁止硬编码中英文。
7. 不实现 §1.3 列出的非目标功能。
