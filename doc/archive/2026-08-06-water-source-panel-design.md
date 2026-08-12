# web 端水源面板 + 地图水源点 设计

- 日期:2026-08-06
- 范围:`overview`(态势总览)模块新增水源消费 —— 独立 `WaterSourcePanel` + `RealGisMap` 水源图层(图标化 + zoom 过滤)
- 数据源:znya `water_sources` 表 614 条(第 1 批已注入),经 web BFF `/api/business/water-sources/` 拉
- 关联:
  - 水源注入:`2026-08-06-water-sources-import-design.md` / [[water-sources-import-done]]
  - GIS 底座:[[incremental-step4-gis-base-done]]
  - 执勤力量面板(复用模式):`ForceResourcePanel.tsx` / `api/force.ts`

## 背景

第 1 批 614 条水源已入 znya `water_sources`。现需 web 端消费:overview 模块加水源面板(独立于执勤力量面板)+ 地图水源点。当前 `RealGisMap` 仅显示 82 消防站(`circleMarker`),`ForceResourcePanel` 仅执勤力量。用户要求:消防站与水源**都用不同图标**(而非纯色点),且水源点按缩放级别显示避免远景密集。

## 目标

1. overview 新增独立 `WaterSourcePanel`(按区浏览/搜索/定位水源)
2. `RealGisMap` 显示水源点(`zoom≥13`),消防站与水源都从 `circleMarker` 改 `divIcon` SVG 图标(不同形状区分)
3. 面板↔地图联动(点水源行 → 地图 `flyTo` + `openPopup`)
4. 不破坏现有 82 站显示与执勤力量面板

## 非目标

- CommandView(指挥模块)地图水源点(后续)
- 水源增删改(只读展示)
- 图标图片资源(用 SVG `divIcon`,无图片依赖)
- 水源聚合(`markercluster`,若后续嫌密集再加)

## 架构与数据流

```
znya water_sources(614)
  ↑ /api/business/water-sources/(BFF catch-all 代理,已存在)
fetchWaterSources(src/api/water.ts,分页 100)
  ↓ mapWaterSource(src/lib/water-mapper.ts)
WaterSource[](前端类型)
  → WaterSourcePanel(总数+类型小计 / 区树 / 清单)
  → RealGisMap 水源层(zoom≥13 divIcon)
```

## 设计决策(已与用户确认)

1. **独立 `WaterSourcePanel`**(非扩展 ForceResourcePanel)—— 职责单一
2. **地图水源 `zoom≥13` 显示**(`zoom<13` 只显消防站)—— 避免远景密集
3. **图标化**:消防站 + 水源 都 `circleMarker`→`divIcon` SVG(站用消防徽标形、水源用水滴/消火栓形,按类型着色)
4. **分类树按区**(濂溪/柴桑/浔阳/彭泽)—— 614 条按类型 612/1/1 无区分度,按区 288/256/42/28 均衡
5. `DraggablePanel` 浮动(与站库面板默认位置错开)

## 新建文件

### `src/api/water.ts`
- `fetchWaterSources(state?: FetchState): Promise<WaterSource[]>`
- 复用 `force.ts` 的 `fetchAll` 分页模式(`PAGE_SIZE=100`,znya 返回 `{items, total}`)
- `state='error'` 抛错,`'empty'` 返回 `[]`,默认 `fetchAll<ZnyaWaterSource>('/api/business/water-sources')` 后 `.map(mapWaterSource)`

### `src/lib/water-mapper.ts`
- `DISTRICT_NAME: Record<string, string>` = `{360404:'濂溪区', 360411:'柴桑区', 360410:'浔阳区', 360406:'彭泽县'}`
- `mapWaterSource(z: ZnyaWaterSource): WaterSource`(字段映射,见下"类型")
- `buildWaterDistrictStats(list): { district, districtCode, count }[]`(按 `districtCode` 聚合,4 区)
- `buildWaterTypeStats(list): { type, count }[]`(按 `type` 聚合:市政消火栓/消防水池/天然水源)
- `ZnyaWaterSource` 类型(对应 znya `water_sources` 字段:id/ref_type/ref_id/water_type/name/status/location_path/longitude/latitude/district_code/extra_attrs)

### `src/lib/map-icons.ts`
- `stationIcon(type: string): L.DivIcon` —— 消防徽标形 SVG,填充色取 `TYPE_COLORS[type]`
- `waterIcon(waterType: string): L.DivIcon` —— 水滴/消火栓形 SVG,色按 water_type:市政消火栓=`#38bdf8`(浅蓝)、消防水池=`#34d399`(绿)、天然水源=`#22d3ee`(青)、其它=`#60a5fa`
- `shouldShowWater(zoom: number): boolean` —— `zoom>=13` 返回 `true`(纯函数,可单测)
- 实现:`L.divIcon({ html: '<svg>...</svg>', className: 'map-icon', iconSize: [w,h], iconAnchor:[w/2,h] })`,深色背景下用亮色填充 + 深色描边保证可见

