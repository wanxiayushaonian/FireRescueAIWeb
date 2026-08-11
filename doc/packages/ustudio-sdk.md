# ustudio-sdk

> UStudio 数字孪生场景业务 SDK（`ustudio-sdk@2.0.3`）

基于 SoonSpace/uStudio 场景能力封装的一层业务 SDK，是模板中所有场景动作的统一入口。负责初始化、场景加载、本体功能调用、导航、GIS、路径/多边形、面板与视频等能力。

## 核心职责

- 初始化 `hostUrl`、`appKey`、多语言（locale）。
- 加载与移除场景（唯一场景加载入口）。
- 提供一站式模型交互能力（飞向、高亮、透明度、显隐、截图等）。
- 提供场景本体功能调用（`invokeTwinsFunction`）及自定义功能 API。
- 管理 WebSocket、CPS worker、场景包下载与解密、用户摆放模型、主视角、路径/多边形恢复。

## 生命周期 API

| 方法 | 作用 |
| --- | --- |
| `createUStudioSdk(options)` | 创建 SDK 实例（`PluginOptions` 支持 `yExtendSpacing`、2D 轮廓线/面板颜色等配置） |
| `sdk.init(options)` | 初始化：`config.hostUrl`、`config.appKey`、`locale.lang`，需注册业务桥 `commandBridge` |
| `sdk.initScene(sceneId, options)` | 加载场景（唯一入口），支持 `onProgress` 进度回调 |
| `sdk.removeScene(sceneId)` | 移除场景（卸载时必须调用，不要只清 DOM） |
| `sdk.destroy()` | 销毁 SDK 实例 |
| `sdk.getSoonSpace()` | 获取底层 SoonSpace 实例 |
| `sdk.setLocale(lang)` | 设置语言（`zh-CN` / `en-US`） |
| `sdk.setCommandBridge(bridge)` | 注册业务桥：`panelList`、`panelSetVisible`、`showVideo` |
| `sdk.subscribeSceneState(listener)` | 订阅场景状态（楼栋/楼层/模式/可达性/连通性等） |

## 本体功能调用（invokeTwinsFunction）

`twins_instance_id` 必传，`input_params` 使用 `{ key, value }[]` 数组。

| function_identifier | 作用 | 关键入参 |
| --- | --- | --- |
| `flyto` | 飞向目标 | — |
| `heighLight` | 高亮（支持 `ids` 批量） | `color`、`ids?` |
| `cancelHeighLight` | 取消高亮（支持 `ids` 批量） | `ids?` |
| `setOpacity` | 透明 | `color`（传透明度数值如 `0.35`） |
| `unSetOpacity` | 恢复透明 | — |
| `show` / `hide` | 显示 / 隐藏（支持 `ids` 批量） | `ids?` |
| `screenShot` | 截图 | — |
| `getProperties` / `setProperty` | 读 / 写属性 | 属性标识需从数据或本体定义确认 |
| `pathMove` / `pathRestore` | 沿路径移动 / 复位 | `path` |
| `drawRoute` / `deleteRoute` | 绘制 / 删除路线 | `path` |
| `navigateFromExternal` | 场外到场内导航 | `source{lon,lat}`、`target` |
| `navigateWithinScene` | 场景内导航 | `source`、`target`、`waypoint_node_ids?` |
| `deleteNavigationRoute` | 删除导航路线 | `path_id` |
| `placeTwins` | 新增本体实例（model 用 `scale`+`bottom`，dot 用 `size`+`center`） | `twinsId`、`parentId`、坐标 |
| `updateTwinsPlacement` | 移动/改尺寸/改属性 | `id`、patch |
| `deleteTwins` | 删除本体实例 | `id` |
| `setScene` | 场景设置（楼栋/楼层/2D3D/炸开/标注/可达性/连通性） | `buildings`、`stories`、`mode`、`yExtend`、`labels`、`reachable`、`connectivity`、`nodeId`、`spaceId` |
| `getSceneSetState` | 获取场景设置状态 | — |
| `gisSetVisible` | GIS 显隐 | `visible` |
| `virtualRouteSetVisible` | 路径显隐（必须传 id + visible） | `routeIds`、`visible` |
| `polygonSetVisible` | 多边形显隐（必须传 id + visible） | `polygonIds`、`visible` |
| `panelList` | 插件面板列表 | — |
| `showVideo` | 视频弹窗（FLV/HLS/原生格式） | `url` |

> 批量能力（2.0.3 新增）：`heighLight` / `cancelHeighLight` / `setOpacity` / `unSetOpacity` / `show` / `hide` 支持在 `input_params` 中传 `ids` 数组一次操作多个对象，返回统一的 `ObjectBatchResult`（含 `total / succeeded / failed` 及每个对象的成功/失败明细）。

## SDK 便捷方法

| 方法 | 作用 |
| --- | --- |
| `sdk.fly(id)` | 飞向对象 |
| `sdk.heighLight(id, color)` | 高亮 |
| `sdk.cancelHeighLight(id)` | 取消高亮 |
| `sdk.setOpacity(id, opacity)` | 透明 |
| `sdk.unSetOpacity(id)` | 恢复透明 |
| `sdk.show(id)` / `sdk.hide(id)` | 显示 / 隐藏 |
| `sdk.screenShot()` | 截图 |
| `sdk.showVideo(url)` | 视频弹窗 |
| `sdk.invokeTwinsFunction(...)` | 调用任意本体功能 |

## 在模板中的使用

- `lib/soonspace-runtime.ts`：SDK 生命周期与业务桥注册。
- `lib/scene-sdk.ts`：`sceneSdk()` 单例导出，业务组件优先从这里取 SDK 实例。
- `components/SoonspaceSceneViewer.tsx`：场景初始化、面板与视频弹窗装配。
- `lib/generated-panels.ts`：面板登记（`id/name/aliases/domId/description`），配合 `panelList` / `panelSetVisible` 使用。
- `lib/video-runtime.ts`：视频播放运行时（FLV 走 mpegts.js、HLS 走 hls.js）。

## 版本记录

- 2.0.1 → 2.0.2：内部修复，无公开 API 变化。
- 2.0.2 → 2.0.3：新增批量对象操作（`ids` 入参 + `ObjectBatchResult` 返回）。
