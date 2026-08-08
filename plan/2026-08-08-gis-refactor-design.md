# GIS 底座结构重构设计（子项目 1 / 策略 A）

> 2026-08-08 brainstorming 结论。属于"GIS 底座优化"四方向（性能/结构/视觉/分析）的第 1 个子项目。
> 排期背景：暂无实际性能症状，属预防性重构；为后续视觉、性能、分析三个子项目铺路。

## 一、目标与红线

**目标**：拆解 `RealGisMap.tsx`（1786 行 / 70KB，8 类职责混杂），消灭双份代码与 API 层重复，顺带清理死代码与过期数据。

**行为保真红线**：
- 不写新功能、不改交互、不改样式
- 订阅源、effect 依赖数组、防抖/seq 语义逐字保留
- 唯一例外：清债三项（删 `geo-convert`、修南京默认中心/过期 mock、修 roadmap 坐标系描述）

## 二、现状痛点（已确认）

1. `RealGisMap.tsx` 1786 行：50+ useState、20+ useEffect，底图/图层/面板/路线/sceneLog/命令面板全塞一处
2. 路线渲染双份代码：`planRoutes`（RealGisMap.tsx:548-596）与 sceneLog `showRoute` 执行器（1526-1556）几乎逐字重复（色板、tipHtml 模板、seg 锚点算法）
3. API 层重复：`water/key-units/key-buildings/incidents/force.ts` 各自手写 `getJson`/`mutate`/分页
4. 死代码 `lib/geo-convert.ts`（62 行 + 测试，零业务调用，与"全库 GCJ02"定论相悖）
5. 过期数据：`src/mock/sceneLog.ts` 默认中心在南京；`src/mock/stations.ts` mock 坐标在南京
6. 文档过时：`plan/situation-overview-roadmap.md:132` 写"站/水 WGS84"，与代码定论（全库 GCJ02）矛盾

## 三、目标模块结构

```
web/
├── lib/
│   ├── http.ts                        # 【新】getJson / mutate / fetchAll,API 层共用
│   └── gis/                           # 【新】纯函数渲染器,根 vitest 覆盖
│       ├── route-render.ts            # 路线 polyline + tipHtml + seg 锚点(面板与 MCP 通道共用)
│       ├── popup-html.ts              # popupForKeyUnit / popupForKeyBuilding / 站/水/警情 popup
│       ├── marker-html.ts             # 单位警情态/风险角标 iconHtml 组装
│       └── palette-items.ts           # 命令面板条目构建(动作/单位/地址)
├── src/
│   ├── api/                           # 5 文件改用 lib/http.ts,只留端点拼装 + mapper
│   └── components/gis/
│       ├── RealGisMap.tsx             # 编排者:状态声明 + hook 组装 + JSX,目标 ≤850 行(用户裁决:JSX/圆环动作/命令面板接线属组件层合理职责)
│       └── hooks/
│           ├── use-leaflet-map.ts     # 初始化/底图切换/tileerror 降级/zoom 同步
│           ├── use-gis-data.ts        # 7 个数据加载 effect
│           ├── use-layer-visibility.ts# 7 个显隐 effect → 配置表循环
│           ├── use-deploy-routes.ts   # 派遣面板状态 + planRoutes + clearRoutes
│           ├── use-coord-fix.ts       # 坐标修正面板状态组(pickMode/geoCandidates/draftCoord)
│           ├── use-entity-form.ts     # 点位增删改状态组
│           └── use-scene-bridge.ts    # sceneLog 订阅 + flyTo/addMarker/resetView/showRoute
```

## 四、关键边界决策

1. **图层渲染 effect 留在编排者，函数体下沉为 `lib/gis` 纯函数**。渲染器签名形如
   `renderKeyUnits(layer, units, incidents, zoom, { onRadial, onDeploy })`。
   effect 不搬进 hook 的原因：它们依赖组件层回调（openRadial/openDeploy）与 marker 注册表 ref，
   搬迁要传七八个 ref 反而更绕。收敛的是代码量，不是 effect 数量。
2. **marker 注册表（markersRef 等 7 个 Map）留在编排者**。sceneLog 执行器与圆环"详情"都要按 id
   找回 marker 弹 popup，查找关系是全局的。
3. **不引入新状态库**。面板群用 `use-coord-fix` / `use-entity-form` 各收敛为"一个 state + 一组操作"。
4. **顺道清债**：删 `lib/geo-convert.ts` 及其测试；`sceneLog.ts` 默认中心改九江
   `[29.66734, 115.96498]`；`mock/stations.ts` 坐标改九江；roadmap 坐标系段落改为"全库 GCJ02"。

