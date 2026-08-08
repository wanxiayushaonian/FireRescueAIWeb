# GIS 子项目4:灾情响应 ETA 分析 + 3D引导 设计

> 四方向策略A(重构先行)的「数据与分析」方向。前置:子项目1(结构重构)/2(视觉)/3(性能)已完成并部署。

**Goal**: 以乐盈广场21号楼(有3D建模)为演示锚点,GIS 提供"灾情响应 ETA 分析"能力,并能引导进入该建筑 3D 建模,形成「态势 → 灾情 → 响应分析 → 3D 救援」的演示叙事链。

**Architecture**: 在现有 `RealGisMap` 编排 + `lib/gis` 渲染器 + `hooks` 分层上叠加两个能力。响应分析**复用现有 `/route/driving` 代理**(每站→灾情点驾车 ETA,已验证可用),前端 `lib/gis` 纯函数 + 渲染器 + `use-incident-response` hook 编排,站点按 ETA 染色 + 一个 5min 估算参考圆;3D引导复用 `scene-command-bus` 事件机制,选中建筑经 scene bus 派发 scene_id 切换 `RealSceneView`。

**Tech Stack**: Next.js 16 + React 19 + TS + Leaflet 1.9 + zyna(FastAPI/Postgres) + 高德 driving(`/route` 已有) + uStudio sceneSdk

## 全局约束

- 坐标系:全库 GCJ02(driving 输入输出 GCJ02,无需基准转换)
- vitest node 环境:`lib/gis` 凡需 Leaflet 运行时的模块统一 `import type L` + 函数内 `require('leaflet')`
- `lib/` 不 import `src/`(vitest `@` 别名只映射仓库根)
- amap_key 仅存 zyna 后端,前端经 `/api/business` 代理
- 演示锚点:乐盈广场21号楼(`key_buildings.id = 1c2d4772-831d-4c77-b88a-f9565ad589c7`,坐标 115.9475/29.6612 GCJ02)
- 已知基线失败套件 `lib/scene-command-bus/__tests__/{bridge,handlers}.test.ts` 不动(与本工作无关)

## Task 0.1 结论(2026-08-08 实测,已完成)

驾车等时圈 API **不可用**,改用 ETA 染色方案:
- `v3/direction/reachcircle`:strategy 0/1/2 返回相同的 ~300m 多边形(5min 步行尺度),**不支持驾车**(驾车 5min 应 2–3km);去 strategy 报 INVALID_PARAMS
- `restapi.amap.com/rest/me/isochrone`(新版):**INSUFFICIENT_PRIVILEGES**(10012),需企业权限
- **决议**:放弃"驾车等时圈面",改为 **ETA 染色 + 5min 估算参考圆**(方案③)。复用已验证的 `/route/driving`,无需新增 zyna 端点

## 范围

### 包含
1. **灾情响应 ETA 分析**:每站→灾情点驾车 ETA 染色 + 5min 估算参考圆 + 最近站路线 + ETA 排序面板
2. **3D引导**:选中 21号楼 → 进入 RealSceneView

### 非目标(YAGNI,明确砍掉)
- **风险热力图**:数据不足(`building_height`/`ground_floors`/`underground_floors` 非空率 0%,`incidents` 仅 6 行,`unit_type` 1666/1682 都是"重点单位"无区分度,`floor_area` 93% 但"面积≠风险")
- **全局态势覆盖**:全市缓冲圆常驻(演示聚焦单点)
- **驾车等时圈面**:API 不支持(Task 0.1 结论),路径采样自制成本高收益低,不做
- **多灾情建筑同时分析**:替换式,同一时刻只分析一个

## 需求规格

### 灾情响应 ETA 分析

| 维度 | 规格 |
|---|---|
| 触发 | 选中重点建筑(演示:21号楼) → RadialMenu「响应分析」动作 |
| 参与站筛选 | haversine **5 km**(默认可调)内 + `stations` 图层小眼睛可见的消防站 |
| 时间档 | **5 min** 默认,可切 5/10 min(重算染色阈值与参考圆) |
| 主可视化 | 批量调 `/route/driving`(每站→灾情点)→ 站点按 ETA 染色(<5min 绿/5–10 黄/>10 红) |
| 参考圆 | 以灾情点为中心,5min 估算半径(城区 ~30km/h × 5min ≈ **2.5 km**,10min ≈ 5 km)虚线圆,**标注"驾车估算"**(视觉辅助,精确判断靠 ETA 染色) |
| 最近站路线 | 复用 `use-deploy-routes` 画一条 route-flow polyline(ETA 最小的站) |
| 分析面板 | 参与站按 ETA 升序排列 + 染色图例 + 距离/时间 + 时间档切换 |
| 清除 | 关闭菜单 / 取消选中 / 关 `incidentResponse` 图层 / 选另一建筑 → 清除 |
| 单一性 | 同一时刻只分析一个灾情建筑(再选则替换) |

