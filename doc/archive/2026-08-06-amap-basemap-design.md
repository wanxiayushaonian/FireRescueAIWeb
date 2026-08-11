# 工作包 1:地图底图 天地图 → 高德 设计

> **Brainstorming 产物。** 后续用 writing-plans 出实施计划(改动小,计划可极简)。

## 目标

将态势总览 2D 地图(`RealGisMap.tsx`)底图从天地图切换为高德矢量瓦片,解决天地图配额紧张问题,并为工作包 2(高德路线规划)铺垫同源 GCJ02 坐标系。

## 背景

- 天地图配额少,大屏长时间运行易触上限
- 后续路线规划用高德(天地图无此服务),底图与路线规划同源可避免坐标系混用
- 天地图耦合极薄:仅 `RealGisMap.tsx:17/19` 两行瓦片 URL(`vec_w` 底图 + `cva_w` 注记)+ `NEXT_PUBLIC_TIANDITU_KEY` 门控

## 现状(关键事实)

| 项 | 现状 |
|---|---|
| 坐标转换 | `lib/geo-convert.ts` **已导出** `wgs84ToGcj02` / `gcj02ToWgs84`(纯函数,`__tests__/geo-convert.test.ts` 已覆盖)—— **无需新增** |
| 数据层坐标 | 站 / 水入库为 WGS84(经 BD09→GCJ02→WGS84) |
| 天地图耦合 | `RealGisMap.tsx` 两个瓦片 URL + key 门控 + 无 key 降级占位 |
| 高德裸瓦片 | `webrd0{1-4}.is.autonavi.com/appmaptile?...&style=8` 矢量带中文注记,单层,免 key |

## 设计

### 1. 瓦片源替换

- 移除:`vec_w`(底图)+ `cva_w`(注记)双层 + `NEXT_PUBLIC_TIANDITU_KEY` 变量及其门控
- 新增:高德矢量瓦片单层(自带中文地名 / 道路注记)
  - 候选 URL:`https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}`
  - `subdomains: ['1','2','3','4']`
  - 实现时 curl 单张瓦片确认可访问 + 内容正确,再定稿 URL
- 深色滤镜 `gis-dark-filter` 保留(高德瓦片适用,大屏深色风格一致)

### 2. 坐标系:显示层统一 GCJ02(存储层不动)

策略:**数据层(站 / 水)仍存 WGS84,只在 `RealGisMap` 渲染边界转 GCJ02**。`geo-convert.ts` 现成函数直接调用,最小风险、不碰已入库数据。

- `DEFAULT_CENTER` `[29.67, 115.96]` WGS84 → 运行时 `wgs84ToGcj02(115.96, 29.67)` 转换
- 站点 marker:`wgs84ToGcj02(s.lng, s.lat)` → `[g.lat, g.lng]`
- 水源 marker:同上
- sceneLog `flyTo` / `addMarker`:sceneLog 传的是站 / 水 WGS84 → 转 GCJ02 再 `map.flyTo`
- `resetView`:DEFAULT_CENTER 转 GCJ02 后 `setView`
- popup 文本内的坐标:保留显示原始 WGS84(标注为"库内坐标"),避免显示值与数据层不一致造成困惑

### 3. 降级策略调整

- 移除 `TIANDITU_KEY` 门控(高德免 key,不再以"无 key"作为降级条件)
- 新增 tileerror 降级:监听 `tileerror` 事件,连续失败超阈值 → 显示占位网格(`bg-bg-grid`)+ 提示条"底图不可用"
- 复用现有"站 / 水坐标列表"作为瓦片不可用时的文字降级

### 4. 不改的部分

Leaflet `divIcon`(站点菱形"消"徽标 / 水源水滴)、`handleStationClick`、`shouldShowWater`、sceneLog 订阅结构、深色滤镜 —— 全部保留。

## 验证

- [ ] 地图显示高德矢量底图(九江区域地名 / 道路注记清晰)
- [ ] 82 个消防站点位与底图道路对齐(不偏东北、不错位)
- [ ] 水源点(zoom ≥ 13)与底图对齐
- [ ] `flyTo` 站点 / 水源 → 准确居中并开 popup
- [ ] `resetView` → 复位九江中心
- [ ] 瓦片故意断网 / 失败 → 占位降级生效
- [ ] `npm test`(geo-convert 测试不受影响,保持绿)

## 风险

| 风险 | 缓解 |
|---|---|
| 高德裸瓦片非官方接入,极小概率被限 IP | tileerror 降级兜底;若频繁被限,后续申请 JS API key 升级(滑向方案 B 弃 Leaflet) |
| GCJ02 转换近似(`gcj02ToWgs84` 单向误差 < 1e-5) | 仅显示层用,精度足够;数据层不动故无累积误差 |
| 高德瓦片 URL 变动 | 实现时 curl 验证;URL 集中为常量便于替换 |

## 不在本工作包(工作包 2)

- znya `/api/route/driving` 代理端点(持 `AMAP_KEY`,已配入 `.env`)
- web `src/api/route.ts` + `BuildingInfoWindow` / `TacticalOverlay` 改用真实路线规划
- 地图路线 polyline 绘制
- ETA / routeSummary 从 mock(haversine + estimateEtaMin)替换为真实高德结果
