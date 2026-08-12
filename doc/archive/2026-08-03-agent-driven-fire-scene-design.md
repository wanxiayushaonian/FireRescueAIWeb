# 智能消防 3D 场景 — Agent 驱动设计 (Spec)

- 日期:2026-08-03
- 项目:`jarvis-ustudio-scene`(`/home/ljb/program/FireRescueAI/web`)
- 状态:已与用户对齐,待审阅 → 转 `writing-plans`

---

## 1. 背景与定位

构建一个**智能体驱动的 3D 智能消防场景**,核心定位:

- **主**:训练 / 演练仿真平台(C)——指挥员为主角的多角色协同演练。
- **次**:方案展示(A)——可对外演示"agent + 3D"能力。

约束(来自赛事方):模型 / 场景服务 / 智能体运行时均由服务商提供(`https://fc.xwbuilders.com`,讯维云);本仓库是前端 + 一层 Next.js BFF。我们**不能修改服务商后端**,但**可在 `dt-ustudio-agent-admin` 配置 agent 的 MCP 工具与系统提示词**,并**自托管 MCP 服务端**供 agent 调用。

---

## 2. 现状(基于代码,不重写)

| 层 | 现状 | 处置 |
|---|---|---|
| 前端框架 | Next.js 16 + React 19 + TS | 保留 |
| 3D 引擎 | `soonspacejs` + `ustudio-sdk`(含 plugin-fds / plugin-effect / plugin-cps-soonmanager 等) | 保留;agent 通过工具驱动 |
| 场景入口 | `sceneSdk()`(=`window.__scene`,`CustomFunctionUStudioSdk<UStudioSdk>` 单例,见 `lib/scene-sdk.ts`) | **agent 驱动场景的唯一入口** |
| 已有面板 | `SoonspaceSceneViewer` / `FireSafetyPanel`(设备感知+真实状态) / `PlanPanel`(预案脚本执行) / `AlarmCenter` / `MultiAgentWidget` | 保留并扩展 |
| 插件注册表 | `lib/scene-plugins/`(`PluginManager` + `ScenePlugin`,带 vitest) | **SceneCommandBus 沿用此 Registry 模式** |
| BFF | `app/api/ustudio/*/route.ts`(bootstrap/tree/fire-devices/instances/overview/polygons·detail/routes·detail/reachable/connectivity/user-instances) | 保留;MCP 读类工具复用 `lib/ustudio.ts` |
| agent-chat | `app/uagent-service/api/agent/v1/apps/agent-chat/route.ts`(纯透传 SSE) | **保持透传,不改** |

服务商 agent(`@dt-uagent/multi-agent-sdk`)是**封闭聊天窗**:公开 API 仅 `init()→{sendMessage, destroy}`,无工具注册、无消息回调。故 agent→场景**必须经我们自托管的 MCP 服务端**实现。

---

## 3. 架构总览

```
┌─ dt-ustudio-agent-admin(配置项)─────────────────────────────┐
│  ① 系统 Prompt:消防指挥参谋 / 演练导演人设                    │
│  ② mcpServers.instance.url → 我们托管的 MCP 服务端公网地址    │
└────────────────────┬─────────────────────────────────────────┘
                     │ MCP(SSE 传输,JSON-RPC)
┌────────────────────▼────────── 我们自托管(独立 Node/TS 进程)─┐
│  MCP 服务端(@modelcontextprotocol/sdk)                       │
│   ├ 工具声明(schema)+ tools/list                            │
│   ├ 读类工具:调 Next.js BFF(/api/ustudio/*)→ 返回真实数据   │
│   └ 写类工具:发 SceneCommand → in-memory pub/sub            │
│  /scene-events(SSE):浏览器 EventSource 订阅命令流             │
└──────┬───────────────────────────┬──────────────────────────┘
       │ fetch(读查询)            │ SSE(下发命令)
┌──────▼──────────────┐    ┌──────▼─────────────────────────────┐
│ Next.js BFF(不动)  │    │ 浏览器(前端)                       │
│ /api/ustudio/*      │    │  SceneCommandBus(Registry)          │
│ lib/ustudio.ts      │    │   工具名 → sceneSdk().xxx            │
└─────────────────────┘    │  + 反向:scene 事件 → 通知 agent      │
                           └────────────────────────────────────┘

  agent-chat SSE(服务商→前端聊天窗)保持纯透传,不经我们解析。
```

**核心分工**:MCP 服务端管"语义 + 数据";浏览器 `SceneCommandBus` 管"视觉执行";两者用**工具名**对齐。写类工具不需要从服务器回连浏览器之外的状态——它只负责"发命令",命令经 pub/sub→SSE 自然到达浏览器。

---

## 4. 组件清单与职责

### 4.1 MCP 服务端(新建,独立进程)
- 职责:向 agent 暴露消防工具(MCP SSE 传输);读类工具代理查询 BFF;写类工具产出 `SceneCommand`。
- 依赖:Next.js BFF(`/api/ustudio/*`)、`@modelcontextprotocol/sdk`。
- 位置:新目录 `mcp-server/`(独立 package,TS,Node runtime)。
- 鉴权:自身可校验请求中的 `appKey`(与 admin 配置一致);URL/appKey 来自环境变量。

