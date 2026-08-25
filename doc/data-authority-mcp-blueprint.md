# 消防智能体数据权威与双 MCP 蓝图

> 状态：现行。适用于 21 号楼演练、四角色智能体和赛事平台“只能按 MCP 服务勾选”的配置方式。
> 核心原则：数据库回答“档案和业务事实”，uStudio 回答“场景里实际建了什么/当前看到了什么”，DrillSession 回答“本局演练发生了什么”。三者不能互相冒充。

## 1. 两个 MCP 的职责

| MCP 服务 | 唯一职责 | 权威数据 | 不应承担 |
|---|---|---|---|
| `firerescue-business-mcp`（Python，8788） | 业务事实、空间点位、正式预案、力量可用性、派遣分析 | znya PostgreSQL、AMap 路径/地理编码 | 3D 显隐、浏览器状态、演练事件注入 |
| `firerescue-mcp`（Node，8787） | 3D/GIS 操作、uStudio 场景读取、DrillSession、演练对抗控制 | uStudio 场景树、在线浏览器、服务端 DrillSession；兼容读取部分 znya 数据 | 判断真实力量是否可用、把场景模型数量当业务台账 |

Node MCP 中的 `query_building_profile/query_facilities/query_key_parts/query_knowledge` 是当前兼容工具，数据仍来自 znya，而非 Node 自己拥有。后续新增业务查询必须优先放到 Python MCP，避免继续扩大混合边界。

## 2. 数据来源与业务用途

| 业务问题 | 权威来源 | 主键/关联键 | 当前工具 | 可信度规则 |
|---|---|---|---|---|
| 这是哪栋楼、关联哪个场景/单位/警情/预案 | `key_buildings/key_units/incidents/emergency_plans` | `building_id`、`scene_id`、`incident_id`、`key_unit_id` | `resolve_operational_context` | 任何角色先解析 ID，禁止从名称猜 UUID |
| 建筑高度、层数、用途、结构、周边 | znya 建筑档案 | `building_id` | `query_building_profile` | 档案事实；空字段不得由模型补造 |
| 重点部位、危险性、责任人、出口 | `key_floors` | `building_id` | `query_key_parts` | 业务台账；自由文本楼层需谨慎匹配 |
| 消防设施账面数量、状态、位置 | `fire_facilities` | `ref_type=key_building + ref_id=building_id` | `query_facilities` | 台账事实，不代表已在 3D 建模，也不等于实时传感器状态 |
| 场景中实际建模的楼层/设备 | uStudio 场景树 | `scene_id`、场景对象 ID | `list_floors/list_fire_devices/query_scene_facilities` | 只代表场景包；浏览器离线时不得伪造结果 |
| 台账与模型是否一致 | znya + uStudio | `building_id -> scene_id` | `reconcile_building_facilities` | 返回 `matched/ledger_only/scene_only/count_mismatch` 和完整度 |
| 当前可用人员、车辆、装备 | `fire_force_items.status` | `station_id` | `query_force_availability` | 默认排除 `is_demo=true`；禁止用消防站编制数冒充可用数 |
| 正式作战预案 | `emergency_plans` 及 9 类结构化子表 | `plan_id/building_id` | `query_operational_plan` | 默认只返回发布/审核通过版本；草稿、缺章节、过期均告警 |
| 水源、消防站、警情点位 | znya 对应表 | 业务 UUID + GCJ02 | `query_water_sources/query_stations/query_incidents` | 坐标必须声明 GCJ02；无更新时间时按静态档案处理 |
| 到场路线和 ETA | AMap + znya 点位 | 站点/目标坐标 | `plan_dispatch`，再 `show_route` | 路径是规划结果；是否可派仍由力量可用性决定 |
| 历史预案经验 | pgvector 知识库 | `kb_id/document_id/chunk_id` | `query_knowledge` | 只能作为参考证据，不能覆盖当前正式预案和当前态势 |
| 当前演练状态、特情、决策、评估 | 浏览器 confront-store + 服务端 DrillSession | `drill_id` | `query_scene_state/inject_event/report_decision` | `online=true` 才是实时；`persisted=true` 是最近快照、明确非实时 |

