# UX 交互规范

> 适用范围：焦点与描边、快捷键、空状态、窗口状态记忆、关于页与在线升级、错误文案、删除保护、性能预算、可访问性。
> 何时读取：改交互细节、设置页第五标签（关于/升级）、全局快捷键、错误文案之前。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §5.7/§9；升级类型契约见 `../contracts/impl-contract.md` §1/§2

## 1. 焦点与描边

- 所有可交互元素 `:focus-visible` 统一 **2px accent 描边、内嵌 `outline-offset: -1px`**——描边不得显著增大控件占用面积，也不得压到相邻控件；卡片内控件间距按描边可见设计。（v1.0.1 起为内嵌 −1px，取代早期 offset 2px 外描边方案。）
- 文本输入**不加蓝色边框**（`.input-surface` 内凹井式表面），聚焦仅显示内嵌描边。
- 全部控件可 Tab 到达；Modal 初始焦点进面板。

## 2. 快捷键

| 键 | 行为 |
| --- | --- |
| `Ctrl/Cmd+N` | 新会话 |
| `Ctrl/Cmd+,` | 设置 |
| `Enter` / `Shift+Enter` | 发送 / 换行（`enter_send` 可反转） |
| `Esc` | 停止生成 / 退出批量选择 / 关闭弹层 |
| `Ctrl/Cmd+R` | 生成回复（胶囊可见时才生效，`./ui-liquid-glass.md` §6） |

## 3. 空状态与引导

- 无平台时：会话页中栏引导卡片（直达设置页）。
- 无会话时：快捷开始卡片。
- 空状态交错入场动效见 `./ui-liquid-glass.md` §7。

## 4. 窗口状态记忆

- 记忆上次尺寸/位置（`data/window-state.json`，防抖持久化）。
- 恢复时钳制到可见工作区，最大化状态保留（纯函数核心 + fs 壳，可测）。

## 5. 关于页与在线升级（设置第五标签）

- 信息卡：版本 / 协议 / 作者 / GitHub（外链经 `openExternal`，仅 http(s)）。
- 升级卡状态机：`checking → available（自动转 downloading）→ downloading → downloaded → install`；`none`/`unavailable`/失败一律通知气泡；下载完成态必须带固定高度可滚动版本说明 + 备份警告 + 安装确认弹窗，确认后静默安装并重启（`quitAndInstall(true,true)`）。
- **主进程权威状态**（`updateGetState()`）：About 页挂载时同步，错过 `update:available` 事件也能恢复 UI；available 态自动续下载。
- 真实通道 = electron-updater + GitHub provider（`ryanlew17/Easy-WebUI`，打包嵌入 app-update.yml）；`autoDownload=false`（下载由用户触发）；`allowPrerelease ← settings.update_beta`；sha512 校验内建；版本比较 compareSemver（导出于 updater.ts）；安装前 DB 由 before-quit 钩子关闭。
- 启动自检由 `auto_update` 控制：发现新版仅广播提示（带宽动作须用户知情），下载由 About 页状态机接管。
- 运行形态分支：打包版真实流程；dev/未打包 → `unavailable/dev_mode`；`EASYUI_MOCK_UPDATE=1` → mock 演示通道（虚构 patch+1 + 2s 假进度，vitest 同通道可测，electron-updater 懒加载 require，测试环境永不拉起 electron）；web 预览默认 `unavailable/web_preview`（`localStorage.easyui_mock_update='1'` 演示）。
- 发布端流程见 `../release.md`（Release 说明纯英文；latest.yml 必须上传）。

## 6. 错误文案

三段式——发生了什么 / 可能原因 / 建议操作。例："连接失败（HTTP 401）。密钥可能无效或已过期。请在平台设置中检查 API 密钥。"（经 i18n 双语，`./i18n.md`）

## 7. 删除保护

删除平台 / 会话 / 备份 / 消息均需确认；删平台提示"该平台的 N 个会话将保留，但需重新指定模型"。

## 8. 性能预算

- 冷启动到可交互 < 3s；流式渲染 50ms 节流。
- 1 万条消息会话首屏 < 500ms 为目标（虚拟滚动列路线图 `../roadmap.md`）。

## 9. 可访问性

- 所有交互控件可 Tab 到达；`:focus-visible` 内嵌描边（§1）。
- 对比度 ≥ WCAG AA；aria-label 走 i18n。
