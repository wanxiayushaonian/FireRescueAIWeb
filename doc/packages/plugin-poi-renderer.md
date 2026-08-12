# @soonspacejs/plugin-poi-renderer

> POI 标注渲染插件（`@soonspacejs/plugin-poi-renderer@2.15.18`）

高效渲染 POI 标注点（图片、面板、视频等富媒体内容），支持批量渲染与自定义样式。官方文档：http://www.xwbuilders.com:8800/plugin/poi-renderer.html

## 核心类

### PoiRenderer（POI 渲染器）

| 方法 | 作用 |
| --- | --- |
| `batchRender(...)` | 批量渲染 POI 节点 |
| `renderCustom(...)` | 自定义样式渲染 |
| `renderPanel(...)` | 面板数据渲染（数据面板样式） |
| `renderVideo(...)` | 视频内容渲染 |

## 关键类型

| 类型 | 说明 |
| --- | --- |
| `PoiNodeData` | POI 节点数据 |
| `PoiNodeBaseOption` | POI 基础配置 |
| `PoiNodeCustomOptions` | 自定义样式配置 |
| `PoiNodePanelOptions` / `PoiNodePanelDataSource` | 面板样式配置与数据源 |
| `PoiNodeVideoOptions` | 视频配置 |
| `PoiNodeBatchOptions` | 批量渲染配置 |
| `PoiImageOptions` | 图片配置 |
| `PoiContentTypeEnum` | 内容类型枚举 |
| `DefaultStyle` | 默认样式常量 |

## 在模板中的使用

- 作为 SoonSpace 插件套件成员安装，用于 POI 标注点展示。
- 模板中标注/标签显隐由 ustudio-sdk 场景能力统一管理（如 `setScene({ labels })`），业务代码一般不需要直接调用本插件。
