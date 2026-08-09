# 演练对抗智能推演 — 实施计划

> 日期:2026-08-09 | 分支:`feature/drill-simulation`
> 设计依据:`plan/2026-08-09-drill-simulation-design.md`(v2)
> 范围:子项目5(agent 接入+桥接+MCP)+ 子项目6(演练推演)
> 执行方式:subagent-driven(SDD),每任务一执行者 + task-reviewer + 最终分支审查

---

## 全局约束

- **坐标系/认证**:agent-chat 走 BFF(`/uagent-service/.../agent-chat` route 透传),header `X-App-Key`(`NEXT_PUBLIC_X_APP_KEY`);MCP 用 `MCP_APP_KEY`
- **ustudio-sdk 2.0.3**:placeTwins/navigateWithinScene/setViewMode/ObjectBatch 已可用
- **lib/ 不得 import src/**(vitest `@` 别名仅映射仓库根);lib/ 用 `import type` + 函数内 require 模式引用 leaflet/soonspace
- **纯逻辑进 lib/(可单测)**:SSE 解析、function_identifier 映射、状态机规则、事件树数据 —— 组件只编排
- **scene action 总线**:5B 新增 action 走现有 `sceneLog.addSceneAction`,executor 扩展在 `lib/scene-action-executor.ts`
- **MVP 兜底**:云端 agent 配置受阻时,推演引擎用本地规则脚本 agent(确定性),agent-chat 接入后切换

---

## 子项目5:agent 接入 + 本体功能桥接 + MCP(公共底座)

### Task 0:实测 agent-chat 程序化 + SSE 格式(前置验证)

**目标**:确认 agent-chat 程序化 POST 可行 + 摸清 SSE 中 `function_call`/`tool_call` 的具体结构(主智能体本体功能输出格式)。

**做法**:
- POST `/uagent-service/api/agent/v1/apps/agent-chat`,body={messages:[{role:user,content:"场景id=465718852859613184,飞向1号楼"}], app_id, forwardedProps:{scene_id}, passthroughProps:{}},header X-App-Key
- 流式收 SSE,逐事件打印,识别 function_call(function_identifier + input_params)/tool_call/文本段
- 对照主智能体 instructions 的本体功能列表,确认触发与格式

**产出**:`plan/drill-agent-chat-sse-format.md`(SSE 事件结构 + function_call/tool_call 字段实证)
**验收**:能从 SSE 解析出至少 1 个 function_call(如飞向/高亮)+ 文本
**依赖**:无

---

### Task 5A:agent-chat 接入层

**5A.1 lib/agent-chat-client.ts(纯逻辑,可单测)**
- `postAgentChat({messages, app_id, forwardedProps, passthroughProps, signal})`:POST BFF route,返回 SSE ReadableStream
- `parseAgentChatSSE(stream)`:异步迭代,产出结构化事件 `{type:'text'|'function_call'|'tool_call'|'finish', ...}`
- 类型:`AgentChatEvent`、`FunctionCall{function_identifier, input_params}`、`ToolCall{tool, args}`
- 单测:`lib/__tests__/agent-chat-client.test.ts`(用固定 SSE 字节流验证解析)

**5A.2 AgentChat 真接替代 mock**
- `src/components/AgentChat.tsx`:去掉 matchScript mock,改用 agent-chat-client
- 用户消息 → postAgentChat → 流式渲染文本 + 派发 function_call(经 5B 桥接)/tool_call(经 MCP)
- 保留 addSceneAction 兼容(过渡)

**验收**:用户在 AgentChat 输入"飞向1号楼",真实 agent 响应 + 3D 场景 flyToObject
**依赖**:Task 0(SSE 格式)+ 5B(function_call 桥接)

---

### Task 5B:已并入 6.3(取消独立)

原 5B(平台 WS 执行监听)取消 —— Task0 实测:agent-chat SSE 已含 `batchInvokeTwinsFunction` 的 tool-call/tool-result,5A 已解析;6.3 AgentRunner 消费 SSE 时筛选执行类 tool-call 记事件树;RealSceneView SDK init 自动连 WS 执行 3D,不需 web 桥接/监听。

---

### Task 5C:业务查询 + 推演控制 MCP

**5C.1 业务查询 MCP(mcp-server)**
- 注册工具(经 mcp-server 现有注册机制):
  - `query_building_profile(building_id)` → znya `/api/business/key-buildings/{id}`
  - `query_facilities(building_id, floor?, type?)` → `/api/business/fire-facilities`
  - `query_key_parts(building_id)` → 重点部位聚合
- 单测:工具入参/出参契约

**5C.2 推演控制 MCP(mcp-server,对接推演引擎 6.2/6.3 的状态)**
- `query_scene_state(drill_id)` → 当前态势(火势/到场/被困)
- `inject_event(drill_id, event)` → 写推演引擎 EventBus
- `report_decision(drill_id, decision)` → 写事件树 + 触发渲染
- 注:推演引擎 6.x 完成后对接,MVP 可先桩

**5C.3 云端主智能体配 mcp_servers(指引文档)**
- `plan/drill-mcp-config-guide.md`:ustudio 平台主智能体应用配 mcp_servers 指向 `http://111.75.149.221:8787`,MCP_APP_KEY 认证,工具白名单(query_*/inject_event/report_decision)
- 用户在平台操作

