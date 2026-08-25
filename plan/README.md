# web/plan/ 文档索引

> 维护:2026-08-25 ｜ 本文件是 plan/ 下全部文档的唯一入口;权威跨项目技术蓝图见仓库根目录 `项目技术蓝图与实施指南.md`。
> 约定:🟢 现行可执行 / 🟡 已实施(计划已成历史,按需查阅) / 🔴 已废弃或已被取代。

> 决赛黄金演示链与验收标准见仓库根目录 `DEMO.md`；演示口径与历史 plan 冲突时以 `DEMO.md` 为准。

## 权威蓝图(仓库根目录,非本目录)

| 文档 | 说明 |
|---|---|
| `../../项目技术蓝图与实施指南.md` | **总蓝图**:模板能力边界 / 三方依赖边界 / SDK 模型链路 / web 诊断与修复清单 / agent 联动 / 路线图。所有 plan 文档与其冲突时以此为准 |
| `../doc/data-authority-mcp-blueprint.md` | **双 MCP 数据权威、ID 图、来源矩阵、四角色服务勾选与标准调用顺序**(2026-08-25 起现行) |

## 实施计划(带 Task 清单)

| 文档 | 摘要 | 状态 |
|---|---|---|
| `2026-08-03-phase0-mcp-bridge.md` | MCP 桥 Phase 0:SSE 服务端 + SceneCommandBus + fly_to 端到端 | 🟡 已实施(全链路生产验证通过) |
| `2026-08-08-gis-refactor-plan.md` | GIS 底座结构重构实施 | 🟡 已实施(RealGisMap 已落地) |
| `2026-08-08-gis-visual-plan.md` | GIS 视觉与体验实施 | 🟡 已实施 |
| `2026-08-08-gis-perf-plan.md` | GIS 性能与加载实施(视口裁剪/聚合) | 🟡 已实施 |
| `2026-08-08-gis-analytics-plan.md` | GIS 灾情响应 ETA 分析实施 | 🟡 部分实施(ETA 染色/响应查询) |
| `2026-08-09-drill-simulation-plan.md` | 演练对抗智能推演实施(tick 引擎) | 🔴 已取代——tick 引擎已删除(6985e64),对抗舱为唯一演练运行时 |
| `2026-08-12-scene-recipe-plan.md` | 3D 显隐 Recipe 编排架构实施(12 Task) | 🟡 已实施 |
| `znya-deploy-mcp.md` | znya 后端 + Python MCP(:8788)部署规划 | 🟡 已实施(生产 8788 运行中,appKey 中间件 + 平台参数剥离均已修复) |
| `2026-08-19-drill-confrontation-cabin-plan.md` | 演练对抗对抗舱实施(照抄原型+接 agent) | 🟡 已实施(生产 08-20/08-25 实测通过) |
| `2026-08-20-command-refactor-plan.md` | 实战指挥 P1 案卷重构(案域三圈/处置时间轴/车辆动画) | 🟡 已实施 |
| `2026-08-20-disposal-flow-demo-plan.md` | 实战指挥处置流程演示实施 | 🟡 已实施 |

## 设计文档(设计意图,供改版参考)

| 文档 | 摘要 | 状态 |
|---|---|---|
| `2026-08-08-gis-refactor-design.md` | GIS 底座结构设计 | 🟡 已实施 |
| `2026-08-08-gis-visual-design.md` | GIS 视觉与交互设计 | 🟡 已实施 |
| `2026-08-08-gis-perf-design.md` | GIS 性能与加载设计 | 🟡 已实施 |
| `2026-08-08-gis-analytics-design.md` | GIS 灾情响应 ETA 设计 | 🟡 已实施 |
| `2026-08-09-drill-simulation-design.md` | 演练对抗智能推演设计(v2,tick 引擎) | 🔴 已取代(对抗舱) |
| `2026-08-19-drill-confrontation-cabin-design.md` | 演练对抗对抗舱设计(照抄原型+接 agent) | 🟡 已实施 |
| `2026-08-20-disposal-flow-demo-design.md` | 实战指挥处置流程演示设计 | 🟡 已实施 |
| `situation-overview-roadmap.md` | 态势总览增强与 Agent 智能化路线图 | 🟡 规划参考 |

## 智能体配置稿(平台 app 提示词)

| 文档 | 摘要 | 状态 |
|---|---|---|
| `2026-08-25-confrontation-agent-prompts.md` | **演练对抗 v2 四角色配置索引**(MCP 服务勾选矩阵) | 🟢 现行(平台已于 2026-08-25 同步) |
| `agents/confront-v2-planner.md` | 四角色提示词:Planner 预案规划与初始部署 | 🟢 现行 |
| `agents/confront-v2-adversary.md` | 四角色提示词:Adversary 导调对抗与特情生成 | 🟢 现行 |
| `agents/confront-v2-commander.md` | 四角色提示词:Commander 现场指挥与动态调整 | 🟢 现行 |
| `agents/confront-v2-evaluator.md` | 四角色提示词:Evaluator 过程评估与复盘 | 🟢 现行 |
| `2026-08-17-overview-agent-gis.md` | 态势总览 agent(风险研判 + GIS 联动) | 🟢 现行(平台已上线) |
| `2026-08-17-objects-agent.md` | 对象总览 agent(灭火作战参谋) | 🟢 现行(平台已上线) |
| `2026-08-17-training-agent.md` | 熟悉考核 agent(教练闭环) | 🟢 现行(平台已上线) |
| `2026-08-18-command-agent.md` | 实战指挥 agent(调派方案生成) | 🟢 现行(平台已上线) |
| `2026-08-24-agent-scene-links.md` | scene:// 场景锚点语法(agent 正文联动 3D) | 🟢 现行(待铺开到各业务 agent 提示词) |
| `2026-08-17-demo-checklist.md` | 决赛演示走查清单 | 🟢 现行 |
| `2026-08-17-drill-commander-agent.md` | 旧演练指挥 agent(tick 引擎时代) | 🔴 已取代(confront-v2-commander) |
| `2026-08-19-drill-planner-agent.md` | 旧演练预案输出 agent | 🔴 已取代(confront-v2-planner) |
| `2026-08-18-adversary-evaluate-global-agents.md` | 旧对抗/评估/全局助手配置稿 | 🟡 部分取代:对抗/评估部分见 confront-v2;**全局助手部分仍现行** |

## 协议实证 / 配置指南

| 文档 | 摘要 | 状态 |
|---|---|---|
| `drill-agent-chat-sse-format.md` | agent-chat SSE 事件格式实测(含 2026-08-14 勘误:字段名契约) | 🟢 现行(见文末勘误节) |
| `drill-mcp-config-guide.md` | 云端主智能体 mcp_servers 配置指南(tick 引擎时代,逐工具白名单) | 🔴 已取代——平台只能按 MCP 服务勾选,见 `2026-08-25-confrontation-agent-prompts.md` |

## 关联目录

| 目录 | 说明 |
|---|---|
| `../doc/` | 数据权威蓝图、演示验收记录、底层 SDK 包文档(packages/)、MCP 文档(mcp/)、archive/ 历史归档 |
| `../deploy/` | 部署资产(docker-compose / Dockerfile.bff / Dockerfile.mcp / deploy-server.sh) |
| `../mcp-server/` | 场景命令 MCP 服务(独立子包,src 13 文件 + 10 测试文件/97 用例,17 工具) |
