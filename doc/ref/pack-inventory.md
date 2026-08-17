# 场景包 478488321394200576 数据解析（2026-08-17 拉取）

> 数据源：`GET /api/ustudio/tree`（12.2MB，较上一版 +2.5MB）。解析器：`lib/scene-pack-inventory.ts`（analyzeScenePack，面板改造直接消费）。
> 相对上一版唯一新增：**SceneInOut 出入口 ×2**（出入口1/2，Site 直属，`parent_out_instance_id=SITE_ROOT`）。动态能力（kgraph 覆盖 3F-38F / 场景路线 1 条）未变。

## 语义层级（深度 4）

```
Site(场地)
├─ Building(广场21D)
│  └─ Story ×42：B1F..40F + 未定义楼层×1（楼层只挂 Building 下）
│     └─ Space / Door / Wall / 楼内设备（设备多挂 Space 下，也有直挂 Story）
└─ Site 直属（全场级，共 ~82 个）：SceneInOut 出入口×2、消防车×2、
   室外消火栓×4、屋顶/室外设备（正压送风机×9、排烟风机×5、喷淋嘴×35、
   感烟探测器×23、应急照明×1）——不归属任何楼层
```

## 类型清单（24 种，数量降序）

| 类型 | 数量 | Site 级 | 说明 |
|---|---|---|---|
| Wall | 24736 | 0 | 墙体（主体结构，draw call 大头） |
| Space | 2608 | 0 | 空间（语义分类见下） |
| Door | 2219 | 0 | 门（图中间点；导航端点不可用） |
| OpenSprinklerHead | 1647 | 35 | 喷淋嘴 |
| PointSmokeDetector | 1382 | 23 | 感烟探测器 |
| EmergencyLightingFixture | 251 | 1 | 应急照明 |
| EvacuationSignLight | 205 | 0 | 疏散标志 |
| ManualFireAlarmButton | 196 | 0 | 手动报警按钮 |
| PositivePressureFan | 156 | 9 | 正压送风机 |
| ExtinguisherCabinet | 156 | 0 | 灭火器箱 |
| IndoorFireHydrant | 152 | 0 | 室内消火栓 |
| SmokeExhaustFan | 118 | 5 | 排烟风机 |
| Stairs | 84 | 0 | 楼梯（按层分段：楼梯_xF_n） |
| Story | 42 | 0 | 楼层 |
| OutdoorFireHydrant | 4 | 4 | 室外消火栓 |
| Shuixiangshuibeng | 2 | 0 | 水箱水泵 |
| SceneInOut | 2 | 2 | **出入口（新）**——进攻路线大门的官方锚点 |
| Site/Building | 各1 | — | 结构根 |
| Gongzuozhan/Kongzhitai/Dianshijiankong | 各1 | 0 | 消控室工作站/控制台/电视监控 |
| SmokeExhaustFireTruck / RemoteWaterSupplyFireTruck | 各1 | 1 | 排烟/远程供水消防车（pathMove 可动） |

twins/out id 双字段全量齐备（无缺失）——拾取别名索引可全覆盖。

## Space 语义分类（2608 个）

房间×940、弱电井×570、电梯井×229、合用前室×146、送风井×139、排烟井×115、防烟楼梯×63、强电井×36、（其余少量）。**空间语义粒度=房间/井道/前室**，是 kgraph 图节点的主要来源。

## 楼层内容形态

- 标准层（如 4F-12F）：约 900 节点/层，Space×70、Door×61、喷淋×42、感烟×36
- 异常层：**13F/25F 明显偏少**（Space×35/43、Door×22/28，疑避难/设备层）；**30F 偏多**（Space×103、Door×84）；39F 残缺（378）；40F 几乎空（20，仅 Space×1）；另有「未定义楼层」×1
- B1F（433）/1F（473）/2F（745）逐级增多

## 动态能力现状（复查确认）

- kgraph 连通图：**3F-38F**（跨层/穿门/楼梯可达；1F/2F/B1F 未建图）
- SceneInOut **未入图**（作导航端点不可达）——出入口可作我们进攻路线的绘制锚点，但不能作 kgraph 端点
- 场景路线：1 条（"test"，平台编辑器产物）

## 补充维度普查（2026-08-17 第二轮）

**场景元信息（bootstrap）**：scene_name="21D(完整包演示包)"，scene_type=SITE，源文件 21D(完整包演示包).zip，公司 id a44adecd…；**平台共 12 个场景包**：当前包 + 各楼层单层包（B1层/1F/13f避难层/25f避难层/31f/35f）+ 旧完整包 + 避难层模型展示 + 单30F + XG简化版 + 鼎创2F3F2_2。

**多边形**：1 个——"建筑正面场景演示区块"（有 position `72.01&-5.46&-96.49`、centroid、size≈57726；无顶点串，polygon=None，疑似面域标记非画线多边形）。

**SceneInOut 出入口带 WGS84 坐标**（净高 2.0m/净宽 1.0m + `wgs84坐标=115.9424&29.6638&…`）——是 **navigateFromExternal（场外→场内导航）的天然起点**；配合工作区未提交的 gcj02ToWgs84 转换即可做"从任意业务坐标到场内"的到场路线。

**各类型属性模板与填充度**（每类抽样实测）：
- 几何业务属性**已自动填充**：Door（连通室外/高度/宽度/是否打开/门底标高）、Space（地面高度/净高）、Stairs（楼梯标高）、SceneInOut（净高/净宽/wgs84坐标）
- 用户业务属性**有模板未填值**（消火栓/喷头/探测器等：规格型号/生产厂家/口径/流量系数等定义在但空,信息卡自动隐藏）——在建模后端填值即显现
- 每类带 `category_name` **本体分类树**（如 室外消防设施/消火栓、防排烟系统/送风设备、消防载具/特种车辆）——面板分类展示可直接用
- 特殊模型（工作站/控制台/电视监控/水箱水泵）仅 twins_name,无业务属性

**连通图枚举接口不开放**：get-reachable-graph 对本包任何姿势(Story/Space 节点)均 0 边;仅 shortest-path-with-waypoints 可用(覆盖 3F-38F)。图本体(节点数/边数)无法盘点。

## 「内容显隐 → 场景包内容」面板改造设计输入

数据基座已就绪（analyzeScenePack）。建议面板双页签：
1. **内容显隐**（现有开关，保持）
2. **场景包内容**（新）：总览卡（总节点/类型数/楼层数）+ 类型表（数量+Site 级占比，点击行=跳显隐开关）+ 楼层×类型矩阵（热力，异常层高亮）+ Space 语义分类条 + Site 级对象清单（出入口/车辆/屋顶设备）+ 图覆盖注记（3F-38F）

改造价值：类型开关与真实数据对齐（含 Site 级拆分——目前"消防设施"开关同时控制楼内+屋顶设备）、楼层内容可视化支撑熟悉/考核内容核对、出入口/车辆等全场对象一屏可见。补充输入：本体分类树（category_name）可作类型表的分组维度；属性填充度（已填/有模板未填）可作数据质量提示；平台 12 个包清单可作场景切换器的参考信息。
