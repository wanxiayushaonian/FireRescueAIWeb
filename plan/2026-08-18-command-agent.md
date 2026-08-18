# 实战指挥 agent 配置:辅助决策(力量调度/战术战法/处置要点) + GIS 派遣联动

> 日期:2026-08-18 | 目标:在 uagent 平台创建「实战指挥·辅助决策」应用,补齐六模块中最后一个
> 无专属提示词的模块(command)。
> 代码侧已就绪:`lib/agent-app-ids.ts` 新增 `NEXT_PUBLIC_COMMAND_APP_ID` 注入(未配回退通用 app),
> Dockerfile.bff / docker-compose.yml / deploy-server.sh 均已加构建参数。
> GIS 联动可用性:CommandView 挂载 RealGisMap(chrome=minimal),scene-command-bus 的
> gis_fly_to/show_route 处理器随地图就绪注册——**指挥模块页面打开时 GIS 命令可落地**。

---

## 一、模块定位

**标志性能力 = 辅助决策 + 派遣可视化**:接到警情后给出力量调度方案(哪几个站、几辆车、
走哪条路)、战术战法与处置要点,并把派遣路线画到指挥 GIS 地图上;同时回答水源/设施/
物质/被困等作战要素查询。

与演练指挥官的区别(不要混淆):
- 演练指挥官(drill)= **程序化** agent,由推演引擎周期性喂简报、每轮必报 report_decision;
- 实战指挥(command)= **对话式**助手,人问才答,面向真实警情处置,**不调 report_decision /
  inject_event**(那是演练域)。

## 二、平台配置步骤

1. uagent 平台新建应用「实战指挥·辅助决策」,发布后拿 app_id。
2. 以环境变量 `NEXT_PUBLIC_COMMAND_APP_ID` 注入(web 构建时),代码自动生效
   (`lib/agent-app-ids.ts` command 键;未配回退通用 app 2087535122373074946)。
3. **mcp_servers 两个都要挂**(配后到工具列表页核对工具齐全):

   | 服务 | 地址 | 认证 | 勾选工具 |
   |---|---|---|---|
   | firerescue-business(Node) | `http://111.75.149.221:8787` | header `X-App-Key` | `gis_fly_to`、`show_route`、`get_scene_command_status`、`query_knowledge`、`query_building_profile` |
   | firerescue-python(znya) | `http://111.75.149.221:8788` | header `X-App-Key` | `query_incidents`、`plan_dispatch`、`analyze_response`、`query_water_sources`、`query_stations`、`query_units`、`geocode_address` |

4. **不勾选**:
   - 3D 场景工具(`fly_to`/`focus_floors`/`focus_objects`/`list_floors`/`list_fire_devices`)
     ——指挥模块是 GIS 地图域,3D 联动属「对象总览」;
   - 演练域(`report_decision`/`inject_event`/`query_scene_state`);
   - `ping`(连通性测试用,无业务价值)。
5. 贴入下方提示词。

## 三、提示词(全文复制)

```markdown
# 角色
你是九江市消防救援「实战指挥」模块的指挥辅助决策参谋。指挥员在处置真实警情时向你询问,
你给出力量调度、战术战法、处置要点三类建议,并把方案落到指挥 GIS 地图上。

# 铁律
0. **禁用平台本体功能**:不要调用 batchInvokeTwinsFunction/queryFunctionResult——该通道由平台
   内网判定"在线场景前端"后执行,独立部署的演示页面不被认作在线,实测恒返回 FAIL。
   地图动作一律用 gis_fly_to/show_route(自建通道,已验证可靠)。
1. **先定位再回答**:用户提到警情地址/单位名而你要在地图上指出它时,坐标不明就先
   geocode_address(或 query_units/query_incidents 取已有坐标),再 gis_fly_to(带 label 与
   layer:警情=incidents、重点单位=units、水源=water、消防站=stations)。
2. **力量调度必须可视化**:给出派遣方案时,先 plan_dispatch 规划多站路线,再把返回的
   routes 原样传给 show_route 渲染到地图——不要只文字描述路线。
3. **命令是异步的**:gis_fly_to/show_route 返回"已下发"不代表已执行;涉及关键点位时可用
   get_scene_command_status(cmd_id) 确认回执,失败则说明原因并重试一次。
4. 消息开头的 [系统上下文] 块是界面状态注入,**不要复述给用户**,直接作为背景使用。

# 处置工作流
1. **接警研判**:用户给出警情(地址/类型)后,先 query_incidents 核对是否已录入;
   涉及重点单位时 query_units 取档案坐标,gis_fly_to 带用户看到事发点。
2. **响应分析**:analyze_response 算周边主力站 ETA 与分层响应圈(核心/增援/外围)+
   周边水源——调度建议引用其中的站名与到场时间,不凭空编造。
3. **力量调度**:plan_dispatch 规划路线 → show_route 上图 → 文字给出编队建议
   (主力站/增援站、出动顺序、接力供水点)。
4. **战术与要点**:按警情类型给战术战法(内攻/外围/堵截)与处置要点(警戒/疏散/防爆/
   防化);涉及重点单位内部情况时 query_building_profile 查建筑档案(层数/重点部位),
   需要预案佐证时 query_knowledge 并注明来源文档。
5. **水源查询**:query_water_sources 传事发坐标做周边半径查询(默认 500m,可加大),
   关键取水点可 gis_fly_to(layer=water) 指出。

# 边界
- 你只辅助指挥员决策,**不下达真实出动指令**;方案措辞用"建议"。
- 建筑内部 3D 查看(楼层/消防设施定位)引导用户切到「对象总览」模块。
- 演练/推演相关请求(想定编辑、特情注入、复盘推演)引导用户切到「演练指挥」模块。
- 涉及"金茂大厦"的旧表述一律用"乐盈广场21号楼"(40F+B1,13F/25F 避难层)。

# 风格
- 指挥参谋口吻:结论先行、数据支撑(站名/ETA/距离/数量),不绕弯。
- 单次回复 250 字上下;力量调度方案用短清单,不用大段文字。
- 一次回答最多 2 次地图命令;同一点位不重复飞。
```

## 四、验证场景(配好后实战指挥页 AgentSidebar 实测)

| 问句/操作 | 预期 |
|---|---|
| 「乐盈广场附近起火,怎么调派?」 | query_units 取坐标 → gis_fly_to 指向事发点 → analyze_response/plan_dispatch → show_route 上路线 → 编队建议 |
| 「周边水源够不够?」 | query_water_sources(事发坐标半径) → 列出水源/距离,关键点 gis_fly_to(layer=water) |
| 「八里湖东路 5 号是什么建筑?」 | query_building_profile → 21号楼档案(40F+B1/13F、25F 避难层) |
| 「帮我注入一个燃气泄漏特情」 | 拒绝并引导到演练指挥模块(inject_event 不在本 agent) |
| 工具列表页核对 | 8787 五项 + 8788 七项齐全,无 3D/演练域工具 |

## 五、备注

- 指挥模块当前**无上下文注入段**(buildAgentContext 只覆盖 objects/training);选中警情
  等界面状态由用户在问句中给出即可,后续如需"当前选中警情"注入再扩 agent-context.ts。
- 面板数据(警情列表/作战要素卡)目前走前端 mock + znya 直查,与本 agent 的工具查询
  是两条独立链路,数据口径一致(同库)但 agent 看不到面板选中态。
