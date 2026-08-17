# 态势总揽 agent 配置:GIS 联动(flyTo)+ 风险研判提示词

> 日期:2026-08-17 | 目标:给 uagent 平台「态势总揽多agent」应用(app_id=`2087571055445204993`)配好工具白名单与提示词,实现「风险研判 + GIS 地图联动定位」。
> 本文档是平台侧配置的操作稿:提示词直接复制到平台应用配置,工具清单按勾选表执行。

---

## 一、本次新增的链路(代码侧已完成)

```
agent 调 gis_fly_to 工具(mcp-server:8787)
  → publishCommand → /scene-events SSE
  → 浏览器 BFF /api/scene-events(同源代理,appKey 在服务端)
  → SceneCommandBridge(全局挂载,App.tsx)
  → handlers.gis_fly_to → sceneLog.flyTo(lat/lng/zoom/label)
  → use-scene-bridge → map.flyTo(Leaflet)
```

- 工具:`gis_fly_to(lat, lng, zoom?, label?)`,坐标 **GCJ02**(与高德底图一致);zoom 默认 15,实际取 max(当前缩放, zoom)。
- `show_route` 工具同通道,但 overview 不配(其 routes 数据源是 plan_dispatch,属指挥调度模块)。
- **本次关键修复**:此前 `manageSceneBridge` 把 SSE 连接建立在「3D SDK 就绪」之后(getSdk 抛错即不连)——
  态势总揽无 3D 场景包,连接永不建立,GIS 命令全被挡。已重构(bridge/transport/handlers 三处):
  连接与 3D SDK 解耦(mount 即连,sdk 经 getter 惰性读取);`registerGisTools` 单独注册无 sdk 依赖的
  GIS 工具(gis_fly_to/show_route),3D 工具就绪后由 registerDefaultTools 全量重注册。
  此前记忆中「/scene-events 桥从未挂载」为过时信息——`components/SceneCommandBridge.tsx` 一直在
  App 挂载,真实缺陷是连接被就绪门槛挡住(本次已修)。

## 二、平台配置步骤

1. 登录 uagent 平台,打开「态势总揽多agent」应用(app_id=`2087571055445204993`)。
2. **mcp_servers 两个都要挂**(注意:2026-08-17 曾发现该应用工具列表只含 8787 的工具、8788 消失,配置后请到工具列表页核对 8 个工具齐全):

   | 服务 | URL | 认证 | 勾选工具 |
   |---|---|---|---|
   | firerescue-business(Node) | `http://111.75.149.221:8787` | header `X-App-Key: <MCP_APP_KEY>` | `gis_fly_to`、`query_knowledge` |
   | firerescue-python(znya) | `http://111.75.149.221:8788` | header `X-App-Key: <MCP_APP_KEY>` | `query_units`、`query_stations`、`query_water_sources`、`geocode_address`、`query_incidents`、`analyze_response` |

3. **不勾选**(防误调/防越界):

   | 工具 | 不勾原因 |
   |---|---|
   | `fly_to`/`focus_objects`/`focus_floors`/`list_fire_devices`/`list_floors` | 3D 场景工具,态势总揽无 3D 场景包 |
   | `show_route` | routes 数据源是 plan_dispatch,属指挥调度模块 |
   | `plan_dispatch` | 调派方案生成是指挥调度模块助手的明星工具 |
   | `query_scene_state`/`inject_event`/`report_decision` | 演练控制,值班研判用不到 |
   | `ping` | 无业务价值 |

4. 将下方提示词全文贴入应用 system prompt/instructions,保存并发布。

## 三、提示词(全文复制)

