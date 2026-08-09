# 云端主智能体 mcp_servers 配置指南(子项目5 Task 5C.3)

> 日期:2026-08-09 | 目标:ustudio 平台主智能体应用配置 mcp_servers,让 agent 经云端调用 mcp-server:8787 的业务查询工具

---

## 一、背景与 MVP 形态

演练对抗推演中,agent 需查建筑档案(znya 数据)。这些数据不在 ustudio 平台,需经公网 MCP 服务(mcp-server:8787)查 znya BFF。

**两条链路(重要,勿混淆)**:

| 链路 | 推演控制(query_scene_state/inject_event/report_decision) | 业务查询(query_building_profile 等) |
|---|---|---|
| **AgentRunner(演练推演)** | 浏览器本地镜像执行(写 EventBus/DrillRecorder),**不经 MCP** | 不调(forwardedProps 已含态势 + 建筑档案由前端持有) |
| **用户对话(AgentChat)** | 经云端 MCP → mcp-server stub(wired=false,占位) | **经云端 MCP → mcp-server → znya**(本指南配置) |

本指南配置「用户对话经 MCP 查业务数据」所需的云端 mcp_servers。

> 注:AgentRunner 链路不需要配 mcp_servers —— 推演引擎 source of truth 在浏览器,
> AgentRunner 解析 agent-chat SSE 时本地镜像执行 report_decision/inject_event(见
> `lib/drill/agent-runner.ts` 的 MVP 架构决策)。

---

## 二、mcp-server 公网地址

| 项 | 值 |
|---|---|
| URL | `http://111.75.149.221:8787`(生产) |
| 认证 | header `X-App-Key: <MCP_APP_KEY>`(向项目维护者索取) |
| 协议 | MCP(Streamable HTTP 或 SSE,按平台支持) |
| 工具注册 | 见 `mcp-server/src/tools.ts` TOOLS 数组 |

---

## 三、ustudio 平台配置步骤

1. 登录 ustudio 平台,打开主智能体应用(multi_agent/main,app_id=`2084563280205111297`)
2. 进入「工具」或「MCP 服务」配置页
3. 新增 mcp_servers:
   - **name**: `firerescue-business`(自定义)
   - **url**: `http://111.75.149.221:8787`
   - **transport**: `streamable_http`(或 SSE,按平台选项)
   - **headers**: `X-App-Key: <MCP_APP_KEY>`
4. **工具白名单**(按需勾选):

   | 工具 | 用途 | 建议 |
   |---|---|---|
   | `query_building_profile` | 建筑档案(结构/层数/分区/毗邻) | ✅ 勾选 |
   | `query_facilities` | 消防设施(消火栓/喷淋/报警) | ✅ 勾选 |
   | `query_key_parts` | 重点部位(避难层/消控室/防火分区) | ✅ 勾选 |
   | `list_fire_devices` | 场景消防设备清单 | ✅ 勾选 |
   | `list_floors` | 楼层清单 | ✅ 勾选 |
   | `fly_to`/`focus_objects`/`focus_floors`/`show_route` | 场景命令(经 /scene-events 推浏览器) | ✅ 勾选(用户对话驱动 3D) |
   | `query_scene_state`/`inject_event`/`report_decision` | 推演控制 | ❌ **MVP 不勾选**(AgentRunner 本地镜像;勾了也是 stub wired=false) |

5. 保存 → 测试:在 agent 对话输入「查 21号楼档案」,确认 tool_call `query_building_profile` 命中并返回 znya 数据

---

## 四、验证清单

- [ ] 平台 agent 对话 → SSE 出现 `tool-call`(query_building_profile)+ `tool-result`(znya 数据)
- [ ] mcp-server 日志(111.75.149.221)出现 `handleToolCall query_building_profile`
- [ ] agent 能基于返回数据回答(如「21号楼高 258 米,58 层」)

### 失败排查

| 现象 | 原因 |
|---|---|
| 401/403 | X-App-Key 错误/过期 |
| 连接超时 | mcp-server 未启动 / 防火墙 / 8787 端口未放 |
| tool 未找到 | 白名单未勾选 / mcp-server 未注册该工具(查 tools.ts TOOLS) |
| tool-result 空/错误 | znya BFF 异常(查 mcp-server → znya 链路)/ building_id 非法 |

---

## 五、后续(非 MVP)

若要「用户对话也驱动推演」(目前 AgentRunner 链路独占推演控制),需评估:
- **形态①**:扩展 /scene-events 为 SSE 双向通道,web 订阅 mcp-server stub 转发的 inject_event/report_decision,喂浏览器 EventBus
- **形态②**:推演引擎下沉到 mcp-server 进程(浏览器经 SSE 订阅状态)

MVP 不实现,待演练大屏(6.5)联调后评估需求。
