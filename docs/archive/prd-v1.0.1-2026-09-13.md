# Easy WebUI — 产品需求文档（PRD）

> 本文件是产品的唯一事实来源（single source of truth），前身 `kimi.md`（v0.1.0 实施指南）已按 v1.0.x 现状完整重写并更名。
> 文档分工：**prd.md（本文件）**定义"做什么/做到什么程度/边界在哪"；**impl-contract.md** 定义跨进程接口的可执行细节；**release.md** 定义发布规范。与 impl-contract.md 冲突时以本文件为准；本文件未覆盖处遵循"最小惊讶原则"并在代码注释中说明取舍。

---

## 1. 项目概述

**Easy WebUI** 是一款面向 PC 端的轻量级、本地优先（local-first）的多平台大模型对话客户端。对标 Open WebUI / SillyTavern 的核心对话能力，但刻意保持小巧：不内置插件市场、不做 RAG、不做多用户。目标是"下载即用、三分钟接入任意服务商"，参数控制向 LM Studio 看齐。

### 1.1 核心价值

- **一个页面，接入所有主流服务商**：12 家预置模板（OpenAI / Anthropic / OpenRouter / DeepSeek / Kimi / 智谱 / 小米 MiMo / MiniMax / 硅基流动 / 魔搭 / 火山引擎 / 阿里百炼）+ 完全自定义 base URL；三种 API 格式（`openai-chat` / `openai-responses` / `anthropic`）自动探测。
- **本地优先**：全部数据（会话/密钥/设置）保存在用户可见的本地数据目录，支持便携版随目录走、自定义位置一键迁移；无云端同步、无遥测。
- **密钥安全**：API 密钥永不明文落盘（safeStorage 优先，机器指纹加密兜底），永不出现在渲染进程；备份默认不含密钥。
- **对话体验完整**：树形分支、重生成/续写、思考过程折叠、生成统计（tok/s / TTFT）、上下文计量、思考开关、自动标题。

### 1.2 目标用户

- 拥有多个 API 渠道（官方 / 中转 / 本地推理端点）的个人开发者与重度 AI 用户。
- 对 Open WebUI 的体积与部署复杂度不满、只需要"纯粹对话 + 精细参数控制"的用户。

### 1.3 非目标（明确不做）

以下功能**不实现**，需求出现时应拒绝或延后：

- 多用户、账号体系、服务端部署（单机单用户）。
- RAG / 知识库 / 文件解析（仅预留纯文本附件的扩展点）。
- 插件系统、函数调用（Function Calling 的可视化编排）。
- 图像生成、语音、移动端适配（响应式只保证窗口缩小到 960px 仍可用，不做手机布局）。

> 在线更新器原列于此，已于 v0.1.1 落地（GitHub Releases 通道，见 §9 与 release.md），不再是非目标。

---

## 2. 技术栈与总体架构

### 2.1 技术选型（当前锁定版本）

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 外壳 | **Electron 44** | PC 桌面分发；渲染进程直连服务商 API 有 CORS 限制，主进程可转发；提供 `safeStorage` 系统级密钥加密 |
| 前端 | Vite 8 + React 18 + TypeScript 5.6（strict） | 生态成熟、AI 代理实现成本最低 |
| 样式 | Tailwind CSS 3 + CSS 自定义属性 | 液态玻璃与双主题均依赖设计令牌（design tokens） |
| 存储 | **better-sqlite3**（主进程，WAL 模式） | 单文件、事务、查询快；原生模块已按 Electron ABI 预编译 |
| 网络 | 主进程 `net.fetch` | 绕过 CORS，统一 SSE 流式处理 |
| 状态 / i18n | Zustand / i18next + react-i18next | 轻量；两份 JSON 语言包 |
| Markdown | react-markdown + remark-gfm + highlight.js + DOMPurify | GFM 表格、代码高亮、渲染前消毒 |
| 更新 | electron-updater（GitHub Releases 通道） | 增量 blockmap + sha512 校验 |

> 备选 Tauri 已评估并否决：Electron 生态与 `safeStorage` 更稳，不更换。

### 2.2 进程架构

```
┌──────────────────────────── Electron Main Process ────────────────────────────┐
│ 窗口管理(含尺寸记忆) │ SQLite 数据层 │ 加密服务(safeStorage) │ Provider Gateway  │
│ 备份导入导出 │ 在线更新(updater) │ 数据目录解析与迁移 │ 日志(脱敏) │ IPC(zod 校验) │
└────────────────────────────────────┬───────────────────────────────────────────┘
                    │  IPC（invoke/handle；流式/事件用 webContents.send）
┌────────────────────────────────── Renderer Process ───────────────────────────┐
│ React UI（会话页/设置页） │ Zustand Store │ i18n │ Cookie 偏好(防 FOUC)         │
└────────────────────────────────────────────────────────────────────────────────┘
```

**关键约束**：

