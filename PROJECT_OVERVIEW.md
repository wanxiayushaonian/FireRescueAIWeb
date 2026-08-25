# 火场救援数字孪生平台 — 项目总览

> 更新时间:2026-08-25(全面重读代码库后修订)
> 当前分支:`master`(唯一分支)
> 部署状态:✅ 已部署至 http://111.75.149.221:3000(push master 经 CI 自动部署)
> 权威技术蓝图(跨项目:模板/赛事后端/znya):见仓库根目录 `项目技术蓝图与实施指南.md`
> 决赛黄金演示链与验收口径:见 `DEMO.md`
> 数据权威与双 MCP 分工:见 `doc/data-authority-mcp-blueprint.md`

---

## 一、项目简介

**火场救援数字孪生平台** —— 基于 3D 场景 + GIS 底座的消防演练对抗系统。

核心能力:
- **态势总览**:GIS 地图 + 执勤力量 + 水源分布 + 重点单位 + 风险研判 agent
- **对象总览**:建筑档案 + 消防设施 + 楼层聚焦/场内导航 + 作战参谋 agent
- **熟悉考核**:六熟悉 AI 引导 + 综合考核 + 教练 agent
- **演练对抗**:四角色 agent(Planner/Adversary/Commander/Evaluator)驱动的对抗舱 + 3D 联动
- **实战指挥**:实时警情 + AI 派遣 + 案域三圈 + 处置时间轴 + 车辆动画
- **GIS 底座**:高德瓦片 + Leaflet + 路线规划 + ETA 分析
- **3D 场景**:Soonspace 引擎 + 楼层聚焦 + 设备可视化 + 场内导航

模块导航顺序:态势总览 / 对象总览 / 熟悉考核 / 演练对抗 / 实战指挥。

---

## 二、当前状态总览

| 维度 | 状态 | 说明 |
|------|------|------|
| **分支** | ✅ 单分支 | 仅 `master`;功能分支已全部回收(2026-08-25) |
| **功能** | 🟡 黄金链 v2 待复验 | 四角色/去重/态势演化已落地,平台四角色提示词已同步(2026-08-25);待三连完整验收后移动 `demo-baseline` 标签(当前停在 034cf46) |
| **测试** | 🟡 逻辑层较强 | 主项目 64 文件/437 用例,MCP 10 文件/97 用例,znya 356 用例;尚缺 React 组件与浏览器 E2E |
| **部署** | ✅ 已加门禁 | push master → CI quality-gate(`npm run verify`)→ SSH 服务器本地构建自动部署;Docker 健康检查;生产脏工作区拒绝部署 |
| **文档** | 🟡 收口中 | `DEMO.md` 为演示验收真相源;`plan/README.md` 是 plan/ 唯一索引(32 篇 + agents/ 4 篇) |
| **技术债** | 🟢 较少 | 1 个 TODO(commandBridge 三 stub);`@xyflow/react` 残留依赖与 globals.css 死样式待清;TS 版本不一致(主 6.0.3 / mcp 5.6.0) |

---

## 三、功能模块状态

### 3.1 已完成 ✅

| 模块 | 入口文件 | 核心能力 |
|------|----------|----------|
| **态势总览** | `src/App.tsx` (overview) | GIS 地图 + 资源总览面板 + 水源/单位/警情图层 + 风险研判 agent(gis_fly_to/show_route 联动) |
| **对象总览** | `src/App.tsx` (objects) | 建筑档案(znya 真实数据) + 楼层聚焦 + 设备拾取/搜索 + 场内导航 + 作战参谋 agent |
| **熟悉考核** | `src/views/TrainingView.tsx` | 六熟悉 AI 引导(17 步联动) + 自主导览 + 综合考核(mock 题库) + 教练 agent |
| **演练对抗** | `src/views/DrillView.tsx` + `src/drill/confrontation/` | 一级:灾情参数/预案输出(mock 模板+真评估)/预案库;二级:对抗舱四角色 agent + 特情去重 + 态势演化 + 3D 联动 + 评估回流预案库 |
| **实战指挥** | `src/views/CommandView.tsx` | 实时警情(mock 频道) + AI 派遣(plan_dispatch 真实) + 案域三圈 + 处置时间轴 + 车辆动画 + 指挥 agent |
| **GIS 底座** | `src/components/RealGisMap.tsx` | 高德瓦片 + Leaflet + 路线规划 + 力量/水源/单位图层 + 视角记忆 |
| **3D 场景** | `src/components/SceneProvider.tsx` + `src/App.tsx`(SceneContainer) | Soonspace 引擎 + 楼层聚焦/炸开 + 设备拾取 + 2D 平面图 + 场内/场外导航 |
| **Agent 对话** | `src/components/assistant-ui/AgentChatThread.tsx` + `src/components/AgentSidebar.tsx` | SSE 流式对话 + 双 tab(业务/全局,9 个平台 app) + 工具调用 + 历史会话 + scene:// 锚点联动 |
| **建筑档案** | `src/components/panels/BuildingProfilePanel.tsx` | 建筑详情 + 楼层分布 + 消防设施统计 + 关键部位楼层聚焦 |
| **预案库** | `src/components/panels/PlanLibraryPanel.tsx` | 归档库(演练产出回流,znya 建档) + 正式预案(znya emergency_plans 只读);已挂载演练/指挥两模块 |

