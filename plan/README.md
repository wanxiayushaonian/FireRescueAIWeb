# web/plan/ 文档索引

> 维护:2026-08-14 ｜ 本文件是 plan/ 下全部文档的唯一入口;权威跨项目技术蓝图见仓库根目录 `项目技术蓝图与实施指南.md`。
> 约定:🟢 现行可执行 / 🟡 已实施(计划已成历史,按需查阅) / 🔴 已废弃或已被取代。

## 权威蓝图(仓库根目录,非本目录)

| 文档 | 说明 |
|---|---|
| `../../项目技术蓝图与实施指南.md` | **总蓝图**:模板能力边界 / 三方依赖边界 / SDK 模型链路 / web 诊断与修复清单 / agent 联动 / 路线图。所有 plan 文档与其冲突时以此为准 |

## 实施计划(带 Task 清单)

| 文档 | 摘要 | 状态 |
|---|---|---|
| `2026-08-03-phase0-mcp-bridge.md` | MCP 桥 Phase 0:SSE 服务端 + SceneCommandBus + fly_to 端到端(含验收记录) | 🟡 已实施,`mcp-server/` 已落地;3D 飞行与真 agent 接入待人工确认 |
| `2026-08-08-gis-refactor-plan.md` | GIS 底座结构重构实施 | 🟡 已实施(RealGisMap 已落地) |
| `2026-08-08-gis-visual-plan.md` | GIS 视觉与体验实施 | 🟡 已实施 |
| `2026-08-08-gis-perf-plan.md` | GIS 性能与加载实施(视口裁剪/聚合) | 🟡 已实施 |
| `2026-08-08-gis-analytics-plan.md` | GIS 灾情响应 ETA 分析实施 | 🟡 部分实施(ETA 染色/响应查询) |
| `2026-08-09-drill-simulation-plan.md` | 演练对抗智能推演实施 | 🟡 大部分完成(AgentRunner/事件树已落地) |
| `2026-08-12-scene-recipe-plan.md` | 3D 显隐 Recipe 编排架构实施(12 Task) | 🟡 已实施(Task 0 双体系裁定与 Task 12 并归**未执行**,见蓝图 §4.4) |
| `znya-deploy-mcp.md` | znya 后端 + Python MCP(:8788)部署规划 | 🟡 6 项待办未完成,业务查询工具生产不可用 |
| `2026-08-19-drill-confrontation-cabin-plan.md` | 演练对抗对抗舱实施(照抄原型+接 agent) | 🟡 已实施(待手动对抗验证) |

## 设计文档(设计意图,供改版参考)

| 文档 | 摘要 | 状态 |
|---|---|---|
| `2026-08-08-gis-refactor-design.md` | GIS 底座结构设计 | 🟡 已实施 |
| `2026-08-08-gis-visual-design.md` | GIS 视觉与交互设计 | 🟡 已实施 |
| `2026-08-08-gis-perf-design.md` | GIS 性能与加载设计 | 🟡 已实施 |
| `2026-08-08-gis-analytics-design.md` | GIS 灾情响应 ETA 设计 | 🟡 已实施 |
| `2026-08-09-drill-simulation-design.md` | 演练对抗智能推演设计(v2) | 🟡 已实施 |
| `2026-08-19-drill-confrontation-cabin-design.md` | 演练对抗对抗舱设计(照抄原型+接 agent) | 🟡 已实施 |
| `situation-overview-roadmap.md` | 态势总览增强与 Agent 智能化路线图 | 🟡 规划参考 |

## 协议实证 / 配置指南(现行有效)

| 文档 | 摘要 | 状态 |
|---|---|---|
| `drill-agent-chat-sse-format.md` | agent-chat SSE 事件格式实测(含 2026-08-14 勘误:字段名契约) | 🟢 现行(见文末勘误节) |
| `drill-mcp-config-guide.md` | 云端主智能体 mcp_servers 配置指南(工具白名单) | 🟢 现行 |

## 关联目录

| 目录 | 说明 |
|---|---|
| `../doc/` | 底层 SDK 包文档(packages/)、MCP 文档(mcp/)、SDK 文档、archive/ 历史归档 |
| `../deploy/` | 部署资产(docker-compose / Dockerfile.bff / Dockerfile.mcp / deploy-server.sh) |
| `../mcp-server/` | 场景命令 MCP 服务(独立子包,src 10 文件 + 7 测试) |