1. **所有出站 API 请求必须经由主进程 Provider Gateway 转发**，渲染进程不持有明文密钥、不直接请求服务商。渲染进程只提供"平台 id + 模型名 + 参数"，主进程查库解密密钥后发请求。
2. 流式响应经 `webContents.send('chat:delta', …)` 推送，渲染进程增量渲染；取消经 IPC 调 `AbortController.abort()`，已收部分内容落库（`partial: true`）。
3. **IPC 接口对每个 payload 做 zod 校验**，不信任渲染进程传入的任何字段；错误经 `redact()` 脱敏后以 `EASYUI_ERR:` 编码抛回（细节见 impl-contract §2）。
4. `nodeIntegration: false`、`contextIsolation: true`，`contextBridge` 只暴露白名单 API（`window.easyui.*`）。
5. **渲染进程代码不得 import `electron/` 下任何模块**；跨进程共享的类型与纯逻辑一律放 `shared/`。
6. **Web 预览 Mock 桥**：`src/bridge/getApi()` 在无 `window.easyui` 时返回 localStorage 实现的 `mockApi`（完整 `EasyUiApi`，含流式演示回复）。`npm run dev` 纯浏览器可走通全部 UI 流程；**主进程逻辑的行为修复须同步修 mock 桥**，两端语义一致。

### 2.3 目录结构

```
EasyWebUI/
├── docs/                # prd.md（本文件）、impl-contract.md、release.md、screenshots/
├── electron/            # 主进程（tsc → dist-electron/，commonjs）
│   ├── main.ts          #   入口：窗口/数据目录/CSP/日志/生命周期
│   ├── preload.ts       #   contextBridge → window.easyui
│   ├── ipc.ts           #   全部 ipcMain.handle（zod 校验 + redact）
│   ├── chat.ts          #   生成编排：落库 → 裁剪 → 流式 → 落库（树形分支）
│   ├── db/              #   better-sqlite3（WAL + schema_migrations 迁移）
│   ├── crypto/          #   safeStorage 优先；机器指纹 scrypt+AES-GCM 兜底；redact
│   ├── gateway/         #   协议适配 / SSE / joinUrl / 裁剪 / 超时重试
│   ├── backup/          #   adm-zip 导出导入（纯函数核心，不依赖 sqlite/electron）
│   ├── updater.ts       #   在线升级（electron-updater + 状态机）
│   ├── window-state*.ts #   窗口尺寸记忆（纯函数核心 + fs 壳，可测）
│   └── paths.ts / storage-migrate.ts / logger.ts
├── shared/              # 跨进程唯一共享层：types（EasyUiApi 契约）/ params / presets /
│                        #   appearance / reasoning / title / errors / ipc
├── src/                 # 渲染进程（Vite + React 18 + strict + Tailwind 3）
│   ├── bridge/          #   getApi()：Electron 桥或 localStorage mock
│   ├── pages/           #   chat/（三栏会话页）、settings/（五标签设置页）
│   ├── components/      #   Modal / Toast / Markdown / Popover / controls / icons / params
│   ├── store/           #   zustand（conversations/messages/presets/providers/settings/ui）
│   ├── i18n/ lib/ styles/
├── tests/               # vitest 单测（gateway/trim/crypto/backup/db/窗口状态…）
├── scripts/             # 走查与探针（puppeteer-core + 系统 Edge 无头）、截图、冒烟
├── build/               # 应用图标
└── release/             # electron-builder 产物
```

---

## 3. 功能规格：模型平台管理（Provider）

### 3.1 数据字段

每个"平台"（Provider）包含：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID v4 |
| `name` | 用户自定义名称，如"OpenAI 官方""DeepSeek 中转" |
| `base_url` | API 地址；存储时去掉末尾 `/`（端点拼接规则见 §6.5） |
| `api_format` | 枚举：`openai-chat` / `openai-responses` / `anthropic` |
| `api_key_cipher` | **加密后**的密钥密文（§8.1），永不存明文；**只在主进程 DB 中存在**，渲染进程拿到的是 `has_key: boolean` |
| `models` | 已启用模型列表：`{ id, display_name?, enabled, last_check? }`，`last_check: { status, latency_ms?, checked_at?, error? }` |
| `created_at` / `updated_at` | 时间戳 |

### 3.2 交互流程

**新增/编辑平台**（模态框）：

1. 12 家**预置模板**作为快捷填充（点选自动填 base_url/format，名称可改，不预写数据库；明细见 impl-contract §4）；也支持完全自定义。
2. 填写名称、API 地址、API 密钥，选择响应格式（默认 `openai-chat`，提供"自动探测"，见 §3.3）。
3. 点击**"检测模型列表"**：openai 系 `GET /v1/models` + Bearer 头；anthropic 加 `x-api-key` + `anthropic-version` 头。超时 15s；失败在输入框下方给可读错误（状态码 + 服务商 message，**密钥已脱敏**）。支持用未保存的草稿密钥直接拉取。
4. 成功后弹出模型复选列表，勾选写入 `models`（`enabled: true`）。
5. **列表获取失败允许"手动添加模型"**（直接输入模型 ID）——很多中转站屏蔽列表接口，这是硬性要求。

**连接检测**：

- 单模型"检测"与"全部检测"（主进程并发 = 4，逐个事件回报）。
- 检测 = 最小开销请求：`messages=[{role:'user',content:'ping'}]`、`max_tokens=1`、非流式。
- 结果持久化到 `last_check`：绿色圆点 + 延迟毫秒数 / 红色圆点 + 悬浮错误详情。

