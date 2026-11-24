# 视觉系统与 Liquid Glass

> 权威范围：视觉令牌、页面骨架、材质分工、形状、排版、缩放和动效。
> 何时读取：修改任何样式、布局、图标或视觉状态之前。
> 代码事实来源：`src/styles/tokens.css`、`glass-optics.css`、`src/index.css`、`src/components/AppFrame.tsx`。
> 最后更新：2026-11-22

浮层定位见 `./popover.md`；焦点和键盘见 `./ux-guidelines.md`；偏好持久化见 `./storage.md`；vendored 引擎边界见 `../architecture.md`。

## 1. 设计原则与令牌

内容优先、控制悬浮、材质有分工。不得把所有内容包成玻璃卡片，也不得以 blur 数值代替实际视觉评审。

| 语义 | 主要令牌 | 规则 |
| --- | --- | --- |
| 画布 / 抽屉 | `--surface-canvas-*` / `--surface-drawer-*` | 静态低权重渐变与噪点；抽屉无 blur |
| 顶栏 / 输入坞 | `--surface-chrome-*` / `--surface-composer-bg` | 浮于真实内容之上，共用边缘、高光和阴影规则 |
| 内容 / 控件 | `--surface-card-*` / `--surface-control-*` | 内容层无 blur；控件使用单层低权重边界 |
| 浮层 / 模态 | `--surface-pop-*` / `--surface-modal-*` | 浮层保证文字可读；模态正文使用实色表面 |
| 强调 / 焦点 | `--accent*` / `--focus-ring` | 文字、图形、填充和焦点分离，不共用渐变描边 |

`--glass-*`、`--row-*` 仅为兼容别名。正文和关键文字对比度至少 4.5:1，焦点指示至少 3:1，由 `tests/visual-contrast.test.ts` 检查。

## 2. 形状、排版与控件

- 圆角只有四档：小控件 0.5rem、字段/行 0.75rem、容器 1rem、胶囊/圆形。普通容器在支持时使用 `corner-shape:squircle`，否则回退 `border-radius`；真圆和胶囊使用 `corner-shape:initial`。
- 光学伪元素必须同时继承宿主 `border-radius` 与 `corner-shape`。不得出现矩形浮层壳套胶囊按钮。
- 使用 `--type-caption/control/body/title` 及对应行高、字重；统计使用 `tabular-nums`。本地界面字体栈必须包含中文，代码使用系统等宽字体。
- 强调色只用于主操作、焦点和选中；user 气泡使用中性色。危险操作默认中性，仅交互时显红；状态徽章使用中性底与状态点。
- 字段行共享 `FormRow`；长文本使用堆叠布局。长双语选项在触发器和列表中正常换行，控件高度随内容增长，不以省略号隐藏关键语义。
- 图标统一来自 `src/components/icons.tsx`：16 viewBox、约 12 的墨迹和光学居中；图标按钮统一使用 `IconButton`。

## 3. 材质与降级

- 输入坞是强玻璃锚点；聊天顶栏为中等玻璃；下拉、菜单和 Generate 为功能性玻璃。Toast、tooltip、模态和设置内容保持克制。
- 同屏玻璃模糊层不超过 5。气泡、列表行和抽屉不使用 blur；边缘环和色散不得新增 backdrop-filter。
- 默认始终是完整 CSS 材质：`fallback/filter-budget`、零折射表面、零地图。真实折射未启用，其实验数据与重新启用条件见 [REQ-2026-006 验收记录](../requirements/active/REQ-2026-006-liquid-glass-visual-upgrade.md)。
- 不支持 backdrop-filter、reduced transparency 或 forced colors 时移除装饰并保证可读；forced colors 使用系统色和实体边界。

## 4. 骨架、缩放与滚动

- `AppFrame` 使用 15rem 导航、52rem 内容列和可拖宽检查器；64rem 以下检查器改为可关闭覆盖栏。聊天与设置共享工作区原点。
- 尺寸使用 rem，flex 链保持 `min-w-0`。应用缩放 50%–250%、浏览器缩放 67%–200% 不得产生横向溢出、遮挡或内容截断。
- 常规命中区至少 32×32，紧凑档为 24×24；小图标可使用不重叠的隐形命中区。
- user 气泡右对齐、最大为内容列 85%、最小 3rem；assistant 使用开放阅读排版。长代码和表格在消息内部滚动。
- 输入坞底行左侧为 Think 与上下文用量，右侧为圆形发送/停止。Generate 是按钮自身唯一的玻璃胶囊；选择模式隐藏 Generate 和输入坞但保留草稿。
- 消息列表安全区上 5rem、下 11rem。仅在对应方向仍有内容时启用 mask 渐隐，上下渐隐带均为 2.5rem；focus-within、生成中、reduced transparency 和 forced colors 下关闭。

## 5. 动效与高光

- 按钮颜色过渡 150ms，悬浮 200ms，面板/模态 300ms；使用 `--ease-interactive` 与 `--ease-panel`。
- 空状态只首屏交错入场；reduced motion 关闭位移动效和高光跟随，保留必要颜色状态。
- 输入坞 pointermove 只缓存坐标，由单个 rAF 更新高光 transform/opacity，不进入 React render。input/resize 后暂缓 150ms，静止后恢复。

主题、语言和外观偏好的存储与首帧应用见 `./storage.md`；截图、探针和实际读图门禁见 `../release.md`。
