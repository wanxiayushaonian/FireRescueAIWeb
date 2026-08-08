# GIS 底座性能与加载设计（子项目 3 / 策略 A）

> 2026-08-08 brainstorming 结论。依赖子项目 1（结构）与子项目 2（视觉）的模块归属。
> 用户裁决：水源保图标+裁剪限量；超限回落聚合气泡（不藏数据）。

## 问题界定（已确认的真实隐患）

1. **重点单位/建筑**：数据全量在前端（千级/数百），但 zoom≥14 渲染时**无视口裁剪**，千级 divIcon 全进 DOM
2. **水源**：bbox 加载（≤2000/视口）但密集城区视口内 divIcon 可达数百~2000，平移全量重建
3. 警情/区域/边界/消防站量级小，不动

**技术约束**：`L.canvas()` 对 divIcon（DOM marker）无效；marker 视觉体系（子项目 2）建在 divIcon 上 → 不走 Canvas，走"裁剪 + 限量 + 回落聚合"。

## 一、视口裁剪渲染（重点单位/建筑）

- `lib/gis/` 新增纯函数：`cullToBounds<T>(items: T[], getLng: (t: T) => number, getLat: (t: T) => number, bounds: { west: number; south: number; east: number; north: number }): T[]`（可单测）
- `use-leaflet-map` 新增导出 `viewportTick: number`——moveend 300ms 防抖自增（与水源同款模式）；单位/建筑渲染 effect 依赖它，平移后重渲染
- 渲染时按 `map.getBounds().pad(0.1)` 裁剪后再建 marker
- **popup 保活移植**：render-water 的 openId 恢复模式（重建前记 isPopupOpen 的 id → 重建后在新 marker 上 openPopup）移植到 render-key-units / render-key-buildings，避免平移关掉正在看的 popup

## 二、超限回落聚合气泡

- `lib/gis/` 新增纯函数：`decidePointRender(countInView: number, cap: number): 'points' | 'cluster'`（可单测）
- 常量 `POINT_CAP = 800`（集中定义，可调）
- **水源**：zoom≥15 且视口点数 > CAP → 用现有 `gridCluster` 客户端聚合 + `waterClusterSvg` 气泡渲染（点击放大逻辑复用），指示区显示"点位密集，已聚合显示"
- **单位/建筑**：zoom≥14 裁剪后 > CAP → 回落各自 `clusterBubbleSvg`（'#fb7185' / '#60a5fa'）
- 回落是聚合不是截断，放大自然散开；有警情的单位始终逐点（既有规则不变）

## 三、验证

- 单测：`cullToBounds`（边界含/不含、pad 行为）、`decidePointRender`（阈值边界 799/800/801）
- 人工验收：九江市密集区 zoom 15 视口 DOM 节点数对比（前后）、平移流畅度、**淡入动画在 moveend 重建时是否频繁闪烁**（烦则把淡入限定为仅数据变化触发——列为验收观察项，非本设计默认改动）
- 回归：子项目 1/2 冒烟清单中涉及点位渲染与视觉的项

## 非目标（YAGNI）

- 不改水源 bbox 请求策略（已视口驱动）；不动警情/区域/边界图层
- 不引入 leaflet.markercluster 插件；不使用 Canvas renderer
- 不做服务端单位/建筑 bbox 端点（数据已全量在前端，客户端裁剪足够）