**验收**:MCP 工具经 mcp-server 可调(本地 curl);云端 agent tool_call 能命中(待平台配置后)
**依赖**:5A.1(ToolCall 类型);6.2/6.3(推演引擎,5C.2 对接)

---

## 子项目6:演练对抗智能推演(重点)

### Task 6.0:对象总览建筑档案(前置,数据底座)

**目标**:znya 建筑数据 → web 建筑档案面板(替代 mock BuildingProfile)。

**做法**:
- `src/api/building-profile.ts`:fetch key_buildings + fire_facilities(按 building_id)
- `src/components/panels/BuildingProfilePanel.tsx`:真实档案(结构/供水/关键部位/室内设施/联系人)
- lib/ 映射:`lib/building-mapper.ts`(znya → BuildingProfile 类型)

**验收**:进对象总览选 21号楼 → 真实档案数据展示

> **spec 偏离注记(review)**:5 分组按 znya 真实 schema 重组(建筑概况/消防系统/关键部位/防火设计/联系人,对应 structure_designs+surroundings+key_floors+fire_facilities)。plan 原 spec 的 mock 形态分组(结构/供水/关键部位/室内设施/联系人)作废 —— 那基于旧 mock BuildingProfile,与 znya 真实数据形态不匹配。
**依赖**:无(znya 数据已有)

---

### Task 6.1:推演引擎 — Timeline(tick 调度)

**lib/drill/timeline-engine.ts(纯逻辑,可单测)**
- `TimelineEngine`:tick 调度,速度控制(暂停/1×/5×),单轮时钟,事件触发(onTick)
- 不依赖 React(纯类/函数),组件包装成 hook(`useTimeline`)
- 单测:暂停/恢复/变速/tick 计数

**验收**:启动引擎,1× 每秒 tick,5× 加速,暂停停

> **hook 单测 follow-up(review)**:`use-timeline` hook 单测(RTL + fake timers,验 unmount stop)推迟 —— 仓库未装 `@testing-library/react`。待装 RTL 后补 `src/drill/hooks/__tests__/use-timeline.test.ts`。engine 层 12 测试已覆盖核心逻辑。
**依赖**:无

---

### Task 6.2:推演引擎 — EventBus + DisasterState(状态机)

**lib/drill/event-bus.ts + lib/drill/disaster-state.ts(纯逻辑,可单测)**
- EventBus:剧本 seed 注入 + inject_event + 决策事件,按时间分发
- DisasterState:火势等级(0-4)× 到场力量(站/车/人 + ETA)× 被困人数 × 建筑损伤
- 规则推进(每 tick):
  - 火势按风向/强度/建筑结构蔓延(规则表)
  - 到场力量按 ETA 递减 → 到场 → 转可用
  - 战术效果(出水/泡沫)压制火势
  - 被困按救援减员
- 单测:给定初始态 + 事件序列 → 状态演化正确

**验收**:剧本 seed + 对抗 inject → 状态机正确推进(火势/到场/被困数值合理)
**依赖**:6.1(Timeline)

> **spec 偏离注记(review)**:风向/风速 MVP 仅可视化(记录蔓延方向供 3D/事件树用),数值规则只走建筑结构(STRUCTURE_FIRE_MODIFIER 修正 fireEscalateTicks)。待版本2 加 wind→fireEscalateTicks 系数(风速/风向影响蔓延速率)。

---

### Task 6.3:推演引擎 — AgentRunner(agent 编排,含原 5B 执行记录职责)✅

> **完成(SDD 批次3)**:lib/drill/agent-runner.ts + lib/drill/drill-recorder.ts(从 6.4 前置纯逻辑)+ 43 测试通过。MVP 形态决策:推演引擎 source of truth 在浏览器,AgentRunner 解析 SSE 时**本地镜像执行** report_decision/inject_event(写本地 EventBus 驱动 DisasterState)+ 记 DrillRecorder;batchInvokeTwinsFunction 仅记事件树(3D 由平台 WS→SDK 自动);mcp-server drill-control 保持 stub(供用户对话经云端 MCP 链路,形态①/②待 MVP 后定)。

