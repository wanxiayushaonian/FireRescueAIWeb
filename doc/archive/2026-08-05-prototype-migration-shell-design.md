# 原型迁移(迁壳阶段)设计

- 日期:2026-08-05
- 范围:把 `消防救援前端原型/app/`(深色指挥大屏 SPA)整体迁入当前 `web/` 项目并跑通
- 关联:`web/mcp/*`(他平台官方 MCP 文档)、`web/mcp-server/`(自研 MCP)、`web/app/api/*`(BFF)

## 背景与迁移动因

存在三套相关代码:

1. **当前 `web/`** — Next 16 + React 19,真实 **Soonspacejs/UStudio SDK** 渲染 3D 场景;自研 `mcp-server`(5 工具)+ BFF(`/api/ustudio/*`、`/api/scene-events` SSE 命令流)+ `@dt-uagent/multi-agent-sdk`。UI 是单页围绕 3D 场景 + 几个浮层面板,**业务深度浅**。
2. **原型 `消防救援前端原型/app/`** — Next 15 + Tailwind 3.4 + shadcn/ui(40+ 组件)+ Framer Motion,深色指挥中心大屏风格。五大模块(态势总览 GIS / 对象总览建筑档案 / 演练对抗 / 熟悉考核 / 实战指挥),经 6 轮迭代,业务链路完整(含 SSE 流式预案、考核闭环、战术推演层、演示剧本)。可拖拽面板系统 + 智能体悬浮窗(多身份)。**3D 场景是 `ScenePlaceholder` 占位区**,SDK 是 mock adapter(flyTo/highlight/switchFloor/showRoute 只打日志)。`output: 'export'` 静态导出,无服务端;数据全是 `src/mock/*`。
3. **`web/mcp/`(他平台官方 MCP 文档)** — 4 份文档共 ~37 个工具。最关键:`invokeTwinsFunction` / `batchInvokeTwinsFunction` 已覆盖飞向/高亮/隐藏等可视化操作(文档明确"由在线的场景前端执行",与本项目 `/scene-events` 同模式),另有 `cypherQuery` 图谱查询、`spaceMetrics`/`spaceStats` 空间度量、`getShortestPathWithWaypoints` 路径规划、`spacequery` 自然语言推理、巡检记录等。

### MCP 分工(澄清)

- **他平台 MCP**:负责**场景内**能力(空间图谱、本体实例、飞向/高亮可视化、路径规划),agent 直连他平台。
- **自研 `mcp-server`**:**不是造轮子**——它对接他平台**没有**的业务数据后端(执勤力量资源库、建筑数字化档案、预案输出/评估、考核、警情等自研服务),把这些暴露给 agent。两者**互补,都保留**。

### 迁移动因

原型 UI/业务成熟度远高于 web 现有 UI(6 轮迭代 vs 单页浅层),且原型本身就是为"接入真实 SDK"设计的(README 明确标注 mock→真实替换点)。把原型迁入 web,可复用 web 已配好的 git CI/CD、GHCR、服务器部署、env,避免另起炉灶。

## 三个关键决策(用户已确认)

| 决策 | 选择 | 说明 |
|---|---|---|
| **方向** | B — 在当前 `web/` 上迁原型 | 复用已配好的 CI/CD、env、部署链路,不另搭 |
| **节奏** | A — 先整体迁"壳"跑通,再增量接真实能力 | 第一步纯前端搬迁 + 技术栈对齐,不碰真实 3D/后端 |
| **现有内核处置** | A — 全部保留文件、只摘出挂载 | 纯加法;真实 3D 组件 + lib + BFF + mcp-server 文件全留着不挂载,增量阶段零摩擦接回 |

## 目标与非目标

### 本阶段(迁壳)目标

把原型的深色指挥大屏 SPA(5 模块 + 面板系统 + 智能体窗 + mock 数据 + 占位 3D)**原样**搬进 `web/`,在 web 里跑通。**纯加法**——只往 web 加原型,不动 web 现有真实 3D / BFF / mcp-server / lib 逻辑。

### 非目标(留作增量阶段)

- 不接真实 3D(原型占位 `ScenePlaceholder`/`GisMapPlaceholder` 保留)
- 不接真实后端(原型 `src/mock/*` 保留)
- 不整合智能体(原型 `AgentChat` 的 mock 演示脚本保留,web `@dt-uagent/multi-agent-sdk` 暂不挂)
- 不删 web 任何现有文件
- 不改 `mcp-server/` / `app/api/*` BFF
- 不对接他平台 MCP / 自研 MCP(那是后续场景联动的事)

### 可接受过渡

迁壳完成后 web 会从"真实 3D"短暂退回"占位 3D"——增量阶段第一刀即接回真实 Soonspace Viewer。

## 关键技术决策