### 3.3 格式自动探测（尽力而为，可失败）

按顺序尝试：① Bearer 头 `GET /v1/models` → 成功则 `openai-chat`；② 换 `x-api-key` + `anthropic-version` 头 → 成功则 `anthropic`。均失败保持用户选择并提示"无法自动识别，请手动选择"。探测只是辅助，**不阻断保存**。

---

## 4. 功能规格：对话与参数

### 4.1 会话页布局（三栏）

- **左栏（侧栏）**：会话列表（新建、重命名、删除、置顶、按更新时间排序、手动 ✨ 生成标题）；可折叠。
- **中栏**：消息流（树形分支的激活路径，见 §4.5）+ 输入坞（Composer：多行输入、思考开关、上下文环形计量、发送/停止；上方浮动"生成回复"胶囊）。
- **右栏（可折叠）**：当前会话参数面板（§4.2），覆盖项高亮 + 一键回退预设。

### 4.2 参数与预设系统（LM Studio 式，schema v2）

**生效参数 = 全局预设 ←(覆盖) 选中用户预设 ←(覆盖) 会话 overrides**。会话只存 overrides（`Partial`），与基线等值的键自动删除（等值修剪）；`null` 显式删除某键。全局预设（id=`global`）常驻、不可删、不可改名，在设置页编辑并可恢复出厂默认；用户预设可在参数面板新建/套用。模型切换不回溯修改历史消息，`provider_id`/`model` 存会话顶层字段。

`ParamValues` 全量字段：

| 参数 | 类型 / 范围 | 说明 |
| --- | --- | --- |
| `system_prompt` | 多行文本 | 为空则不注入 |
| `temperature` | float 0–2 | 总是发送 |
| `limit_response_length` + `max_tokens` | bool + int 1–128000 | 开启才发送 `max_tokens` |
| `context_window` | int（token 数） | 上下文预算上限，也是计量环分母（§4.3） |
| `context_overflow` | `rolling` / `truncate_middle` / `stop` | 溢出策略，见 §4.3 |
| `stop_strings` | string[] | 非空才发送 |
| `top_k` | int 0–500，0 = 不发送 | anthropic 与 OpenRouter 传递，其余协议 UI 提示不支持 |
| `repeat_penalty_enabled` + `repeat_penalty` | bool + float 0–2 | openai 系映射 `frequency_penalty = value − 1`（仅 >1 时传，近似语义） |
| `presence_penalty_enabled` + `presence_penalty` | bool + float −2–2 | |
| `top_p_enabled` + `top_p` | bool + float 0–1 | |
| `min_p_enabled` + `min_p` | bool + float 0–1 | 仅 OpenRouter 支持 |
| `structured_output_enabled` + `…_schema` | bool + JSON Schema 文本 | 不可解析发送前报 `invalid_json_schema`（请求不发出） |
| `stream` | bool，默认开 | |

**协议差异处理原则**：适配层静默丢弃目标协议不支持的参数（明细 §6.5），UI 仅做"当前协议不生效"提示，不强制报错。

### 4.3 上下文裁剪与计量

发送前在主进程组装消息（`gateway/trim.ts`，纯函数可测）：

1. **估算器**：优先 `js-tiktoken`（cl100k_base）；任何失败回退 `ceil(字符数 / 3)`（中文偏保守）。
2. **预算** = `min(context_window, 模型上限未知则 context_window)` − 输出预留 − 256（安全余量）；输出预留 = `limit_response_length` 开 ? `max_tokens` : 4096。
3. **溢出策略**三态：
   - `rolling`（默认）：成对丢弃最老 user/assistant，至少保最后一条；
   - `truncate_middle`：保系统提示 + 最老一轮 + 尽量新的尾部，丢中段；头尾仍超预算退化为丢头 + 截断最后一条；
   - `stop`：不裁剪，超预算直接报 `ApiError{code:'context_overflow'}` 阻断发送。
4. 单条消息本身超预算 → 二分截断并标记 `truncated`（发 `context_truncated` 警告，不阻断）。

> 会话历史在 DB 中永久完整保存，裁剪只影响发送载荷。

**上下文计量**（渲染进程本地计算，无 IPC）：用量 = 激活路径消息 `token_count`（缺省按 4 字符 ≈ 1 token 估算）+ system_prompt + 输入草稿；预算 = 生效参数的 `context_window`。输入坞发送键左侧环形进度（>80% 转 warning 色），悬停浮层三行明细（会话 tokens / 窗口 / 已用%）。

### 4.4 生成控制

- 流式期间：输入框禁用、显示"停止"按钮；取消后主进程 abort，已收部分内容落库（`partial: true`）。
- 编排：落库 user 消息 → 裁剪组装 → 调适配层 → 流式回推（`chat:delta`，reasoning 与 content 分流）→ 落库 assistant 消息。发送/重生成/续写共用同一编排。
- 请求失败：已收内容与错误一并落库，消息以气泡内错误卡片呈现（状态码 + 脱敏后信息），提供"重试"按钮；重试复用同一条用户消息，不产生重复记录。
- **同会话同一时间只允许一个进行中的生成**（单生成锁）。
- 流式渲染：气泡内三点 typing 指示器 → 首个 delta 替换为正文；delta 进增量缓冲，50ms 节流 flush。

