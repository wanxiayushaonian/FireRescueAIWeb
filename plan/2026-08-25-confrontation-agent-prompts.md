# 演练对抗 v2 四角色 Agent 配置索引

> 版本: `confront-v2.2-2026-08-25`
>
> 适配平台真实约束:平台只能按 MCP 服务勾选，不能在 App 内逐个勾选工具。

## 1. 现有两台 MCP 服务

### Node MCP（场景、档案、演练）

逻辑名:`firerescue-scene-drill`，当前服务为 8787 `/mcp`。

服务内会同时暴露:

- 场景查询:`list_fire_devices`、`list_floors`、`query_scene_facilities`。
- 场景动作:`focus_objects`、`focus_floors`、`fly_to`、`gis_fly_to`、`show_route`。
- 回执查询:`get_scene_command_status`。
- 建筑/预案查询:`query_building_profile`、`query_facilities`、`query_key_parts`、`query_knowledge`、`reconcile_building_facilities`。
- 演练工具:`query_scene_state`、`inject_event`、`report_decision`。

### Python MCP（辖区业务、GIS派遣）

逻辑名:`firerescue-business-mcp`，当前服务为 8788 `/mcp`。

服务内会同时暴露:

- `ping`
- `query_units`
- `query_stations`
- `query_water_sources`
- `geocode_address`
- `query_incidents`
- `resolve_operational_context`
- `query_force_availability`
- `query_operational_plan`
- `plan_dispatch`
- `analyze_response`

## 2. 平台勾选方案

| App | Node MCP | Python MCP | 原因 |
|---|---:|---:|---|
| Planner | ✓ | ✓ | 需建筑/预案与辖区力量/水源/派遣支撑初始部署 |
| Adversary | ✓ | — | 需实时演练态势、建筑细节、知识库和 `inject_event`;不需派遣工具 |
| Commander | ✓ | ✓ | 需演练态势/建筑数据与增援、供水、响应分析 |
| Evaluator | — | — | 完整过程数据由调用方直接传入，评估阶段禁止外部工具引入不可控数据 |

## 3. 按服务勾选的重要含义

MCP 服务一旦勾选，App 就可能看到该服务内的所有工具。所以:

1. Prompt 必须分别写出“本角色允许调用”和“虽可见但严禁调用”。
2. 不得再在配置文档中写“只勾选某几个工具”。
3. Prompt 约束只是行为防线，不是安全边界。真正的强权限隔离需要服务端按角色拆端点/密钥，不在本比赛版范围内。
4. 程序化调用时，以用户消息中的结构化态势为本轮权威输入;平台系统 Prompt 提供稳定角色与方法论。

## 4. 可直接复制到平台的完整提示词

- [Planner——预案规划与初始部署](agents/confront-v2-planner.md)
- [Adversary——导调对抗与特情生成](agents/confront-v2-adversary.md)
- [Commander——现场指挥与动态调整](agents/confront-v2-commander.md)
- [Evaluator——过程评估与复盘](agents/confront-v2-evaluator.md)

## 5. 现行运行时分工

```text
Planner 生成初始部署
  ↓
Adversary 读取当前态势+历史，生成新特情
  ↓
程序去重/增量校验，特情落库并演化态势
  ↓
Commander 读取特情+演化态势+历史决策，上报调整
  ↓
人员采纳/人工改派
  ↓
Evaluator 读取完整 timeline 评分复盘
```

## 6. 平台同步状态

2026-08-25 只读检查确认:四个 App 的 `config.instructions` 与 `pub_config.instructions`
仍是 2026-08-17–19 旧版。本文及四份分角色 Prompt 是新权威源，平台尚未同步。
