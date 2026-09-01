# FireRescueAIWeb — 火场救援数字孪生平台

基于 3D 场景 + GIS 底座的消防演练对抗系统：五大业务模块 + 四角色智能体对抗舱 + 双 MCP 工具服务 + Next.js BFF。

> **详细文档入口：[`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md)**（架构 / 数据流 / 部署 / 已知问题，随项目持续更新，冲突时以其为准）
> 演示验收真相源：[`DEMO.md`](./DEMO.md) ｜ 智能体提示词与 MCP 配置打包：[`doc/agent-mcp-pack/`](./doc/agent-mcp-pack/README.md)

## 五大模块

| 模块 | 能力关键词 |
|---|---|
| **态势总览** | GIS 态势一张图 + 风险研判 agent（gis_fly_to / show_route 地图联动） |
| **对象总览** | 建筑档案（znya 真实数据）+ 楼层聚焦 / 场内导航 + 灭火作战参谋 agent |
| **熟悉考核** | 六熟悉 AI 引导（17 步联动）+ 综合考核 + 教练 agent |
| **演练对抗** | 四角色 agent（Planner / Adversary / Commander / Evaluator）对抗舱 + 特情去重 + 态势演化 + 一级预案输出（真 agent）+ 分组讲解视频 + 云端演练记录回放 |
| **实战指挥** | 警情处置 + AI 派遣（plan_dispatch 真实路线）+ 案域三圈 + 处置时间轴 + 现场视频回传 |

## 架构速览

```text
浏览器(Next.js 16 + React 19 前端与 BFF)
  ├─ Agent 对话 → uStudio uagent 平台(agent-chat SSE)
  │     ├─ Node MCP :8787  场景/演练,18 工具(3D/GIS 动作、DrillSession、对抗控制)
  │     └─ Python MCP :8788 业务事实,11 工具(档案/力量/预案/派遣,znya PostgreSQL)
  ├─ 工具结果: /scene-events SSE 下发浏览器执行 → ack 回执
  └─ 演练快照: confront-store → PUT /api/drill-sessions → DrillSession(文件持久化)
```

数据权威三权分立：znya = 业务事实，uStudio = 场景实况，DrillSession = 演练过程（详见 [`doc/data-authority-mcp-blueprint.md`](./doc/data-authority-mcp-blueprint.md)）。

## 快速上手

```bash
git clone git@github.com:wanxiayushaonian/FireRescueAIWeb.git
cd FireRescueAIWeb
npm install                # soonspacejs 插件 peer 精确锁定,异常时加 --legacy-peer-deps
cp .env.example .env.local # 填 uStudio 网关密钥 / agent app_id / znya 地址 / MCP_APP_KEY
npm run dev                # http://localhost:3000
```

环境变量清单见 `PROJECT_OVERVIEW.md` §7.1（`.env.local` 前端 + `deploy/.env` 服务器）。

## 常用命令

```bash
npm run verify             # 完整门禁(typecheck+测试+mcp build+mcp test+生产构建),提交前必跑
npm run typecheck          # TypeScript 类型检查
npm run test               # vitest 单测(主项目约 501 用例)
cd mcp-server && npm run dev|build|test   # MCP 子包(约 98 用例)
```

## 部署

push `master` → GitHub Actions quality-gate（`npm run verify`）→ SSH 服务器本地构建 → Docker 容器（BFF :3000 + Node MCP :8787，`HOSTNAME=0.0.0.0` 必需）。生产环境：<http://111.75.149.221:3000>。

## 关联仓库

- **znya 业务后端 + Python MCP**：[`wanxiayushaonian/FireRescueAI`](https://github.com/wanxiayushaonian/FireRescueAI)（FastAPI :9100 + firerescue-business-mcp :8788，本仓库的档案/力量/预案/派遣数据源）
