# @soonspacejs/plugin-effect

> 特效插件（`@soonspacejs/plugin-effect@2.15.18`）

提供粒子、火焰、烟雾、水、天气、建筑生长等丰富的场景特效。官方文档：http://www.xwbuilders.com:8800/plugin/effect.html

## 核心类

### EffectPlugin

| 方法 | 作用 |
| --- | --- |
| `createParticleCluster(...)` | 创建粒子簇 |
| `createSparkles(...)` | 创建闪烁粒子（Sparkles 效果） |
| `createSmoke(...)` | 创建烟雾效果 |
| `createSmoke2(...)` | 创建另一种烟雾效果（二次烟雾） |
| `createFlame(...)` | 创建火焰效果 |
| `createWater(...)` | 创建水面效果 |
| `createContactShadows(...)` | 创建接触阴影 |
| `createBuilds(...)` | 建筑生长动画效果 |
| `createPointsWave(...)` | 点阵波浪效果 |
| `createCircleWave(...)` | 圆形扩散波浪 |
| `createCylinderWave(...)` | 圆柱扩散波浪 |
| `openWeather(...)` / `closeWeather(...)` | 开启 / 关闭天气效果 |
| `removeEffect(...)` | 移除特效 |

## 关键配置类型

| 类型 | 说明 |
| --- | --- |
| `SparklesOptions` | 闪烁粒子参数（数量、颜色、速度等） |
| `SmokeOptions` / `Smoke2Options` | 烟雾参数 |
| `FlameOptions` | 火焰参数 |
| `WaterOptions` / `CreateWaterOptions` | 水面参数 |
| `ContactShadowsOptions` | 接触阴影参数 |
| `BuildsOptions` | 建筑生长参数 |
| `PointsWaveOptions` | 点阵波浪参数 |
| `CircleWaveOptions` / `CylinderWaveOptions` | 圆形/圆柱波浪参数 |
| `WeatherOptions` | 天气参数 |

## 在模板中的使用

- 作为 SoonSpace 插件套件成员安装，用于场景特效（爆炸、粒子、水流等）。
- 模板场景包若带预置特效由 SDK/CPS 插件管理；业务面板如需特效请通过 ustudio-sdk 场景能力触发。
