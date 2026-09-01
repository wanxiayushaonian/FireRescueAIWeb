# FireRescueAI 智能体提示词配置与 MCP 功能 · 打包

> 快照日期：2026-08-30。本文件夹是面向**平台同步 / 评审 / 交接**的自包含分发包：总览与机制类内容按主题分文件，提示词逐角色一个文件（可直接整块复制贴入平台）。
>
> ⚠️ 各文件为源文件快照，冲突时以文末「权威源对照」列出的源文件为准。

## 目录

| 文件 | 内容 |
|---|---|
| [01-Node-MCP-8787工具清单.md](01-Node-MCP-8787工具清单.md) | `firerescue-mcp` 18 工具 + 传输/鉴权/环境变量 + 演练命令链与 DrillSession |
| [02-Python-MCP-8788工具清单.md](02-Python-MCP-8788工具清单.md) | `firerescue-business-mcp` 11 工具 + 统一返回信封 |
| [03-数据权威蓝图.md](03-数据权威蓝图.md) | 双 MCP 职责 / 数据权威 / 统一 ID 图 / 标准调用顺序（蓝图全文快照） |
| [04-平台MCP勾选矩阵.md](04-平台MCP勾选矩阵.md) | 按服务勾选矩阵（App × 双 MCP）+ 约束含义 |
| [05-运行时注入机制.md](05-运行时注入机制.md) | `[系统上下文]` 前缀 / 程序化消息前缀 / 评估模板与降级 |
| [06-scene锚点语法.md](06-scene锚点语法.md) | agent 正文联动 3D 的 scene:// 语法与约定 |
| prompts/ | 全部平台系统提示词（9 个，见下表） |

## 提示词清单（prompts/）

| 文件 | 角色 | 平台 MCP 勾选 |
|---|---|---|
| [confront-v2-planner.md](prompts/confront-v2-planner.md) | 演练对抗·预案规划员（含一级 preflight 双模式） | Node + Python |
| [confront-v2-adversary.md](prompts/confront-v2-adversary.md) | 演练对抗·导调对手 | 仅 Node |
| [confront-v2-commander.md](prompts/confront-v2-commander.md) | 演练对抗·现场总指挥（含人工基线纪律） | Node + Python |
| [confront-v2-evaluator.md](prompts/confront-v2-evaluator.md) | 演练对抗·评估与复盘专家 | 都不勾 |
| [module-overview.md](prompts/module-overview.md) | 态势总览·态势研判智能体 | GIS 研判域 |
| [module-objects.md](prompts/module-objects.md) | 对象总览·灭火作战参谋（档案分析） | 3D 联动 + 档案 + 水源 |
| [module-training.md](prompts/module-training.md) | 熟悉考核·消防业务教练 | 3D 联动 |
| [module-command.md](prompts/module-command.md) | 实战指挥·辅助决策 | GIS 指挥域 |
| [module-global.md](prompts/module-global.md) | 全局助手（五模块共享） | 仅知识检索 |

## 1. 体系总览

智能体全部托管在 uStudio uagent 平台（应用 = App，前端经 agent-chat SSE 通道对话），工具能力由平台勾选的两台 MCP 服务提供。结构分三层：

1. **五模块侧边栏智能体**（业务/全局双 tab）：态势总览、对象总览、实战指挥、演练对抗（侧栏为「预案推演」app）、熟悉考核。
2. **演练对抗舱四角色**（对抗舱内部编排，非侧栏）：Planner / Adversary / Commander / Evaluator。
3. **一级预案输出与评估**：一级面板 preflight 复用 Planner（`propose_initial_plan` 交卷）；演练预案评估/实战战后评估走评估 app（消息前缀注入过程数据，只收 JSON）。

### 1.1 平台 App 与 app_id 对照

| App | app_id | 说明 |
|---|---|---|
| 态势总览（态势研判智能体） | `2087571055445204993` | overview 业务助手 |
| 对象总览（档案分析智能体） | `2089516809929342977` | `NEXT_PUBLIC_OBJECTS_APP_ID` 可覆盖 |
| 熟悉考核（熟悉引导智能体） | `2089517460338434049` | `NEXT_PUBLIC_TRAINING_APP_ID` 可覆盖 |
| 实战指挥（辅助决策智能体） | `2089559905052377090` | `NEXT_PUBLIC_COMMAND_APP_ID` 可覆盖 |
| 演练侧栏·预案推演智能体 | `2092049331623940097` | `DRILL_PLAN_APP_ID`；2026-08-26 新建 |
| 对抗舱 Planner（预案输出 planner） | `2090106853293072385` | 对抗舱 Planner 与一级 preflight 共用 |
| 对抗舱 Adversary（对抗） | `2089649115801305090` | |
| 对抗舱 Commander（演练指挥官） | `2089348733554843649` | |
| 对抗舱 Evaluator（评估） | `2089649510980239361` | 亦用于演练预案评估/战后评估 |
| 全局助手 | `2089649747428302849` | 五模块共享全局 tab |
| 通用兜底 | `2087535122373074946` | 未配置专属 app 的模块回退 |

