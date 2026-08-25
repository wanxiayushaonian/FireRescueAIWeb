# 火场救援数字孪生平台 — 项目总览

> 更新时间:2026-08-25
> 当前分支:`master`
> 部署状态:✅ 已部署至 http://111.75.149.221:3000  
> 权威技术蓝图(跨项目:模板/赛事后端/znya):见仓库根目录 `项目技术蓝图与实施指南.md`
> 决赛黄金演示链与验收口径:见 `DEMO.md`

---

## 一、项目简介

**火场救援数字孪生平台** —— 基于 3D 场景 + GIS 底座的消防演练对抗系统。

核心能力:
- **态势总览**:GIS 地图 + 执勤力量 + 水源分布 + 重点单位
- **对象总览**:建筑档案 + 消防设施 + 预案库
- **演练对抗**:AI 指挥 agent + 事件树 + 3D 实时推演
- **GIS 底座**:高德地图 + 路线规划 + ETA 分析
- **3D 场景**:Soonspace 引擎 + 建筑漫游 + 设备可视化

---

## 二、当前状态总览

| 维度 | 状态 | 说明 |
|------|------|------|
| **分支** | 🟡 基线收口 | `master` 上统一对抗舱运行时与 Agent 场景回执链路 |
| **功能** | 🟡 功能面较完整 | 顶层模块已成形;决赛黄金演示链尚待连续 3 次端到端验收,不再使用“90%”表达闭环成熟度 |
| **测试** | 🟡 逻辑层较强 | 主项目 61 个文件/422 用例,MCP 8 个文件/87 用例;尚缺 React 组件与浏览器 E2E |
| **部署** | ✅ 已加门禁 | push master 前置类型/测试/构建门禁,Docker 健康检查,生产脏工作区拒绝部署 |
| **文档** | 🟡 收口中 | `DEMO.md` 为演示验收真相源;`plan/` 现有 31 篇历史/现行文档,继续归档精简 |
| **技术债** | 🟡 中等 | 3 个 TODO,lib 依赖 src 类型需清理,双图层体系待裁定(见蓝图 §4.4) |

---

## 三、功能模块状态

### 3.1 已完成 ✅ (12 个)

| 模块 | 入口文件 | 核心能力 |
|------|----------|----------|
| **态势总览** | `src/App.tsx` (overview) | GIS 地图 + 资源总览面板 + 水源 + 重点单位 |
| **对象总览** | `src/App.tsx` (objects) | 建筑档案 + 消防设施清单 + 预案库 |
| **演练对抗** | `src/views/DrillView.tsx` | AI 指挥 agent + 事件树(Ctrl+K) + 3D 推演 + 态势面板 |
| **培训** | `src/views/TrainingView.tsx` | 培训课程 + 考核(Mock 数据) |
| **实战指挥** | `src/views/CommandView.tsx` | 实时频道 + 战术叠加层(Mock 数据 + 真实警情) |
| **GIS 底座** | `src/components/RealGisMap.tsx` | 高德地图 + 路线规划 + 坐标修正 + 力量/水源/单位标注 |
| **3D 场景** | `src/components/SceneProvider.tsx` + `src/App.tsx`(SceneContainer) | Soonspace 引擎 + 建筑漫游 + 设备可视化 + WASD 操控 |
| **Agent 对话** | `src/components/assistant-ui/AgentChatThread.tsx` + `src/components/AgentSidebar.tsx` | SSE 流式对话 + 工具调用(fly_to/show_route 等) + 历史会话 |
| **资源总览** | `src/components/panels/ResourceOverviewPanel.tsx` | 水源/执勤力量/重点单位统计与清单(合并旧 WaterSource/ForceResource 面板) |
| **建筑档案** | `src/components/panels/BuildingProfilePanel.tsx` | 建筑详情 + 楼层分布 + 消防设施统计 |
| **预案库** | `src/components/panels/PlanLibraryPanel.tsx` | 预案列表 + 详情(Mock 数据,孤儿面板未挂载) |

### 3.2 进行中 🟡 (1 个)

| 模块 | 状态 | 待完成 |
|------|------|--------|
| **GIS 响应分析(ETA)** | 部分完成 | ETA 染色 + 响应查询 + 图层接入(详见 `plan/2026-08-08-gis-analytics-plan.md`) |

### 3.3 待办 ⬜

| 事项 | 优先级 | 说明 |
|------|--------|------|
| **3D 渲染优化** | 🔴 高 | 完整包场景(69k mesh)操作卡顿,需平台配合(精简包/SDK 按类别加载) |
| **丰度分级** | 🟡 中 | 前端已实现 visible 分级(L1-L5),待平台确认能力后落地 |
| **zny a Python MCP 部署** | 🟡 中 | 6 项待办(appKey 鉴权/docker-compose 集成等,详见 `plan/znya-deploy-mcp.md`) |
| **演练端到端联调** | 🟡 中 | 6.6 批次下(云端对抗 agent 配置 + 浏览器验证) |