| 项 | 决策 | 理由 |
|---|---|---|
| **框架基线** | 以 web 现有为准:**Next 16** / **TypeScript 6** / React 19 | web 已配好 CI/CD+部署,不降级;原型代码适配上来(App Router 稳定,大概率兼容) |
| **路径别名** | tsconfig `"@/*": ["./src/*", "./*"]` 双映射 | 见下节详解 |
| **目录** | 原型 `src/`(101 文件)整体→web 顶层 `src/`;原型 `public/`(5 svg)合并进 web `public/` | 原型内部 import 零改 |
| **样式** | 原型 `globals.css` **替换** web 的;web 旧 globals.css(多智能体浮窗 `.ma-*`、`previewServerFallback` 等)存为 `app/legacy.css` 备用,不挂载 | 原型是完整深色大屏主题 + Tailwind 指令 + shadcn 变量;旧样式属于暂下线的 web UI |
| **layout** | 用原型的(标题"灭火救援预案智能辅助平台" + 字体 + logo);web 的 `<UStudioVideoDialog/>` 摘出不挂载(文件保留) | 原型主题统一 |
| **page** | 原型 `page.tsx`(`'use client'` + `<App/>`)接管;web 旧 `page.tsx`(3D 组合)留 git 历史,真实 3D 组件文件全保留 | 增量阶段把真实 Viewer 嵌进原型 `ScenePlaceholder` 位 |
| **Tailwind/shadcn** | 引入 `tailwind.config.js` / `postcss.config.js` / `components.json` 到 web 顶层 | 原型 UI 全靠它 |
| **Next 配置** | web 的 `next.config.mjs` **不动**(保持 standalone + `transpilePackages` + `rewrites`),**不加** `output: 'export'` | web 要 BFF(API routes),不能静态导出 |
| **依赖** | 原型 deps(radix 全家桶 / shadcn / framer-motion / lucide-react / recharts / zod / react-hook-form / cmdk / vaul / sonner / react-resizable-panels / date-fns / embla / react-day-picker / input-otp / class-variance-authority / clsx / tailwind-merge / next-themes 等)+ devDeps(tailwindcss / tailwindcss-animate / tw-animate-css / autoprefixer)合入 web `package.json` | — |

## 路径别名双映射(详解)

**冲突**:web tsconfig `"@/*": ["./*"]`(指向项目根),原型 tsconfig `"@/*": ["./src/*"]`(指向 src/)。web 现有代码 `@/` 用了 **63 处**(遍布 `app/api/`、`components/`、`lib/`),全指向根——这些是真实 3D/BFF 内核,不能改。

**方案**:tsconfig paths 改为数组,按顺序解析回退:

```jsonc
"paths": {
  "@/*": ["./src/*", "./*"]
}
```

- 原型 `@/components/ui/button` → 先匹配 `./src/components/ui/button`(命中,原型 shadcn 组件)
- web `@/components/SoonspaceSceneViewer` → 先找 `./src/components/SoonspaceSceneViewer`(不存在)→ 回退 `./components/SoonspaceSceneViewer`(命中,web 现有)
- web `@/lib/ustudio` → `./src/lib/ustudio`(不存在)→ `./lib/ustudio`(命中)
- 原型 `@/lib/utils` → `./src/lib/utils`(命中,shadcn 的 `cn` 工具)

TypeScript paths 数组按顺序尝试解析,第一个命中即用;Next.js(turbopack/webpack)同样支持。63 处 web 引用**零改动**。

**潜在冲突排查**:原型 `src/components/` 含子目录 `ui/`、`panels/`、`command/`、`drill/`、`gis/`、`training/` + 根文件(TopBar/SideNav/AgentChat/Toast/StatCard 等);web `components/` 是 SoonspaceSceneViewer/MultiAgentWidget/PluginPanel 等具体文件——**无同名冲突**。原型 `src/lib/utils.ts` 与 web `lib/`(ustudio/scene-sdk/scene-command-bus 等)目录结构不同,不冲突。

## 验证标准(迁壳完成硬指标)

- `npm run dev` 起来 → 深色大屏主页正常、5 模块切换、面板系统、智能体悬浮窗、演示剧本全部**不回归**
- mock 数据正常(「演示数据」标注在)
- `npm run typecheck` 通过(TS 6 下原型代码 + web 现有代码全绿)
- `npm run build`(standalone)成功
- `npm run test`(vitest)web 现有 lib 测试**不回归**
- `/api/*` BFF 不受影响(curl 探活 `/api/ustudio/overview` 等)
- `mcp-server/` 子包不受影响

## 风险点

1. **Next 15→16 / TS 5.9→6 适配**:原型代码可能有少量 API 需微调(大概率兼容,App Router 稳定)。若 build 报错,逐点修。
2. **双映射别名解析**:需实测 turbopack 解析顺序正确(预期 OK,标准 TS paths 行为)。
3. **依赖版本**:原型 `next ^15.5` vs web `next ^16.2`,以 16 为基安装;radix/lucide/framer 等与 Next 版本无关,冲突风险低。
4. **Tailwind 引入**:web 旧 CSS 非 Tailwind,引入后只影响新原型 UI;旧 UI 不挂载故无破坏。

## 阶段拆分概览(留给后续 plan 细化)

1. **基础设施**:Tailwind/postcss/components.json/tailwind.config 入 web + `globals.css` 替换 + `legacy.css` 备份 + `layout.tsx` 对齐
2. **依赖合并**:`package.json` 合并原型 deps + `npm install`
3. **搬运**:原型 `src/`→web `src/`、`public/` 合并、tsconfig paths 双映射
4. **接管**:`app/page.tsx` 换原型版
5. **适配修编译**:`typecheck` + `build` 过一遍,修 Next 16 / TS 6 兼容点
6. **验证**:dev 走查 + build + test + BFF 探活

## 后续增量阶段预告(不在本 spec 范围)

- **接真实 3D**:原型 `ScenePlaceholder`/`GisMapPlaceholder` → 真实 Soonspace/UStudio Viewer(复用 web `components/SoonspaceSceneViewer` + `lib/soonspace-runtime`)
- **接真实后端**:原型 `src/mock/*` 的 `fetchXxx()` → 自研后端 API / 自研 mcp-server
- **智能体整合**:原型 `AgentChat` mock 脚本 → web `@dt-uagent/multi-agent-sdk` 真实通道
- **场景命令联动**:原型 mock SDK adapter → 真实场景命令总线(`lib/scene-command-bus`),并厘清与他平台 `invokeTwinsFunction` 通道的关系
