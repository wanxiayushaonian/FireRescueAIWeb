# agent-chat SSE 格式实证(Task0 产出)

> 日期:2026-08-09 | 实测:POST `https://fc.xwbuilders.com/uagent-service/api/agent/v1/apps/agent-chat`
> X-App-Key: `NEXT_PUBLIC_X_APP_KEY`(akXGOP...)| 主智能体 app_id: `2084563280205111297`

## 1. 程序化 POST(✅ 可行,绕过 SDK UI)

```http
POST /uagent-service/api/agent/v1/apps/agent-chat
X-App-Key: akXGOP92YHDUIHSTBGQKVWD5ZSHASB
Content-Type: application/json
Accept: text/event-stream

{
  "content": "场景id 465718852859613184,飞向21号楼主楼",
  "app_id": "2084563280205111297",
  "forwardedProps": { "scene_id": "465718852859613184" },
  "stream": true
}
```

- 顶层 `content`(不是 `messages`)—— 缺 content 报 `MissingParameter`
- `forwardedProps` → 注入主智能体 SystemMessage(LLM 感知 scene_id 等)
- `passthrough_props` → 透传 MCP 工具 `_context.passthrough_props`
- 无需 Authorization(应用级 X-App-Key 即可)

## 2. SSE 事件类型(✅ 实测)

每行 `data:{json}`,按 `type` 派发:

| type | 字段 | 说明 |
|---|---|---|
| `conversation_id` | conversation_id | 会话 id(首个事件) |
| `reasoning` | content, agent | 思考流(逐 token,agent 名) |
| **`tool-call`** | toolCallId, **toolName**, args(JSON 字符串), agent, parentToolCallId | 工具调用 |
| `tool-result` | toolCallId, toolName, result(JSON), agent | 工具返回 |
| `text` | content, agent, parentToolCallId | 输出文本流(逐 token) |
| `finish` | finishReason, usage?, parentToolCallId | 段结束(token 用量) |
| `timing` | phase, name, elapsedMs | 计时 |

## 3. tool-call 结构(✅)

```json
{"type":"tool-call","toolCallId":"call_xxx","toolName":"spacequery",
 "args":"{\"query\":\"有哪些建筑\",\"scene_id\":\"465718852859613184\"}",
 "agent":"空间信息查询或推理及本体功能调用","parentToolCallId":"call_yyy"}
```

- `args` 是 **JSON 字符串**(需二次 parse)
- `agent`:发言 agent 名(`MultiAgent` 主 / 子 agent 中文名)
- `parentToolCallId`:挂在哪个父 tool-call 下(主调 `task` 分发子 agent → 子 agent 输出挂该 task 的 toolCallId)

## 4. toolName 集合(✅ 查询/元数据类已清)

| toolName | 作用 | 类型 |
|---|---|---|
| `task` | 主→子 agent 分发(args: description + subagent_type) | 编排 |
| `spacequery` | 空间/知识图谱查询(查本体实例,返回 rows) | 查询 |
| `gisListTwinsInstances` | GIS 列本体实例 | 查询 |
| `getAllTwinsDefinition` | 所有本体定义 | 元数据 |
| `getTwinsDefinitionDetailByIdentifier` | 本体定义详情 | 元数据 |
| **`getTwinsFunctionByIdentifier`** | 按标识查本体**功能**定义(飞向/高亮等的 function_identifier) | 元数据 |
| `getTwinsInstanceDetail` | 本体实例详情 | 查询 |
| `siteInstance` | 场景实例(疑似执行入口,⚠️待确认) | 待确认 |
| `mcp_result_grep` / `mcp_result_view` | MCP 结果处理(内置) | 辅助 |

## 5. 多 agent 编排(✅)

- 主智能体(`MultiAgent`)收到消息 → reasoning 判断 → `task` 工具分发子 agent(args.subagent_type=中文角色名)
- 子 agent(如"空间信息查询或推理及本体功能调用")独立 reasoning + 调工具(spacequery/getTwins*),输出挂 parentToolCallId
- 子 agent 当前是**平台内置**(主智能体 apps 配置 `sub_agents:[火灾等级判定]`,但 SSE 出现"空间查询"子 agent —— 平台默认提供)

## 6. ✅ 本体功能执行:batchInvokeTwinsFunction(平台配置后实测)

配置主智能体 tools 后,agent 主动调本体功能,toolName = `batchInvokeTwinsFunction`:

```json
{"type":"tool-call","toolName":"batchInvokeTwinsFunction",
 "args":"{\"function_identifier\":\"flyto\",\"input_params\":[],\"twins_instance_ids\":[\"465718888976764928\"]}",
 "agent":"空间信息查询或推理及本体功能调用"}
```

- `function_identifier`:本体功能标识(蛇形),如 `flyto`(飞向);其余对照主智能体 instructions:highlight / cancelHighlight / hide / show / setOpacity / 沿路径移动 / navigateWithinScene / placeTwins / deleteTwins / setScene ...
- `input_params`:功能入参列表(飞向无参 → [])
- `twins_instance_ids`:目标本体实例 id 列表

**tool-result(平台返回)**:发 `message_id` + `status:PROCESSING`(异步),提示「**FAIL/NOT_FOUND 常见原因是无在线场景前端可执行**」—— 即本体功能执行需要**在线场景前端(web RealSceneView)**。

### 6.1 关键洞察:执行经平台 WS → web SDK,不经 SSE 解析

```
agent tool-call batchInvokeTwinsFunction
  → 平台发 message(message_id)→ 平台 WS → 在线场景前端 SDK(createUStudioSdk init 时建 WS)
  → SDK/Soonspace 执行(flyto→相机)→ 结果 → tool-result 给 agent
```

**web 不需要从 agent-chat SSE 解析 function_call 再桥接 SoonspaceRuntime** —— 平台经 WS 直接驱动 SDK 执行(只要 RealSceneView 在线 + SDK init 连了 WS)。

### 6.2 对子项目5的影响(重大简化)

- **5A SSE 解析**:仍需(收 agent 决策文本 + tool-call 用于事件树/推演记录)
- **5B 本体功能桥接:大幅简化** —— 执行平台自动(WS+SDK),web 只需 ① SDK init 连 WS(RealSceneView 已有)② 监听 WS 执行事件(记事件树/推演状态)。**不用做 function_identifier → SoonspaceRuntime 桥接**
- **5C 业务/推演 MCP**:仍需(znya 查询 + 推演控制,ustudio 没有)

新增 toolName:`batchInvokeTwinsFunction`(执行)/ `queryFunctionResult`(查执行结果)/ `_sub_agent_tool_calls`(子 agent 调用聚合)

## 7. 对推演引擎(AgentRunner)的要点

- 程序化调用:每事件/tick POST agent-chat(content=态势描述,forwardedProps=火势/到场/被困)
- 流式收 SSE,解析 tool-call → 派发(toolName 路由)
- agent 处理慢(单轮 30-100s),推演时间轴需考虑(agent 决策异步,不阻塞 tick)
- conversation_id 复用:同一演练用同一会话(保持上下文)
