# @soonspacejs/plugin-tiles

> 3D Tiles 倾斜摄影插件（`@soonspacejs/plugin-tiles@2.15.18`），GIS 底座

用于加载 3D Tiles 格式的倾斜摄影/地形数据，是场景 GIS 底座能力的来源；GIS 导航路线使用其地面标绘能力。

## 核心类

### TilesPlugin

| 方法 | 作用 |
| --- | --- |
| `constructor(...)` | 创建插件实例 |
| `loadTiles(...)` | 加载 3D Tiles 数据（倾斜摄影/地形） |
| `removeTiles(...)` | 移除已加载的 Tiles 数据 |

### ArcgisTilesRenderer

- ArcGIS 风格 Tiles 渲染器，负责 Tiles 数据的渲染管线。

### TileCustomMaterialPlugin

- Tiles 自定义材质插件，支持对 Tiles 数据应用自定义材质效果。

## 在模板中的使用

- GIS 显隐由 SDK 的 `gisSetVisible(visible)` 统一控制，业务代码不直接操作 Tiles 插件。
- 场外到场内导航（`navigateFromExternal`）依赖其地面标绘能力，由 ustudio-sdk 内部完成。