### 3.2 待办 ⬜(演示冻结期暂停新功能,见 `DEMO.md` §6)

| 事项 | 优先级 | 说明 |
|------|--------|------|
| **黄金演示链三连验收** | 🔴 高 | 平台四角色提示词已同步(2026-08-25);按 `DEMO.md` §5 跑 3 连验收,通过后移动 `demo-baseline` 标签 |
| **3D 渲染优化** | 🔴 高 | 完整包场景(69k mesh)操作卡顿,需平台配合(精简包/SDK 按类别加载);已做:像素比自适应 + 楼层裁剪 + 高亮先清后加 |
| **丰度分级** | 🟡 中 | 阻塞于平台能力确认,同上 |

---

## 四、技术架构

### 4.1 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| **前端框架** | Next.js (App Router) | ^16.2.9 |
| **UI 库** | React | ^19.2.7 |
| **类型系统** | TypeScript | ^6.0.3 (主) / ^5.6.0 (mcp-server) |
| **3D 引擎** | SoonspaceJS + 7 插件(精确锁定,无 ^) | 2.15.19 |
| **3D SDK** | uStudio SDK | ^2.0.4 |
| **2D 地图** | Leaflet + 高德瓦片 | ^1.9.4 |
| **动画** | Framer Motion | ^12.43.0 |
| **图表** | Recharts | ^2.15.4 |
| **Agent UI** | @assistant-ui/react + react-markdown | ^0.15.16 / ^10.1.0 |
| **Agent SDK** | @dt-uagent/multi-agent-sdk | ^1.0.13 |
| **MCP** | @modelcontextprotocol/sdk | ^1.30.0 |

注:`@xyflow/react`(^12.11.2)是旧事件树残留依赖,代码已无引用(仅 globals.css 有死样式),待清理。

### 4.2 代码结构

```
web/
├── src/
│   ├── components/     # React 组件(地图/3D/面板/对话)
│   ├── views/          # 顶层视图(Training/Command/Drill)
│   ├── drill/          # 演练对抗(对抗舱 confrontation/ + building-21 常量)
│   ├── api/            # 前端 API 调用层
│   ├── lib/            # src 域纯函数(agent-context 等,vitest 覆盖)
│   └── mock/           # Mock 数据(警情/题库/六熟悉;building.ts 为无引用死代码待清)
├── lib/
│   ├── scene-recipe/   # 3D 显隐 Recipe 编排(单一真相源)
│   ├── scene-command-bus/  # 场景命令总线(MCP→浏览器执行+ack 回执)
│   ├── gis/            # GIS 纯函数(渲染/查询/ETA/车辆动画)
│   └── *.ts            # mapper/geo-query/scene-sdk/soonspace-runtime/agent-* 等
├── mcp-server/         # 场景/演练 MCP 服务(独立子包,src 13 文件,17 工具)
├── app/api/            # BFF API 路由(20 个:ustudio 14 + business 代理 + scene-events×2 + drill-sessions + health 等)
├── doc/                # data-authority-mcp-blueprint / demo-validation / packages / mcp / archive
└── plan/               # 设计与计划文档(32 篇 + agents/ 4 篇四角色提示词,索引见 plan/README.md)
```

### 4.3 数据流

```
浏览器 → Next.js BFF (/api/*) → uStudio 场景服务 (fc.xwbuilders.com)
                              → znya 业务后端 (:9100)
                              → 高德地图 (GIS 底图)

Agent 对话 → uStudio agent-chat (SSE) → 工具调用
  → Node MCP :8787(场景/GIS/演练,17 工具)──场景命令──> /scene-events SSE → 浏览器 SceneCommandBridge → SDK,ack 回执
  → Python MCP :8788(业务事实,11 工具)──> znya PostgreSQL

演练状态:浏览器 confront-store ──120ms 防抖 PUT──> BFF /api/drill-sessions/:id ──> MCP DrillSession(文件持久化)
         agent query_scene_state 在线查浏览器(2s),离线降级 DrillSession 快照
```

