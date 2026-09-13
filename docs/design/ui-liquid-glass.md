# 液态玻璃视觉系统（Liquid Glass）

> 适用范围：视觉令牌、材质与模糊预算、主题、缩放鲁棒性、UI 偏好持久化（Cookie）、气泡/输入坞/图标规格、动效与字体栈。
> 何时读取：改任何样式/视觉/动效之前——这是所有 UI 改动的基础文档；浮层规则另见 `./popover.md`，焦点/交互规范另见 `./ux-guidelines.md`。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §5.1–5.4/§5.8 + 原 docs/impl-contract.md §7（两份重复内容合并去重）

## 1. 视觉令牌（`src/styles/tokens.css`）

深浅两套主题（`data-theme` 切换）。材质由三类变量构成：

- **玻璃底**：`--glass-bg`（常态 .52）/ `--glass-bg-pop`（浮层 .72）/ `--glass-bg-modal`（模态 .8），配 `backdrop-filter: blur(28 / 40 / 44px) saturate(180~200%)`。
- **方向性边缘 + 双 specular**：`--glass-border` 侧缘、`--glass-border-top` 更亮的顶缘（受光方向），`--specular-top` / `--specular-bottom` 内嵌高光（顶亮 / 底微亮），叠 `--card-shadow` 分层环境投影——模拟真实玻璃受光，而非四周均匀描边。
- **抽屉与卡片**：`--drawer-bg` 着色抽屉（**无模糊**，ChatGPT 风格）；`.row-surface` 无边框卡片 + 投影，替代通栏发丝分隔线。**布局语言：圆角卡片/抽屉分层，禁止通栏 hairline**；栏间如需分隔用 `0.5px var(--glass-border)`，禁止卡片套卡片（用留白+字重+分隔线分层）。

工具类：`.glass`（面板/输入卡）、`.glass-bar`（栏顶横条，无描边）、`.glass-strong`、`.glass-pop`（浮层）、`.glass-interactive`（可点击玻璃，hover 亮度 +4%）、`.drawer`。

**圆角阶梯**：勾选框 4px / kbd 6px / icon 按钮 8px / 控件·行·卡片·浮层 12px / 面板·气泡·模态·分组卡 20px / 胶囊 999px。

## 2. 模糊预算与性能红线

- `backdrop-filter` 昂贵：**同屏玻璃模糊层 ≤ 5**（左栏顶栏、消息流顶栏、输入坞、右栏顶栏、模态框等）；**列表行/气泡不用模糊**，用半透明纯色。
- 降级：`@supports not (backdrop-filter…)` 与 `prefers-reduced-transparency` 下不透明度提升至 0.92/0.97。
- 窗口背景铺柔和多段径向渐变 + 细噪点（CSS/SVG data-URI，无外链），深浅主题各一套，保证玻璃有内容可"折射"。

## 3. 主题

- 浅色 / 深色 / 跟随系统三档，即时生效（`data-theme` 属性）。
- 主题切换过渡 300ms 且仅颜色系属性（避免布局抖动）；`prefers-reduced-motion` 下禁用一切过渡。

## 4. 缩放鲁棒性（硬指标）

两层缩放都必须稳健：

- **应用内 UI 缩放**（设置页，50%–250%、步长 10%，CSS zoom 实现）：delta 式滑块拖动不会失控；模态/浮层做视口补偿（锚定不漂移）；Ctrl+滚轮 / 捏合缩放被拦截交给应用层。
- **浏览器级缩放**：全部尺寸用 rem（根字号 16px），禁止以 px 写死容器宽高（仅线宽允许）；三栏 Grid `minmax(200px,260px) 1fr minmax(240px,320px)`；67%–200% 逐一目检无横向滚动条、无截断（长模型名 ellipsis、模态 `max-height:90vh` 内滚）。
- **flex `min-width:auto` 会击穿 `max-width`**：内容链路上保持 `min-w-0`，否则长代码/表格撑出横向滚动条。
- 交互控件最小可点击区域 ≥ 32×32px（紧凑档 24px，视觉 16px 的 icon 允许隐形命中区扩展）。

外观定制项（缩放/字体/字号/代码主题）归一化与消毒见 `shared/appearance.ts`（字号：界面 10–24px、代码块 6–40px，非法 → null → UI 拒绝并 toast；字体栈字符白名单）。

## 5. UI 偏好持久化（Cookie `easyui_prefs`）

- **轻量 UI 偏好**写单 Cookie `easyui_prefs`（+ localStorage 同名兜底）：`theme`、已解析的 `lang`、`sidebar_collapsed`、`right_width`，以及**外观项**（`zoom` / `font_ui` / `font_code` / `code_theme` / `font_ui_size` / `font_code_size`）。
- 外观项同时在 SQLite GeneralSettings 存一份（设置页事实来源），Cookie 用于 React 挂载前同步首帧应用（**防 FOUC**，内联脚本；改脚本必重算 CSP sha256）。
- 约定：值 = `encodeURIComponent(JSON)` < 2KB；365 天、`SameSite=Lax`、不设 `HttpOnly`；绝不含敏感信息。**业务数据一律走 SQLite，不放 Cookie**。

## 6. 气泡、输入坞与图标

- **气泡**：内容列居中 `max-w-7xl`；气泡最大宽 85% 列宽，user 右对齐（min-width 7.5rem）、assistant 左对齐（min-width 12rem）；长代码/表格在气泡内滚动；头部行单行不折行；统计行在气泡底部（`./chat.md` §4）；操作按钮见 `./message-tree.md` §3。
- **输入坞**：玻璃卡片（`composer-shell`），多行输入增高时底行控件钉底右下；**"生成回复 (Ctrl/Cmd+R)" 是浮于输入坞上方 12px 的液态玻璃胶囊**（portal 居中；仅激活叶为 user 且无生成中时出现，快捷键仅可见时生效）。
- **图标**：`src/components/icons.tsx` 统一 SVG 图标库，Lucide 风格 16×16 viewBox、墨迹约 12×12 且光学居中（偏差 ≤0.25 单位，可用 `getBBox()` + `getScreenCTM()` 审计）；新增按钮一律 icon + `IconButton`。

## 7. 动效

全部尊重 `prefers-reduced-motion`：

- 按钮 150ms 颜色过渡 + `active: scale(0.98)`；悬浮 200ms `var(--ease-interactive)`（亮度 +4%）。
- 缓动：交互 `--ease-interactive: cubic-bezier(0.32,0.72,0,1)`、面板 `--ease-panel: cubic-bezier(0.22,1,0.36,1)`；面板折叠/模态出现 300ms。
- 空状态/引导卡片交错入场：`opacity:0→1, translateY(8px→0)`，`transition-delay: calc(var(--stagger) * 90ms)`，仅首屏一次。
- 流式编排：发送 → 三点 typing 指示器 → 首个 delta 替换为正文（50ms 节流）→ 完成（`./chat.md` §2）。

## 8. 字体栈（必须含中文，禁纯拉丁显示字体渲染中文）

- 界面：`-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`。
- 代码：`ui-monospace, "SF Mono", "Cascadia Code", Consolas, monospace`。
- 不用任何网络字体（CSP `default-src 'self'` 也不允许）。