## 五、核心接口

### lib/http.ts

```ts
export async function getJson<T>(url: string): Promise<T>
export async function mutate<T>(url: string, method: 'POST'|'PUT'|'DELETE', body?: unknown): Promise<T>
export async function fetchAll<T>(pageUrl: (page: number) => string, pick: (d: any) => T[]): Promise<T>
```

各 API 文件删私有实现，行为不变（错误信息格式、翻页上限 2000 等均保留）。

### lib/gis/route-render.ts

```ts
export interface RouteRenderItem {
  stationName: string; polyline: [number, number][];
  distance?: number; duration?: number; trafficLights?: number;
}
export const ROUTE_COLORS: readonly string[]
export function renderRoutes(layer: L.LayerGroup, routes: RouteRenderItem[]): {
  bounds: L.LatLngBounds | null; summary: PlannedRoute[];
}
```

- `planRoutes`（面板触发）：driving 结果 → 组装 `RouteRenderItem[]` → `renderRoutes` → bounds 适窗、summary 喂 `setPlanned`
- sceneLog `showRoute` 执行器（MCP 触发）：params 直接取 `RouteRenderItem[]` → 同一 `renderRoutes`
- tipHtml 模板、`0.3 + idx*0.18` 锚点算法、色板从此只有一份

### use-leaflet-map.ts

```ts
export function useLeafletMap(rootRef, onDrawCreated): {
  mapRef, layers: { boundary, stations, water, highlight, keyUnits, incidents, buildings, regions, route, temp },
  mapInited, zoom, baseMap, setBaseMap, tilesFailed,
}
```

11 个 LayerGroup ref 收进一个 `layers` 对象。

### use-scene-bridge.ts

```ts
export function useSceneBridge(deps: {
  mapRef, layers, stationsRef, waterRef,
  markers: { station, water },
  setPlanned: (r: PlannedRoute[]) => void;
}): void
```

内部完成订阅 + flyTo/addMarker/resetView/showRoute 分发；showRoute 分支调 `renderRoutes`。

**数据流不变**：hook 只是现有 effect 的搬家。隐藏行为（如水源"数据集没变就跳过 setState 保 popup"）搬家时加注释显式化。

## 六、迁移顺序（每步独立可提交、可回滚）

| 步 | 内容 | 风险 | 验证 |
|---|---|---|---|
| 1 | `lib/http.ts` + 5 个 API 文件去重 | 低 | 现有测试 + build |
| 2 | `lib/gis/route-render.ts` 抽取，双份代码合一（先于搬家，只搬一份） | 低 | 新增单测 |
| 3 | 清债：删 geo-convert、修 sceneLog 中心、修 mock 坐标、修 roadmap | 低 | vitest + grep 零引用 |
| 4 | `use-leaflet-map` | 中 | 冒烟：底图切换/缩放/降级 |
| 5 | `use-gis-data` + `use-layer-visibility` | 中 | 冒烟：图层开关、水源三级缩放 |
| 6 | `popup-html.ts` + `marker-html.ts` + 渲染 effect 函数体下沉 | 中 | 单测 + 冒烟点击/右键 |
| 7 | `use-deploy-routes` + `use-coord-fix` + `use-entity-form` | 中高 | 冒烟：派遣/坐标修正/增删改全流程 |
| 8 | `use-scene-bridge` + `palette-items.ts` | 中 | 冒烟：MCP showRoute 回灌、Ctrl+K |
| 9 | 收尾：`RealGisMap.tsx` ≤850 行验收（用户裁决），注释头更新 | — | `/verify` 全量 |

## 七、测试策略

- 新增单测只针对 `lib/` 纯函数（根 vitest 覆盖范围）：
  - `route-render`：色板轮换、tipHtml 含站名/ETA、summary、bounds
  - `popup-html`：警情态追加、已建模标记
  - `marker-html`：警情优先于风险角标的互斥逻辑
  - `palette-items`：动作过滤、分组顺序
- hook 不写单测（React+Leaflet 耦合，性价比低），靠冒烟清单人工验证
- 错误处理保持现状（catch 静默 + toast），不顺带"改进"

## 八、回滚策略

每步一个 commit（`refactor(gis): ...`，Conventional Commits），出问题单步 revert。

## 九、后续子项目（不在本设计范围）

- 子项目 2：视觉与体验（暗色滤镜调优、marker 视觉体系、聚合气泡样式、loading/空态）
- 子项目 3：性能与加载（Canvas renderer、视口驱动推广到单位/建筑/警情）
- 子项目 4：数据与分析（等时圈覆盖盲区、风险热力图）