### 4.2 SceneCommandBus(新建,前端 `lib/scene-command-bus/`)
- 职责:订阅 `/scene-events`(EventSource);按 `tool` 名分发到 handler;handler 调 `sceneSdk()`;管理副作用清理(如取消高亮)。
- 模式:Registry(`registerSceneTool(name, handler)`),与现有 `scene-plugins` 一致。
- 依赖:`lib/scene-sdk.ts`、`lib/scene-plugins` 的注册风格。

### 4.3 scene-events 通道(新建)
- 浏览器侧:`EventSource` 订阅 MCP 服务端的 `/scene-events`(跨域,CORS 允许)。
- MCP 服务端侧:`/scene-events` GET 返回 SSE,从 in-memory pub/sub 推送 `SceneCommand`。
- 命令信封:`{ id, tool, args, sessionId?, ts }`。

### 4.4 agent 系统提示词(在 admin 配置)
- v1 = **强参谋**:响应指挥员、主动用工具辅助决策、解释理由、驱动场景聚焦。
- P2 = 升级为**导演**:自主推进剧本(点火 / 注入事件 / 调度),火势烈度可调。

### 4.5 不改动的组件
`SoonspaceSceneViewer`、`FireSafetyPanel`、`PlanPanel`、`AlarmCenter`、`MultiAgentWidget`、`app/uagent-service/.../agent-chat/route.ts`、`app/api/ustudio/*`。`PlanPanel` 的 `usePlanExecution` 逻辑后续可被 `run_plan` 工具复用。

---

## 5. 端到端数据流(以"飞向某设备"为例)

1. 用户在 `MultiAgentWidget` 输入:"带我看 3 楼的喷淋头"。
2. SDK `sendMessage` → `/uagent-service/.../agent-chat`(透传)→ 服务商 agent。
3. agent(经系统 Prompt + MCP `tools/list`)决定调 `find_nearest({what:'sprinkler', from:{story:'3F'}})` → MCP 服务端 → 查 BFF → 返回 `{id, name, ...}`。
4. agent 再调 `fly_to({target: id})` → MCP 服务端 → 发 `SceneCommand{tool:'fly_to', args:{target:id}}` → pub/sub → `/scene-events` SSE。
5. 浏览器 `SceneCommandBus` 收到 → `handler['fly_to']` → `sceneSdk().fly(id)`。
6. MCP 同时返回 ack 给 agent;agent 在聊天窗回复"已带你定位到 3F 喷淋头 XX"。
7. (反向,可选)浏览器把"用户点击了某设备"事件回喂 agent(经单独通道或 `sendMessage`)。

---

## 6. MCP 工具目录(v1 = P0+P1)

> 所有工具给 JSON Schema;agent 自动习得参数。新增工具 = MCP 端 + 前端各加一条同名映射。

### 6.1 感知 / 查询(读类 — 返回真实数据)
| 工具 | 入参 | 返回 |
|---|---|---|
| `get_scene_overview` | `{}` | `{sceneId, stories[], deviceStats{total,normal,warning,offline}}` |
| `list_fire_devices` | `{type?, story?}` | `[{id,name,type,status,story,space}]` |
| `get_device_status` | `{id}` | `{id,status,field,value}` |
| `find_nearest` | `{what:'hydrant'\|'exit'\|'extinguisher'\|'sprinkler', from:{id?\|xyz?\|story?}}` | `{id,name,distance,walkingPath?}` |

### 6.2 场景动作(写类 — 发 SceneCommand,返回 ack)
| 工具 | 入参 | 映射 sceneSdk |
|---|---|---|
| `fly_to` | `{target:id\|xyz, duration?}` | `fly(id)` |
| `focus_objects` | `{ids[], color?}` | `heighLight(id,color)` 批量 |
| `clear_focus` | `{ids?}` | `cancelHeighLight(id)`;空=全部已记录 |
| `focus_floors` | `{storyIds[], mode:'2D'\|'3D', yExtend?}` | `setScene({stories, mode})` |
| `show_route` | `{routeIds?, from?, to?, color?}` | `virtualRouteSetVisible(ids,true)` / `drawRoute` / `navigateWithinScene` |
| `hide_route` | `{routeIds?}` | `virtualRouteSetVisible(ids,false)` |
| `draw_zone` | `{id, points:xyz[], color?, opacity?}` | `drawVirtualPolygon(detail)` |
| `clear_zone` | `{ids?}` | `clearVirtualPolygon(id)` |
| `play_camera` | `{cameraId, streamUrl?}` | `showVideo` / `UStudioVideoDialog` |