数据权威三权分立(详见 `doc/data-authority-mcp-blueprint.md`):znya=业务事实,uStudio=场景实况,DrillSession=演练过程。

### 4.4 部署架构

```
push master → GitHub Actions: quality-gate(npm run verify: typecheck+测试+mcp+build)
            → build-images(推 GHCR,备用,部署不拉)
            → deploy: SSH 服务器 git pull --ff-only + bash deploy/deploy-server.sh(服务器本地构建)

服务器:
  - BFF (Next.js standalone,HOSTNAME=0.0.0.0 必需):3000 端口 (前端 + /api/*)
  - MCP Server:8787 端口 (streamable-http /mcp + 兼容 /sse,Agent 连接)
  - znya(独立仓库 FireRescueAI):后端 9100 + Python MCP 8788(生产钉 MCP_TRANSPORT=sse) + postgres/redis
```

---

## 五、当前焦点与开发方向

### 5.1 高优先级 🔴

**1. 黄金演示链 v2 三连验收**
- 平台四角色提示词已于 2026-08-25 同步(confront-v2.2,`plan/agents/confront-v2-*.md`)
- 按 `DEMO.md` §4 脚本连跑 3 次,满足 §5 全部硬性标准后移动 `demo-baseline` 标签
- 验收记录模板见 `DEMO.md` §7

**2. 3D 渲染优化**
- **问题**:完整包场景(21D) 69k mesh 全量加载,操作卡顿
- **已做**:像素比自适应降级 + 楼层裁剪重放 + 高亮"先清后加"(replaceHighlight) + overview 失焦暂停渲染
- **需平台配合**:精简版场景包 / SDK 按类别加载 API / 重复设施 InstancedMesh

### 5.2 中优先级 🟡

**3. scene:// 锚点提示词铺开**:`plan/2026-08-24-agent-scene-links.md` 语法待贴入各业务 agent 提示词(演练四角色已完成同步)。

**4. 丰度分级落地**:阻塞于平台能力确认(精简包/SDK 过滤)。

**5. GIS 响应分析(ETA)收尾**:部分完成(`lib/gis/eta-render.ts` + `response-query.ts`,详见 `plan/2026-08-08-gis-analytics-plan.md`)。

### 5.3 低优先级 🟢

**6. 技术债清理**
- `@xyflow/react` 残留依赖 + globals.css 死样式删除
- TypeScript 版本统一(主 6.0.3 vs mcp 5.6.0)
- `lib/soonspace-runtime.ts` commandBridge 三方法 stub(panelList/panelSetVisible/showVideo,迁壳遗留)

**7. 测试覆盖扩展**
- 未覆盖:`src/components/` + `src/views/` + `src/api/`
- 建议:引入 `@testing-library/react` + jsdom 环境,优先覆盖核心组件(SceneProvider/RealGisMap/AgentChatThread)

---

## 六、已知问题与技术债

### 6.1 代码中的 TODO

| 文件 | 内容 | 优先级 |
|------|------|--------|
| `lib/soonspace-runtime.ts` | commandBridge(panelList/panelSetVisible/showVideo)为 stub,平台面板/视频命令空转(迁壳遗留) | 🟢 低 |

### 6.2 架构问题

| 问题 | 影响 | 建议 |
|------|------|------|
| React 组件无测试覆盖 | 质量无保障 | 引入 `@testing-library/react` + jsdom |
| TypeScript 版本不一致 | 主 6.0.3 vs mcp 5.6.0 | 统一版本,避免类型兼容问题 |
| `@xyflow/react` 未使用 | 依赖冗余 | 删依赖 + globals.css 死样式 |

### 6.3 性能问题

| 问题 | 现状 | 方案 |
|------|------|------|
| 3D 场景加载慢 | 完整包全量加载,等待时间长 | 平台提供精简包 / SDK 按类别加载 |
| 3D 操作卡顿 | 69k mesh 全量渲染 | 楼层裁剪(已做) + 平台 InstancedMesh + frustumCulled |

---

## 七、快速上手

### 7.1 开发环境

