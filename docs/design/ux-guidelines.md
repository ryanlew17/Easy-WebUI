# 交互与可访问性

> 权威范围：焦点、快捷键、空态、窗口记忆、删除确认、错误文案和在线升级交互。
> 何时读取：修改全局交互、设置页关于/升级、键盘行为或错误提示之前。
> 代码事实来源：`src/components/`、`electron/updater.ts`、`electron/window-state.ts`。
> 最后更新：2026-11-22

视觉令牌和命中区见 `./ui-liquid-glass.md`；浮层行为见 `./popover.md`；性能门与发布流程见 `../release.md`。

## 1. 焦点与键盘

- 可交互元素使用 2px `--focus-ring` 的 `:focus-visible` 描边，通常 `outline-offset:-1px`，不得增加布局尺寸或遮挡相邻控件。
- 文本输入聚焦时移除默认阴影，只保留一个焦点环，禁止灰描边与蓝环并存。
- 输入坞例外：高光壳保留 overflow hidden，焦点由无裁剪的 `.composer-focus-frame` 以 2px 外环承担；壳和 textarea 不重复画环，forced colors 使用 Highlight outline。
- 所有功能可 Tab 到达；Modal 初始焦点进入面板并管理焦点返回。

| 快捷键 | 行为 |
| --- | --- |
| Ctrl/Cmd+N | 新会话 |
| Ctrl/Cmd+, | 设置 |
| Enter / Shift+Enter | 发送 / 换行；`enter_send` 可反转 |
| Esc | 停止生成、退出批量选择或关闭顶层弹层 |
| Ctrl/Cmd+R | Generate 胶囊可见时生成回复 |

## 2. 空态与删除

- 无平台空态直达平台设置；无会话空态只引导新建会话，不引用尚未显示的模型选择器。
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
