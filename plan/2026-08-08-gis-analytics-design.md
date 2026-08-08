# GIS 子项目4:灾情响应等时圈 + 3D引导 设计

> 四方向策略A(重构先行)的「数据与分析」方向。前置:子项目1(结构重构)/2(视觉)/3(性能)已完成并部署。

**Goal**: 以乐盈广场21号楼(有3D建模)为演示锚点,GIS 提供"灾情响应等时圈分析"能力,并能引导进入该建筑 3D 建模,形成「态势 → 灾情 → 响应分析 → 3D 救援」的演示叙事链。

**Architecture**: 在现有 `RealGisMap` 编排 + `lib/gis` 渲染器 + `hooks` 分层上叠加两个能力。等时圈走 znya 新增 reachcircle 代理(复用 `route.py` 的 amap_key/_default_fetch 模式),前端 `lib/gis` 纯函数 + 渲染器 + `use-incident-response` hook 编排;3D引导复用 `scene-command-bus` 事件机制,选中建筑经 scene bus 派发 scene_id 切换 `RealSceneView`。

**Tech Stack**: Next.js 16 + React 19 + TS + Leaflet 1.9 + zyna(FastAPI/Postgres) + 高德 reachcircle(`v3/direction/reachcircle`) + uStudio sceneSdk

## 全局约束

- 坐标系:全库 GCJ02(reachcircle 输入输出 GCJ02,无需基准转换)
- vitest node 环境:`lib/gis` 凡需 Leaflet 运行时的模块统一 `import type L` + 函数内 `require('leaflet')`
- `lib/` 不 import `src/`(vitest `@` 别名只映射仓库根)
- amap_key 仅存 zyna 后端,前端经 `/api/business` 代理
- 演示锚点:乐盈广场21号楼(`key_buildings.id = 1c2d4772-831d-4c77-b88a-f9565ad589c7`,坐标 115.9475/29.6612 GCJ02)
- 已知基线失败套件 `lib/scene-command-bus/__tests__/{bridge,handlers}.test.ts` 不动(与本工作无关)

## 范围

### 包含
1. **灾情响应等时圈**:方案2(反向单点等时圈)为主 + 方案3(驾车 ETA 染色)兜底
2. **3D引导**:选中 21号楼 → 进入 RealSceneView

### 非目标(YAGNI,明确砍掉)
- **风险热力图**:数据不足(`building_height`/`ground_floors`/`underground_floors` 非空率 0%,`incidents` 仅 6 行,`unit_type` 1666/1682 都是"重点单位"无区分度,`floor_area` 93% 但"面积≠风险")
- **全局态势覆盖**:全市缓冲圆常驻(演示聚焦单点,全市态势力噪声)
- **多灾情建筑同时分析**:替换式,同一时刻只分析一个
- **公交/步行等时圈**:仅驾车(消防到场语义)

## 需求规格

### 等时圈响应分析

| 维度 | 规格 |
|---|---|
| 触发 | 选中重点建筑(演示:21号楼) → RadialMenu「响应分析」动作 |
| 参与站筛选 | haversine **5 km**(默认可调)内 + `stations` 图层小眼睛可见的消防站 |
| 等时圈时间 | **5 min** 默认,可切 5/10 min(切换重算) |
| 主可视化(方案2) | 从**灾情点**出发 reachcircle 5 min 可达多边形(深色半透填充 + 青描边);圈内参与站高亮,圈外参与站灰显 |
| 兜底可视化(方案3) | reachcircle 失败/驾车不支持 → 每站→灾情点驾车 ETA,站点染色(<5min 绿/5–10 黄/>10 红)+ 面板按 ETA 排序 |
| 最近站路线 | 复用 `use-deploy-routes` 画一条 route-flow polyline |
| 清除 | 关闭菜单 / 取消选中 / 关 `incidentResponse` 图层 / 选另一建筑 → 清除 |
| 单一性 | 同一时刻只分析一个灾情建筑(再选则替换) |

**关键概念区分**:5 km = 站筛选半径(谁参与);5 min = 等时圈时间(谁能到场)。两者正交。

### 3D引导

