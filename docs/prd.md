# Easy WebUI — 产品需求文档（PRD）

> 适用范围：产品定位、核心价值、目标用户、非目标、模块地图与边界、关键质量属性。**只描述"产品是什么/不做什么"**。
> 何时读取：判断需求是否该做（对照非目标）、理解模块边界、做架构级规划时。
> 关联需求：增量需求不写入本文件——见 [requirements/](./requirements/index.md)。
> 最后更新：2026-09-13
> 来源：原 prd.md §1 重写精简（原文存档于 [archive/prd-v1.0.1-2026-09-13.md](./archive/prd-v1.0.1-2026-09-13.md)）

---

## 1. 产品定位

**Easy WebUI** 是一款面向 PC 端的轻量级、本地优先（local-first）的多平台大模型对话客户端。对标 Open WebUI / SillyTavern 的核心对话能力，但刻意保持小巧：不内置插件市场、不做 RAG、不做多用户。目标是"下载即用、三分钟接入任意服务商"，参数控制向 LM Studio 看齐。

### 1.1 核心价值

- **一个页面，接入所有主流服务商**：12 家预置模板 + 完全自定义 base URL；三种 API 格式（`openai-chat` / `openai-responses` / `anthropic`）自动探测。
- **本地优先**：全部数据（会话/密钥/设置）保存在用户可见的本地数据目录，支持便携版随目录走、自定义位置一键迁移；无云端同步、无遥测。
- **密钥安全**：API 密钥永不明文落盘，永不出现在渲染进程；备份默认不含密钥。
- **对话体验完整**：树形分支、重生成/续写、思考过程折叠、生成统计（tok/s / TTFT）、上下文计量、思考开关、自动标题。

### 1.2 目标用户

- 拥有多个 API 渠道（官方 / 中转 / 本地推理端点）的个人开发者与重度 AI 用户。
- 对 Open WebUI 的体积与部署复杂度不满、只需要"纯粹对话 + 精细参数控制"的用户。

## 2. 非目标（明确不做）

以下功能**不实现**，需求出现时应拒绝或延后：

- 多用户、账号体系、服务端部署（单机单用户）。
- RAG / 知识库 / 文件解析（仅预留纯文本附件的扩展点）。
- 插件系统、函数调用（Function Calling 的可视化编排）。
- 图像生成、语音、移动端适配（响应式只保证窗口缩小到 960px 仍可用，不做手机布局）。

> 在线更新器原列于此，已于 v0.1.1 落地（GitHub Releases 通道），不再是非目标。

## 3. 模块地图与边界

| 模块 | 边界一句话 | 行为快照 |
| --- | --- | --- |
| 模型平台管理（Provider） | 平台 CRUD、12 家预置模板、模型列表/连通性检测、格式自动探测 | [design/provider.md](./design/provider.md) |
| 对话（布局/编排/思考开关/统计） | 三栏会话页；发送/重生成/续写共用编排；单生成锁 | [design/chat.md](./design/chat.md) |
| 参数与预设 | 全局预设 ← 用户预设 ← 会话覆盖 三层合成 | [design/params.md](./design/params.md) |
| 上下文裁剪与计量 | 只裁发送载荷，DB 永久保全量历史 | [design/context-trim.md](./design/context-trim.md) |
| 树形分支消息 | 消息是树；任何操作不得破坏其他分支可达性 | [design/message-tree.md](./design/message-tree.md) |
| 标题生成 | 自动 + 手动；失败绝不阻断对话 | [design/title.md](./design/title.md) |
| Provider Gateway | 主进程统一出站请求；协议差异在适配层内部消化 | [design/gateway.md](./design/gateway.md) |
| 本地存储 | 便携/安装/自定义三态目录体系；备份/恢复 | [design/storage.md](./design/storage.md) |
| 安全 | 密钥加密、全链路脱敏、渲染进程隔离、零遥测 | [design/security.md](./design/security.md) |
| 液态玻璃 UI | 设计令牌驱动的视觉系统与缩放鲁棒性 | [design/ui-liquid-glass.md](./design/ui-liquid-glass.md) |
| 国际化 | 中英双语，所有用户可见字符串走 i18n | [design/i18n.md](./design/i18n.md) |
| 浮层 | 一切浮层 portal 到 body | [design/popover.md](./design/popover.md) |
| UX 规范 | 焦点/快捷键/错误文案/关于页与在线升级 | [design/ux-guidelines.md](./design/ux-guidelines.md) |

## 4. 关键质量属性

- **安全**：密钥永不明文落盘、永不进渲染进程；所有出站请求走主进程；IPC 全量校验、错误全链路脱敏（详见 [design/security.md](./design/security.md)）。
- **隐私**：零遥测、零自动上报；出站请求仅服务商端点与更新检查（可关）。
- **性能**：冷启动到可交互 < 3s；流式渲染 50ms 节流；1 万条消息会话首屏 < 500ms 为目标（详见 [design/ux-guidelines.md](./design/ux-guidelines.md) §8）。
- **鲁棒**：应用内缩放 50%–250% 与浏览器缩放 67%–200% 不破版；玻璃/动效有降级路径（详见 [design/ui-liquid-glass.md](./design/ui-liquid-glass.md)）。
- **可访问性**：全键盘可达、焦点可见、对比度 ≥ WCAG AA、双语无硬编码。
- **数据可信**：任何迁移/删除路径不静默丢数据；删除有确认；分支操作不破坏可达性。

## 5. 文档地图

- 技术选型 / 进程架构 / 目录结构 / 构建 → [architecture.md](./architecture.md)
- 模块行为快照 → [design/](./design/README.md)
- 接口 / 协议映射 / 数据库 / 备份格式 → [contracts/](./contracts/README.md)
- 增量需求 → [requirements/](./requirements/index.md)（GitHub Issue 优先）
- 技术决策 → [adr/](./adr/README.md)
- 版本历程 → [changelog.md](./changelog.md) · 候选方向 → [roadmap.md](./roadmap.md)
- 测试门槛 → [testing.md](./testing.md) · 发布规范 → [release.md](./release.md)
