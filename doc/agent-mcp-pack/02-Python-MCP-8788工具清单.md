# Python MCP（`firerescue-business-mcp`，8788）工具清单

> 源文件：`znya_jjxf119/server/app/mcp/server.py`（FastMCP）。
> 唯一职责：业务事实、空间点位、正式预案、力量可用性、派遣分析。
> 权威数据：znya PostgreSQL、AMap 路径/地理编码。
> 不应承担：3D 显隐、浏览器状态、演练事件注入。

## 1. 传输与鉴权

- 代码默认 streamable-http `/mcp`，兼容老 SSE；**生产由 env `MCP_TRANSPORT=sse` 钉在老协议**（平台连接方式不变）。端口 env `MCP_PORT`（默认 8788）。
- 鉴权：appKey 常量时间比较。SSE 形态只校验握手端点 `?appKey=`，`/messages` 回传端点放行（再拦会把握手成功的会话卡死在 401——平台工具列表拿不到的根因）；streamable-http 形态校验 header `X-App-Key`。
- `_StripPlatformCtxMiddleware` 在 ASGI 层剥离平台注入的 `workspace_id` / `_context` 参数（否则 pydantic 校验拒绝）。
- 派遣/响应核心逻辑在 `app.services.dispatch`，MCP 与 REST 共用，本文件只做薄包装。

## 2. 工具清单（11 个）

| 工具 | 参数 | 功能 |
|---|---|---|
| `ping` | `message` | 健康检查回显 |
| `query_units` | `keyword?` | 重点单位（id/name/unit_type/district/GCJ02 坐标），限 50 条 |
| `query_stations` | `keyword?` | 消防站（id/name/type/status/坐标/personnel） |
| `query_water_sources` | `keyword?` 或 `lng`,`lat`,`radius=500`,`limit=50` | 消防水源（GCJ02）；给坐标走周边半径查询，否则按名称模糊；排除演示数据 |
| `geocode_address` | `address`, `city?=九江` | 地址/单位名 → 高德 GCJ02 坐标候选 |
| `query_incidents` | `keyword?`, `status?`, `level?`, `limit?=50` | 警情/事件（按状态/级别/地址过滤，按发生时间倒序） |
| `resolve_operational_context` | `query?` / `scene_id?` / `building_id?` / `incident_id?` | **统一作战上下文解析**：任一入口返回关联 building/key_unit/incident/plan ID 图与数据质量 meta；agent 跨数据域前必须先调，禁止猜 UUID |
| `query_force_availability` | `station_ids?`, `keyword?`, `limit?=20`, `include_demo?=false` | 真实可用人员/车辆/装备（fire_force_items 按 status 区分在位/出警/维保/离线）；**禁止用站点编制数冒充可用数**；默认排除 is_demo |
| `query_operational_plan` | `plan_id?` / `building_id?`, `published_only?=true` | 正式预案 + 9 类结构化子表（阶段/灾情想定/力量部署/战斗部署/通信/安全/水源/版本）；published_only 拒草稿 |
| `plan_dispatch` | `target` 或 `target_lng`,`target_lat`, `station_ids?` | 多站派遣路线规划（polyline/距离/时长/红绿灯；不指定站点自动推荐最近 3 主力站） |
| `analyze_response` | `target` 或坐标, `target_min?=5`, `radius_km?=5` | 响应分析：周边主力站 ETA + 分层响应圈（核心/增援/外围）+ 周边水源 |

## 3. 统一返回信封

新增聚合工具（`resolve_operational_context` / `query_force_availability` / `query_operational_plan` 等）统一返回：

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

**角色必须先检查 `warnings/is_demo/completeness/truncated` 再下结论**；不完整/演示/非实时数据必须在输出中显式标注，不能润色成确定事实。