### 4.5 树形分支与消息操作（schema v3）

消息是 **parent_id 树**；`conversations.active_leaf_id` 指向激活叶。`listMessages` 返回根 → 激活叶的线性路径；路径上同 parent 子消息数 >1 的消息带 `branch={index, count, ids}`（同级按 created_at,rowid）。

- `sendMessage`：新 user 消息 parent = 当前激活叶；`siblingOf`（编辑后重发）时 parent = 原消息的 parent → **开新分支，原分支保留**。
- `setActiveLeaf`（branch 按钮）：在该消息之后分叉聊天。
- `regenerate`：目标 assistant 的 parent 下新建同级分支（不删旧分支），激活叶切到新分支。
- `switchBranch`：激活叶 = 目标分支最深后代（分叉取最新子）。
- `continueMessage`：不建行，delta 追加到同一消息（计时/字数对总内容累计）。
- `generateResponse`：激活叶为 user 时直接生成 assistant 子消息；否则报 `nothing_to_generate`。
- `updateMessageContent`：assistant 原地改内容，不触发生成。
- `deleteMessages`：各节点子树连删（事务）；**激活叶在被删子树内时回退到最近存活祖先、再下钻其最新存活后代**（删除后再解析，保证 2/2 分支删除其一后另一分支完整可达）；同级只剩 1 支后不渲染 `‹1/1›` 徽标。

**气泡操作**（icon 按钮统一走 `IconButton` + `icons.tsx` 图标库）：user/assistant 均有 branch/copy/edit/delete；assistant 额外 regenerate/continue；生成中全部禁用。分支导航 `‹ n/N ›` 只在 count>1 时出现。**右键任一气泡进入批量选择模式**：左侧统一对齐的复选框列、隐藏其余操作，底部浮层显示计数 + 删除 + 退出（Esc 亦可）。

### 4.6 思考开关（reasoning_enabled）

- 会话级开关（DB 列，新会话默认开）。开 = 模型默认思考，请求不附加参数；关 = 按 api_format 附加关闭载荷：openai-chat `thinking:{type:'disabled'}`、openai-responses `reasoning:{effort:'none'}`、anthropic `thinking:{type:'disabled'}`（`shared/reasoning.ts` 统一产出）。
- 能力判定 `modelSupportsReasoning`：保守的"确认不支持"名单（gpt-3.5/gpt-4o/moonshot-v1/llama/mistral/gemma 等）；**未知一律按支持处理**（按钮显示）。标题生成不受影响。

### 4.7 生成统计（MessageStats）

- 计时口径：t0 = 请求发出；TTFT = 首个 delta（reasoning/content 先到为准）− t0（非流式 = total）；reasoning_ms = 首 content delta − t0（仅当出现过 reasoning）；total_ms = 结束/中止/失败 − t0（中止/失败同样落库）。
- 展示：reasoning 折叠块标题「Thought for X.XXs / 思考了 X.XX 秒」；完成后气泡底部统计行：tok/s（= token_count / max(total−ttft, 1ms)）、tokens、TTFT、总用时、finish_reason；≥60s 显示 `Xm XXs`（双语格式化）。

### 4.8 标题生成

- **自动**：首轮对话完成后（`auto_title` 开且标题为空），用 `resolveTitleTarget` 解析的模型（设置页指定优先 → 会话当前模型回退）生成极简短标题；单次 20s 超时、间隔 800ms 重试 1 次；成功广播 `title:updated`，失败广播 `title:failed`（toast 警告，**绝不阻断对话**）。
- **手动**：侧栏 ✨ 强制覆盖现有标题，忽略 auto_title；无可用模型报 `title_model_unavailable`，无 user 消息报 `title_no_user_message`。
- 空标题占位统一走 `displayTitle`（侧栏行 + 消息流顶栏）。

---

## 5. UI 设计规格：Apple 液态玻璃（Liquid Glass）

### 5.1 视觉令牌

`src/styles/tokens.css` 定义深浅两套主题（`data-theme` 切换）。材质由三类变量构成：

- **玻璃底**：`--glass-bg`（常态 .52）/ `--glass-bg-pop`（浮层 .72）/ `--glass-bg-modal`（模态 .8），配 `backdrop-filter: blur(28 / 40 / 44px) saturate(180~200%)`。
- **方向性边缘 + 双 specular**：`--glass-border` 侧缘、`--glass-border-top` 更亮的顶缘（受光方向），`--specular-top` / `--specular-bottom` 内嵌高光（顶亮 / 底微亮），叠 `--card-shadow` 分层环境投影——模拟真实玻璃受光，而非四周均匀描边。
- **抽屉与卡片**：`--drawer-bg` 着色抽屉（**无模糊**，ChatGPT 风格）；`.row-surface` 无边框卡片 + 投影，替代通栏发丝分隔线（布局语言：圆角卡片/抽屉分层，禁止通栏 hairline）。

