# 增量第 4 步:GIS 底座(2D 地图真实化 + 空间能力自足)

- 日期:2026-08-05
- 范围:`overview` 模块的 2D 地图从 GisMapPlaceholder(mock SVG 线性投影)升级为**真实天地图底图**,消防站点位真实化,坐标转换/半径查询自足实现(不依赖平台 MCP)
- 关联:
  - 架构纲领:`2026-08-05-incremental-integration-architecture.md`
  - 上一步:`2026-08-05-force-resources-real-data-design.md`(执勤力量真实数据,znya 消防站 14 站可用)
  - 平台 MCP 文档:`mcp/空间信息查询及推理.md`(convert/searchCircle/spacequery——agent 专用)

## 背景与关键发现

原型 `GisMapPlaceholder`(overview 模块 2D 地图)是 **mock SVG 线性投影**(道路/点位/路线全部演示),注释明确"接入平台后由 GIS SDK 接管"。探索结论:

1. **平台无 2D 地图渲染 SDK**(ustudio-sdk 是 3D 场景 SDK;mcp 文档只有空间查询/推理能力)
2. **平台 MCP 空间能力无公开 HTTP API**(探测 `/api/gis/v1/convert` 等候选均返回宽松 `errcode 9999` 系统错误,随机路径也 200——网关不暴露这些能力;MCP 是 agent 专用通道)
3. **2D 底图需前端自选** → 用户决策:天地图(免费 key、WGS84、国内网络、政务适配)

**设计原则:GIS 底座完全自足**——2D 底图(天地图)+ 业务点位(znya)+ 坐标转换(自实现数学)+ 半径查询(基于 znya 业务数据)。平台 MCP 空间能力**保留给 agent 驱动场景**(架构第 4 步 handler+智能体),GIS 底座不依赖它。

## 关键决策(用户确认)

1. 方向:**2D 地图真实化 + 空间能力组合**(一次立起底座)
2. 底图:**天地图**(WGS84,key 从 env,用户申请)
3. 空间能力第一批:**convert + searchCircle**,且**自足实现**(convert 用公开数学公式;searchCircle 用 znya 业务数据球面距离过滤)——探测确认平台 MCP 无 HTTP 端点后调整
4. 点位第一批:**消防站(znya 14 站)**,建筑/水源留待后续

## 设计

### 1. 底图:Leaflet + 天地图瓦片

- **Leaflet**(轻量、React 友好、按需瓦片)加载天地图 WMTS 瓦片
- 瓦片 URL 模板:`https://t{t}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}`
  - 天地图 `w`(EPSG:4326 切片)与 `c`(EPSG:3857 墨卡托)两种;适配 Leaflet 时按实际 CRS 选择,深色大屏可对瓦片容器叠加暗色滤镜或选影像底图 `img_w`
- key:`NEXT_PUBLIC_TIANDITU_KEY`(env,gitignored);本地无 key 时组件降级显示(保留坐标网格/点位标注,提示底图未加载)
- 经纬度用 WGS84(天地图原生,与 znya 消防站坐标及 convert 输出一致)

### 2. `RealGisMap` 组件(替换 GisMapPlaceholder)

- **新建** `src/components/RealGisMap.tsx`(Leaflet 地图),overview 模块挂载从 `GisMapPlaceholder` 切换为 `RealGisMap`;`GisMapPlaceholder.tsx` 删除(其 mock 数据与联动逻辑在 RealGisMap 复用真实数据)
- **保留的交互**(第一批):点站弹 InfoWindow(站名/类型/人数/车辆/电话)、缩放控件、sceneLog 订阅联动(地图↔3D 场景↔业务面板)、路线渲染(showRoute 命令的地图表现)
- **暂不渲染**(留待建筑档案/水源接入):建筑点位与建筑 InfoWindow、水源脉冲、mock 道路/演示底图文案
- 去掉"演示底图/平台 GIS SDK 接入区"占位文案

### 3. 消防站点位(真实)

- 数据:`fetchStations()`(`src/api/force.ts`,已有,14 站真实经纬度)→ 地图打点
- 类型配色沿用现有 `TYPE_COLORS`(队站 5 类配色)
- 点站交互:弹 InfoWindow(站名/类型/人数/车辆/电话)+ 写入 sceneLog(`flyTo` 联动 3D 场景)

### 4. 坐标转换 convert(自实现,可 TDD)

- 纯函数 `bd09ToWgs84(lng, lat)` / `wgs84ToBd09(lng, lat)`(百度↔WGS84 公开标准公式:BD09→GCJ02→WGS84 两级纠偏)
- 放 `lib/geo-convert.ts`,单测覆盖(已知坐标对、往返一致性、边界)
- 用途:前端坐标统一 WGS84;若后续接平台/外部数据带百度/GCJ 坐标,可转换

### 5. 半径查询 searchCircle(基于 znya 业务数据,可 TDD)

- 纯函数 `filterByRadius<T>(items, center, radiusM)`:球面距离(Haversine)过滤
- 数据源:znya 业务点位(消防站;后续建筑/水源/设施加入)
- 用途:地图点击某点 → 查询周围 N 米内的消防站/设施(替代平台 searchCircle 的 MCP 依赖)
- 放 `lib/geo-query.ts`,单测覆盖(距离计算、边界、空集)

### 6. 联动(sceneLog 通道,复用现有)

- 地图点站 → `addSceneAction({action:'flyTo', ...})` → 3D 场景定位(已有逻辑)
- 3D/业务面板动作(flyTo/addMarker)→ 地图定位/标注(已有 subscribeSceneLog 逻辑,底图换真实后复用)
- overview 模块:地图 + 执勤力量面板(ForceResourcePanel 已真实化)共存,面板点站 → 地图聚焦

## 测试与验证

- **TDD**:`lib/geo-convert.test.ts`(BD09↔WGS84 往返 + 已知对)、`lib/geo-query.test.ts`(Haversine 距离 + 半径过滤 + 边界)
- **组件走查**:overview 模块显示天地图底图 + 14 消防站点位;点站 InfoWindow + 3D 联动;无 key 降级可见
- **三绿**:typecheck + build + vitest;既有链路回归(执勤力量/3D 场景不受影响)

## 范围边界

- **不做**:不接建筑/水源/设施点位(架构第 3 步建筑档案做);不调平台 MCP 空间能力(GIS 底座自足,平台能力留给 agent 场景);不动 3D 场景(RealSceneView)
- **保留**:mock 文件(src/mock/geo.ts,其它组件/回退用)、状态演示、overview 模块布局

## 配置

- `.env.local` 追加 `NEXT_PUBLIC_TIANDITU_KEY`(gitignored;用户向天地图官网申请,本地可先留空降级)
- 依赖:新增 `leaflet`(npm)