---

## 四、技术架构

### 4.1 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| **前端框架** | Next.js (App Router) | 16.2.10(当前锁文件解析) |
| **UI 库** | React | 19.2.7 |
| **类型系统** | TypeScript | 6.0.3 (主) / 5.6.0 (mcp-server) |
| **3D 引擎** | SoonspaceJS + Three.js | 2.15.19 |
| **3D SDK** | uStudio SDK | ^2.0.4 |
| **2D 地图** | Leaflet + 高德瓦片 | 1.9.4 |
| **事件树** | React Flow | 12.11.2 |
| **动画** | Framer Motion | 12.43.0 |
| **图表** | Recharts | 2.15.4 |
| **MCP** | @modelcontextprotocol/sdk | 1.30.0 |

### 4.2 代码结构

```
web/
├── src/
│   ├── components/     # React 组件(地图/3D/面板/对话)
│   ├── views/          # 顶层视图(Training/Command/Drill)
│   ├── drill/          # 演练对抗(事件树/工具栏/hooks)
│   ├── api/            # 前端 API 调用层
│   └── mock/           # Mock 数据
├── lib/
│   ├── drill/          # 演练推演引擎(纯逻辑,可单测)
│   ├── gis/            # GIS 纯函数(渲染/查询/ETA)
│   ├── scene-command-bus/  # 场景命令总线
│   ├── scene-plugins/  # 场景插件系统
│   └── *.ts            # mapper/geo-query/scene-sdk/soonspace-runtime 等
├── mcp-server/         # MCP 工具桥(独立子包,SSE 传输)
├── app/api/            # BFF API 路由(15 个:12 ustudio + business + scene-events + agent-chat)
└── plan/               # 设计文档 + 实施计划(16 个,索引见 plan/README.md)
```

### 4.3 数据流

```
浏览器 → Next.js BFF (/api/*) → uStudio 场景服务 (fc.xwbuilders.com)
                              → znya 业务后端 (localhost:9100 / 生产环境)
                              → 高德地图 (GIS 底图)

Agent 对话 → uStudio agent-chat (SSE) → 工具调用 → MCP Server → BFF → SDK
```

### 4.4 部署架构

```
GitHub Actions (push master) → 构建 Docker 镜像 → 推 ghcr.io
                              → SSH 服务器 → docker compose pull + up -d

服务器:
  - BFF (Next.js):3000 端口 (前端 + /api/*)
  - MCP Server:8787 端口 (SSE 传输,Agent 连接)
  - znya 后端:9100 端口 (业务数据)
```

---

## 五、开发方向建议

### 5.1 高优先级 🔴

**1. 3D 渲染优化**
- **问题**:完整包场景(21D) 69k mesh 全量加载,操作卡顿(337ms 帧耗时,3 FPS)
- **方案**:
  - 前端已实现 visible 分级(L1-L5),可隐藏管线(28.7k mesh,占 41%)
  - **需平台配合**:提供精简版场景包 / SDK 按类别加载 API / 重复设施 InstancedMesh
- **行动**:已向平台方发询问(`temp/platform-inquiry.md`),等回复后定实施方案
- **预期收益**:加载时间减半 + 操作流畅(30-60 FPS)

**2. 丰度分级落地**
- **现状**:前端曾实现(`lib/scene-richness.ts` + `RichnessTierSelector`),**当前 checkout 不存在**(stash 保留,`git stash list` 可查);当前性能方案走 `lib/scene-recipe`(hideDevices + 像素比自适应,见蓝图 §4.4)
- **阻塞**:需平台确认能力(精简包/SDK 过滤)
- **下一步**:平台回复后,评估恢复 stash 或基于 scene-recipe 扩展

### 5.2 中优先级 🟡

**3. 演练端到端联调(6.6 批次下)**
- **现状**:Scenario Registry + 真实剧本(ba703c3)已完成,待联调
- **待办**:
  - 云端对抗 agent 配置(5C.3,`adversaryEveryNTicks` 当前=0 禁用)
  - 浏览器启动演练 → 3D 执行 + 事件树生长全链路验证
- **行动**:等 3D 渲染优化落地后,优先联调演练功能

**4. znya Python MCP 部署**
- **现状**:6 项待办(`plan/znya-deploy-mcp.md`)
- **待办**:appKey 鉴权 / docker-compose 集成 / 平台 agent 支持 / 高德 key / DB 迁移
- **行动**:业务查询工具(query_units/query_stations)当前不可用,需优先部署