```markdown
# 角色
你是九江市消防救援「态势总揽」模块的态势研判智能体,服务消防指挥中心值班指挥员。
你的核心职责不是数据查询,而是**风险研判**:给定一起警情或一个目标位置,快速回答——
周围有什么、会波及谁、可用水源在哪、响应力量够不够。

# 能力边界
- 你负责:警情定位与地图联动、周边风险研判(单位/危险源/水源)、响应力量评估、波及风险简报。
- 你不负责:调派方案下达(属「指挥调度」模块助手)、单栋建筑内部战术(属「对象总览」模块助手)。
  用户问这两类问题时,给出研判视角的一句话结论,并提示切换对应模块,不要越界展开。
- 对话上下文中可能出现 scene_id(3D 场景包标识),与本模块 GIS 地图无关,忽略即可。
- 数据库里没有的信息(单位/水源/警情),如实说明,绝不编造。

# 工具规范
## 坐标系
所有工具坐标均为 GCJ02(高德坐标系),与地图底图一致,直接使用,不做任何换算。

## 标准研判流程
1. **定位目标**:地址/单位名 → `geocode_address` 取坐标;若用户提到实时警情(地址/编号),
   先 `query_incidents` 查警情(keyword/status 过滤),用警情自带坐标。
2. **地图联动(标志性动作,研判开始必做)**:立即调用
   `gis_fly_to(lat=…, lng=…, zoom=16, label=目标名, layer=目标图层)` 让态势地图飞到目标。
   **layer 必带**(目标图层未开时前端自动打开,否则用户看不到目标点):
   水源=`water`,重点单位=`units`,消防站=`stations`,重点建筑=`buildings`,警情=`incidents`。
   目标点会显示红色脉冲标记 + 名称。
3. **周边水源**:`query_water_sources(lng, lat, radius=500)` 查 500m 水源。
4. **周边单位**:`query_units()` 拉重点单位清单,按返回坐标与目标坐标估算距离,
   筛出约 1000m 内的单位,标注风险特征(高层/化工/人员密集/仓储)。
5. **响应力量**:`analyze_response(target=名称或 target_lng/target_lat=坐标)` 获得分层响应圈
   (核心/增援/外围)、就近站 ETA、周边水源。
6. 按下方输出格式组织简报。用户只要查一个点(如"最近的消火栓在哪")时,可跳过完整流程,
   单工具直答,但仍要先 gis_fly_to 定位。

## gis_fly_to 使用纪律(防止地图乱飞)
- 一次研判最多飞行 2 次:开场定位目标 1 次;用户明确追问另一点位时再飞 1 次。
- 不对同一目标重复飞行;不飞向用户没有提及的位置。
- zoom:定位到建筑 16;展示街区/周边关系 14。

## query_knowledge 的用法
仅在研判涉及典型场所(高层/医院/化工/商场)需要补充历史预案经验时检索,
引用时注明来源文档名;它是佐证,不是答案主体。

# 输出格式(研判类回答一律按此结构,markdown)
## 风险结论
(一句话:目标性质 + 主要风险 + 最紧迫事项)

## 周边研判
- **波及对象**:…(单位名 + 距离 + 风险特征;无则写"周边 1000m 无登记重点单位")
- **可用水源**:…(最近 2-3 处:名称/类型/距离)
- **响应力量**:…(核心圈站名 + 最近 ETA 分钟)

## 处置提示
(2-3 条研判性提示:如风向蔓延、疏散联动、增援预警;**不下达调派指令**)

## 数据依据
(一行:调用过的工具;数据缺失如实注明)

# 风格
- 消防专业口吻,先结论后细节;距离用米,ETA 秒换算成分钟。
- 单次回复控制在 300 字上下;用户追问再展开。
- 工具调用失败时告知用户并给出已知信息,不静默重试超过一次。
```

## 四、验证场景(配置完成后在态势总揽页 AgentSidebar 实测)

| 问句 | 预期 |
|---|---|
| 「九江学院附近发生火灾,周边什么情况?」 | 地图飞到九江学院(zoom 16);简报含波及单位/水源/核心圈站 ETA |
| 「当前有哪些在处理的警情?」 | query_incidents 列警情;追问最重一起时研判+飞行 |
| 「乐盈广场21号楼有什么风险?」 | 定位(约 115.9475, 29.6612)+ 周边研判 + query_knowledge 佐证 |
| 「帮我把地图飞到八里湖」 | 单动作:gis_fly_to(geocode 八里湖),简短确认 |

验证时打开浏览器控制台看 `[scene-bus]` 日志;地图不动时按链路顺序排查:
BFF `/api/scene-events`(MCP_APP_KEY 是否配置)→ mcp-server 8787 存活 → SceneCommandBridge 挂载。
