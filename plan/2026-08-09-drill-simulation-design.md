# 演练对抗智能推演 — 设计文档(v2)

> 日期:2026-08-09 | 分支:`feature/drill-simulation`
> 范围:子项目5(agent 接入 + 本体功能桥接 + MCP,公共底座)+ 子项目6(演练对抗智能推演,重点)
> v2 更新:查清 agent 本体功能执行链路(`function_call` → web → SoonspaceRuntime,非平台直驱),子项目5 重拆 5A/5B/5C
> 原则:先做 agent 公共底座(子项目5),再做演练推演(子项目6)

---

## 一、背景与目标

### 1.1 愿景锚点

全生命周期数字预案平台五场景(平时→战时):态势总览 → 对象总览 → 熟悉考核 → **演练对抗** → 实战指挥。态势总览已真实化,本设计转向**演练对抗**:多 agent 按时间从事件池动态推演 + 事件树可视化(动态生长,类游戏事件树)。

### 1.2 MVP(用户已确认)

- 21 号楼 1 剧本(着火位置/物质/被困/风向)
- 指挥 agent + 对抗 agent(评估后续)
- 简化状态机(火势 × 到场力量 × 被困,规则推进)
- 事件树(React Flow,动态生长 + 回溯)
- 3D 联动(placeTwins/navigateWithinScene/setViewMode 实时呈现)

---

## 二、现状盘点

### 2.1 已具备

