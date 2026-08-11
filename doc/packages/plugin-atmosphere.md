# @soonspacejs/plugin-atmosphere

> 大气/天空环境插件（`@soonspacejs/plugin-atmosphere@2.15.18`）

为场景提供大气、云层、天空等环境效果。

## 核心类

### AtmospherePlugin

| 方法 | 作用 |
| --- | --- |
| `constructor(...)` | 创建插件实例 |
| `start(...)` | 启动大气/天空效果 |
| `stop(...)` | 停止效果 |
| `dispose(...)` | 释放插件资源 |
| `setCloudLayer(...)` | 设置云层 |
| `loadCloudTextures(...)` | 加载云层纹理 |
| `updateModelLightingMask(...)` | 更新模型光照遮罩（让模型正确受天空光影响） |

## 在模板中的使用

- 作为 SoonSpace 插件套件成员安装，用于场景环境氛围效果。
- 由 ustudio-sdk 场景渲染管线管理，业务代码一般无需直接调用。