**lib/drill/agent-runner.ts + src/drill/hooks/use-agent-runner.ts**
- AgentRunner:事件/tick → 程序化 postAgentChat(5A.1)
  - 指挥 agent(app_id_c,forwardedProps=当前态势)→ 决策 + tool_call
  - 对抗 agent(app_id_r,定时/随机)→ inject_event
- 解析 SSE → 派发:
  - **本体功能执行** tool_call(`batchInvokeTwinsFunction` 等,原 5B 职责)→ 3D 由平台 WS→SDK 自动执行(RealSceneView 在线即可);**记事件树**(执行节点 + tool_result)
  - `query_*`/`inject_event`/`report_decision` tool_call → 5C MCP
  - 决策文本 → 事件树
- 集成 5A/5C + 6.1/6.2(状态)
- 注:3D 执行不经 web 桥接(平台 WS 自动),AgentRunner 只记录 tool_call/tool_result 到事件树

**验收**:事件触发 → 指挥 agent 决策 → 3D 执行被记录进事件树 + MCP 查建筑;对抗 agent 注入特情
**依赖**:5A/5C + 6.1/6.2

---

### Task 6.4:事件树(React Flow)

**lib/drill/drill-recorder.ts(纯逻辑)+ src/drill/EventTree.tsx**
- DrillRecorder:节点(灾情/决策/状态/特情/到场)+ 因果边,追加式
- EventTree:React Flow 渲染,动态生长(自动布局)+ 回溯(点节点 → 推演引擎跳该时刻快照)
- 节点详情面板(点节点看 agent 决策依据 + 当时态势)

**验收**:演练进行时事件树实时生长;点节点回溯
**依赖**:6.3(决策入树)

---

### Task 6.5:演练大屏集成

**src/views/DrillView.tsx + src/drill/**
- 布局:时间轴 + 3D 场景 + 事件树 + agent 决策面板
- 剧本选择 + 启动/暂停/变速
- 接 App.tsx 模块路由(演练对抗模块)

**验收**:演练对抗模块可进入,布局完整,各区域联动
**依赖**:6.1-6.4 + RealSceneView

---

### Task 6.6:MVP 剧本 + 端到端联调

**src/drill/scenarios/building-21.ts + 端到端**
- 21号楼剧本(JSON schema:scene_id=465718852859613184 / 着火点 / 物质 / 被困 / 风向 / 时间线 seed)
- 指挥 + 对抗 agent 端到端跑通
- 验证闭环:剧本→事件→agent 决策→3D 渲染+状态推进+事件树→新事件→...→结束复盘

**验收**:21号楼剧本完整跑一轮,3D 实时呈现 + 事件树生长 + 可回溯
**依赖**:6.0-6.5 全部 + 云端 agent 配置(对抗 agent)+ 5C.3

---

## 执行顺序与依赖

```
Task0(实测 SSE)─┐
               ├─→ 5A(接入)─┐
               ┘             ├─→ 6.3(AgentRunner)─→ 6.4(事件树)─→ 6.5(大屏)─→ 6.6(MVP)
5B(桥接)──────────────────────┤                  ↑
5C(MCP)───────────────────────┘                  │
6.0(建筑档案)────────────────────────────────────┤(6.3 查建筑)
6.1(Timeline)─→ 6.2(EventBus+State)──────────────┘(6.3 依赖状态)
```

**建议批次**:
1. Task0 + 6.0 + 6.1(并行,无依赖)✅
2. 5A + 5C.1 + 6.2(依赖 Task0/6.1)✅
3. 5C.2 + 5C.3 + 6.3(依赖 5A/5C.1/6.2;6.3 含原 5B 执行记录职责)✅ — MVP 形态:AgentRunner 浏览器本地镜像执行推演控制 tool_call(report_decision/inject_event 写 EventBus)+ DrillRecorder 纯逻辑从 6.4 前置;drill-control stub 供用户对话链路(形态①/②待定,见 drill-mcp-config-guide.md)
4. 6.4 + 6.5(依赖 6.3)
5. 6.6(全部就绪后端到端)

---

## 验收清单(子项目完成标准)

- [ ] 子项目5:AgentChat 真接云端;function_call 驱动 3D(飞向/高亮/导航/摆放/视角);MCP 业务查询可用
- [ ] 子项目6:21号楼剧本跑通,多 agent 动态推演,3D 实时呈现,事件树动态生长+回溯
- [ ] 全局:tsc 通过;lib/ 单测通过;lib/ 不 import src/