工具类：`.glass`（面板/输入卡）、`.glass-bar`（栏顶横条，无描边）、`.glass-strong`、`.glass-pop`（浮层）、`.glass-interactive`（可点击玻璃，hover 亮度 +4%）、`.drawer`。圆角阶梯：勾选框 4px / kbd 6px / icon 按钮 8px / 控件·行·卡片·浮层 12px / 面板·气泡·模态·分组卡 20px / 胶囊 999px。缓动：交互 `--ease-interactive: cubic-bezier(0.32,0.72,0,1)`、面板 `--ease-panel: cubic-bezier(0.22,1,0.36,1)`；按钮 150ms 颜色过渡 + `active: scale(0.98)`，悬浮 200ms。

**性能红线**：

- `backdrop-filter` 昂贵：同屏玻璃模糊层 ≤ 5（栏顶条、输入坞、浮层、模态等）；**列表行/气泡不用模糊**，用半透明纯色。
- 降级：`@supports not (backdrop-filter…)` 与 `prefers-reduced-transparency` 下不透明度提升至 0.92/0.97。
- 窗口背景铺柔和多段径向渐变 + 细噪点（CSS/SVG data-URI，无外链），保证玻璃有内容可"折射"。

### 5.2 主题

- 浅色 / 深色 / 跟随系统三档，即时生效（`data-theme` 属性）；`prefers-reduced-motion` 下禁用一切过渡。
- 主题切换过渡 300ms 且仅颜色系属性（避免布局抖动）。

### 5.3 缩放鲁棒性（硬指标）

两层缩放都必须稳健：

- **应用内 UI 缩放**（设置页，50%–250%、步长 10%，CSS zoom 实现）：delta 式滑块拖动不会失控；模态/浮层做视口补偿（锚定不漂移）；Ctrl+滚轮 / 捏合缩放被拦截交给应用层。
- **浏览器级缩放**：全部尺寸用 rem（根字号 16px），禁止以 px 写死容器宽高（仅线宽允许）；三栏 Grid `minmax(200px,260px) 1fr minmax(240px,320px)`；67%–200% 逐一目检无横向滚动条、无截断（长模型名 ellipsis、模态 `max-height:90vh` 内滚）。
- **flex `min-width:auto` 会击穿 `max-width`**：内容链路上保持 `min-w-0`，否则长代码/表格撑出横向滚动条。
- 交互控件最小可点击区域 ≥ 32×32px（紧凑档 24px，视觉 16px 的 icon 允许隐形命中区扩展）。

### 5.4 偏好持久化

**轻量 UI 偏好**写单 Cookie `easyui_prefs`（+ localStorage 同名兜底）：`theme`、已解析的 `lang`、`sidebar_collapsed`、`right_width`，以及**外观项**（`zoom` / `font_ui` / `font_code` / `code_theme` / `font_ui_size` / `font_code_size`）——外观项同时在 SQLite `GeneralSettings` 存一份（设置页事实来源），Cookie 用于 React 挂载前同步首帧应用（防 FOUC，内联脚本改版必重算 CSP sha256）。

约定：值 = `encodeURIComponent(JSON)` < 2KB；365 天、`SameSite=Lax`、不设 `HttpOnly`；绝不含敏感信息。**业务数据一律走 SQLite，不放 Cookie**。

### 5.5 国际化

- 语言包 `src/i18n/zh-CN.json` / `en-US.json`，键名点分层级（`chat.input.placeholder`）。
- **所有面向用户的字符串禁止硬编码**，含错误提示、按钮 aria-label、确认框；提交前自查无残留。
- 默认语言：读 Cookie 已解析 lang → 系统 locale 命中中文则 zh-CN，否则 en-US；切换后写 Cookie。
- 数字、时间、时长一律 `Intl.*` 按当前语言格式化；中文不用 italic，强调用字重/颜色。
- Mock 桥演示回复中英各一段，按当前语言选择。

### 5.6 浮层与模糊（portal 规则，v1.0.1 确立）

**祖先带 `backdrop-filter` 会形成 backdrop root，其后代的模糊只能采样祖先内部 → 视觉失效。** 因此：

- **一切浮层（下拉、弹层、tooltip、悬浮提示、生成胶囊）必须 `createPortal(document.body)`**，不得是 `.glass-bar` 等模糊祖先的 DOM 子孙。统一走 `src/components/Popover.tsx`（`AnchoredPopover`）：锚点 rect → `fixed` 定位、placement/align、`matchAnchorWidth`、gap/viewportMargin、滚动/resize/visualViewport 重定位、边缘翻转、外点关闭；定位计算遵守"视觉 px / 布局 px"换算纪律（应用内 CSS zoom 下锚定不漂移）。
- InfoTip（参数 ⓘ）：hover/focus/click 三态 + 钉住态（Esc/点外关闭），浮层 portal + 按视口余量上下翻转、横向钳制。

### 5.7 焦点与描边

