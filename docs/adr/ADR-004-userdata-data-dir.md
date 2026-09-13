# ADR-004: 数据目录默认落在 userData 而非安装目录

- Status: Accepted
- Date: 2026-09-13
- Deciders: project owner
- Supersedes: —
- Superseded by: —

## Context

本地优先产品的全部数据（会话/密钥/设置/备份）落在一个用户可见的数据目录。两类分发形态对目录的要求冲突：

- **安装版**：NSIS 重装/覆盖安装会清空安装目录，卸载不应删用户数据——早期"exe 旁 data/"方案在重装时丢数据；
- **便携版**：数据必须随 exe 目录走（整目录拷贝即迁移），且要避开 portable 运行时在 %TEMP% 的解包目录。

## Decision

解析优先级：**自定义指针 → 便携 exe 旁 `data/` → 安装版 `userData/data`（`%APPDATA%/easy-webui/data`）**。

- 便携判定：打包且存在 `PORTABLE_EXECUTABLE_DIR`；指针文件便携版放便携根 `easywebui-data-dir.json`，安装版放 `userData/data-dir-pointer.json`。
- `nsis.deleteAppDataOnUninstall = false`；重装/覆盖安装/卸载均不动用户目录。
- 支持自定义位置：校验链 + 目标有数据仅写指针（`switched`）/空目录则 WAL checkpoint 后全量复制（`migrated`），重启生效；旧版本遗留数据（旧安装目录、%Temp% 解包目录）首次启动自动抢救迁移；`storage-layout.json` 带布局版本号供未来结构升级。**任何路径都不删除旧数据。** 现行规则见 `../design/storage.md`。

## Consequences

- 需要长期维护解析优先级、指针文件、迁移抢救（`storage-migrate.ts`）与布局版本逻辑，测试面增加（window-state/storage 迁移单测）。
- 换取：安装版数据安全（重装/卸载不丢）、便携版目录自包含、用户可自管位置且迁移无损。

## Alternatives Considered

- **统一安装目录旁 `data/`**：Windows 重装/覆盖安装清空安装目录直接丢数据，已实测踩坑，否决（这是本 ADR 的直接动因）。
- **只依赖 Electron `userData`、不做便携/自定义**：便携版"随目录走"是产品核心卖点之一（local-first），否决。
