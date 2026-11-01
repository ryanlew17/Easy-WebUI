# REQ-2026-002：输入、工具链与升级摘要安全跟进

状态：done（2026-11-01，独立验收通过）
版本：v1.0.3-beta.0
来源：外部独立安全审查 `tmp/security-review-2026-11-01-v1.0.2.md`（F-2，兼顾 F-3/F-5/F-6）及 2026-11-01 范围扩展
关联设计：`contracts/impl-contract.md`、`contracts/protocol-mapping.md`、`design/chat.md`、`design/security.md`、`design/ux-guidelines.md`
影响模块：`shared/`、`electron/`、`src/bridge/`、`src/components/`、`src/pages/settings/`、构建配置、测试与发布依赖
非目标：REQ-2026-003 的性能改造；无当前需求驱动的 React 19、i18next 26、react-i18next 17 及对应类型包大版本迁移；PRD 已排除的功能

## 背景

v1.0.2 后生产依赖审计仍有 zod 的 GHSA-mrhx-c7xc-m3w5 通告，开发工具链也存在可修复项。本次允许破坏性更新，因此不再整体跳过 Tailwind CSS、Vitest、TypeScript 等升级，而是按安全收益、兼容性和验证成本分阶段实施，珍惜破坏性更新窗口但不引入无关框架迁移。

安装版“版本升级摘要”当前由 `electron-updater` 读入 GitHub Release 正文，却以只读 `textarea` 展示，不能渲染 Markdown 或 GitHub 常见安全 HTML。本需求同时补齐该用户可见缺口；聊天消息的 raw HTML 禁令保持不变。

## 已完成的支撑修复

- `updateProvider.models` 在主进程与 mock 桥统一限制为最多 2000 项，作为 zod 4 迁移前的内存放大缓解。
- openai-chat 流内 `error` 事件改为脱敏后抛出；后台生成尾部异常统一捕获并记录，不再产生未处理 Promise 拒绝。
- 备份列表读取 manifest 前已增加 256MB 声明尺寸上限，安全审查 F-1 不重复立项。

## 依赖升级决策

版本以 2026-11-01 npm registry 与本地 lock 核查为准；实施时若出现新补丁，先评估再记录，不自动跨入新增大版本。

| 分组 | 当前基线 → 目标 | 理由与约束 |
| --- | --- | --- |
| 输入安全 | zod 3.25.76 → 4.6.7 | 覆盖 GHSA-mrhx-c7xc-m3w5；独立提交并回归全部 schema、错误码与脱敏 |
| 测试安全 | vitest 4.1.11 → 5.0.5；puppeteer-core 25.9.0 → 25.16.0 | 覆盖当前 Vitest/mocker 与 Puppeteer 链可修复通告；遵循 Vitest 5 迁移语义 |
| 更新链 | electron-updater 6.8.9 → 6.8.11；electron-builder manifest ^26.15.3 → ^26.18.0 | 对齐补丁与发布链；lock 已有 electron-builder 26.18.0，不降级、不强制审计修复 |
| 样式链 | tailwindcss 3.4.19 → 4.3.3，新增 @tailwindcss/vite 4.3.3 | 使用官方 Vite 路径；现有 JS 配置经 `@config` 显式保留，验证后移除不再需要的 PostCSS/autoprefixer 链 |
| 类型链 | typescript 5.9.3 → 7.0.2；@types/node 22.20.1 → 24.19.2 | 采用原生编译器性能收益并匹配 Node 24；同步迁移旧式 tsconfig，不只改版本号 |
| 开发工具 | concurrently 9.2.5 → 10.0.6；cross-env 7.0.3 → 10.1.0；wait-on 8.0.5 → 9.5.1 | 当前 Node 24 满足引擎要求；脚本参数与进程退出行为需回归 |
| 摘要渲染 | react-markdown 9.1.0 → 10.1.0；新增 rehype-raw 7.0.0、rehype-sanitize 6.0.0 | 当前组件未使用被移除的 `className` prop；raw HTML 只在升级摘要渲染器启用并消毒 |
| 非破坏补丁 | @vitejs/plugin-react 6.1.1 → 6.1.2；zustand 5.0.15 → 5.0.16 等 | 随对应阶段更新并回归，不与额外大版本捆绑 |
| 保持版本 | Electron 45.2.1、Vite 8.3.5、better-sqlite3 13.0.3、esbuild 0.28.2、React 18 | 当前已满足需求或无升级驱动；不得清理 `build.npmRebuild` 与 `build.electronDist` 工程决策 |

Vitest 5 与 concurrently 10 的开发环境下限要求将 `engines.node` 调整为 `>=22.12.0`，并同步架构文档。当前环境 Node 24.22.2 满足要求。

## 分阶段方案