| 步骤 | 动作 |
|---|---|
| ① 选中 21号楼 | 地图 `flyTo` 聚焦 + 高亮 |
| ② 入口 | RadialMenu「进入 3D 建模」动作(scene_id 缺失则禁用 + tooltip) |
| ③ 派发 | 读 `key_buildings.scene_id` → scene bus 派发 `ustudio:scene {sceneId}` |
| ④ 切换 | `App.tsx` 新增 scene bus 监听 → `setSelectedSceneId` |
| ⑤ 渲染 | `RealSceneView` 切换到 21号楼 3D(自动 dispose 旧 runtime 重 init,已有能力) |

## 组件分解

### zyna 侧(`znya_jjxf119/server/`)
| 文件 | 职责 | 接口 |
|---|---|---|
| `app/api/isochrone.py`(新) | `/isochrone` 代理高德 `v3/direction/reachcircle` | 入参 `location`(lng,lat)+`time`(分钟)+`strategy`(驾车);出参可达多边形坐标 `[[[lng,lat],...]]`。复用 `route.py` 的 `settings.amap_key`/`_default_fetch` |
| driving ETA | 复用现有 `/route`(方案3兜底),不新增 | `/route?origin=&destination=` 已有 |
| `tests/test_isochrone.py`(新) | mock amap 响应,测解析 | 仿 `test_route.py` |

reachcircle 响应解析:返回 `polylines[].outer`(坐标串,`;` 分隔点,`,` 分隔经纬度)→ 解析为 `[[lng,lat],...]` 多边形环。注意去除可能的 jsonp 包装。

### web 侧
| 文件 | 职责 |
|---|---|
| `lib/gis/isochrone-api.ts`(新) | 调 `/api/business/isochrone` 的纯函数 + reachcircle 响应解析(outer 串 → `[[lng,lat]...]`)。**纯函数,可单测** |
| `lib/gis/point-in-polygon.ts`(新) | 射线法点在多边形内判定(圈内站分类用)。**纯算法** |
| `lib/gis/render-isochrone.ts`(新) | 可达多边形 → Leaflet polygon(深色皮肤,gis-popup 同款 token)+ 站分类(圈内高亮/圈外灰显)。`import type L` + require 模式 |
| `src/components/gis/hooks/use-incident-response.ts`(新) | 编排:选中灾情建筑 → 筛 5km 可见站 → 调 isochrone → 渲染(失败降级 ETA 染色) |
| `src/components/gis/hooks/use-layer-visibility.ts`(改) | `flags` 加 `incidentResponse: boolean` |
| `src/components/gis/RadialMenu.tsx`(改) | 重点建筑菜单加「响应分析」「进入 3D 建模」动作 |
| `src/components/RealGisMap.tsx`(改) | 接入 `use-incident-response` + 图层开关 |
| `src/App.tsx`(改) | 新增 scene bus 监听 → `setSelectedSceneId`(不改 TopBar 下拉既有逻辑) |
| `lib/scene-command-bus/`(复用) | 已有 `ustudio:scene` 事件派发/订阅能力 |

### 数据
| 项 | 处置 |
|---|---|
| `key_buildings.scene_id`(新列,String(36),nullable) | 存该建筑对应的 uStudio scene_id;**仅演示建筑填**(21号楼由用户提供值) |
| alembic 迁移(新) | 加列,nullable,无默认 |

## 数据流

### A. 等时圈响应分析(主)
```
① 选中重点建筑 → RadialMenu
② 「响应分析」→ use-incident-response 触发
③ 取:灾情点坐标 + 可见消防站(stations 小眼睛)
④ 筛选:haversine 5km 内可见站 → 参与站(10–30)
⑤ 调 zyna /isochrone(灾情点, 5min, strategy=驾车) → 可达多边形
⑥ render-isochrone:画多边形(深色半透+青描边)
   + point-in-polygon 分类:圈内站高亮 / 圈外站灰显
⑦ 最近站:复用 use-deploy-routes 一条 route-flow 路线
⑧ 分析面板:参与站列表(覆盖状态+ETA) + 时间档切换(5/10min 重算)

【降级】⑤ 失败/超时/驾车不支持 → driving ETA 染色:
   每站→灾情点驾车时间,染色(<5绿/5-10黄/>10红),面板 ETA 排序
```

