# soonspacejs

> SoonSpace 三维场景引擎（`soonspacejs@2.15.18`），ustudio-sdk 的底层渲染基座

SoonSpace.js 是基于 three.js 的三维场景引擎，提供对象管理、相机控制、光照、动画、标注（Poi）、拓扑（Topology）、路径动画、后处理等完整场景能力。模板中由 `ustudio-sdk` 间接持有实例，业务代码一般通过 `sdk.getSoonSpace()` 访问，不直接创建第二个实例。

## 核心能力

### 场景初始化与渲染

- `init`（构造 Viewport）: 创建渲染器、场景、相机
- `render` / `setCamera` / `setCameraViewpoint`: 渲染与相机控制（预设视角、环绕）
- `screenshot`: 场景截图
- `clear` / `clearIdb`: 清空场景 / 清理 IndexedDB 缓存
- `setBackgroundColor` / `setBackgroundImage` / `setSky` / `setSkyBackground` / `setSphereSkyBackground`: 背景与天空
- `setToneMapping` / `setColorSpace` / `setEnvironment` / `setBloom` / `setSSAO`: 渲染效果（色调映射、色彩空间、环境光、泛光、环境光遮蔽）

### 对象创建与管理（Library）

- `addObject` / `attachObject`: 添加 / 挂载对象
- `addModelForGroup` / `addPoiForGroup` / `addPoiNodeForGroup` / `addSbmForGroup` / `addTopologyForGroup`: 各类对象分组管理
- `createModel` / `cloneModel`: 模型创建与克隆
- `createPoi` / `createPoiMesh` / `createPoiNode`: POI 标注点创建
- `createTopology`: 拓扑（点线关系）创建
- `createGroup` / `createGround` / `createDecal`: 分组、地面、贴花
- `createPluginObject`: 插件对象
- `addToPluginObject`: 将对象加入插件对象
- `computeModelsBoundsTree` / `createFindObjectsInBoxNearPosition` / `createFindObjectsInSphereNearPosition` / `createFindObjectsNearPath`: BVH 加速的包围盒/球/路径附近对象查询

### 光源

- `createAmbientLight` / `createDirectionalLight` / `createHemisphereLight` / `createSpotLight` / `createPointLight` / `createRectAreaLight`: 各类光源创建
- `setAmbientLight` / `setDirectionalLight` / `setHemisphereLight` / `setSpotLight` / `setPointLight` / `setRectAreaLight`: 光源更新
- `clearLight` / `showAllLight`: 清空 / 显示全部光源

### 相机控制与辅助

- `addGridHelper` / `addAxesHelper` / `addBoxHelper` / `addGroundHelper` / `addPlaneHelper` / `addSpotLightHelper` / `addHemisphereLightHelper` / `addDirectionalLightHelper` / `addPointLightHelper` / `addRectAreaLightHelper`: 辅助对象
- `clearHelper` / `showAllHelper`: 清空 / 显示辅助对象
- `setControlsOptions`: 控制器参数
- `setHoverEnabled` / `setScaleFixedEnabled` / `setLevelEnabled` / `setAutoInstancing`: 交互与渲染开关

### 交互效果

- `surroundOnObject` / `surroundOnTarget`: 环绕对象 / 目标
- `edgeShow` / `unEdgeShow`: 边缘线显示 / 取消
- `strokeShow` / `unStrokeShow`: 描边显示 / 取消
- `highlightShow` / `unHighlightShow`: 高亮显示 / 取消
- `opacityShow` / `unOpacityShow`: 透明显示 / 恢复
- `emissiveShow` / `unEmissiveShow`: 自发光显示 / 取消
- `isolate` / `unisolate`: 隔离显示 / 取消
- `showAllModel` / `showAllPoi` / `showAllPoiNode` / `showAllSbm` / `showAllTopology` / `showAllDecal` / `showAllGroup`: 各类对象全部显示

### 动画

- `createPathAnimation` / `createBonePathAnimation` / `createChainSkeletalModel`: 路径动画 / 骨骼路径动画 / 骨骼链模型
- `createPathAnimationAction` / `createPathAnimationActionForCamera`: 路径动画动作（相机）
- `startClipAnimation` / `stopClipAnimation` / `resetClipAnimation`: 裁剪动画控制
- `playModelAnimation` / `stopModelAnimation`: 模型动画播放 / 停止
- `animate` / `tween`: Tween 动画（基于 three/examples TWEEN）

### 拓扑与路径

- `getShortestPath` / `getShortestPathByMultipleStartPoints` / `getShortestPathByMultipleEndPoints`: 最短路径
- `loadTopology` / `clearTopology` / `resetTopologyNodes` / `setTopologyPassable`: 拓扑加载、清除、节点复位、可通过性
- `removeTopologyById` / `removeTopologyGroupById`: 拓扑删除

### 模型加载（Loader）

- `addSbmForGroup` / `cloneSbm` / `clearSbm`: SBM（SoonSpace 模型格式）加载管理
- `setModelDracoDecoderPath`: Draco 压缩解码器路径
- `setSbmModelMaps` / `setModelsMap`: 模型映射

## 静态成员

| 成员 | 作用 |
| --- | --- |
| `SoonSpace.THREE` | three.js 引用（`THREE.*` 全量导出） |
| `SoonSpace.TWEEN` | tween 动画库 |
| `SoonSpace.utils` | 工具集（xml 解析、深浅拷贝、网络、路径、日志等） |
| `SoonSpace.animation` | 动画工具 |
| `SoonSpace.library` | 对象库（Model / Poi / Topology / Group / Canvas3D / Decal 等） |
| `SoonSpace.ACTION` | 相机控制动作枚举（ROTATE / TRUCK / DOLLY / ZOOM 等） |

## 在模板中的使用

- 由 `ustudio-sdk@2.0.3` 作为 peer 依赖持有，业务代码通过 `sdk.getSoonSpace()` 访问。
- `lib/soonspace-runtime.ts` 中完成场景初始化与生命周期管理，不重复创建第二个引擎实例。
- 版本必须与 8 个 `@soonspacejs/plugin-*` 插件保持一致（当前均为 2.15.18）。

## 版本记录

- 2.15.17 → 2.15.18：与插件套件同步的小版本更新（详见插件套件发布说明）。