```bash
# 克隆仓库
git clone git@github.com:wanxiayushaonian/FireRescueAIWeb.git
cd FireRescueAIWeb

# 安装依赖(soonspacejs 插件 peer 精确锁定,需 --legacy-peer-deps,见 package.json)
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local,填入:
# - NEXT_PUBLIC_X_APP_KEY (uStudio 场景密钥)
# - NEXT_PUBLIC_USTUDIO_BASE (uStudio 网关地址)
# - NEXT_PUBLIC_*_APP_ID (9 个 agent app id,未配自动降级)
# - ZNYA_BASE_URL (znya 后端地址)
# - ZNYA_ADMIN_USER / ZNYA_ADMIN_PASSWORD (znya 管理员账号)
# - MCP_APP_KEY (MCP 服务认证密钥)

# 启动开发服务器
npm run dev
# 访问 http://localhost:3000
```

### 7.2 常用命令

```bash
# 开发
npm run dev              # 启动 Next.js 开发服务器
npm run build            # 构建生产版本
npm run typecheck        # TypeScript 类型检查
npm run test             # 运行测试(vitest run)
npm run verify           # 完整门禁(typecheck+测试+mcp build+ mcp 测试+生产构建),提交前必跑

# MCP 子包
cd mcp-server
npm run dev              # 启动 MCP 开发服务器(tsx watch)
npm run build            # 编译 TypeScript
npm run test             # 运行 MCP 测试

# 部署(CI 自动,手动应急)
cd deploy
./deploy-server.sh       # 服务器本地构建 + compose up(读 deploy/.env)
```

### 7.3 关键文件索引

| 类别 | 文件 |
|------|------|
| 项目入口 | `src/App.tsx` |
| 路由配置 | `app/layout.tsx`, `app/page.tsx` |
| 侧边栏导航 | `src/components/SideNav.tsx` |
| GIS 底座 | `src/components/RealGisMap.tsx`, `lib/gis/*` |
| 3D 场景 | `src/components/SceneProvider.tsx`, `lib/soonspace-runtime.ts`, `lib/scene-recipe/*` |
| 演练对抗 | `src/views/DrillView.tsx`, `src/drill/confrontation/*` |
| Agent 对话 | `src/components/AgentSidebar.tsx`, `src/components/assistant-ui/AgentChatThread.tsx`, `lib/agent-chat-client.ts`, `lib/agent-app-ids.ts` |
| 场景命令总线 | `components/SceneCommandBridge.tsx`, `lib/scene-command-bus/*` |
| MCP 服务 | `mcp-server/src/index.ts`, `mcp-server/src/tools.ts`, `mcp-server/src/http.ts` |
| 部署配置 | `deploy/docker-compose.yml`, `deploy/Dockerfile.bff`, `deploy/Dockerfile.mcp`, `deploy/deploy-server.sh` |
| CI/CD | `.github/workflows/deploy.yml` |
| 环境变量 | `.env.local`, `deploy/.env` |

---

## 八、文档索引

**plan/ 文档以 `plan/README.md` 为唯一索引入口(状态/新旧以它为准,此处不再复制)。**

| 类别 | 位置 |
|------|------|
| 演示验收真相源 | `DEMO.md` |
| 数据权威与双 MCP 分工 | `doc/data-authority-mcp-blueprint.md` |
| 四角色提示词(现行权威) | `plan/agents/confront-v2-*.md`(索引 `plan/2026-08-25-confrontation-agent-prompts.md`) |
| 演示验收记录 | `doc/demo-validation-2026-08-25.md`, `doc/demo-validation-v2-2026-08-25.md` |
| 场景包普查 | `doc/ref/pack-inventory.md` |
| 需求对齐 | `doc/ref/ref.md` + `doc/ref/ref-status.md` |
| 底层包技术文档 | `doc/packages/`(ustudio-sdk/soonspacejs/multi-agent-sdk/插件) |
| MCP 平台文档 | `doc/mcp/`(本体服务/本体功能调用/空间查询) |
| SDK 文档 | `doc/ustudiosdk-2.0.md` |
| 历史文档 | `doc/archive/`(早期开发阶段归档备查) |

---

## 九、联系方式

- **项目仓库**:https://github.com/wanxiayushaonian/FireRescueAIWeb
- **生产环境**:http://111.75.149.221:3000
- **uStudio 网关**:https://fc.xwbuilders.com
- **znya 后端**:http://localhost:9100 (开发) / 生产已部署(独立仓库 FireRescueAI,服务器 `~/jjxf/znya`)

---

**文档维护**:本文档随项目进展持续更新。重大变更(新功能/架构调整/部署变更)需同步更新本文档。