### B. 3D引导
```
① 选中 21号楼 → flyTo 聚焦 + 高亮
② RadialMenu「进入 3D 建模」(scene_id 缺失则禁用)
③ 读 key_buildings.scene_id → scene bus 派发 ustudio:scene {sceneId}
④ App.tsx scene bus 监听 → setSelectedSceneId
⑤ RealSceneView 切换 21号楼 3D
```

## 错误处理

| 场景 | 处理 |
|---|---|
| reachcircle 失败/超时/驾车模式不支持 | **自动降级 ETA 染色**,面板标注"等时圈不可用,已用驾车时间估算" |
| 5km 内无可见站 | 空态"5km 内无可见消防站"(提示检查 stations 小眼睛) |
| 所有参与站均在圈外 | 正常渲染,面板标红"无站能 5 分钟到场" |
| amap_key 未配置/配额超限 | zyna 返回明确错误 → web 降级或提示 |
| 21号楼 scene_id 缺失 | 「进入 3D」动作禁用 + tooltip"未绑定建模场景" |
| 选中建筑无坐标 | 前置校验拦截,不触发 |
| isochrone 返回空多边形 | 降级 ETA 染色 |

降级链是核心鲁棒性:方案2(等时圈面)→ 方案3(ETA染色),两者 UI 槽位一致,切换对用户透明(仅面板标注差异)。

## 测试策略

| 模块 | 测试 | 类型 |
|---|---|---|
| `lib/gis/isochrone-api.ts` | reachcircle 响应解析(outer 串 → `[[lng,lat]...]`)、异常响应(空/错误码/无 polylines/jsonp 包装) | 纯函数单测 |
| `lib/gis/point-in-polygon.ts` | 射线法:点在内/外/边上/凹多边形/退化输入 | **纯算法,重点单测** |
| `lib/gis/render-isochrone.ts` | 站分类决策(圈内/圈外)、降级判定 | `import type L` + require 模式 |
| zyna `isochrone.py` | 解析逻辑(mock amap 响应,仿 `test_route.py`) | 单测 |
| hook + 交互 | 选中→分析→降级→清除 全链路 | 人工冒烟(lib 单测保底) |

## Task 0:前置验证(实现前必须完成,不达标则调整方案)

### 0.1 reachcircle 驾车 strategy 实测 🔴
实现 `isochrone.py` 前先用 zyna amap_key 实测 `v3/direction/reachcircle?strategy=<驾车值>&location=115.9475,29.6612&time=5`:
- 返回合理多边形 → 方案2 成立
- 不支持驾车/报错 → 尝试新版 `restapi.amap.com/rest/me/isochrone`(POST,可能需企业权限);仍不行 → **方案3(ETA染色)升为主方案**,等时圈面延后

### 0.2 乐盈广场21号楼 uStudio scene_id 🟡
由用户提供(uStudio 里 21号楼建模对应的 scene_id)。阻塞 3D引导,不阻塞等时圈。若暂时拿不到,等时圈可独立先做,3D引导留待 scene_id 到位。

## 实现顺序建议(供 writing-plans 参考)

1. **Task 0**:reachcircle 驾车实测 + 确认 21号楼 scene_id(决定后续 task 形态)
2. zyna `isochrone.py` 代理 + 测试
3. web `lib/gis/{isochrone-api,point-in-polygon,render-isochrone}` + 单测
4. `use-incident-response` hook + 降级链
5. RadialMenu 动作 + RealGisMap 接入 + 图层开关
6. 数据:`key_buildings.scene_id` 迁移 + 21号楼绑定
7. 3D引导:scene bus 派发 + App 监听
8. 人工冒烟 + 部署

## 相关
- 前置:[[gis-refactor-subproject1-done]](子项目1/2/3)
- 架构基线:`RealGisMap`(841行编排) + 7 hooks + `lib/gis` 渲染器
- 数据:消防站 556、重点单位 1682、乐盈广场21号楼(id `1c2d4772`)