> 环境变量注入一律 `NEXT_PUBLIC_*`（构建期），完整映射见 `web/lib/agent-app-ids.ts`。

### 1.2 Agent ↔ 前端通信

- **对话**：`postAgentChat`（BFF `/api/business/agent-chat` SSE 事件流，`text/finish/tool` 事件），双层看门狗（响应头 90s + 流空闲 90s，挂起抛 `AgentStreamStalledError` 走降级）。事件字段契约见 `web/plan/drill-agent-chat-sse-format.md`。
- **工具结果回传**：场景类工具经 `/scene-events` SSE 下发浏览器 → 浏览器执行 → ack 回执（可携带 result）→ agent 用 `get_scene_command_status` 查询。

## 2. 权威源对照

| 本包内容 | 源文件 |
|---|---|
| 演练对抗四角色提示词 v2.2 | `web/plan/agents/confront-v2-{planner,adversary,commander,evaluator}.md` |
| 四角色配置索引（勾选矩阵/同步状态） | `web/plan/2026-08-25-confrontation-agent-prompts.md` |
| 模块业务智能体提示词 | `web/plan/2026-08-17-overview-agent-gis.md`、`-objects-agent.md`、`-training-agent.md`、`2026-08-18-command-agent.md`、`-adversary-evaluate-global-agents.md`（全局助手节） |
| Node MCP 工具定义 | `web/mcp-server/src/tools.ts` |
| Python MCP 工具定义 | `znya_jjxf119/server/app/mcp/server.py` |
| 数据权威蓝图 | `web/doc/data-authority-mcp-blueprint.md`（03 文件为其全文快照） |
| 运行时上下文注入 | `web/src/lib/agent-context.ts`、`web/lib/agent-evaluate.ts` |
| scene:// 锚点语法 | `web/plan/2026-08-24-agent-scene-links.md` |
| app_id 映射 | `web/lib/agent-app-ids.ts` |

已取代/过时（不收录）：旧演练指挥 agent（tick 引擎时代）、旧演练预案输出 agent、旧对抗/评估配置稿（对抗/评估节）、逐工具白名单时代的 `drill-mcp-config-guide.md`。

## 3. 版本与同步状态（截至 2026-08-31）

- 2026-08-31:本包随 `d2b0422` 提交并推送上线;同日新增前端模块级视频播放功能（`ca49193`,预案面板三分组浮窗 + 现场回传 + 视频源设置）——属 UI 层不属 agent/MCP 配置面,未入本包。
- **四角色 v2.2 已同步平台**（2026-08-25），三连验收通过，`demo-baseline` tag 于验收提交。
- Node MCP 现为 **18 工具**（2026-08-26 新增 `propose_initial_plan` 后）；Python MCP 11 工具。
- `query_knowledge`：工具保留但四角色提示词不再依赖；历史知识改走平台原生知识库挂载（已挂库）。模块侧栏提示词中 `query_knowledge` 表述早于该裁定，实际以平台原生知识库挂载优先。
- 生产知识库中仍存在旧预案"258 米"文本，为该口径唯一残留来源（代码/库已全部清洗为 150m），待平台侧更新或接受。
- 遗留待办：scene:// 锚点语法铺开到各业务 agent 提示词；对抗评估归档进 znya PostgreSQL 审计层（现 DrillSession 文件形态）；长链路聊天流 2-3 分钟处可能被网关掐断（已加看门狗 + 可手动重新生成，自动续问待拍板）。

## 4. 整理说明

- 四角色提示词源文件中三处程序化消息前缀以 `\uXXXX` 转义形式存放（编辑器痕迹），本包已按运行时实际发送文本还原为 `[对抗开局]` / `[导调触发]` / `[指挥调整]`。
- 模块侧栏提示词原文档中的"逐工具勾选"清单为平台约束发现前的历史写法（现平台只能按 MCP 服务勾选），本包 04 文件为现行口径。
- 提示词代码块外层使用四反引号围栏，内嵌 ```json 示例可正常渲染，整块复制不受影响。
