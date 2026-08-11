# @soonspacejs/plugin-fds

> FDS（Fire Dynamics Simulator，火灾动力学模拟）数据可视化插件（`@soonspacejs/plugin-fds@2.15.18`）

加载并可视化 FDS 火灾模拟数据（温度、烟雾等体数据场），支持时间轴播放、暂停、指定时刻显示。官方文档：http://www.xwbuilders.com:8800/plugin/fds.html

## 核心类

### FdsManager（FDS 数据管理）

| 方法 | 作用 |
| --- | --- |
| `load(input, options?)` | 加载 FDS 数据（URL / 数据对象 / 数组） |
| `play()` | 播放模拟 |
| `pause()` | 暂停 |
| `togglePlay()` | 切换播放/暂停 |
| `setTime(timeSec, options?)` | 设置模拟时间点 |
| `setActiveVolume(...)` | 设置激活的体积数据 |
| `setOptions(...)` | 更新选项 |
| `getState()` | 获取当前状态 |
| `clear()` | 清空数据 |
| `dispose()` | 释放资源 |

### FdsMesh（FDS 网格体）

- FDS 数据的网格化表示。
- `getCellByPosition(...)` / `getPositionByCell(...)`：位置与网格单元互转。

### VolumePoints（体数据点）

- 体数据点集（温度/烟雾场）。

## 关键类型

- `IFdsManagerSource` / `TFdsManagerLoadInput`：加载输入（URL / 对象 / 数组）
- `IFdsManagerOptions` / `IFdsManagerLoadOptions`：加载与显示选项
- `IFdsManagerState`：当前状态（播放/暂停/时间等）
- `IFdsManagerStateChangeEvent` / `IFdsManagerActiveChangeEvent` / `IFdsManagerLoadedEvent` / `IFdsManagerClearEvent` / `IFdsManagerErrorEvent`：事件
- `IFdsManagerEventMap`：事件映射
- `TVolumePointsShape`：体数据形状

## 在模板中的使用

- 作为 SoonSpace 插件套件成员安装，供消防演练等场景使用。
- FDS 数据也可通过 CPS 插件的 `loadFDS` / `playFDS` 等联动接口驱动，具体由 ustudio-sdk 场景链路决定。
