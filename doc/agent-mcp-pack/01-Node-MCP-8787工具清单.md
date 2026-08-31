# Node MCP（`firerescue-mcp`，8787）工具清单

> 源文件：`web/mcp-server/src/tools.ts`。仓库位置 `web/mcp-server`。
> 唯一职责：3D/GIS 操作、uStudio 场景读取、DrillSession、演练对抗控制。
> 不应承担：判断真实力量是否可用、把场景模型数量当业务台账（新增业务查询必须放 Python 侧）。

## 1. 环境变量（`mcp-server/.env.example`）

```text
MCP_PORT=8787
MCP_APP_KEY=replace-with-real-appkey
WEB_BFF_URL=http://localhost:3000
SCENE_ID=replace-with-scene-id
CORS_ORIGIN=http://localhost:3000
```

## 2. 传输与鉴权

- 代码默认 **streamable-http `/mcp`**（平台 uagent 兼容），兼容老 SSE（`/sse` + `/messages`）。
- appKey：SSE 形态校验握手端点 `?appKey=`，`/messages` 回传端点必须放行（会话卡 401 = 平台工具列表拿不到的根因，2026-08-17 教训）。
- 场景类命令为**异步**：下发返回 `cmd_xxx`，执行结果用 `get_scene_command_status` 查询（10 分钟有效）。

## 3. 工具清单（18 个）

### 场景查询（浏览器在线解析场景包，结果经 ack 回传）

| 工具 | 参数 | 功能 |
|---|---|---|
| `list_fire_devices` | — | 当前场景消防设备清单（id/name/type，id 供 fly_to）；全量只回前 50 条 + 统计防 token 爆炸 |
| `list_floors` | — | 场景楼层清单（id/name，id 供 focus_floors） |
| `query_scene_facilities` | `floor?`, `type?` | 建筑内部消防设施数量统计（按类型/楼层分组），来自 3D 场景包；返回 cmd_id，需再查 `get_scene_command_status` 取结果 |

### 场景动作（下发异步命令，返回 cmd_id）

| 工具 | 参数 | 功能 |
|---|---|---|
| `focus_objects` | `ids[]` | 高亮聚焦一组场景对象并飞向首个；空数组清除高亮 |
| `focus_floors` | `story_ids[]`, `fly_to_first?=true` | 隔离显示选中楼层并聚焦；空数组恢复全楼层（不动视角） |
| `fly_to` | `target` | 3D 镜头飞向指定对象 id |
| `gis_fly_to` | `lat`, `lng`, `zoom?`, `label?`, `layer?` | 2D GIS 地图飞向 GCJ02 坐标并显示脉冲标记；layer=water/units/stations/buildings/incidents，未开图层自动打开 |
| `show_route` | `routes[]`, `target?` | 2D GIS 渲染多站派遣路线（routes 由 Python MCP `plan_dispatch` 规划，本工具只渲染） |
| `get_scene_command_status` | `cmd_id` | 查询场景命令执行回执（ok=已执行 / error+原因 / not_found=未执行或已过期） |

### 业务兼容查询（数据来自 znya，经 web BFF）

| 工具 | 参数 | 功能 |
|---|---|---|
| `query_building_profile` | `building_id` | 重点建筑档案概要（名称/地址/层数/高度/联系人 + 结构设计/周边环境），znya key_buildings |
| `query_facilities` | `building_id`, `floor?`, `type?` | 消防设施台账清单（消火栓/喷淋/报警/应急照明等），znya fire_facilities |
| `query_key_parts` | `building_id` | 重点部位（避难层/消控室/防火分区，含火灾危险性/疏散出口/责任人），znya key_floors |
| `query_knowledge` | `query`, `top_k?=5` | 检索历史预案知识库 chunks（兼容保留；已裁定迁移平台原生知识库） |

### 对账

| 工具 | 参数 | 功能 |
|---|---|---|
| `reconcile_building_facilities` | `building_id` | 对账 znya 设施台账 vs uStudio 3D 实际建模：按类型 matched/ledger_only/scene_only/count_mismatch + 完整度 |

### 演练控制（云端 → 浏览器对抗舱，经 `/scene-events`）

| 工具 | 参数 | 功能 |
|---|---|---|
| `query_scene_state` | `drill_id` | 查询对抗舱演练快照（状态/灾情种子/特情/动态调整/评估）；在线回执 `online:true`，超时降级 DrillSession 持久快照 `persisted:true`（明确非实时） |
| `inject_event` | `drill_id`, `event{type,description,payload}` | 注入对抗特情；type 七选一（wind_shift/explosion/secondary_trapped/equipment_failure/collapse/smoke_spread/evacuation_blocked）且同局不得重复；payload 必含 location + 至少一个非零态势增量（fireLevelDelta/trappedDelta/damageDelta/wind）；对抗舱须 running |
| `report_decision` | `drill_id`, `decision{...}` | 上报主智能体决策（进入对抗时间线，供指挥员采纳/改派与评估）；对抗舱须 running |

### 预案输出

| 工具 | 参数 | 功能 |
|---|---|---|
| `propose_initial_plan` | `plan{response_level*, forces*, tactics*, key_points*, attack_route*, evacuation_route*, safety_controls*, reinforcement_triggers?, evidence?, warnings?}`（* 必填） | 一级预案输出专用无副作用结构化方案提交；仅 Planner preflight 阶段使用，不得用于表示已派遣/已执行 |

## 4. 演练命令链与 DrillSession

```text
agent 工具调用(inject_event/report_decision/query_scene_state/场景动作)
  → mcp-server 发布 SceneCommand(cmd_xxx)
  → GET /scene-events SSE 推送到浏览器
  → SceneCommandBridge / 对抗舱 scene-tools.ts 校验 drill_id + running 态
  → 写 confront-store（纯内存状态）/ 执行 3D/GIS 动作
  → ack 回执（可带 result，如 query_scene_state 的快照）
  → agent 用 get_scene_command_status(cmd_id) 查询结果
```

- **DrillSession 服务端快照**：浏览器 SceneCommandBridge 订阅 confront-store 每次变化（120ms 防抖）PUT `/api/drill-sessions/:id` → BFF 转发 mcp-server drill-session-store（内存 Map + 文件持久化 `/data/drill-sessions.json`，LRU 500 局，重启可读）。每局唯一 drillId（`drill-building-21-<base36>`）。
- **态势演化**：特情 payload 的增量落 store.situation（火势 0–5 级 clamp）。
- 归档回放：快照即对抗舱完整 state，`GET /api/drill-sessions` 轻量索引可列服务端所有局，任意浏览器可只读回放。