### 6.3 演练控制 / 评估(P2,先占位)
| 工具 | 入参 | 备注 |
|---|---|---|
| `ignite` | `{zoneId\|xyz, intensity}` | 驱动 plugin-fds/effect 或放火点 POI;依赖插件可用性(待运行时验证) |
| `inject_event` | `{type:'collapse'\|'explosion'\|'trapped', location, detail}` | 叙事 + 视觉 |
| `run_plan` | `{planId}` | 复用 `PlanPanel.usePlanExecution` |
| `record_decision` | `{action, reasoning, at}` | 写决策日志(评估输入) |
| `snapshot` | `{label?}` | `screenShot()`(AAR) |

---

## 7. SceneCommandBus 映射表(前端 handler 契约)

```ts
type SceneCommand = { id: string; tool: string; args: Record<string, unknown>; sessionId?: string; ts: number };

// 注册示例(与 scene-plugins 同风格)
registerSceneTool('fly_to', async (args, sdk) => { await sdk.fly(args.target); });
registerSceneTool('focus_objects', async (args, sdk) => {
  await Promise.allSettled(args.ids.map((id:string)=> sdk.heighLight(id, args.color ?? '#f59e0b')));
  trackFocused(args.ids); // 供 clear_focus 复原
});
// ... 其余按 §6.2 表一一实现
```
- 每个 handler 接收 `(args, sdk)`,`sdk = sceneSdk()`。
- 副作用(focus/route/zone)需登记,供对应 `clear_*` 复原。
- 未知 `tool` → 记日志、不抛(避免单条坏命令卡死总线)。

---

## 8. 业务功能与优先级

| 级别 | 功能 | 依赖工具 |
|---|---|---|
| 🔴 P0 | agent 驱动场景(fly/高亮/切楼层) | `fly_to` `focus_objects` `focus_floors` |
| 🔴 P0 | 消防参谋问答(查设备/状态/最近资源) | `get_scene_overview` `list_fire_devices` `get_device_status` `find_nearest` |
| 🟡 P1 | 应急疏散路线展示 | `show_route` `hide_route` |
| 🟡 P1 | 危险区 / 警戒区标注 | `draw_zone` `clear_zone` |
| 🟡 P1 | CCTV 联动 | `play_camera` |
| 🟢 P2 | 火情演化(点火/蔓延) | `ignite`(依赖 fds/effect) |
| 🟢 P2 | 动态剧本 + 决策采集 + 复盘(AAR) | `inject_event` `run_plan` `record_decision` `snapshot` |

---

## 9. 安全约束

- MCP 服务端 URL、`appKey`、agent gateway 等敏感值**全部走环境变量**;`.env` 必须在 `.gitignore` 内;**不得**写入代码或本 spec 之外的任何跟踪文件。
- admin 中的 `mcpServers.instance.url` 在部署期注入,不入库。
- MCP 服务端校验入站 `appKey`,拒绝未授权调用。
- 若怀疑 `appKey` 已泄露,立即在 admin 轮换。

---

## 10. 分阶段交付

- **Phase 0 地基**:独立 MCP 服务端骨架(SSE 传输 + `tools/list`);`SceneCommandBus` + `/scene-events` SSE + 内存 pub/sub;1 读 + 1 写工具打通;admin 配置 + dev 隧道。验收:对话让 agent 调 `fly_to`,场景真的飞过去。
- **Phase 1 (P0)**:全量读工具 + 核心写工具(fly/focus/floors);强参谋 Prompt;与 `FireSafetyPanel`/`AlarmCenter` 数据对齐。验收:参谋能答设备问题并驱动聚焦。
- **Phase 2 (P1)**:route/zone/camera;疏散路线与危险区演示。验收:完整一次"报警→定位→疏散→警戒"链路。
- **Phase 3 (P2)**:火情演化(运行时确认 fds/effect)、导演人设、决策日志与 AAR。

---

## 11. 测试策略

- **单元(vitest)**:`SceneCommandBus` 分发与映射(每工具一条)、命令信封校验、`clear_*` 复原、未知 tool 容错。沿用 `lib/scene-plugins/__tests__` 风格。
- **契约**:MCP `tools/list` 输出与本文档 §6 schema 一致(快照)。
- **集成**:用标准 MCP 客户端(如 `@modelcontextprotocol/inspector`)对 MCP 服务端做 `tools/call`,验证读类返回真实数据、写类产出正确 `SceneCommand`。
- **端到端(手动清单)**:Phase 0/1/2 各自的验收脚本。

---

## 12. 待确认项 / 风险

| 项 | 说明 | 处置 |
|---|---|---|
| MCP 公网暴露方式 | dev 用 cloudflare/ngrok 隧道;部署待定 | 实现期定 |
| 多会话路由 | MVP 单会话广播;多会话需 sessionId 路由 | 后续 |
| plugin-fds / plugin-effect 可用性 | 决定 `ignite` 是真模拟还是 POI 占位 | 运行时验证 |
| agent 实际 tool_calls 行为 | 需跑一次抓 SSE 确认 agent 是否按 MCP schema 调用 | Phase 0 验证 |
| 仓库非 git | 无法 `commit` 本 spec | 暂以文件落地;后续按需 `git init` |
