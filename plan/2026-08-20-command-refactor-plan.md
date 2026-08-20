# 实战指挥重构方案:从"全市图+面板"到"案卷+时间轴"

> 日期:2026-08-20 | 分支:feature/drill-confrontation(随下次发布合入)
> 背景:用户裁定实战指挥以"数据实时反馈"为魂,与态势总览的重复感要靠**分工叙事**消解——
> 态势总览管"面"(空间驱动:全市一张图),实战指挥管"案"(时间驱动:单案全流程)。
> **2026-08-20 用户简化裁定:mock 主线演示即可,不对接 incidents 业务库**——P2 的轮询/同步指示不再做,默认模式改 mock,AI 派遣路线服务两模式共用。
> 现状问题:①与总览同构(全市图+换侧板);②真实模式只拉一次静态快照,"实时"缺位;③"案"的时间骨架缺失。

---

## 〇、定位重述(全模块分工)

| 维度 | 态势总览 | 实战指挥(重构后) |
|---|---|---|
| 视角 | 全市一张图(空间) | 单案作战域(时间) |
| 地图 | 全市域,图层全量 | 选中案件即聚焦案域圈层,圈外淡出 |
| 主线 | 风险研判/巡防值守 | 接警→调派→途中→到场→处置→战评 |
| 实时 | 周期态势 | 案件状态流转 + 车辆行进 + 同步指示 |
| agent | 风险研判(不变) | 辅助决策(不变) |

工程原则:**RealGisMap 共享底座不动**,差异全部做在 CommandView 层(视角聚焦/覆盖层/面板),避免动总览。

---

## 一、P1 案卷重构(核心批,本次实施)

### 1.1 案域聚焦视图

**行为**:选中警情后,地图 flyTo 案点并绘制"案域圈层"(复用 TacticalOverlay 米制圈层),半径分级:
- 核心圈 500m(警戒区,红)
- 作战圈 1.5km(水源/站点/波及单位,橙)
- 支援圈 3km(增援站点,青,虚线)

圈外底图淡出不做(工程代价高、价值低)——用**圈层+聚焦+图层自动开**表达案域感:选中案后自动开启 water/stations/buildings 图层(案域相关),未选中回落默认图层。

**改动**:
- `CommandView.tsx`:选中回调里 gisMap.flyTo + 调用新覆盖层
- `src/components/command/IncidentZoneOverlay.tsx`(新):复用 TacticalOverlay 的圈层投影逻辑(抽公共函数 `lib/gis/rings.ts` 或直接 import 复用),画三圈+图例
- RealGisMap 增加受控图层开关接口:现有 showWater 等 state 提升为可外部设置(`setLayerVisibility(layer, on)` 经 onMapReady 回传或 ref)——**最小实现**:CommandView 选中案后经 CustomEvent/现有事件总线通知 RealGisMap 开图层,不动总览路径

### 1.2 处置时间轴(案的骨架)

**行为**:选中案件 → 警情列表右侧(或灾情变量面板上方)出现"处置时间轴"竖向时间线:
- 节点源(两模式统一):
  - 真实模式:incident.statusHistory(DB 状态 接警/出动/到场/控制/结束 → adapter 已映射)+ **前端动作追加**:选中后每次 AI 派遣/增援/状态刷新都在案卷时间线记一笔(本地累积,刷新丢失可接受,标注演示口径)
  - 模拟模式:liveChannel 事件流(status/rescue/vars)天然就是时间线,直接消费 LiveEvent 历史
- 节点挂载:时间轴节点可带摘要(如"首站到场 10:41 · 城东站 5 车"),点击节点 → 地图 flyTo 相关对象(到场节点飞案点,派遣节点可高亮对应路线)

**改动**:
- `src/components/command/IncidentTimeline.tsx`(新):纯展示组件(节点列表+点击回调),样式参照对抗舱右栏 TimelineNode(色点+badge+时刻)
- `src/mock/incidents.ts`/adapter:statusHistory 已有,补"前端动作记录"的轻量 store(`src/lib/case-timeline.ts` 新:按 incidentId 累积 {ts,label,kind,flyTo?} 数组,subscribe 模式,与 confront-store 同款极简 store)

### 1.3 车辆行进动画(实时感最强点)

**行为**:AI 派遣路线渲染后(现有 dispatchRoutes → renderRoutes),每条路线上生成一个**车标 marker**,按 `duration` 真实时间比例从站点向案点移动(压缩演示:全程 30-60s,可调速 1x/4x);车标到案点 → 该站状态标"到场"→ 时间轴记节点。行进中车标带站名 tip。

**改动**:
- `lib/gis/vehicle-anim.ts`(新,纯函数可单测):
  - `interpolateOnPolyline(polyline, progress): [lat,lng]`(按线段长度加权插值)
  - `compressDuration(sec, speed): ms`(真实 duration → 演示时长)
- `CommandView.tsx`:派遣路线就绪后启动 rAF/setTimeout 步进动画(Leaflet marker.setLatLng);组件卸载/切换案件清理
- 车标图标复用 `lib/map-icons` 风格(消防车 emoji 或 iconDiv)

**边界**:不接真实 GPS(无源);动画为演示口径,面板角落标注"行进模拟"。3D 侧不动(演练车辆巡线已有,GIS 车动是本模块的)。

### P1 验收
- 选中真实警情:地图聚焦+三圈案域+水源/站点图层自动开;
- 时间轴显示状态史+派遣动作,点节点地图响应;
- 派遣路线出现后车标行进,到案点时间轴记"到场";
- 态势总览模块无任何变化;tsc+vitest 全绿(vehicle-anim/case-timeline 有单测)。

---

## 二、P2 实时诚实化(第二批)

1. **真实模式轮询**:fetchIncidents 30s 轮询(visibilitychange 暂停),状态 diff → 变化时 toast+时间轴记节点;
2. **同步指示**:警情列表面板头显示"数据时间 HH:MM:SS · Ns 前同步 · [刷新]"(诚实呈现快照时刻,不伪装实时);
3. **接警模拟器**:真实模式下保留"注入模拟警情"入口(复用 injectIncident)——演示"新警情进来→全链路响应"(列表置顶+toast+agent 上下文),标注模拟来源。

改动:CommandView 轮询 effect+面板头部组件;IncidentListPanel 增头部同步指示。

## 三、P3 减法与合并(第三批,可选拍板)

1. VideoPlaybackPanel 无真实源 → 默认收起/移入"更多";
2. CommandIntelPanel(作战要素)与总览 ResourceOverviewPanel 内容重叠 → 指挥侧只保留"本案相关"(按选中案 1.5km 过滤水源/站点),全市统计删;
3. 顶部状态演示 combobox(原型遗留)从指挥面板移除(生产演示已不需要空态/失败态切换)。

---

## 四、风险与边界

| 风险 | 应对 |
|---|---|
| RealGisMap 图层开关接口改动波及总览 | 用事件通知而非改 props;总览路径零改动验证 |
| 时间轴真实数据稀疏(incidents 表状态不全) | 前端动作记录兜底+演示口径标注 |
| 车辆动画性能(多案多线) | 仅选中案的路线动画;rAF 单循环;卸载清理 |
| znya incidents 无经纬度警情 | 已有过滤(Number.isFinite),案域聚焦跳过 |

## 五、实施顺序

P1 一次提交(三件相互独立可分 commit):①案域视图 ②时间轴 ③车动 → 浏览器实测(本地 dev+生产数据)→ P2 → P3 拍板后。
