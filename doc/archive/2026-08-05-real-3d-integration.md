# 增量第一步:接真实 3D + 双通道恢复

- 日期:2026-08-05
- 范围:原型场景区占位 3D → 真实 Soonspace;恢复场景命令双通道(自研 `/scene-events` + 平台 SDK 内置 WS)
- 关联:
  - 架构纲领:`2026-08-05-incremental-integration-architecture.md`
  - 迁壳 spec:`2026-08-05-prototype-migration-shell-design.md`
  - 真实 3D 来源:`components/SoonspaceSceneViewer.tsx`、`lib/soonspace-runtime.ts`

## 背景

迁壳完成后原型大屏在 web 跑通,但 `objects`/`drill` 模块的中央场景区是 `ScenePlaceholder`(占位 3D + mock 视觉)。本步把占位换成真实 Soonspace 3D,并恢复场景命令联动。

### 平台通道现状(排查结论)

`soonspace-runtime.init` 已配 `sdk.init({ config: { hostUrl, appKey }, commandBridge: { panelList, panelSetVisible, showVideo } })`。SDK 内部 `createInternalWebSocket` 自动建平台 WS。**真实 3D 接回 → SDK init → 平台 WS 自动建 → 平台 `invokeTwinsFunction` 推送的可视化 SDK 自动执行**。故"平台通道"随真实 3D 自动恢复,**无需额外搭订阅**。

## 设计决策(已确认)

| 决策 | 选择 |
|---|---|
| Q2 范围 | 接真实 3D + 挂 `SceneCommandBridge` + commandBridge 重接。**原 1b(平台通道)取消**(随 3D 自动) |
| Q3 融合 | **抽核心**:复用 viewer 的 3D 画布 + 场景加载 + runtime,去掉顶栏/门厅/插件/信息卡 |
| ① 场景加载 | **`SCENE_ID`(env)直加载,跳过门厅**;无 `SCENE_ID` 时 fallback 提示 |
| ② commandBridge | **先 stub**(空实现 + TODO),后接原型 `DraggablePanel`/`VideoPlaybackPanel` |
| ③ 动作范围 | **`flyTo`/`highlight`/`switchFloor`/`resetView`**(SDK 直出);`showRoute`/`drawZone`/`addMarker` 留架构第 4 步 |

## 组件设计

### 1. `RealSceneView`(新建 `src/components/RealSceneView.tsx`)

抽 `SoonspaceSceneViewer` 的核心,薄壳组件:

**复用**(从 SoonspaceSceneViewer 抽):
- `viewerCanvas` 容器(ref) + `SoonspaceRuntime`(init/dispose)
- bootstrap:`fetchJson('/api/ustudio/bootstrap?sceneId=...')`
- Draco:`ssp.setModelDracoDecoderPath('/draco/')`
- 场景加载视图(loading/error/progress)—— 简化版(无门厅,无场景切换)
- `ustudio:scene` 事件(SDK 就绪后触发,供 `SceneCommandBridge` 接管)
- 浮层:`SceneInfoCard` + `SceneLogPanel`(从 `ScenePlaceholder` 沿用,显示场景信息 + 动作流水)

**去掉**(原型已有等价或风格冲突):
- 顶栏 `appTopBar`(场景名/楼层/设备搜索/告警/插件/镜头路径/切换场景)—— 原型 `TopBar`/`SideNav`/面板系统已覆盖
- 门厅 `launcher` —— 用 `SCENE_ID` 直加载
- 插件面板 / 镜头路径 / 相机设置 / 点击信息卡 —— 非最小集,留后

**新增**(核心):订阅 `sceneLog`,把 action 映射到真实 SDK:

| sceneLog action | 真实 SDK 调用 |
|---|---|
| `flyTo` | `runtime.flyToObject(target)` |
| `highlight` / `batchHighlight` | `sdk.heighLight(id, color)`(逐个) |
| `switchFloor` | `runtime.setViewMode(...)`(按 `params.floor`) |
| `resetView` | `runtime` 重置视角 |
| `showRoute`/`drawZone`/`addMarker`/`updatePlan` | 忽略(留架构第 4 步),仅记日志 |