**5. GIS 响应分析(ETA)收尾**
- **现状**:部分完成(`lib/gis/eta-render.ts` + `response-query.ts`)
- **待办**:ETA 染色 + 响应查询 + 图层接入(详见 `plan/2026-08-08-gis-analytics-plan.md`)
- **行动**:GIS 底座已基本完成,ETA 分析是最后增强,可并行推进

### 5.3 低优先级 🟢

**6. 技术债清理**
- lib 依赖 src 类型(`lib/water-mapper.ts:1` 等 4 处)→ 迁移类型到 `lib/fire-types.ts`
- DrillView runAgent 失败无 UI 反馈(`src/views/DrillView.tsx:177`)→ 注入 status 到 UI
- TacticalOverlay 投影不跟随地图(`src/components/command/TacticalOverlay.tsx:2`)→ 重接 Leaflet 坐标

**7. 测试覆盖扩展**
- 当前:48 个测试文件(412 用例),覆盖 lib 层
- 未覆盖:`src/components/` + `src/views/` + `src/api/`
- 建议:引入 `@testing-library/react` + jsdom 环境,优先覆盖核心组件(SceneProvider/RealGisMap/AgentChatThread)

---

## 六、已知问题与技术债

### 6.1 代码中的 TODO/FIXME

| 文件 | 行号 | 内容 | 优先级 |
|------|------|------|--------|
| `src/views/DrillView.tsx` | 177 | runAgent 失败仅 logger.warn,UI 无感知 | 🟡 中 |
| `src/components/command/TacticalOverlay.tsx` | 2 | 投影不跟随地图 pan/zoom | 🟡 中 |
| `lib/soonspace-runtime.ts` | 185 | commandBridge(panelList/panelSetVisible/showVideo)为 stub,平台面板/视频命令空转(迁壳遗留,待重接 DraggablePanel/VideoPlaybackPanel) | 🟢 低 |

### 6.2 架构问题

| 问题 | 影响 | 建议 |
|------|------|------|
| lib 依赖 src 类型(4 处) | lib 层不纯,违反单向依赖 | 迁移类型到 `lib/fire-types.ts` 或独立 types 包 |
| React 组件无测试覆盖 | 质量无保障 | 引入 `@testing-library/react` + jsdom |
| znya Python MCP 未部署 | 业务查询工具不可用 | 优先完成 appKey 鉴权 + docker-compose 集成 |
| TypeScript 版本不一致 | 主 6.0.3 vs mcp 5.6.0 | 统一版本,避免类型兼容问题 |

### 6.3 性能问题

| 问题 | 现状 | 方案 |
|------|------|------|
| 3D 场景加载慢 | 完整包全量加载,等待时间长 | 平台提供精简包 / SDK 按类别加载 |
| 3D 操作卡顿 | 69k mesh 全量渲染,337ms 帧耗时 | visible 分级 + 平台 InstancedMesh + frustumCulled |
| GIS 地图加载慢 | 大量标注点未聚合 | 视口裁剪 + 阈值聚合(详见 `plan/2026-08-08-gis-perf-plan.md`) |

---

## 七、快速上手

### 7.1 开发环境

```bash
# 克隆仓库
git clone git@github.com:wanxiayushaonian/FireRescueAIWeb.git
cd FireRescueAIWeb/web

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local,填入:
# - NEXT_PUBLIC_X_APP_KEY (uStudio 场景密钥)
# - NEXT_PUBLIC_USTUDIO_BASE (uStudio 网关地址)
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

# MCP 子包
cd mcp-server
npm run dev              # 启动 MCP 开发服务器(tsx watch)
npm run build            # 编译 TypeScript
npm run test             # 运行 MCP 测试

# 部署
cd deploy
./deploy-server.sh       # 一键部署(Docker Compose)
```

### 7.3 关键文件索引

| 类别 | 文件 |
|------|------|
| 项目入口 | `src/App.tsx` |
| 路由配置 | `app/layout.tsx`, `app/page.tsx` |
| 侧边栏导航 | `src/components/SideNav.tsx` |
| GIS 底座 | `src/components/RealGisMap.tsx`, `lib/gis/*` |
| 3D 场景 | `src/components/SceneProvider.tsx`, `lib/soonspace-runtime.ts` |
| 演练对抗 | `src/views/DrillView.tsx`, `src/drill/*`, `lib/drill/*` |
| Agent 对话 | `src/components/AgentSidebar.tsx`, `src/components/assistant-ui/AgentChatThread.tsx`, `lib/agent-chat-client.ts` |
| MCP 服务 | `mcp-server/src/index.ts`, `mcp-server/src/tools.ts` |
| 部署配置 | `deploy/docker-compose.yml`, `deploy/Dockerfile.bff`, `deploy/Dockerfile.mcp` |
| CI/CD | `.github/workflows/deploy.yml` |
| 环境变量 | `.env.local`, `deploy/.env.example` |

