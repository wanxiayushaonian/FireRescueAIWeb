# Phase 1 — 场景聚焦工具(focus_objects / focus_floors + list_floors)设计

- 日期:2026-08-04
- 范围:在 Phase 0(`fly_to`)基础上,新增 agent 的"引导用户看某处"能力
- 关联:`plan/2026-08-03-phase0-mcp-bridge.md`(Phase 0 Task 7 注释点名的 Phase 1 工具)

## 背景与目标

Phase 0 打通了 `agent → MCP → /scene-events → 浏览器 → 场景` 的命令链路,落地了 `list_fire_devices`(读)与 `fly_to`(写)。Phase 1 扩展聚焦类能力:

- **`focus_objects`**:高亮一组设备 + 镜头框住,让用户立刻看到"这几个东西"。
- **`focus_floors`**:隔离显示选中楼层,看清楼层内部布局。
- **`list_floors`**:提供楼层清单,让 agent 知道有哪些楼层、拿到 id。

### 非目标(留作后续)

- `show_route`(路径)、`draw_zone`(区域)—— 需接 BFF 路径/区域数据契约,工作量大,单独设计。
- 高亮颜色自定义 / 设备状态联动色 —— 固定告警橙红即可。
- `focus_floors` 叠加镜头飞行 —— 本期仅隔离显示。

## 工具清单与数据契约

### 读工具:`list_floors`

| 项 | 说明 |
|---|---|
| 输入 | 无(隐式用 `SCENE_ID`) |
| 输出 | `{ id, name, building_name? }[]`,id 供 `focus_floors` 用 |
| 数据源 | 复用 BFF `/api/ustudio/tree`,MCP 端拍平,节点 `type` 匹配 `story\|floor\|楼层\|层$`(与 `overview` 的 `STORY_PATTERN` 一致) |
| 缓存 | 与 `list_fire_devices` 共享 tree 拉取(原 device cache → 改名 tree cache,共用 TTL) |

### 写工具:`focus_objects`

| 项 | 说明 |
|---|---|
| 输入 | `{ ids: string[] }`(对象 id,来自 `list_fire_devices`) |
| 行为 | 高亮这些对象(`highlightObject`,固定告警橙红 `#f87171`)+ 镜头自适应框住 |
| 镜头 | 单对象 → `flyToObject`;多对象 → 包围盒 `setCameraViewpoint` |
| 状态 | 调用即替换(先清旧高亮再高亮新的);`ids: []` → 清除全部高亮 |
| 命令 | `publishCommand({ tool:'focus_objects', args:{ ids } })` |

### 写工具:`focus_floors`

| 项 | 说明 |
|---|---|
| 输入 | `{ story_ids: string[] }`(楼层 id,来自 `list_floors`) |
| 行为 | 隔离显示选中楼层(其余层隐藏) |
| 实现 | `runtime.setViewMode(params, treeData, storyIds)` |
| 状态 | 调用即替换;`story_ids: []` → 恢复全楼层显示 |
| 命令 | `publishCommand({ tool:'focus_floors', args:{ story_ids } })` |

## 关键设计选择

### 1. `list_floors` 复用 tree,不新增 BFF 端点

`tree` 接口已含楼层节点(`getFireDeviceList` 已在用)。MCP 端按 `STORY_PATTERN` 拍平楼层,与 `getFireDeviceList` 同源同模式。原设备缓存改名 `tree cache`,由 `list_fire_devices` / `list_floors` 共享,避免重复拉 14MB tree。**取舍**:不引入专用 floors BFF 端点(YAGNI)。

### 2. `focus_objects` 多对象框住 → 新增 `SoonspaceRuntime.focusOnObjects`

现有 `flyToObject` 只能单对象。新增 `focusOnObjects(ids[])`:
- **单对象**:委托 `flyToObject` + `highlightObject`。
- **多对象**:`highlightObject` 全部 + 算对象包围盒(box3 并集)+ `setCameraViewpoint` 框住。
- **空数组**:清除已高亮对象(`clearObjectHighlight`),镜头不动。

