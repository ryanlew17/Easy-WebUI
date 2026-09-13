# 对话：布局、生成编排、思考开关、生成统计

> 适用范围：会话页三栏布局、生成编排（发送/重生成/续写共用）、流式渲染、失败重试、单生成锁、思考开关、生成统计口径与展示。
> 何时读取：改会话页布局、`electron/chat.ts` 编排、流式渲染、统计展示之前。
> 关联需求：无（v1.0.1 现状快照）。
> 最后更新：2026-09-13
> 来源：原 prd.md §4.1/§4.4/§4.6/§4.7 + 原 docs/impl-contract.md §11.2/§11.4；分支操作语义见 `./message-tree.md`，参数见 `./params.md`

## 1. 会话页布局（三栏）

- **左栏（侧栏）**：会话列表（新建、重命名、删除、置顶、按更新时间排序、手动 ✨ 生成标题）；可折叠。
- **中栏**：消息流（树形分支的激活路径）+ 输入坞（Composer：多行输入、思考开关、上下文环形计量、发送/停止；上方浮动"生成回复"胶囊）。
- **右栏（可折叠）**：当前会话参数面板，覆盖项高亮 + 一键回退预设。

三栏 Grid `minmax(200px,260px) 1fr minmax(240px,320px)`；视觉规格（气泡宽度/输入坞/胶囊）见 `./ui-liquid-glass.md` §6。

## 2. 生成编排（发送 / 重生成 / 续写共用）

- 编排顺序：落库 user 消息 → 裁剪组装（`./context-trim.md`）→ 调适配层（`./gateway.md`）→ 流式回推（`chat:delta`，reasoning 与 content 分流）→ 落库 assistant 消息。
- 流式期间：输入框禁用、显示"停止"按钮；取消后主进程 abort（`AbortController.abort()`），已收部分内容落库（`partial: true`）。
- 请求失败：已收内容与错误一并落库，消息以气泡内错误卡片呈现（状态码 + 脱敏后信息），提供"重试"按钮；重试复用同一条用户消息，不产生重复记录。
- **同会话同一时间只允许一个进行中的生成**（单生成锁；违反报 `generation_in_progress`）。
- 流式渲染：气泡内三点 typing 指示器 → 首个 delta 替换为正文；delta 进增量缓冲，50ms 节流 flush。
- `generateResponse`：激活叶为 user 时直接生成 assistant 子消息（输入坞上方胶囊）；否则报 `nothing_to_generate`。

## 3. 思考开关（reasoning_enabled）

- 会话级开关（DB 列，新会话默认开）。开 = 模型默认思考，请求不附加参数；关 = 按 api_format 附加关闭载荷：openai-chat `thinking:{type:'disabled'}`、openai-responses `reasoning:{effort:'none'}`、anthropic `thinking:{type:'disabled'}`（`shared/reasoning.ts` 的 `reasoningOffPayload()` 统一产出，`AdapterChatInput.reasoningOff` 透传）。
- 能力判定 `modelSupportsReasoning(modelId)`：保守的"确认不支持"名单（gpt-3.5 / gpt-4o / moonshot-v1 / llama / mistral / gemma 等）；**未知一律按支持处理**（按钮显示）。标题生成不受影响。

## 4. 生成统计（MessageStats）

**计时口径**（t0 = 请求发出）：

| 指标 | 定义 |
| --- | --- |
| `ttft_ms` | 首个 delta（reasoning/content 先到为准）− t0；非流式 = total |
| `reasoning_ms` | 首 content delta − t0（仅当出现过 reasoning；无则流结束） |
| `total_ms` | 结束/中止/失败 − t0（中止/失败同样落库） |

**展示**：

- reasoning 折叠块标题「Thought for X.XXs / 思考了 X.XX 秒」。
- 完成后气泡底部统计行：tok/s（= token_count / max(total−ttft, 1ms)）、tokens、TTFT、总用时、finish_reason。
- ≥60s 显示 `Xm XXs`（`formatDurationMs` 双语格式化）。
- 续写（continue）：不建行，delta 追加到同一消息；计时/字数对总内容累计（total_ms 与 token_count 累加，ttft 保留首段值，finish_reason 取本次）。
