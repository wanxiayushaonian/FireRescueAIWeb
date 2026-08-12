# @soonspacejs/plugin-cps-soonmanager

> CPS（场景语义/实例管理）插件（`@soonspacejs/plugin-cps-soonmanager@2.15.18`），ustudio-sdk 的场景加载核心依赖

负责加载 uStudio/CPS 场景包、获取并解析语义数据（墙、柱、窗、空间、楼层等）、GIS/FDS/POI/拓扑等场景附属数据，以及业务 ID（`twins_instance_id`）与场景对象 ID（`out_instance_id`）的映射管理。

## 核心功能

### 场景加载

| 方法 | 作用 |
| --- | --- |
| `loadScene(options, workIdMap?)` | 加载场景（路径/密钥、预置特效等） |
| `loadSceneAndSemantic(options, workIdMap?)` | 加载场景 + 语义数据（传统方式，语义颜色及透明度） |
| `loadSceneAndSemanticInWorker(options, workIdMap?, workerOptions?)` | Worker 并行加载场景 + 语义（性能更优，业务接口不阻塞场景加载） |

> 注意：模板生命周期中场景加载统一由 ustudio-sdk 的 `initScene` 管理，业务代码**不要**直接调用这些方法。

### 语义与场景数据获取

| 方法 | 作用 |
| --- | --- |
| `fetchMetaData()` | 场景元数据 |
| `fetchTreeData()` | 场景实例树（楼栋/楼层/空间/设备层级） |
| `fetchSemanticData()` | 语义数据（墙、柱、窗等语义面） |
| `fetchRoadsData()` | 道路数据 |
| `fetchFlatData()` | 平面化数据 |
| `fetchPoiData()` | POI 标注数据 |
| `fetchDataSourceData()` | 数据源数据 |
| `fetchTopologyData()` | 拓扑路径数据 |
| `fetchPropertiesData()` | 属性数据（键值映射） |
| `fetchAnimationsData()` | 动画数据 |
| `fetchModelVisionsData()` | 模型视角数据 |
| `fetchSpacesData()` | 空间数据 |
| `fetchFlowsData()` | 流程/流动数据 |
| `fetchGisData()` | GIS 数据 |
| `fetchGisPlotsData()` | GIS 标绘数据 |
| `fetchFDSData()` | FDS 火灾模拟数据 |

### 业务 ID 映射

- `applyWorkIdMap(workIdMap)`：应用业务 ID 映射（`out_instance_id` → `{ work_id: twins_instance_id }`）
- 加载中或加载后均可调用，未创建对象的映射进入 pending，对象创建后自动补齐；已创建对象立即更新 `userData.work_id`、`extraIds` 和对象缓存

### POI 渲染

- `loadPoi(refreshByDataSource?, refreshByUserData?)`：加载 POI
- `refreshPoiByDataSource()` / `refreshByUserData()`：按数据源 / 用户数据刷新 POI

### FDS 联动

- `loadFDS(url?, options?)`：加载 FDS 数据
- `clearFDS()` / `getFDSState()` / `playFDS()` / `pauseFDS()` / `toggleFDSPlay()` / `setFDSTime(timeSec, options?)`：FDS 播放控制

### 拓扑

- `getTopologies()` / `loadTopologies()`：拓扑数据获取与加载
- `sortTopologyNodes(topologyInfo, startNodeId?)`：拓扑节点排序

### 其他

- `presetGis()`：GIS 预置
- `presetEffects(options?)`：预置特效
- `playAnimationById(id, animationIndex?, options?)`：按 ID 播放动画
- `setKey(key)` / `setPath(path)`：鉴权密钥 / 场景路径设置

## 关键类型

- `ConstructorOptions`：插件构造参数
- `ILoadSceneOptions` / `ILoadSceneAndSemanticInWorkerOptions`：加载选项
- `IWorkIdMap` / `IApplyWorkIdMapResult`：业务 ID 映射
- `ITreeData` / `IInnerTreeData`：场景树数据
- `SemanticObject`：语义对象
- `IGisData` / `IGisPlot` / `IGisSettings`：GIS 相关
- `IFdsData` / `IFdsManagerState`：FDS 相关
- `IPoiData` / `PoiContentTypeEnum`：POI 相关
- `LoadSceneAlgorithm` / `PassableType`：枚举
- `IProgressEventMap`：加载进度事件

## Worker 源码职责（了解即可）

- `semantic-worker.config.ts`：墙、柱、窗解析配置
- `semantic-worker.parser.ts`：纯数据解析与批次分组（不依赖 SoonSpace 实例）
- `semantic.worker.ts`：Worker 入口（资源获取 + 调用解析器）
- `semantic-worker.client.ts`：主线程 Worker 生命周期、取消与消息协议
- `semantic-batch.utils.ts`：主线程离场创建、统一挂载与失败清理

## 在模板中的使用

- ustudio-sdk 的 peer 依赖，场景加载由 `sdk.initScene(sceneId)` 统一触发，CPS 插件的内部加载由 SDK 管理。
- 运行时业务数据（实例树、属性、路径等）走 `@/lib/ustudio` 的服务端封装（`getSceneInstanceTree` 等），浏览器端不直接调用本插件接口。
