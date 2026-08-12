# 包功能文档索引

> 模板业务依赖包的功能说明文档（11 份），按类别组织。更新时间：2026-08-10。

## 场景渲染核心

| 包 | 文档 | 一句话定位 |
| --- | --- | --- |
| `ustudio-sdk` | [ustudio-sdk.md](./ustudio-sdk.md) | UStudio 数字孪生场景业务 SDK，模板所有场景动作的统一入口 |
| `soonspacejs` | [soonspacejs.md](./soonspacejs.md) | 基于 three.js 的三维场景引擎，SDK 底层渲染基座 |

## SoonSpace 插件（版本与 soonspacejs 保持 2.15.18 一致）

| 包 | 文档 | 一句话定位 |
| --- | --- | --- |
| `@soonspacejs/plugin-cps-soonmanager` | [plugin-cps-soonmanager.md](./plugin-cps-soonmanager.md) | CPS 场景包加载与语义数据管理，SDK 场景加载核心依赖 |
| `@soonspacejs/plugin-gs3d-loader` | [plugin-gs3d-loader.md](./plugin-gs3d-loader.md) | GS3D 场景格式加载器 |
| `@soonspacejs/plugin-tiles` | [plugin-tiles.md](./plugin-tiles.md) | 3D Tiles 倾斜摄影加载，GIS 底座 |
| `@soonspacejs/plugin-atmosphere` | [plugin-atmosphere.md](./plugin-atmosphere.md) | 大气/天空/云层环境效果 |
| `@soonspacejs/plugin-effect` | [plugin-effect.md](./plugin-effect.md) | 粒子/火焰/烟雾/水面/天气等特效 |
| `@soonspacejs/plugin-flow` | [plugin-flow.md](./plugin-flow.md) | 流程图解析与执行，驱动场景对象动作编排 |
| `@soonspacejs/plugin-fds` | [plugin-fds.md](./plugin-fds.md) | FDS 火灾模拟数据可视化 |
| `@soonspacejs/plugin-poi-renderer` | [plugin-poi-renderer.md](./plugin-poi-renderer.md) | POI 标注点高效渲染（图片/面板/视频） |

## 多智能体

| 包 | 文档 | 一句话定位 |
| --- | --- | --- |
| `@dt-uagent/multi-agent-sdk` | [multi-agent-sdk.md](./multi-agent-sdk.md) | 多智能体对话浮窗，模板右下角浮窗的驱动 SDK |

## 相关

- 全量依赖清单与版本说明见 [../package-dependencies.md](../package-dependencies.md)
- 各包源码与类型定义位于 `node_modules/<包名>/`（README、`dist/*.d.ts`、`docs/`）
