# 根 components 模板遗留调研

> 日期：2026-08-12  
> 范围：`components/` 根目录 17 个模板遗留组件（**均不在运行链路**：`src/App.tsx` 不引、`src/` 下无文件 import，仅根 components/ 互引）  
> 目的：理解用途，判断哪些值得迁移到 `src/components/` 重新启用  
> 关联：记忆 `dual-components-root`、`doc/ref/arch_ref.md`

---

## 一、分类汇总

### A. 值得加进来（src 当前缺的独特能力）

| 组件 | 用途 | 服务模块 | 优先级 |
|---|---|---|---|
| **UStudioVideoDialog** | FLV/HLS/原生视频播放弹窗（事件驱动，自带 UI） | 一/五 | 🔴 高 |
| **AlarmCenter** | 告警 30s 轮询 + 顶栏徽章 + 横幅 + 点击定位 | 二/五 | 🔴 高 |
| **KeyHintOverlay** | WASD/QE 按键提示浮层（71 行零依赖） | 3D 操控 | 🟡 高 |
| **CameraPathPanel** | 镜头路径点串联 + 播放动画 + agent 可控（`__cameraPathTool`） | 一/三 | 🟡 中 |
| **PlanPanel** | 预案逐步骤驱动场景（fly+楼层+路线+高亮）+ 进度条 | 四/五 | 🟡 中 |
| **FireSafetyPanel** | 设施实时状态探测 + 状态来源追溯 + 类型/楼层双维度统计 | 二 | 🟢 中 |
| **DeviceSearch** | 顶栏全局设备搜索框（跨模块） | 二/五 | 🟢 低 |
| **CameraSettingsPopup** | 按键提示/R 键重置统一设置弹窗 | 3D 操控 | 🟢 低 |
| **SceneObjectInfoCard** | 点选 3D 物体反查信息 + 定位 + 加路径点 | 二 | 🟢 低 |

### B. 过时可弃（功能已被 src 替代）

| 组件 | 被 src 什么替代 |
|---|---|
| **SoonspaceSceneViewer**（556 行上帝组件） | `SceneProvider` + `RealSceneView` + `TopBar`（已正确分层） |
| **PanelShell** | `DraggablePanel` |
| **PluginPanel**（733 行插件控件） | `src/panels/*` 业务面板（"插件注册+通用控件"理念与当前"业务 panel"不同，迁移成本 > 重写） |
| **SceneLauncher**（全屏门厅） | `TopBar` 下拉场景切换 |
| **SdkPluginPanel** | `FloorDisplayPanel` + `MapLayerControl` |
| **MultiAgentWidget** | `AgentChat`（自研 agentScripts vs 外部 `@dt-uagent` SDK） |
| **UStudioSceneViewer** | 1 行 re-export 壳 |
| **sdk.d.ts** | 跟随 MultiAgentWidget |

---

## 二、逐个详情

### 1. AlarmCenter.tsx（228 行，完整）
实时告警中心：30s 轮询场景消防设备状态，识别 warning/offline 聚合展示，点击定位+高亮。顶栏告警按钮(徽章)+横幅+下拉列表。**依赖**：`@/lib/scene-sdk`、`@/lib/device-tree`、`/api/ustudio/fire-devices`。**初判**：BuildingProfilePanel 已承担设施清单，但 src 无"主动监控+徽章"形态，值得迁移（改 znya 告警接口）。

### 2. CameraPathPanel.tsx（123 行，完整）
镜头路径工具：保存当前视角为有序路径点，播放漫游动画；暴露 `window.__cameraPathTool` 供 agent 调用。**依赖**：`@/lib/camera-path`、`window.__scene`、`PanelShell`。**初判**：src 只有"保存单点视角"，缺多路径点串联+播放+agent 可控，模块三 AI 引导熟悉/模块一漫游刚需。

### 3. CameraSettingsPopup.tsx（59 行，完整）
相机操控设置弹窗：按键提示开关、R 键重置开关，持久化 localStorage。纯 React。**初判**：src 无统一相机设置入口，可配 KeyHintOverlay 一起迁。

### 4. DeviceSearch.tsx（154 行，完整）
设备搜索框：按名称/类型/楼层/空间模糊搜索，定位+高亮。**依赖**：`@/lib/scene-sdk`、`@/lib/device-tree`、`/api/ustudio/tree`。**初判**：src 搜索分散在各 panel，缺顶栏全局搜索框。

### 5. FireSafetyPanel.tsx（580 行，完整）
消防设施分布面板：统计总数/正常/告警/离线，类型+楼层双维度分布，单点/批量高亮。**依赖**：`PanelShell`、`@/lib/scene-sdk`、`@/lib/fire-types`、`/api/ustudio/fire-devices`。**初判**：BuildingProfilePanel 偏静态展示，FireSafetyPanel 的"实时状态探测+状态来源字段追溯+双维度统计图"是 src 没有的细节，可增强 BuildingProfile。