- 所有可交互元素 `:focus-visible` 统一 **2px accent 描边、内嵌 `outline-offset: -1px`**——描边不得显著增大控件占用面积，也不得压到相邻控件；卡片内控件间距按描边可见设计。
- 文本输入**不加蓝色边框**（`.input-surface` 内凹井式表面），聚焦仅显示内嵌描边。
- 全部控件可 Tab 到达；Modal 初始焦点进面板。

### 5.8 气泡、输入坞与图标

- **气泡**：内容列居中 `max-w-7xl`；气泡最大宽 85% 列宽，user 右对齐（min-width 7.5rem）、assistant 左对齐（min-width 12rem）；长代码/表格在气泡内滚动；头部行单行不折行；统计行在气泡底部（§4.7）。
- **输入坞**：玻璃卡片（`composer-shell`），多行输入增高时底行控件钉底右下；**"生成回复 (Ctrl/Cmd+R)" 是浮于输入坞上方 12px 的液态玻璃胶囊**（portal，居中；仅激活叶为 user 且无生成中时出现，快捷键仅可见时生效）。
- **图标**：`src/components/icons.tsx` 统一 SVG 图标库，Lucide 风格 16×16 viewBox、墨迹约 12×12 且光学居中（偏差 ≤0.25 单位，可用 `getBBox()` + `getScreenCTM()` 审计）；新增按钮一律 icon + `IconButton`。

---

## 6. 协议适配层（Provider Gateway）

主进程模块，统一接口（`AdapterChatInput` 含 `reasoningOff` 透传）：

```ts
interface ChatRequest {
  providerId: string; model: string;
  messages: { role: 'system'|'user'|'assistant'; content: string }[];
  params: ParamValues;            // resolveParams 后的生效参数
  stream: boolean; reasoningOff?: boolean;
  signal: AbortSignal;
}
interface ChatChunk { delta?: string; reasoning_delta?: string; finishReason?: string; usage?: Usage; error?: ApiError }
// 统一出口：chat(req): AsyncIterable<ChatChunk>；另提供 listModels() / testModel()
```

### 6.1 `openai-chat`（Chat Completions）

- `POST …/chat/completions`，`Authorization: Bearer`。SSE：`data:` 行、`[DONE]` 终止、`choices[0].delta.content`；`delta.reasoning_content` → `reasoning_delta`。
- 关闭思考：附加 `thinking:{type:'disabled'}`。

### 6.2 `openai-responses`（Responses API）

- `POST …/responses`；system 角色抽为顶层 `instructions`；assistant 历史用 `output_text`；`max_output_tokens`。
- 流式事件 `response.output_text.delta` / `response.completed` / `response.failed`。
- 关闭思考：`reasoning:{effort:'none'}`；top_k/min_p/penalties/stop 不支持，静默丢弃。

### 6.3 `anthropic`（Messages API）

- `POST …/messages`，Header `x-api-key` + `anthropic-version: 2023-06-01`。**`system` 是顶层字段**，messages 不含 system 角色。
- **`max_tokens` 必填**：`limit_response_length` 开用其值，关用 4096 兜底；`top_k`（>0 才传）、`top_p`（enabled）、`stop_sequences`（非空）。
- 流式 `content_block_delta` → `delta.text`、`message_stop` 终止。structured/min_p/presence/repeat 不支持，静默省略。

### 6.4 通用要求

- 连接超时 15s；流式空闲 60s 无数据自动重试 1 次，再失败报错（UI 给"重试"按钮）。
- HTTP 非 2xx：读响应体 `error.message` 统一映射 `ApiError{code,message}`；**任何错误对象序列化前过 `redact()`**（密钥 → `前3字符***`）。
- 每种格式提供 `listModels()` 与 `testModel()` 供 §3 使用。

### 6.5 参数映射与 URL 拼接

**入参为生效 `ParamValues`**：`temperature` 总是发送；`top_p`/`presence_penalty` 仅 enabled；`max_tokens` 仅 `limit_response_length` 开；`stop`/`stop_sequences` 仅非空；`repeat_penalty` enabled 且 >1 → openai 系 `frequency_penalty = value − 1`（近似语义）；**OpenRouter 专属**（仅 host 含 `openrouter.ai`）：`top_k`(>0)、`min_p`(enabled)、`repetition_penalty`；`structured_output_enabled` → openai `response_format` / responses `text.format`（json_schema strict，name=`easyui_output`）。

**joinUrl**（`gateway/url.ts`）：去末尾 `/` 后，base 已带版本段（`/v\d+`）或 anthropic 前缀（`/anthropic`）则直接拼路径，否则补 `/v1`：

```
openai-chat:      joinUrl(base,'/chat/completions')、joinUrl(base,'/models')
openai-responses: joinUrl(base,'/responses')、joinUrl(base,'/models')
anthropic:        joinUrl(base,'/messages')、joinUrl(base,'/models')
//  api.anthropic.com → /v1/messages；api.xiaomimimo.com/anthropic → /anthropic/v1/messages
```

---

## 7. 本地数据存储

### 7.1 位置与结构

解析优先级：**自定义指针 → 便携 exe 旁 `data/` → 安装版 `userData/data`**。