**关键概念区分**:5 km = 站筛选半径(谁参与);5 min = ETA 染色阈值 + 参考圆半径依据。两者正交。

### 3D引导

| 步骤 | 动作 |
|---|---|
| ① 选中 21号楼 | 地图 `flyTo` 聚焦 + 高亮 |
| ② 入口 | RadialMenu「进入 3D 建模」动作(scene_id 缺失则禁用 + tooltip) |
| ③ 派发 | 读 `key_buildings.scene_id` → scene bus 派发 `ustudio:scene {sceneId}` |
| ④ 切换 | `App.tsx` 新增 scene bus 监听 → `setSelectedSceneId` |
| ⑤ 渲染 | `RealSceneView` 切换到 21号楼 3D(自动 dispose 旧 runtime 重 init,已有能力) |

## 组件分解

### zyna 侧
**无新增**。复用现有 `app/api/route.py` 的 `/route/driving`(前端批量并发调用,每次一对 origin/destination)。

### web 侧
| 文件 | 职责 |
|---|---|
| `lib/gis/eta-render.ts`(新) | ETA→颜色映射(`<5` 绿/`5–10` 黄/`>`10 红)、5min 估算半径(车速×时间)、距离/时间格式化。**纯函数,可单测** |
| `lib/gis/render-response.ts`(新) | 站点染色(替换/叠加 icon class)+ 参考圆(Leaflet circle 虚线)+ 清除。`import type L` + require 模式 |
| `src/components/gis/hooks/use-incident-response.ts`(新) | 编排:选中灾情建筑 → 筛 5km 可见站 → 批量 `/route/driving` 取 ETA → 染色 + 参考圆 + 最近站路线(复用 use-deploy-routes) |
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

### A. 灾情响应 ETA 分析
```
① 选中重点建筑 → RadialMenu
② 「响应分析」→ use-incident-response 触发
③ 取:灾情点坐标 + 可见消防站(stations 小眼睛)
④ 筛选:haversine 5km 内可见站 → 参与站(10–30)
⑤ 画参考圆:灾情点为中心,5min 估算半径(2.5km)虚线圆,标"驾车估算"
⑥ 批量并发调 /route/driving(每站→灾情点) → 各站 ETA + 距离
⑦ eta-render:站点染色(<5绿/5-10黄/>10红)
⑧ 最近站:ETA 最小者,复用 use-deploy-routes 画 route-flow 路线
⑨ 分析面板:参与站按 ETA 升序 + 染色图例 + 时间档切换(5/10min 重算)
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
| 单站 driving 失败/超时 | 该站染色为"未知"(灰),不阻塞其他站;面板标注"ETA 获取失败" |
| 5km 内无可见站 | 空态"5km 内无可见消防站"(提示检查 stations 小眼睛) |
| 全部站 ETA > 阈值 | 正常渲染,面板标红"无站能 5 分钟内到场" |
| amap_key 未配置/配额超限 | driving 代理返回错误 → 受影响站标"未知" |
| 批量 driving 部分失败 | 并发请求各自容错,成功的染色,失败的灰显 |
| 21号楼 scene_id 缺失 | 「进入 3D」动作禁用 + tooltip"未绑定建模场景" |
| 选中建筑无坐标 | 前置校验拦截,不触发 |

## 测试策略

| 模块 | 测试 | 类型 |
|---|---|---|
| `lib/gis/eta-render.ts` | ETA→颜色边界(4:59/5:00/9:59/10:00)、估算半径(5min/10min、车速参数)、格式化 | **纯函数,重点单测** |
| `lib/gis/render-response.ts` | 染色 class 决策、参考圆参数、清除逻辑 | `import type L` + require 模式 |
| hook + 交互 | 选中→分析→部分失败→清除 全链路 | 人工冒烟(lib 单测保底) |

> 无需 zyna 新端点测试(复用 driving,已有测试)。已知基线失败套件不动。

## Task 0.2:乐盈广场21号楼 uStudio scene_id 🟡

由用户提供(uStudio 里 21号楼建模对应的 scene_id)。阻塞 3D引导,不阻塞 ETA 分析。若暂时拿不到,ETA 分析可独立先做,3D引导留待 scene_id 到位。

## 实现顺序建议(供 writing-plans 参考)

1. web `lib/gis/{eta-render,render-response}` + 单测
2. `use-incident-response` hook(筛选 + 批量 driving + 染色 + 参考圆 + 最近站)
3. RadialMenu 动作 + RealGisMap 接入 + 图层开关
4. 数据:`key_buildings.scene_id` 迁移 + 21号楼绑定(待 Task 0.2)
5. 3D引导:scene bus 派发 + App 监听
6. 人工冒烟 + 部署

## 相关
- 前置:[[gis-refactor-subproject1-done]](子项目1/2/3)
- 架构基线:`RealGisMap`(841行编排) + 7 hooks + `lib/gis` 渲染器
- 数据:消防站 556、重点单位 1682、乐盈广场21号楼(id `1c2d4772`)