**边界约束**:
- **SDK 未就绪时**(场景加载中):动作丢弃 + `console.warn`(不排队,保持简单)
- **target 形式**:原型 `addSceneAction` 多用名字(如 `buildingName`),真实 SDK 要 id(`out_instance_id`)。本步先支持 **target 为 id** 的路径;名字 target 走"记日志跳过",待建筑档案 id 对齐(架构第 3 步)后,面板侧改写 id target

### 2. `App.tsx` 场景区接入

```
{module === 'overview' ? <GisMapPlaceholder />      // 不变(GIS 留后)
 : module === 'objects' || module === 'drill' ? <RealSceneView />  // 替换 ScenePlaceholder
 : ...}
```
+ 挂 `<SceneCommandBridge />`(全局,一次):自研 `/scene-events` 通道,SDK 就绪后 handler 生效。

> `ScenePlaceholder` 文件保留(不删,git 历史 + 增量参考)。

### 3. commandBridge 重接(stub)

`lib/soonspace-runtime.ts` 的 `commandBridge: { panelList, panelSetVisible, showVideo }`:
- 改为先 stub:`{ panelList: () => [], panelSetVisible: async () => ({}), showVideo: () => {} }` + TODO 注释(重接到原型 `DraggablePanel`/`VideoPlaybackPanel` 是后续)
- `generated-panel-runtime` 的 import 保留(后续重接用),仅 init 时传 stub

## 动作数据流(三股 → 真实 SDK,统一记 sceneLog)

```
原型面板/智能体/剧本 ──addSceneAction──→ sceneLog ──订阅──→ RealSceneView ──→ runtime/SDK
agent(/scene-events) ──────────────→ scene-command-bus handler ──→ SDK(+记 sceneLog)
agent(平台 invokeTwinsFunction) ────→ SDK 内置 WS 自动执行(+commandBridge stub)
```

三股统一记 `sceneLog`(`SceneLogPanel` 显示流水);执行各走最短路径。

## 验证标准

- `typecheck` + `build` 绿
- `vitest` 不回归
- `dev`:`objects`/`drill` 模块中央区显示**真实 3D 场景**(非占位)
- `dev`:点建筑档案设施(gis/BuildingInfoWindow 用 id 的)→ 真实飞向高亮
- `dev`:智能体 `flyTo` → 真实镜头移动
- `SceneLogPanel` 动作流水正常显示(三股都记)
- `commandBridge` stub 不报错(平台推送的 panelList/panelSetVisible/showVideo 命令落到 stub)
- `objects`/`drill` 切换/卸载不泄漏(runtime dispose)

## 边界(本步不做)

- `overview` 的 `GisMapPlaceholder`(GIS 真实化,GIS 接入另做)
- `showRoute`/`drawZone`/`addMarker` handler(BFF routes/polygons 数据 + 绘制层,架构第 4 步)
- commandBridge 真实重接到原型面板/视频(先 stub)
- 门厅/场景切换(`SCENE_ID` 直加载)
- highlight 的"名字→id"解析(待建筑档案 id 对齐,架构第 3 步)
- 设备搜索/告警中心/插件面板/镜头路径/相机设置(SoonspaceSceneViewer 的进阶功能,留后)

## 风险点

1. **SCENE_ID 缺失**:本地 `.env.local` 需配 `SCENE_ID`(或 bootstrap 默认);fallback 提示要清晰
2. **target 名字 vs id**:原型 mock 用名字,本步只执行 id target;大量 mock 动作(名字)会"记日志跳过",看起来"没反应"——可接受(占位→真实的过渡,待模块接入)
3. **legacy.css**:SoonspaceSceneViewer 用 `.viewerShell` 等 class。**抽核心后 RealSceneView 不用这些**(用自己的 Tailwind class),故无需挂 legacy.css。若复用了某些 class 再按需取
4. **双场景区切换**:`objects`↔`drill` 切换会 dispose/re-init runtime,注意 `ustudio:scene` 事件 + SceneCommandBridge 重连时序(已有 `manageSceneBridge` 覆盖)