- 便携判定：打包且存在 `PORTABLE_EXECUTABLE_DIR`（避免数据落 %TEMP% 解包目录）；安装版默认 `%APPDATA%/easy-webui/data`，重装/覆盖安装/卸载均不动它（`nsis.deleteAppDataOnUninstall=false`）。
- 指针文件：便携 → 便携根 `easywebui-data-dir.json`；安装版 → `userData/data-dir-pointer.json`，内容 `{"dataDir":"…"}`。
- 启动顺序：`resolveDataDir` → `migrateStorageDir`（**旧数据抢救**：目标无 db 时从 legacy 目录整体复制；布局版本标记 `storage-layout.json`，当前 v1）→ `openDatabase`。
- 自定义位置（设置页）：校验链 `invalid_dir → 同目录 noop → 嵌套目录 → 不可写`；目标有数据仅写指针（`switched`），否则 WAL checkpoint + 全量复制（`migrated`）；成功后提示重启（`app.relaunch`）。**任何路径都不删除旧数据**。

结构：

```
data/
├── easyui.db(-wal/-shm)   # SQLite 主库（WAL）
├── keyring.bin            # safeStorage 不可用时的回退密钥材料（权限 600）
├── window-state.json      # 窗口尺寸/位置记忆
├── storage-layout.json    # 存储布局版本标记
├── backups/               # 备份 zip 默认输出位置
└── logs/app.log           # 按日轮转，保留 7 天
```

### 7.2 SQLite Schema（v3）

`PRAGMA journal_mode=WAL`、`foreign_keys=ON`；迁移表 `schema_migrations` 启动自动升级（v1 基础表 → v2 预设/overrides + 旧 params 迁移 → v3 树形分支/统计列，回填幂等；schema<3 旧备份恢复后复用同一回填）。

- `providers`：§3.1 字段（密文 BLOB、models_json）。
- `conversations`：`provider_id`(FK SET NULL)、`model`、`preset_id`(FK SET NULL)、`overrides_json`（只存与基线不等的键）、`pinned`、`active_leaf_id`、`reasoning_enabled`(默认 1)。
- `messages`：`parent_id`（会话首条 NULL）、`role`、`content`、`reasoning`、`token_count`（落库缓存）、`partial`、`error_json`、`reasoning_ms/ttft_ms/total_ms`、`finish_reason`。
- `presets`：`is_global`（`global` 常驻）；`settings`：键值表（GeneralSettings）。

- 标题自动生成规则见 §4.8。消息全文搜索（FTS5）仍为路线图项（§10），未实现。

### 7.3 备份与恢复

设置页"备份管理"：

1. **导出** `easyui-backup-YYYYMMDD-HHmm.zip`：`data.json`（providers/conversations/messages/presets/设置全量 JSON）+ `manifest.json`（app/schema version、includes_keys、kdf?、created_at）。
2. **不含密钥（默认）**：`api_key_cipher` 置 null；恢复后平台其余配置可用，仅需补填密钥。
3. **含密钥**：独立备份密码（≥8 位，二次确认）；scrypt（N=2^15, r=8, p=1）派生 32 字节密钥，AES-256-GCM 加密"解密后的密钥明文列表"，salt/nonce 入包。
4. **绝不允许把 safeStorage 机器密文直接导出**（绑定本机，换机无法解密）。

**恢复**：选 zip → 解析 manifest → 含密钥则验密码 → 校验 schema_version ≤ 当前 → 事务内导入；**合并**（按 id 跳过，默认）/ **覆盖**（清表重导，二次确认 + 自动先做一份不含密钥的临时备份）；完成后报统计（平台/会话/消息/预设/跳过数）。备份列表支持打开目录与删除。

---

## 8. 安全设计

1. **密钥存储（8.1）**：首选 `safeStorage.encryptString` → Base64 存 `api_key_cipher`，自描述前缀 `v1:ss:`；不可用时机器指纹（hostname+username+platform 的 SHA-256）经 scrypt 派生密钥做 AES-256-GCM，前缀 `v1:mf:`，盐存 `keyring.bin`（600），设置页常驻黄色提示。**密钥明文只允许存在于主进程内存的请求组装瞬间**，不出现在：日志、错误消息、IPC 返回、渲染进程、备份默认导出。
2. **日志与脱敏（8.2）**：主进程日志 `data/logs/app.log`（按日轮转 7 天），请求日志只记 URL 与状态码；全部已知密钥注册进 `crypto/redact` 登记表，任何出口统一 `redact()`（保留前 3 位 + `***`）。
3. **渲染进程安全（8.3）**：CSP `default-src 'self'`（防 FOUC 内联脚本经 sha256 白名单；dev 由 Vite 插件剥离以支持 HMR）；`nodeIntegration:false` + `contextIsolation:true`；Markdown 渲染前经 DOMPurify 消毒（模型输出不可信）；不加载远程字体/脚本。
4. **隐私（8.4）**：零遥测、零自动上报；出站请求仅两类——用户配置的服务商端点，与在线升级检查（GitHub Releases，`auto_update` 可关，见 §9）。

---

## 9. 其他设计规范