## 3. 统一 ID 图

```text
incident_id ──> building_id ──> scene_id ──> uStudio object/story IDs
     │               │
     └──────────────> key_unit_id
                     │
building_id ─────────┼──> plan_id
                     ├──> fire_facilities.ref_id
                     └──> key_floors

station_id ──> fire_force_items.ref_id
drill_id   ──> DrillSession（与四角色在同一局中保持一致）
```

规则：`scene_id` 不是 `building_id`，场景对象 ID 也不是业务设施 ID。当前设施只能按“规范化类型 + 数量”对账；要做到逐设备一一对应，需在 `fire_facilities` 增加稳定的 `scene_object_id` 并执行一次绑定治理。

## 4. 统一返回信封

新增聚合工具统一返回：

```json
{
  "data": {},
  "meta": {
    "source": "znya-postgresql",
    "source_tables": ["..."],
    "updated_at": "ISO-8601 or null",
    "coordinate_system": "GCJ02",
    "completeness": 0.0,
    "is_demo": false,
    "truncated": false,
    "warnings": []
  }
}
```

角色必须先检查 `warnings/is_demo/completeness/truncated`，再下结论。`is_demo=true`、`completeness<1` 或 `online=false` 的信息必须在输出中标注，不能润色成确定事实。

## 5. 四角色的 MCP 服务勾选

赛事平台只能按服务勾选，因此采用“服务权限 + 提示词工具纪律”，不依赖逐工具白名单。

| 角色 | Python 业务 MCP | Node 场景/演练 MCP | 使用边界 |
|---|---:|---:|---|
| 预案输出 Planner | ✓ | ✓ | 先解析上下文、正式预案和力量，再读取场景/台账并输出初始部署；不得注入特情 |
| 对抗 Adversary |  | ✓ | 读取建筑/重点部位/当前演练状态，只调用 `inject_event`；每轮特情类型、位置、机制和影响需变化 |
| 指挥 Commander | ✓ | ✓ | 查真实力量/水源/路线，读取当前态势，调用 `report_decision` 并按需渲染；不得注入特情 |
| 评估 Evaluator |  |  | 调用方直接传入完整时间线和评估证据；评估阶段不挂 MCP，避免引入不可控外部状态 |

平台没有逐工具勾选不妨碍运行，但提示词必须明确“允许调用”和“禁止调用”，并在应用侧记录每个角色的 tool call，赛后检查越权。

## 6. 一次演练的标准调用顺序

1. Planner 调 `resolve_operational_context`，锁定 `building_id/scene_id/plan_id`。
2. Planner 并行取 `query_operational_plan`、`query_force_availability`、建筑档案、重点部位、设施对账；缺失项进入 `warnings`。
3. Planner 形成可追溯初始部署；路线需先 `plan_dispatch`，后由 Node `show_route` 渲染并查命令回执。
4. Adversary 每轮先 `query_scene_state`，读取已用 `specialType/location` 和演化态势，再注入不同机制的特情。
5. Commander 读取新态势和可用力量，形成决策并 `report_decision`；不能重复使用开局静态数据代替当前态势。
6. 浏览器每次状态变化主动同步 DrillSession；在线查询也会刷新服务端快照。
7. 调用方把完整事件—决策序列和评估证据传给 Evaluator；离线恢复快照必须标记非实时，Evaluator 不另行调用 MCP。

## 7. 当前已补齐与仍需治理

已实现：统一上下文解析、真实力量可用性、结构化正式预案、设施跨源对账、服务端 DrillSession 与浏览器主动同步。

仍需后续数据治理：

- 给 `fire_facilities` 增加 `scene_object_id`，把“类型数量对账”升级为“逐设备绑定”。
- 将旧查询工具逐步统一为 `{data, meta}`，特别是水源、警情、站点和知识库。
- `plan_dispatch` 目前应在调用前显式取得可用力量；后续把车辆能力/人员/装备约束直接合入派遣算法。
- 给可用力量建立更新时间 SLA；超时数据自动降级为“档案状态”，而不是“实时状态”。
- 将 DrillSession 从单文件升级为 PostgreSQL/Redis（当并发演练、多实例部署或审计保留成为要求时）。
