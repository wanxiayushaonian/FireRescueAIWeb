# @soonspacejs/plugin-flow

> 流程/流动逻辑插件（`@soonspacejs/plugin-flow@2.15.18`）

提供可视化流程图的解析与执行能力：通过节点（Node）与连线（Edge）构建的流程图，可驱动场景对象执行高亮、显隐、移动、旋转、缩放、透明度、路径移动、POI 展示等动作。适合做事件联动/演示编排。

## 核心类

### FlowParser（流程解析与执行）

| 方法 | 作用 |
| --- | --- |
| `parse(...)` | 解析流程图数据 |
| `run(...)` | 运行流程图 |
| `stop(...)` | 停止运行 |
| `addNode(...)` | 添加节点 |
| `addEdge(...)` | 添加连线 |
| `getNodeById(...)` | 按 ID 获取节点 |
| `getEdgeById(...)` | 按 ID 获取连线 |
| `getVariableNameById(...)` | 按 ID 获取变量名 |
| `cleanup(...)` | 清理运行状态 |
| `clear(...)` | 清空流程 |
| `dispose(...)` | 释放资源 |
| `debug(...)` | 调试输出 |

### ComponentFlowParser

- 组件级流程解析器（基于 `FlowParser` 扩展，支持组件动画编排）。

### Trigger / ComponentTrigger（触发器）

- 流程触发机制，支持组件级触发器控制流程启动。

## 流程节点类型（flows/nodes）

| 节点 | 作用 |
| --- | --- |
| `StartNode` | 起始节点 |
| `DelayNode` | 延时节点 |
| `ConditionNode` | 条件判断节点 |
| `DataExtractionNode` / `DataFilterNode` | 数据提取 / 过滤节点 |
| `NumberNode` / `MeshesNode` / `MeshNode` / `ModelNode` / `ModelsNode` | 数字 / 网格 / 模型对象节点 |
| `SpaceNode` / `SpacesNode` / `POINode` / `POISNode` | 空间 / POI 节点 |
| `PathNode` / `PathsNode` | 路径节点 |
| `ShowNode` / `HideNode` | 显示 / 隐藏节点 |
| `HighlightNode` / `UnHighlightNode` | 高亮 / 取消高亮节点 |
| `OpacityNode` / `UnOpacityNode` | 透明 / 恢复节点 |
| `EmissiveNode` / `UnEmissiveNode` | 自发光 / 取消节点 |
| `TranslateNode` / `RotateNode` / `ScaleNode` | 平移 / 旋转 / 缩放节点 |
| `FlyToNode` | 飞向节点 |
| `ColorNode` / `UserDataNode` | 颜色 / userData 节点 |
| `clip-animation` / `component-tween-animation` / `tween-animation` | 动画类节点（裁剪动画 / 补间动画） |

## 在模板中的使用

- 作为 SoonSpace 插件套件成员安装，供带流程/演示场景使用。
- 模板业务面板如需动画编排，建议优先使用 ustudio-sdk 场景能力（如 `pathMove`、`heighLight`），仅在需要复杂流程图驱动时考虑本插件。