- [x] **阶段 0：需求与基线**。扩展本需求，登记 REQ-2026-003，记录 262 项测试、双类型检查约 3.39s、主 JS 包 705087 字节（gzip 210684 字节）的基线。
- [x] **阶段 1：zod 4 独立迁移**。仅调整 zod、IPC/共享 schema 及必要测试；保持有效/无效输入、models ≤2000、`invalid_input`、错误脱敏和 `EASYUI_ERR` 兼容。全量回归通过，变更未混入其他依赖升级。
- [x] **阶段 2：测试与发布工具链**。升级 Vitest、Puppeteer、electron-updater、electron-builder 和兼容开发工具；处理 Vitest 5 mock 清理、异步断言与配置加载变化，并更新 Node 引擎要求。
- [x] **阶段 3：TypeScript 7 独立迁移**。Web 移除 `baseUrl` 并改用相对 `paths`；Electron 迁移旧式 `moduleResolution: Node`，保持 `dist-electron/electron/` 与 `shared/` 输出结构；记录构建时间对比。
- [x] **阶段 4：Tailwind 4 独立迁移**。迁移 Vite 插件和 CSS 入口，保留设计令牌；核查 border、outline、space/divide、层叠顺序等破坏性变化，完成 portal、模糊层、双缩放和 UI 截图回归。
- [x] **阶段 5：GitHub 升级摘要富文本**。以独立 `ReleaseNotes` 渲染器替换只读文本框，复用 `.md` 样式与链接/代码能力；支持 GFM 和白名单 HTML，分段摘要用空行连接，并同步 Electron/Web mock 演示。
- [x] **阶段 6：v1.0.3 发布门槛**。最后统一切换版本号和现行文档，执行完整测试、构建、探针、真实打包冒烟与依赖审计。GitHub 推送、tag 和正式发布另行确认。

## 升级摘要安全边界

- 支持 GFM 标题、列表、表格、代码、引用及 GitHub 常见安全 HTML；摘要区域保持可滚动和可访问名称。
- 仅在 `ReleaseNotes` 中使用 `rehype-raw + rehype-sanitize` 白名单；移除脚本、样式、iframe、表单、事件属性、危险 URL 与远程图片。
- 链接仅允许 http/https，并沿用应用外链闸门；聊天 `Markdown` 组件不得启用 raw HTML。
- 测试覆盖摘要字符串/分段数组、恶意 HTML/URL、Markdown 与 HTML 渲染，以及真实 GitHub Release 正文的联网渲染验证。

## 验收标准

- zod ≥4.6.6，生产依赖审计不再包含其通告；全部 schema、有效/无效输入与错误分支测试通过。
- v1.0.2 的 models 上限、备份 manifest 尺寸校验、流错误与后台异常回归测试保持通过。
- 阶段隔离以需求变更记录为准；经需求方 2026-11-01 签认，允许破坏性升级合并提交。未使用 `npm audit fix --force` 或 electron-builder 降级掩盖审计结果。
- 升级摘要可直接读取并渲染 GitHub Markdown/安全 HTML，XSS 用例不进入 DOM，聊天 raw HTML 行为不变。
- `npm run typecheck`、`npm test`、`npm run build`、portal/UI 探针、截图和真实 Setup/Portable 冒烟通过。
- 应用缩放 50%–250% 与浏览器缩放 67%–200% 无布局回归，同屏玻璃模糊层仍不超过 5。
- `npm audit --omit=dev` 清零；全量审计中当前上游无法消除的开发链残余逐项记录影响与处置。
- `package.json`、lock 与发布文档统一为 v1.0.3-beta.0，Release 说明保持纯英文。

## 变更记录

- 2026-11-01 创建 zod 4 独立迁移需求。
- 2026-11-01 阶段 0：扩展至 v1.0.3 工具链与升级摘要，补充依赖决策和分阶段验收。
- 2026-11-01 阶段 1：迁移至 zod 4.6.7；新增共享 schema 与真实 ZodError 兼容测试，主进程和 mock 统一拒绝非有限模型检测数值；275 项测试、双类型检查、构建与生产依赖审计通过。
- 2026-11-01 阶段 2：升级 Vitest 5.0.5、Puppeteer 25.16.0、electron-updater 6.8.11、electron-builder 26.18.0 及兼容开发工具；Node 下限调整为 22.12.0，Vite/Vitest 配置迁移为 `.mts`；275 项测试、类型检查、构建、portal/UI 探针、开发启动与真实 Electron 冒烟通过；生产审计为 0，全量仅剩 15 项开发链 moderate。
- 2026-11-01 阶段 3：迁移至 TypeScript 7.0.2；Web 改用相对 `paths`，Electron 采用 NodeNext 并显式 rootDir；干净构建保持 electron/shared 输出结构，275 项测试与真实 Electron 冒烟通过；三次双类型检查中位数由 3.255s 降至 0.835s。
- 2026-11-01 阶段 4：迁移至 Tailwind CSS 4.3.3 与 @tailwindcss/vite，保留 `@config` 设计令牌并移除 PostCSS/autoprefixer；CSS 目标调整为 Safari 16.4+ / Firefox 128+；以 TypeScript 官方 alias 方案保留 TS 5 peer 兼容、TS 7 构建。275 项测试、构建、portal/UI/静态预览、缩放极值与真实 Electron 冒烟通过；CSS gzip 增加 1355 字节并登记至 REQ-2026-003。
- 2026-11-01 阶段 5：新增独立 ReleaseNotes，支持 GFM 与白名单 HTML，摘要分段以空行连接并同步双 mock；About 改为可聚焦滚动富文本区域，聊天 raw HTML 禁令不变。新增 6 项测试，281 项测试、类型检查与构建通过；真实 Electron mock 更新和 GitHub v1.0.2 正文联网渲染通过；摘要解析器按需拆包，主包较阶段 1 仅增加 1859 字节。
- 2026-11-01 阶段 6：版本与 lock 统一为 1.0.3；281 项测试、构建、portal/UI 探针、8 张截图、Setup/Portable 与 unpacked 启动验证通过，三类产物在线更新检查均成功；生产审计为 0，latest.yml 哈希匹配，英文 Release 说明与独立验收 handoff 已写入 tmp。
- 2026-11-01 独立验收：审查结论 Pass with findings，无 Critical 或代码级 Important。流程 Important 已由需求方签认闭合：允许破坏性升级合并提交，阶段隔离以变更记录为准；3 项 Info 接受。版本调整为 v1.0.3-beta.0 预发布。