| 组件 | 状态 | 说明 |
|---|---|---|
| ustudio-sdk | ✅ 2.0.3 | placeTwins / navigateWithinScene / setViewMode / ObjectBatch |
| soonspacejs + @soonspacejs/* | ✅ 2.15.17 | 3D 引擎 + 插件 |
| **sceneLog 总线** | ✅ | addSceneAction / subscribeSceneLog |
| **scene-action-executor**(`lib/scene-action-executor.ts`) | ✅ 框架 | mapSceneAction / subscribeSceneActions |
| **RealSceneView executor** | ⚠️ 仅 4 action | flyToObject / highlight / switchFloor / resetCamera |
| **SoonspaceRuntime**(`lib/soonspace-runtime.ts`) | ✅ 能力全 | setViewMode / flyToObject / drawReachableRoutes / drawConnectivityRoutes / loadUserAddedInstances(placeTwins)等 —— 但多数未接入 executor |
| **ustudio 平台应用**(X_APP_KEY) | ✅ | 「主智能体」(multi_agent/main/qwen3.7-plus,**内置本体功能**:飞向/高亮/导航/摆放/模型操作,经 function_identifier)+ 「火灾等级判定」(sub,I-V 级) |
| mcp-server | ✅ 8787(公网) | MCP_APP_KEY 认证 |
| znya 数据 + 生产 | ✅ | key_buildings(含 21号楼 scene_id)/ fire_facilities / key_units... |

### 2.2 执行链路 gap(关键)

```
AgentChat(本地 mock) → addSceneAction → sceneLog
                                          ↓ subscribeSceneActions
                                    scene-action-executor
                                          ↓
                              RealSceneView executor(仅 4 action)
                                          ↓
                                    SoonspaceRuntime
```

| # | gap | 说明 |
|---|---|---|
| 1 | agent-chat SSE 未真接入 | AgentChat 用 matchScript mock,没真收云端 agent-chat SSE |
| 2 | function_call 无人消费 | agent 输出的 function_identifier(飞向/高亮/导航/摆放)没解析执行 |
| 3 | executor 只 4 action | SoonspaceRuntime 的 setViewMode/drawReachableRoutes/placeTwins 未接入 |
| 4 | 业务/推演 MCP 无 | znya 查询 + 推演控制缺 |

### 2.3 关键结论

**agent 本体功能(3D)经 agent-chat SSE 输出 `function_call`(function_identifier + input_params)→ web 解析 → 调 SoonspaceRuntime 执行**。ustudio 平台不直接驱动 RealSceneView,**web 是执行方**。因此 3D 操作**不走 MCP 封装 SDK**,而是 function_call 桥接。

---

## 三、总体架构

```
┌──────────────────── web 前端(演练大屏)────────────────────┐
│  时间轴(暂停/1×/5×)+ 推演引擎(Timeline/EventBus/State)     │
│      │                                                       │
│      └─ AgentRunner:事件/tick → 程序化 POST agent-chat        │
│            (forwardedProps=态势, passthroughProps=scene_id)   │
│                  │ SSE                                       │
└──────────────────┼──────────────────────────────────────────┘
                   ▼
        云端 uagent(fc.xwbuilders.com)
        主智能体(编排)+ 火灾等级判定(sub)+ 对抗 agent
                  │ SSE: function_call(本体功能)+ tool_call(MCP)
                  ▼
        ┌── web SSE 消费层(5A)──┐
        │                        │
   function_call              tool_call
        │                        │
        ▼                        ▼
  本体功能桥接(5B)         MCP 执行(5C)
  function_identifier        tool → mcp-server:8787
  → SoonspaceRuntime         ├─ 业务查询 → znya
  (placeTwins/navigate/      └─ 推演控制 → 推演引擎
   setViewMode/batch)              │
        │                        │
        ▼                        ▼
  RealSceneView 渲染 + 事件树长节点 + 状态推进
```

**闭环**:事件 → AgentRunner 调 agent → SSE(function_call + tool_call)→ 5B 桥接渲染 + 5C MCP 执行 → 状态推进 + 事件树 → 新事件 → ...

---

## 四、子项目5:agent 接入 + 桥接 + MCP(公共底座)

### 5A. agent-chat 接入层

- **lib/agent-chat-client.ts**:封装程序化 POST `/uagent-service/api/agent/v1/apps/agent-chat`(BFF 透传 fc.xwbuilders.com),header X-App-Key,body={messages, app_id, forwardedProps, passthroughProps},流式解析 SSE
- **SSE 解析**:提取 `function_call`(function_identifier + input_params)+ `tool_call`(MCP 工具名 + 参数)+ 决策文本
- **AgentChat 真接**:替代 mock,用户对话也走真实 agent-chat
- 复用:推演引擎(AgentRunner)+ AgentChat(用户对话)都经此客户端

### 5B. 本体功能桥接 + executor 扩展

**function_identifier → SoonspaceRuntime 映射**(对照主智能体内置功能):

| 本体功能(function_identifier) | SoonspaceRuntime 方法 |
|---|---|
| 飞向 | flyToObject |
| 高亮 / 取消高亮 | highlightObject / clearObjectHighlight |
| 沿路径移动 / 导航(场景内/外) | drawReachableRoutes / navigateWithinScene / navigateFromExternal |
| 摆放实例 / 删除实例 | placeTwins / deleteTwins |
| 模型操作(楼层显隐/2D-3D/炸开) | setViewMode |
| 设置透明度 / 显隐 | ObjectBatch(setOpacity/show/hide) |

**scene-action-executor 扩展**:新增 action(place_role/navigate_indoor/set_view_mode/batch_highlight/clear_tactical)→ SoonspaceRuntime,与现有 4 action 并存。

### 5C. 业务查询 + 推演控制 MCP(mcp-server 注册)

**业务查询(MCP → znya `/api/business/*`)**:
- `query_building_profile`(建筑档案:结构/层数/分区/毗邻)
- `query_facilities`(消防设施,按楼层:消火栓/喷淋/出口)
- `query_key_parts`(重点部位:出口/消防电梯/防火分区/消控室/避难层)

**推演控制(MCP → 推演引擎)**:
- `query_scene_state`(当前态势:火势/到场力量/被困/已用路线)
- `inject_event`(对抗 agent 注入特情:风向突变/爆炸/二次被困)
- `report_decision`(决策入事件树 + 触发渲染)

**云端配置**:主智能体应用配 `mcp_servers` 指向公网 `http://111.75.149.221:8787`,MCP_APP_KEY 认证(平台操作,给指引)。

---

## 五、子项目6:演练对抗智能推演(重点)

### 5.1 对象总览建筑档案(前置,数据底座)

- znya `key_buildings` + `fire_facilities` 已有数据
- web 建筑档案面板(结构/供水/关键部位/室内设施/联系人),替代 mock BuildingProfile
- agent 经 `query_building_profile`/`query_facilities`/`query_key_parts` 读这些数据

### 5.2 推演引擎(web 前端,`src/drill/`)

| 模块 | 职责 |
|---|---|
| TimelineEngine | tick 调度 + 速度(暂停/1×/5×)+ 单轮时钟 |
| EventBus | 事件池:剧本 seed + 对抗 inject_event + 决策事件 |
| DisasterState | 状态机:火势等级(0-4)× 到场力量 × 被困 × 建筑损伤(规则推进) |
| AgentRunner | 事件/tick → 程序化 agent-chat(forwardedProps=态势)→ 解析 function_call/tool_call |
| DrillRecorder | 事件树数据(节点 + 因果边),供 React Flow |

### 5.3 多 agent(云端 uagent,程序化触发)

| agent | role | 职责 | 触发 |
|---|---|---|---|
| 主智能体(已有) | main | 编排 + 本体功能(3D 操作) | 每事件 |
| 火灾等级判定(已有) | sub | 灾情→等级→力量调度 | 关键事件 |
| 对抗 agent(新增) | sub | 制造特情(inject_event) | 随机/定时 |
| 评估 agent(后续) | sub | 复盘→归档预案库 | 演练结束 |

### 5.4 事件树(React Flow)

- 节点:灾情(红)/决策(蓝)/状态(灰)/特情(橙)/到场(绿)
- 边:因果 + 时间序
- 动态生长(推演中)+ 回溯(点节点跳该时刻)
- 演练结束:整树 = 复盘材料

### 5.5 演练大屏布局

```
时间轴控制 + 剧本选择
┌─────────────────────┬──────────────────┐
│                     │ 事件树(React Flow)│
│ 3D 场景(RealSceneView)│  动态生长         │
│ 着火/蔓延/人员/路线   ├──────────────────┤
│                     │ agent 决策面板    │
└─────────────────────┴──────────────────┘
```

---

## 六、风险与待定

| # | 风险 | 应对 |
|---|---|---|
| 1 | agent-chat SSE 格式(function_call/tool_call 具体结构) | 子项目5 Task0 实测验证 |
| 2 | 云端配 mcp_servers + 对抗 agent | 平台操作,给指引;MVP 可先规则脚本兜底对抗 |
| 3 | function_identifier 全集(主智能体 instructions 列了参考集) | 5B 按 needs 实现,逐步补 |
| 4 | 状态机简化度 | MVP 用规则表(风向×强度×结构→蔓延) |
| 5 | 剧本格式 | JSON schema(scene_id/着火点/物质/被困/风向/时间线 seed) |

---

## 七、实施顺序

**子项目5(5A → 5B → 5C)先做**,子项目6 依赖它。子项目6 内:对象总览建筑档案(6.0 前置)→ 推演引擎 → 事件树 → agent 接入 → MVP 联调。

详细任务分解见 `plan/2026-08-09-drill-simulation-plan.md`。