### 6. KeyHintOverlay.tsx（71 行，完整）
按键提示浮层：W/A/S/D/E/Q/R 键按下高亮，松开恢复。纯 React。**初判**：src 完全没有，轻量零依赖，建议加进来。

### 7. MultiAgentWidget.tsx（323 行，完整）
多智能体浮窗：右下角 FAB + 可拖拽聊天面板，动态 import `@dt-uagent/multi-agent-sdk`。**初判**：已被 `AgentChat`（自研 agentScripts）替代，外部 SDK 路线已弃，**过时可弃**。

### 8. PanelShell.tsx（295 行，完整）
通用可拖拽面板壳：标题栏+内容区，四角吸附、最小化、布局持久化，向 `@/lib/panels` 注册供 agent SDK 调起。**初判**：已被 `DraggablePanel` 替代（src 走简单壳+App 静态布局），**过时**。

### 9. PlanPanel.tsx（316 行，完整）
应急预案面板：预案列表+详情+执行步骤，"执行预案"逐步切楼层→显路线→飞行→批量高亮，进度条+当前步骤同步。**依赖**：`PanelShell`、`@/lib/scene-sdk`、`@/lib/plan-data`。**初判**：src 的 PlanOutputPanel/PlanLibraryPanel 承担输出+归档，但缺"逐步骤驱动场景的可视化执行器"，模块四对抗时间轴可借鉴 `usePlanExecution` hook。

### 10. PluginPanel.tsx（733 行含样式，完整）
场景插件控制面板：基于 `PluginManager` 渲染 9 种控件（radio/toggle/select/slider/number/datetime/list/grouped-list/button）。**依赖**：`@/lib/scene-plugins`。**初判**：与 src "业务 panel" 架构理念不同，迁移成本 > 重写，**过时**。

### 11. SceneLauncher.tsx（306 行，完整）
场景选择门厅：拉场景列表，搜索/排序，卡片显示楼层/设备/消防设备统计（10min 缓存），"最近使用"徽章。**初判**：已被 `TopBar` 下拉替代（形态差异），**过时**。

### 12. SceneObjectInfoCard.tsx（157 行，完整）
场景对象信息卡：点击 3D 物体反查树得名称/类型/楼层，提供高亮/飞向/加路径点。**依赖**：`@/lib/soonspace-runtime`、`@/lib/device-tree`。**初判**：src 的 SceneInfoCard 只显全局信息，不能点单物，可借鉴对接 SceneProvider runtime。

### 13. SdkPluginPanel.tsx（195 行，完整）
SDK 内置控制台：视图切换(3D/2D/炸开/标注/GIS/可达/连通)+楼栋楼层多选+路径多边形显隐+业务面板显隐。**依赖**：`ustudio-sdk`、`@/lib/generated-panel-runtime`。**初判**：已被 `FloorDisplayPanel`+`MapLayerControl` 替代，**过时**。

### 14. SoonspaceSceneViewer.tsx（556 行，完整）
早期场景主壳：自管 SoonspaceRuntime+PluginManager 生命周期，view 状态机，渲染顶栏+调度子组件（PluginPanel/KeyHintOverlay/CameraPathPanel/SceneObjectInfoCard 等）。**初判**：上帝组件，已被 `SceneProvider`+`RealSceneView`+`TopBar` 正确分层替代，**整体过时**；内部小工具按需挑选迁移。

### 15. UStudioSceneViewer.tsx（1 行）
`export { SoonspaceSceneViewer as UStudioSceneViewer }`，别名 re-export。**过时**。

### 16. UStudioVideoDialog.tsx（290 行，完整）
视频播放对话框：监听 `USTUDIO_VIDEO_OPEN_EVENT`，按 URL 自动选 FLV(mpegts.js)/HLS(hls.js)/原生，全屏模态。**依赖**：`mpegts.js`、`hls.js`、`@/lib/video-runtime`。**初判**：src **完全没有视频组件**，模块五/一很可能需要视频监控接入，**强烈建议加进来**（事件驱动，解耦度高，迁移成本最低）。

### 17. sdk.d.ts（26 行）
`@dt-uagent/multi-agent-sdk` 类型声明补丁。跟随 MultiAgentWidget 处理。

---

## 三、迁移共性（"加进来"时都要做）

1. `PanelShell` → `DraggablePanel`
2. `@/lib/scene-sdk` 调用 → `useScene().runtime`
3. 后端 `/api/ustudio/*` → znya 真实接口
4. `window.__scene` / `window.__cameraPathTool` 全局 → React context

## 四、优先级建议

UStudioVideoDialog（独立解耦）> KeyHintOverlay（轻量）> AlarmCenter（模块五刚需）> CameraPathPanel（模块三刚需）> PlanPanel（模块四对抗）> 其余按业务需要。
