# @soonspacejs/plugin-gs3d-loader

> GS3D 场景格式加载插件（`@soonspacejs/plugin-gs3d-loader@2.15.18`）

用于加载 GS3D 格式的 3D 场景/模型资源。

## 核心类

### GS3DLoaderPlugin

| 方法 | 作用 |
| --- | --- |
| `constructor(...)` | 创建插件实例 |
| `load(...)` | 加载单个 GS3D 资源 |
| `loads(...)` | 批量加载多个 GS3D 资源 |
| `createViewer(...)` | 创建 GS3D 查看器 |

## 关键枚举（types.d.ts）

| 枚举 | 值含义 |
| --- | --- |
| `LoaderStatus` | 加载状态（如加载中/完成/失败） |
| `SceneFormat` | 场景格式类型 |

## 在模板中的使用

- 作为 SoonSpace 插件套件成员安装，版本与 `soonspacejs` 保持一致（2.15.18）。
- GS3D 场景包下载与解密由 ustudio-sdk 的 `initScene` 统一管理，业务代码一般不直接调用本插件。