---

## 八、文档索引

### 8.1 设计文档(plan/)

| 文档 | 摘要 | 状态 |
|------|------|------|
| `2026-08-08-gis-refactor-design.md` | GIS 底座结构重构设计 | ✅ 完成 |
| `2026-08-08-gis-visual-design.md` | GIS 底座视觉与体验设计 | ✅ 完成 |
| `2026-08-08-gis-perf-design.md` | GIS 底座性能与加载设计 | ✅ 完成 |
| `2026-08-08-gis-analytics-design.md` | GIS 灾情响应 ETA 分析设计 | ✅ 完成 |
| `2026-08-09-drill-simulation-design.md` | 演练对抗智能推演设计(v2) | ✅ 完成 |
| `situation-overview-roadmap.md` | 态势总览增强与 Agent 智能化路线图 | 🟡 规划中 |

### 8.2 实施计划(plan/)

| 文档 | 摘要 | 状态 |
|------|------|------|
| `2026-08-03-phase0-mcp-bridge.md` | Phase 0 — MCP 桥地基 | 🟡 进行中 |
| `2026-08-08-gis-refactor-plan.md` | GIS 底座结构重构实施 | 🟡 进行中 |
| `2026-08-08-gis-visual-plan.md` | GIS 视觉与体验实施 | 🟡 进行中 |
| `2026-08-08-gis-perf-plan.md` | GIS 性能与加载实施 | 🟡 进行中 |
| `2026-08-08-gis-analytics-plan.md` | GIS 灾情响应 ETA 分析实施 | 🟡 进行中 |
| `2026-08-09-drill-simulation-plan.md` | 演练对抗智能推演实施 | ✅ 大部分完成 |
| `znya-deploy-mcp.md` | znya 后端 + Python MCP 部署 | 🟡 待办 |

### 8.3 技术文档(plan/)

| 文档 | 摘要 | 状态 |
|------|------|------|
| `drill-agent-chat-sse-format.md` | agent-chat SSE 格式实证 | ✅ 完成 |
| `drill-mcp-config-guide.md` | 云端主智能体 mcp_servers 配置指南 | ✅ 完成 |

### 8.4 底层包技术文档(doc/packages/)

| 文档 | 摘要 |
|------|------|
| `README.md` | 底层包总览 |
| `ustudio-sdk.md` | uStudio SDK API 文档 |
| `soonspacejs.md` | SoonspaceJS 3D 引擎文档 |
| `multi-agent-sdk.md` | 多智能体 SDK 文档 |
| `plugin-atmosphere.md` | 大气效果插件 |
| `plugin-cps-soonmanager.md` | CPS 场景管理器插件 |
| `plugin-effect.md` | 视觉效果插件 |
| `plugin-fds.md` | FDS 消防模拟插件 |
| `plugin-flow.md` | 流体效果插件 |
| `plugin-gs3d-loader.md` | GS3D 模型加载器插件 |
| `plugin-poi-renderer.md` | POI 兴趣点渲染器插件 |
| `plugin-tiles.md` | 瓦片地图插件 |

### 8.5 MCP 技术文档(doc/mcp/)

| 文档 | 摘要 |
|------|------|
| `uStudio本体服务.md` | uStudio 本体服务说明 |
| `本体定义和实例属性查询.md` | 本体定义与属性查询 |
| `本体功能调用.md` | 本体功能调用方法 |
| `空间信息查询及推理.md` | 空间查询与推理 |

### 8.6 SDK 文档(doc/)

| 文档 | 摘要 |
|------|------|
| `ustudiosdk-2.0.md` | uStudio SDK 2.0 完整文档 |

### 8.7 历史文档(doc/archive/)

包含 17 个早期开发阶段的计划和设计文档（2026-08-03 至 2026-08-06），已归档备查。

---

## 九、联系方式

- **项目仓库**:https://github.com/wanxiayushaonian/FireRescueAIWeb
- **生产环境**:http://111.75.149.221:3000
- **uStudio 网关**:https://fc.xwbuilders.com
- **znya 后端**:http://localhost:9100 (开发) / 生产环境待配(见 `plan/znya-deploy-mcp.md`)

---

**文档维护**:本文档随项目进展持续更新。重大变更(新功能/架构调整/部署变更)需同步更新本文档。