- **空状态**：无平台时会话页中栏引导卡片（直达设置页）；无会话时快捷开始卡片。
- **快捷键**：`Ctrl/Cmd+N` 新会话、`Ctrl/Cmd+,` 设置、`Enter` 发送 / `Shift+Enter` 换行（`enter_send` 可反转）、`Esc` 停止生成 / 退出批量选择 / 关闭弹层、`Ctrl/Cmd+R` 生成回复（胶囊可见时）。
- **窗口状态**：记忆上次尺寸/位置（`window-state.json`，防抖持久化；恢复时钳制到可见工作区，最大化状态保留）。
- **关于页与在线升级**（设置第五标签）：版本/协议/作者/GitHub 信息卡 + 升级卡（状态机 checking → available → downloading → downloaded → install；下载完显示固定高度可滚动版本说明 + 备份警告，确认后静默安装并重启）。主进程持有权威状态（错过事件可恢复）；`update_beta` 开启映射 GitHub pre-release；dev/web 预览禁用（mock 通道可演示）。启动自检由 `auto_update` 控制，发现新版仅广播提示，下载由用户知情触发。
- **错误文案**：三段式——发生了什么 / 可能原因 / 建议操作。例："连接失败（HTTP 401）。密钥可能无效或已过期。请在平台设置中检查 API 密钥。"
- **删除保护**：删除平台/会话/备份均需确认；删平台提示"该平台的 N 个会话将保留，但需重新指定模型"。
- **性能预算**：冷启动到可交互 < 3s；流式渲染 50ms 节流；1 万条消息会话首屏 < 500ms 为目标（虚拟滚动列路线图 §10）。
- **可访问性**：所有交互控件可 Tab 到达；`:focus-visible` 内嵌描边（§5.7）；对比度 ≥ WCAG AA。
- **测试与验证门槛**：`npm run typecheck`（双 tsconfig）+ `npm test`（vitest：三协议流式/非流式/错误分支、trim、redact、备份 roundtrip、分支删除、窗口状态校验）+ `node scripts/probe-verify-portal.mjs`（headless DOM/几何断言）+ `node scripts/e2e-ui-polish.mjs`（走查截图）+ `npm run shot`（README 截图）+ 安装包人工冒烟。发布前全绿（release.md）。
- **构建**：electron-builder 输出 Windows（nsis + portable，已实测）与 macOS（dmg）/ Linux（AppImage，配置就绪未实测）。`build.npmRebuild:false` 与 `electronDist` 是测得的工程决策，**不许"清理"**（README Packaging 一节）。

---

## 10. 版本历程与路线图

| 版本 | 主题 | 要点 |
| --- | --- | --- |
| v0.1.0 | MVP | 平台管理、三协议适配、流式对话、参数面板、上下文裁剪、密钥加密、备份、液态玻璃 UI、双语、Win 安装包 |
| v0.1.1 | 数据与外观 | 数据目录体系（便携/安装/自定义 + 迁移抢救）、外观定制（缩放/字体/字号/代码主题）、InfoTip、关于页 + 在线升级（GitHub Releases） |
| v0.1.2-beta | 升级链路验证 | 在线升级 E2E 实测 |
| v1.0.0 | 对话体验大版 | UI/动效大修（方向性玻璃材质、卡片化布局、图标统一、InfoTip 自适应）；树形分支、生成统计、思考开关、上下文计量、程序图标 |
| v1.0.1 | 质量与稳定 | 浮层模糊 portal 根治、气泡宽度自适应与对齐、焦点内嵌描边、批量选择对齐、分支删除路径恢复、窗口尺寸记忆、一键截图管线 |

**路线图（候选，未排期）**：消息全文搜索（FTS5，随写入同步更新）；纯文本附件；长会话虚拟滚动；macOS/Linux 打包实测；会话导出为 Markdown。

---

## 11. 给实施代理的硬性约束清单（TL;DR）

1. API 密钥**永不明文落盘**、永不进渲染进程；备份默认**不含**密钥，含密钥时必须密码加密（scrypt + AES-256-GCM），绝不出导 safeStorage 机器密文。
2. 所有服务商请求走主进程 Gateway；渲染进程不见密钥、不直面 CORS；IPC 全量 zod 校验 + 错误 redact。
3. 协议差异（top_k、system 字段位置、penalty 语义、思考开关载荷）在适配层内部消化，UI 仅提示。
4. UI 轻偏好用 Cookie（`easyui_prefs`，含防 FOUC 外观项），业务数据用 SQLite，二者不混用。
5. 全部尺寸 rem 基准；应用内缩放 50%–250% 与浏览器缩放 67%–200% 不许破版；同屏玻璃模糊层 ≤ 5。
6. 所有用户可见字符串走 i18n，禁止硬编码中英文。
7. 不实现 §1.3 列出的非目标功能。
8. **消息是树**：任何分支操作/删除不得破坏其他分支的可达性，删除后激活路径必须恢复到存活分支。
9. **一切浮层 portal 到 body**（backdrop root 规律，§5.6）；焦点描边内嵌不增占位（§5.7）。
10. 主进程行为修复同步修 mock 桥；跨进程接口细节以 impl-contract.md 为准；发布流程见 release.md（Release 说明纯英文）。
