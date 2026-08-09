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

## 6. ⚠️ 待确认:本体功能执行(飞向/高亮/摆放)的 toolName

**三次测试未抓到本体功能执行的 tool-call**:
- "飞向1号楼":agent 一直 spacequery/getTwinsFunction 查询(LLM 多轮),100s 超时未到执行
- "直接飞向实例id":agent 直接 text 回复(没调工具)
- 主智能体 apps 配置 `tools:[] mcp_servers:[]` 空

**推断**(待 5B 实测/平台确认):
- 本体功能执行可能是 `siteInstance` 或 `setScene`(function_identifier 走 out_instance_id)的 tool-call
- 或经 `getTwinsFunctionByIdentifier` 查到 function_identifier 后,用特定 toolName 调用
- 也可能主智能体需在平台**配 tools/mcp_servers**(把飞向/高亮等本体功能暴露为工具)才能让 agent 主动调

**对子项目5的影响**:
- 5A SSE 解析:按 type 派发,tool-call 统一解析(toolName + args)—— ✅ 已可做
- 5B 桥接:已知查询类 toolName 可映射(spacequery→不渲染/gisListTwins→不渲染);**执行类(飞向/高亮/摆放)toolName 待补** —— 需 5B 实测时抓一次完整执行流,或平台配置确认
- 建议先做 5A/5C(不依赖执行类 toolName),5B 执行类映射等抓到真实 toolName 再补

## 7. 对推演引擎(AgentRunner)的要点

- 程序化调用:每事件/tick POST agent-chat(content=态势描述,forwardedProps=火势/到场/被困)
- 流式收 SSE,解析 tool-call → 派发(toolName 路由)
- agent 处理慢(单轮 30-100s),推演时间轴需考虑(agent 决策异步,不阻塞 tick)
- conversation_id 复用:同一演练用同一会话(保持上下文)