### `src/components/panels/WaterSourcePanel.tsx`
- 顶部:总数 `StatCard`(水源总数)+ 类型小计行(市政消火栓 N / 消防水池 N / 天然水源 N)
- 区树:濂溪区 / 柴桑区 / 浔阳区 / 彭泽县(各 `count`)+ "全部"项;点选过滤清单
- 清单:每行 `waterIcon`(小)+ name + address;点行 `writeLinkage(w)` → `addSceneAction(flyTo, 坐标)` + `showToast`
- 搜索框:name / address 模糊(同 ForceResourcePanel 模式)
- 状态演示下拉(ok/loading/empty/error)+ `PanelStateView`(同 ForceResourcePanel)
- 滚动懒加载(`visible` + `onScroll`,同 ForceResourcePanel)

## 修改文件

### `src/components/RealGisMap.tsx`
- **消防站**:`circleMarker` → `L.marker([lat,lng], { icon: stationIcon(type) })`;保持 `bindPopup`(name/type/在位/地址/坐标)、`on('click', handleStationClick)`、sceneLog `flyTo` 联动不变
- **新增水源层**:
  - 拉取 `fetchWaterSources()` → `waterSources` state + `waterSourcesRef`
  - `zoom` 监听(`map.on('zoomend')` + 初始):`shouldShowWater(zoom)` 控制水源 layerGroup 显隐(`addLayer`/`removeLayer`)
  - 水源 marker:`L.marker([lat,lng], { icon: waterIcon(type) }).bindPopup(name/type/address/坐标)`
  - sceneLog `flyTo` 联动扩展:`target` 匹配站名失败时再查水源名 → `flyTo` + `openPopup`(waterMarkersRef)
- **无 key 降级**:水源点也并入降级文字列表(与站并列)

### `src/App.tsx`
- overview 新增 `DraggablePanel`(panelId=`water-source`,title="消防水源",icon=`Droplet`,width=380,dock=left,defaultPos=`{x:16, y:460}` 与站库面板 `{x:16,y:16}` 错开)
- `waterPanelOpen` state(默认 `true`,与 `forcePanelOpen` 同在 overview 进入时自动开 —— App.tsx line 71 `if (k === 'overview') setForcePanelOpen(true)` 旁加 `setWaterPanelOpen(true)`);两面板默认位置错开(站库左上 16/16,水源左下 16/460),DraggablePanel 可拖拽调整

### `src/mock/types.ts`
- 加 `WaterSource` 类型(见下)
- `FetchState` 已存在(复用)

## 类型定义

```ts
export type WaterSource = {
  id: string;
  name: string;
  type: string;        // 市政消火栓 / 消防水池 / 天然水源
  lat: number;
  lng: number;
  address: string;     // location_path
  districtCode: string;
  district: string;    // 区名(DISTRICT_NAME 映射)
  status: string;
};
```

## 测试(vitest)

- `tests/water-mapper.test.ts`:
  - `mapWaterSource` 字段映射(含 `district_code`→`district`)
  - `buildWaterDistrictStats`(614 样本 → 4 区计数 288/256/42/28)
  - `buildWaterTypeStats`(612/1/1)
  - `DISTRICT_NAME` 4 区完整
- `tests/map-icons.test.ts`:
  - `stationIcon('特勤消防站')` html 含 `TYPE_COLORS['特勤消防站']` 颜色
  - `waterIcon('消防水池')` html 含绿色标记
  - `shouldShowWater(12)===false`、`shouldShowWater(13)===true`
- 现有测试无回归(typecheck / build / vitest 全绿)

## 风险

| 风险 | 缓解 |
|---|---|
| 614 水源 zoom≥13 全显,中心城区密集 | `divIcon` marker 性能 OK(总计 696 marker);若卡顿后续加 markercluster |
| 图标 SVG 深色背景不可见 | 亮色填充 + 深色描边 + 适中尺寸(站 24px、水源 18px) |
| znya `location_path` 空 | `mapWaterSource` 容忍空 address(`?? ''`) |
| BFF 代理未通 | catch-all 已存在(`/api/business/[...path]`),无需改 BFF;实施时 curl 验证 |

## 后续(follow-up)

- CommandView(指挥模块)地图水源点:复用 `RealGisMap` 水源层
- 水源聚合:`leaflet.markercluster`(若密集)
- 水源编辑(增删改):需 znya 写接口 + 面板表单
