# 交互与可访问性

> 权威范围：焦点、快捷键、空态、窗口记忆、删除确认、错误文案和在线升级交互。
> 何时读取：修改全局交互、设置页关于/升级、键盘行为或错误提示之前。
> 代码事实来源：`src/components/`、`electron/updater.ts`、`electron/window-state.ts`。
> 最后更新：2026-11-25

视觉令牌和命中区见 `./ui-liquid-glass.md`；浮层行为见 `./popover.md`；性能门与发布流程见 `../release.md`。

## 1. 焦点与键盘

- 可交互元素保留 `:focus-visible`，但普通模式不再叠加蓝色外描边；以 `--focus-edge*`、内高光和柔和内发光点亮控件材质，不得增加布局尺寸。
- 文本输入聚焦时以单层内嵌边缘光替换灰色边界。输入坞由 shell 的光学边缘和内发光承担焦点，textarea 不重复绘制；普通按钮按形状沿用同一语言，会话行焦点合并到整行。
- 实色主按钮、开启的开关和勾选框使用 `--on-accent` 反色内高光，避免焦点与填充同色。Chromium 自动纳入 Tab 序的可滚动代码块同样使用内嵌反馈；forced colors 改用真实 Highlight outline，并清除装饰阴影。
- 所有功能可 Tab 到达；Modal 初始焦点进入面板并管理焦点返回。开发 StrictMode 的 effect 模拟清理不得提前还焦点，真正卸载后仍返回原触发控件。

| 快捷键 | 行为 |
| --- | --- |
| Ctrl/Cmd+N | 新会话 |
| Ctrl/Cmd+, | 设置 |
| Enter / Shift+Enter | 发送 / 换行；`enter_send` 可反转 |
| Esc | 停止生成、退出批量选择或关闭顶层弹层 |
| Ctrl/Cmd+R | Generate 胶囊可见时生成回复 |

检查器分隔条可 Tab 聚焦，左右方向键每次调整 10px，并通过 aria-valuemin/max/now 暴露宽度。

## 2. 空态与删除

- 无平台空态直达平台设置；无会话空态只引导新建会话，不引用尚未显示的模型选择器。
- 设置标签列表在高度不足时独立滚动，底部返回操作保持可见并可聚焦。
- 删除平台、会话、备份或消息均需确认；各领域的具体提示内容由对应设计文档负责。

## 3. 窗口状态

窗口尺寸和位置经防抖写入 `data/window-state.json`；恢复时钳制到可见工作区并保留最大化状态。持久化目录见 `./storage.md`。

## 4. 关于与在线升级

- 关于页展示版本、协议、作者和 GitHub；外链仅允许 http(s)。
- 升级状态为 `checking → available → downloading → downloaded → install`；available 自动进入下载，none、unavailable 和失败通过通知表达。
- 下载完成后显示可滚动的固定高度版本说明、备份警告和安装确认；确认后静默安装并重启。
- 主进程通过 `updateGetState()` 提供权威状态，About 挂载时同步；available 可续传下载。
- 真实通道使用 electron-updater + GitHub Releases，校验 sha512；`autoDownload=false`，`update_beta` 控制 prerelease。启动自检由 `auto_update` 控制，只广播发现版本，下载仍由 About 发起。
- dev/未打包返回 `unavailable/dev_mode`，Web 返回 `unavailable/web_preview`；`EASYUI_MOCK_UPDATE=1` 提供测试通道。
- ReleaseNotes 的按需加载与白名单消毒规则见 `./security.md`；打包和 latest.yml 规则见 `../release.md`。

## 5. 错误与可访问性

错误文案按“发生了什么 / 可能原因 / 建议操作”组织，并同时进入两份语言包。所有 aria-label 使用 i18n；对比度数值由 `./ui-liquid-glass.md` 统一约束。

应用缩放会同比缩放命中区：50% 时 32/24px CSS 目标对应 16/12px 物理尺寸。这是缩放固有结果，不使用反向缩放破坏布局；需要更大物理目标时应提高界面缩放。
