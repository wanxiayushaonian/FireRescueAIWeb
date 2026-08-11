# 增量阶段集成架构(真实能力接入)

- 日期:2026-08-05
- 范围:原型迁壳完成后,接入真实 3D / 业务后端 / 智能体 / 场景命令联动的**架构纲领**,划清"复用原模板能力"与"新建自研后端"的边界
- 关联:
  - 迁壳 spec:`2026-08-05-prototype-migration-shell-design.md`
  - 平台 MCP 文档:`web/mcp/*.md`(uStudio 本体服务 / 空间推理 / 本体查询 / 本体功能调用)
  - 原型数据契约:`web/src/mock/types.ts`、`web/src/mock/sceneLog.ts`
  - web 原模板能力:`web/lib/ustudio.ts`、`web/mcp-server/src/`

## 背景

迁壳阶段(2026-08-05)完成:原型深色指挥大屏 SPA(5 模块 + 面板 + 智能体窗)已整体迁入 `web/src/`,在 web 跑通(typecheck/build/vitest 全绿)。但当前为**占位 3D(`ScenePlaceholder`)+ mock 数据**——非真实。

本架构定义增量阶段如何把真实能力接入,核心是回答两个问题:
1. **原模板(web 迁原型前,平台方给)的哪些数据接口可在原型业务下复用?**
2. **基于原型业务,还要新建哪些后端?**

## 数据三层边界(原理)

原型业务的数据需求分两类,根源不同:

- 🟩 **场景内数据**(空间/本体/路径/区域/可视化)——他平台 uStudio 已有,web BFF 已对接 → **复用**
- 🟦 **业务数据**(执勤力量/建筑档案属性/预案/考核/警情/预案库)——他平台没有 → **新建自研后端**

```
┌─────────────────────────────────────────────────────────┐
│ 层 1  他平台 uStudio(平台方,已有)                     │
│       场景内:空间图谱/本体/路径/区域/巡检/可视化       │
│       web 通道:BFF /api/ustudio/* + lib/ustudio.ts      │
└─────────────────────────────────────────────────────────┘
                      ↑ 复用(场景内一切)
┌─────────────────────────────────────────────────────────┐
│ 层 2  🆕 自研业务后端(A1:Python FastAPI + PostgreSQL) │
│       执勤力量 / 建筑档案属性 / 预案引擎 / 考核 /       │
│       警情接入 / 预案库 / 告警                          │
└─────────────────────────────────────────────────────────┘
                      ↑ 新建(原型 fetchXxx 全指向这)
┌─────────────────────────────────────────────────────────┐
│ 层 3  agent 通道:三个 MCP 职责单一(见下)             │
└─────────────────────────────────────────────────────────┘
```

> **原理结论**:原模板的数据接口 = **场景内的一切**,全经他平台。**没有任何业务数据**。所以业务数据必须自建,且和场景数据**物理隔离**(独立服务 + 独立 DB),只在"对象 id"这一层对齐。

## 复用清单(原模板给的,直接用)

| 原型需求 | 复用来源 | 说明 |
|---|---|---|
| 建筑室内设施的真实 id | BFF `/api/ustudio/tree`、`/instances` | 设施 id = 他平台 `out_instance_id` |
| 楼层列表 | BFF `/api/ustudio/tree`(拍平 story) | 现有 `list_floors` 同源 |
| 消防设备清单 | BFF `/api/ustudio/fire-devices` | 现有 `list_fire_devices` 同源 |
| 进攻/疏散路线 | BFF `/api/ustudio/routes`、`findShortestPath` | 原型 `showRoute` 动作的数据源 |
| 战术区域(蔓延圈) | BFF `/api/ustudio/polygons` | 原型 `drawZone` 的几何来源 |
| 场景动作 flyTo/highlight/switchFloor | `lib/scene-command-bus` 现有 handler | 已实现 |
| 智能体对话通道 | `@dt-uagent/multi-agent-sdk` | 原型 `AgentChat` 接这个 |
| 真实 3D 渲染 | `components/SoonspaceSceneViewer` + `lib/soonspace-runtime` | 迁壳保留未挂载,接回即可 |

## 新建清单(自研业务后端,A1)

| 自研服务 | 对应原型 mock | 备注 |
|---|---|---|
| 执勤力量资源库 | `stations.ts` | 队站/人员/车辆/装备 + 统计 |
| 建筑档案(业务属性) | `building.ts` 的 overview/waterSupply/contacts | 设施部分只存"业务状态",id 关联他平台 |
| 预案引擎 | `drill.ts`/`drillStore.ts` | 流式输出 SSE,六组结构化,接 LLM |
| 熟悉考核 | `training.ts` | 题库/作答/评分/熟悉度回写 |
| 警情接入 | `incidents.ts` | 实时 WS + 警情列表 |
| 预案库 | `planLibrary.ts` | 归档/版本/改进回流 |
| 告警 | `alerts.ts` | 顶部告警清单 |

## 架构定稿(三决策)

```
┌─ 浏览器 web(Next.js)───────────────────────────────────┐
│ 原型 UI(src/) + 真实 3D(SoonspaceSceneViewer,接回)    │
│   /api/ustudio/*    BFF → 他平台 uStudio(场景数据)     │
│   /api/scene-events BFF → 自研 mcp-server(SSE)         │
│   /api/business/*   BFF → Python 业务后端(薄代理)🆕   │
│   scene-command-bus:统一 dispatch(订阅平台+自研双通道)│
└──────────────────────────────────────────────────────────┘
      ↑ 平台 invokeTwinsFunction 推送(前端也订阅)

┌ 他平台 uStudio ┐  ┌ 自研 mcp-server(Node)┐  ┌ 🆕 Python 业务后端 ┐
│ 场景内一切     │  │ 场景命令              │  │ FastAPI+PostgreSQL │
│ (平台方,已有)│  │ fly_to/focus_*       │  │ 业务数据 + 业务 MCP│
└────────────────┘  │ show_route...(扩)   │  │ 执勤/档案/预案... │
      ↑ 他平台 MCP  └──────────────────────┘  └────────────────────┘
   (agent,37 工具)      ↑ 自研 Node MCP            ↑ 🆕 自研 Python MCP
                        └─────────┬────────────────┘
                              [ agent ]
```