### 3. `focus_floors` 隔离 → `runtime.setViewMode`

handler 调 `runtime.setViewMode(params, treeData, storyIds)`。`treeData` 由前端按 `currentSceneId` 拉取(与 `list_floors` 同源 tree),空 `storyIds` 恢复全显示。`setViewMode` 的 `params` 视引擎需要传入(默认楼层隔离视图模式,实现时确认取值)。

## 数据流

```
list_floors(读):  agent → MCP handleToolCall → bff-client.getFloorList(命中 tree cache 或 BFF /tree)→ 拍平楼层 → 返回 agent
focus_objects(写):agent → MCP publishCommand → /scene-events → 前端 dispatch → handler → runtime.focusOnObjects(ids) + highlightObject
focus_floors(写): agent → MCP publishCommand → /scene-events → 前端 dispatch → handler → runtime.setViewMode(..., storyIds)
```

## 落点文件

- `mcp-server/src/tools.ts`:`TOOLS` 加 3 项;`handleToolCall` 加 `list_floors` / `focus_objects` / `focus_floors` 分支
- `mcp-server/src/bff-client.ts`:加 `getFloorList`(tree 拍平楼层);原设备缓存改名/共享为 tree cache
- `mcp-server/src/__tests__/tools.test.ts`:3 工具测试
- `lib/scene-command-bus/handlers.ts`:`registerDefaultTools` 加 `focus_objects` / `focus_floors` handler
- `lib/scene-command-bus/__tests__/handlers.test.ts`:`dispatch` 测试
- `lib/soonspace-runtime.ts`:新增 `focusOnObjects(ids[])`;楼层隔离直接用 `setViewMode`(若需额外封装再补)
- `lib/scene-command-bus/types.ts`:`SceneSdkLike` 扩展(`highlightObject` / `focusOnObjects` / `setViewMode` 最小签名)

## 错误处理

- 写工具 fire-and-forget:handler 内错误由 `dispatch` 的 try/catch 隔离(已有),单个 id 无效不影响其他。
- `focus_objects`:对象 id 不存在(`getObjectById` 空)→ 跳过该项并日志;框住只用有效对象;全部无效则仅清除高亮。
- `focus_floors`:story id 不存在 → `setViewMode` 行为由引擎决定(忽略无效),日志。
- `list_floors`:BFF tree 失败 → 沿用 `bffFetch` 的超时/错误透传。
- ack 文案:`focus_*` 沿用 `fly_to` 改造后的"已下发/无回执"措辞;空数组清除回"已清除聚焦"。

## 测试策略

- **MCP `tools.test.ts`**
  - `list_floors` 返回楼层清单(mock `bff-client` tree)
  - `list_fire_devices` / `list_floors` 共享 tree cache(tree 只拉一次)
  - `focus_objects` / `focus_floors` `publishCommand` 带正确 args
  - 空 `ids` / `story_ids` 也 `publishCommand`(清除命令)
- **前端 `handlers.test.ts`**
  - `focus_objects` `dispatch` → `sdk.focusOnObjects(ids)` 被调
  - `focus_floors` `dispatch` → `sdk.setViewMode` 被调
  - 空数组 → 调用清除路径
- **`runtime.focusOnObjects`**:单对象走 `flyToObject`、多对象走 `setCameraViewpoint`(依赖 ssp mock;断言分支调用)

## 验收标准

- `list_floors` 返回真实楼层列表(agent 能据此回答"有几层")。
- `focus_objects(["某设备 id"])` 场景高亮该设备 + 飞向它;多 id 高亮全部 + 框住;`[]` 清除高亮。
- `focus_floors(["某层 id"])` 场景隔离显示该层;`[]` 恢复。
- 全部改动通过 `npm run typecheck`、根 `npm test`、`cd mcp-server && npm test`。