### 决策 ①:业务后端技术栈 = A1(Python FastAPI + PostgreSQL)

理由:预案引擎/战术推荐大概率接 LLM,Python AI 生态最顺;业务数据正经过 DB,与场景数据物理隔离;用户 Python 背景。

### 决策 ②:业务数据给 agent 的通道 = B1(业务后端自带 Python MCP)

三个 MCP 职责单一,agent 按需连:

| MCP | 归属 | 职责 | agent 用它做 |
|---|---|---|---|
| **他平台 MCP** | 平台方 | 场景内一切 | 飞向/高亮/隐藏/路径查询/图谱推理/巡检 |
| **自研 mcp-server** | 我们(Node) | 场景命令 | `fly_to`/`focus_objects`/`focus_floors`/`show_route`(扩)/`draw_zone`(扩) |
| **🆕 自研 Python MCP** | 我们(Python) | 业务数据 | 执勤查询/档案查询/预案生成/考核/警情 |

### 决策 ③:场景命令双通道 = 前端同时订阅、统一 dispatch

前端 `scene-command-bus` **同时订阅两个来源**,统一 dispatch 到 handler:

| 通道 | 来源 | 负责 |
|---|---|---|
| **平台 `invokeTwinsFunction`** | agent→平台 MCP→推送在线前端 | **原子可视化**:fly_to / highlight / 隐藏(用平台 `function_identifier`) |
| **自研 `/scene-events`** | agent→mcp-server→SSE→前端 | **业务复合操作**:focus_floors 隔离 / show_route 画路线 / draw_zone 画区域 / 联动面板 |

> **分工原则**:`fly_to`/`highlight` 优先走平台通道(平台更懂本体语义,有标准 function);`focus_floors`/`show_route`/`draw_zone`/面板联动走自研通道(平台没有"楼层隔离/战术图层"概念)。前端 handler 不关心来源,只按 action 派发。

## 关键交叉点(原理)

### ① 建筑档案是"混合体"(id 对齐)

`BuildingProfile` 五分组中:
- `overview`/`waterSupply`/`contacts` = **纯业务属性**,自研后端存
- `indoorFacilities`/`keyParts` 的设施 = **场景对象**,id 来自他平台 `out_instance_id`

**对齐键 = `out_instance_id`**:自研后端的设施记录引用场景对象 id(不重复造 id),只额外存"业务状态/最后巡检时间"等。点击设施 → 用这个 id 经 `scene-command-bus` 飞向高亮。

### ② 场景动作 handler 缺口

`sceneLog.ts` 定义 12 种 `SceneActionName`。现有 `scene-command-bus` 只覆盖 3 类(flyTo/highlight/switchFloor)。**待补 handler**:

| 动作 | 数据源(复用 BFF) | 状态 |
|---|---|---|
| `showRoute`/`hideRoute` | `/api/ustudio/routes`、`findShortestPath` | 🆕 待建 |
| `drawZone`/`drawRoute`/`clearTactical` | `/api/ustudio/polygons` + 前端绘制层 | 🆕 待建 |
| `addMarker`/`removeMarker` | GIS 底座打点 | 🆕 待建 |
| `resetView` | 前端 SDK | 🆕 待建 |
| `updatePlan` | 业务事件(预案库) | 🆕 待建 |

## 增量优先级(5 步)

按"看得见 + 依赖 + 验证性"排序:

1. **接真实 3D + 前端双通道订阅基础**
   > `ScenePlaceholder` → `SoonspaceSceneViewer`(复用 web 现有);`scene-command-bus` 加订阅平台 `invokeTwinsFunction` 通道。最先做,场景联动都依赖它。

2. **Python 业务后端骨架**
   > FastAPI + PostgreSQL + 一个示例业务接口 + 业务 MCP 骨架 + web `/api/business/*` 代理。搭后端架子。

3. **第一个业务模块:建筑档案**(混合验证)
   > 横跨"业务属性(自研)+ 设施 id(平台)",**同时验证 id 对齐和双通道联动**——验证性最好的先头模块。

4. **补场景命令 handler 缺口 + 智能体整合**
   > `show_route`/`draw_zone`/`addMarker` handler;`AgentChat` mock → `@dt-uagent/multi-agent-sdk`。

5. **其余业务模块逐个接**:执勤力量 → 预案引擎(含 LLM)→ 考核 → 警情 → 预案库。

## 约束与非目标

- **不动他平台 MCP**(平台方托管,agent 直连,我们只消费文档)
- **不把业务数据塞进 web/Next**(Next BFF 只做薄代理,业务逻辑在 Python 后端)
- **不把业务数据塞进自研 Node mcp-server**(它保持"场景命令工具层"职责单一,不膨胀)
- **mcp-server 工具扩展仅限场景命令类**(`show_route`/`draw_zone` 等),业务查询走 Python MCP
- 预案引擎的 LLM 选型、DB schema 细节、部署形态(独立容器)在各增量 task 的 plan 里细化,不在本架构层定

## 后续

本架构是增量阶段的纲领。每个增量步骤落地时,另起 spec/plan(如 `2026-08-XX-real-3d-integration.md`),引用本架构的边界与决策。
