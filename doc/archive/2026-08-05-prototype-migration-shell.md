# 原型迁移(迁壳阶段)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task(inline,带 checkpoint)。Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `消防救援前端原型/app/`(深色指挥大屏 SPA:5 模块 + 面板系统 + 智能体窗 + mock + 占位 3D)原样搬进 `web/` 并跑通。纯加法,不动 web 现有真实 3D / BFF / mcp-server / lib。

**Architecture:** 原型 `src/` → web 顶层 `src/`;`@/` 别名双映射(`./src/*` + `./*`)让原型与 web 现有 63 处 `@/` 引用共存;引入 Tailwind 3.4 + shadcn/ui;`globals.css`/`layout.tsx`/`page.tsx` 用原型版,web 旧 globals.css 存 `legacy.css`、旧 page 留 git 历史;web 现有 `components/`/`lib/`/`app/api/`/`mcp-server/` 全保留不挂载。

**Tech Stack:** Next **16**(web 现有,不降) · TypeScript **6**(web 现有,不降) · React 19 · Tailwind 3.4.19 · shadcn/ui(new-york) · Framer Motion · lucide-react · recharts

## Global Constraints

- **纯加法**:不删、不改 web 现有真实 3D 组件、`app/api/*` BFF、`mcp-server/`、`lib/*`(除 `tsconfig.json`/`package.json`/`globals.css`/`layout.tsx`/`page.tsx` 这几个对齐项)
- **技术栈以 web 为基**:Next 16 / TS 6 / React 19,不降级;原型代码(Next 15 / TS 5.9)适配上来
- **路径别名双映射**:`tsconfig.json` paths 改为 `"@/*": ["./src/*", "./*"]`,web 现有 63 处 `@/` 引用零改动
- **非 TDD 场景**:本阶段是搬迁现有可运行代码 + 配置对齐 + 编译验证(非新逻辑)。验证靠 `typecheck` / `build` / `dev` 走查 / `test` 不回归(spec 已认可)
- **分支策略**:在 master 直接执行(纯加法风险低 + 复用用户既有习惯),**每 task 独立 commit**(便于回退),全部验证通过后**由用户决定是否 push**(避免中间编译不过的状态触发 CI 部署失败)
- **原型源路径常量**(bash 里需引号,含中文):
  `PROTO="/home/ljb/program/FireRescueAI/消防救援前端原型/app"`
- **工作目录**:所有命令在 `/home/ljb/program/FireRescueAI/web` 下执行
- **简体中文 UI** 与「演示数据」标注保留;原型 mock 数据原样搬,不接真实后端

## File Structure(迁移后 web 关键结构)

```
web/
├── app/
│   ├── layout.tsx          ← 改:用原型版(标题/字体/logo),摘出 UStudioVideoDialog/multi-agent-sdk style
│   ├── page.tsx            ← 改:原型版('use client' + <App/>);web 旧 3D 组合留 git 历史
│   ├── globals.css         ← 改:原型版(165 行 Tailwind+shadcn+深色大屏)
│   ├── legacy.css          ← 新建:web 旧 globals.css(2953 行)备份,不挂载
│   └── api/                ← 不动(BFF:/scene-events、/ustudio/*)
├── src/                    ← 新建:原型 src/ 整体搬入
│   ├── App.tsx             (SPA 根,module 切换)
│   ├── components/         (TopBar/SideNav/AgentChat/ui/*/panels/command/drill/gis/training)
│   ├── views/              (CommandView/TrainingView/ConstructionView)
│   ├── mock/               (13 个 mock 数据文件)
│   ├── hooks/use-mobile.ts
│   └── lib/utils.ts        (cn 工具)
├── components/             ← 不动(web 现有真实 3D 组件,增量阶段接回)
├── lib/                    ← 不动(web 现有 scene-command-bus/ustudio/scene-sdk 等)
├── mcp-server/             ← 不动(自研 MCP 子包)
├── public/
│   ├── draco/              ← 不动(web 现有)
│   └── *.svg               ← 新增:原型 5 个 svg(logo-flame 等)
├── tailwind.config.js      ← 新建:原型版
├── postcss.config.js       ← 新建:原型版(ESM)
├── components.json         ← 新建:shadcn 配置(原型版,aliases 指向 @/)
├── tsconfig.json           ← 改:paths 双映射
├── next.config.mjs         ← 不动(保持 standalone,不加 output:export)
└── package.json            ← 改:合并原型 deps/devDeps
```

---

## Task 1: 依赖合并 — package.json + npm install

**Files:**
- Modify: `package.json`(合并原型 deps / devDeps)
- Read: `$PROTO/package.json`(原型依赖清单源头)

**Interfaces:**
- Produces:`node_modules` 含 Tailwind/shadcn/radix/framer/lucide/recharts 等,供后续 task 编译

**背景**:先装依赖,后续 Tailwind 指令 / 原型代码 import 才能解析。版本以 web 为基(Next 16 / TS 6 / React 19),原型的 next 15 不降 web。

- [ ] **Step 1: 读原型 package.json 拿依赖清单**

```bash
PROTO="/home/ljb/program/FireRescueAI/消防救援前端原型/app"
cat "$PROTO/package.json"
```

- [ ] **Step 2: 合并 dependencies 到 web package.json**

在 web `package.json` 的 `dependencies` 加入(web 已有的跳过,版本冲突时保留 web 版本):

```
@hookform/resolvers, @radix-ui/react-*(accordion/alert-dialog/aspect-ratio/avatar/checkbox/collapsible/context-menu/dialog/dropdown-menu/hover-card/label/menubar/navigation-menu/popover/progress/radio-group/scroll-area/select/separator/slider/slot/switch/tabs/toggle/toggle-group/tooltip), class-variance-authority, clsx, cmdk, date-fns, embla-carousel-react, framer-motion, input-otp, lucide-react, next-themes, react-day-picker, react-hook-form, react-resizable-panels, recharts, sonner, tailwind-merge, vaul, zod
```

> 注意:`next` 保留 web 的 `^16.2.9`(**不**用原型 `^15.5.0`);`react`/`react-dom` 保留 `^19.2.7`(两边一致)。

- [ ] **Step 3: 合并 devDependencies**

加入:

```
autoprefixer, tailwindcss(^3.4.19), tailwindcss-animate, tw-animate-css
```

> `typescript` 保留 web `^6.0.3`(**不**用原型 `~5.9.3`);`@types/*` 保留 web 版本。eslint 相关暂不合(web 有自己的 lint 习惯,原型 eslint.config.js 不搬)。

- [ ] **Step 4: 安装**

```bash
cd /home/ljb/program/FireRescueAI/web
npm install
```

预期:install 成功(可能有 peer dependency 警告,记录但不阻塞;若出现 ERESOLVE 冲突,优先保 Next 16 / React 19,降级冲突的次要包)。

- [ ] **Step 5: 冒烟验证**

```bash
npm run typecheck
```

预期:**通过**(此时原型代码还没搬,web 现有代码不受影响)。

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: 合并原型依赖(radix/shadcn/framer/tailwind 等)为迁壳做准备"
```

---

## Task 2: 基础设施 — Tailwind/shadcn 配置 + globals.css + layout

**Files:**
- Create: `tailwind.config.js`(原型版)
- Create: `postcss.config.js`(原型版 ESM)
- Create: `components.json`(shadcn 配置)
- Modify: `app/globals.css` → 原型版
- Create: `app/legacy.css`(web 旧 globals.css 备份)
- Modify: `app/layout.tsx` → 原型版

**Interfaces:**
- Consumes: Task 1 装好的 tailwindcss/postcss/autoprefixer
- Produces: Tailwind 编译链就绪、深色大屏主题生效

- [ ] **Step 1: 拷贝配置文件到 web 顶层**

```bash
cd /home/ljb/program/FireRescueAI/web
PROTO="/home/ljb/program/FireRescueAI/消防救援前端原型/app"
cp "$PROTO/tailwind.config.js" .
cp "$PROTO/postcss.config.js" .
cp "$PROTO/components.json" .
```

- [ ] **Step 2: 调整 components.json 的 css 路径**

原型 `components.json` 里 `"css": "src/index.css"`(vite 残留路径)。改成 web 的全局样式路径:

```jsonc
// components.json
"tailwind": {
  "config": "postcss.config.js",   // 已是(或改 tailwind.config.js,见下)
  "css": "app/globals.css",        // ← 改成 web 的
  ...
}
```

> 校对 `config` 字段:shadcn 约定指向 tailwind 配置。原型写的是 `postcss.config.js`——保持原型原样即可(shadcn 能识别),只改 `css` 路径。

- [ ] **Step 3: 备份 web 旧 globals.css → legacy.css**

```bash
cp app/globals.css app/legacy.css
```

- [ ] **Step 4: 用原型 globals.css 替换**

```bash
PROTO="/home/ljb/program/FireRescueAI/消防救援前端原型/app"
cp "$PROTO/app/globals.css" app/globals.css
```

- [ ] **Step 5: 改 layout.tsx 为原型版**

把 `app/layout.tsx` 改为(原型版 + 摘出 web 旧引入):

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '灭火救援预案智能辅助平台',
  description: '灭火救援预案智能辅助平台',
  icons: [{ rel: 'icon', type: 'image/svg+xml', url: '/logo-flame.svg' }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Rajdhani:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        {children}
      </body>
    </html>
  );
}
```

> 摘出项(文件保留,不挂载):`<UStudioVideoDialog/>`、`@dt-uagent/multi-agent-sdk/style.css`——增量阶段接回真实 3D/智能体时再挂。

- [ ] **Step 6: 验证 typecheck**

```bash
npm run typecheck
```

预期:**通过**(layout/globals 不引入类型;此时原型 src 未搬,page 还是 web 旧版但 layout 不依赖它)。

> 若报 `Cannot find module './globals.css'` 之类,确认文件存在;CSS 不参与 typecheck,不应报错。

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.js postcss.config.js components.json app/globals.css app/legacy.css app/layout.tsx
git commit -m "build: 引入 Tailwind/shadcn 配置 + 深色大屏 globals.css/layout"
```

---

## Task 3: 搬运 src/ + public/ + tsconfig 双映射

**Files:**
- Create: `src/`(原型 src/ 整体)
- Modify: `public/`(合入原型 svg)
- Modify: `tsconfig.json`(paths 双映射)

**Interfaces:**
- Consumes: Task 1 依赖、Task 2 Tailwind 链
- Produces: web `src/` 含原型全部代码;`@/` 双映射生效

- [ ] **Step 1: 拷贝原型 src/ → web src/**

```bash
cd /home/ljb/program/FireRescueAI/web
PROTO="/home/ljb/program/FireRescueAI/消防救援前端原型/app"
cp -r "$PROTO/src" .
```

预期:web 下出现 `src/`(App.tsx / components / views / mock / hooks / lib)。

- [ ] **Step 2: 合并原型 public/ svg**

```bash
cp "$PROTO/public/"*.svg public/
```

预期:`public/` 下新增 `logo-flame.svg` `building-wireframe.svg` `cube-wireframe.svg` `empty-box.svg` `error-radar.svg`(与现有 `draco/` 共存)。

- [ ] **Step 3: 改 tsconfig.json paths 为双映射**

把 `tsconfig.json` 的:

```jsonc
"paths": {
  "@/*": ["./*"]
}
```

改为:

```jsonc
"paths": {
  "@/*": ["./src/*", "./*"]
}
```

> 原型 `@/components/ui/button` → `./src/components/ui/button`(命中);web `@/components/SoonspaceSceneViewer` → 回退 `./components/SoonspaceSceneViewer`(命中)。**web 63 处 `@/` 零改动**。

- [ ] **Step 4: 冒烟 typecheck(预期会报错,正常)**

```bash
npm run typecheck 2>&1 | head -60
```

预期:**可能报错**——原型代码 TS 5.9→6、Next 15→16 适配点,以及 web 旧 `app/page.tsx` 此时还在但 layout 改了。**此时不要求绿**,错误留给 Task 5 集中修。**记录错误数量与类型**。

- [ ] **Step 5: Commit**

```bash
git add src/ public/ tsconfig.json
git commit -m "feat: 搬入原型 src/(101 文件) + public svg + tsconfig @/ 双映射"
```

---

## Task 4: 接管 page.tsx

**Files:**
- Modify: `app/page.tsx` → 原型版

**Interfaces:**
- Consumes: Task 3 的 `src/App.tsx`
- Produces: 首页渲染原型 `<App/>`,web 旧 3D 组合下线(组件文件保留)

- [ ] **Step 1: 用原型 page.tsx 覆盖**

```bash
cd /home/ljb/program/FireRescueAI/web
PROTO="/home/ljb/program/FireRescueAI/消防救援前端原型/app"
cp "$PROTO/app/page.tsx" app/page.tsx
```

确认 `app/page.tsx` 内容为:

```tsx
'use client';

import App from '@/App';

export default function Page() {
  return <App />;
}
```

> web 旧 `app/page.tsx`(SoonspaceSceneViewer + MultiAgentWidget + FireSafetyPanel + PlanPanel + SceneCommandBridge 组合)被覆盖——其内容在 git 历史(`9baca98` 之前)中,真实 3D 组件文件全部保留在 `components/`,增量阶段重新组合进原型占位区。

- [ ] **Step 2: Commit**

```bash
git add app/page.tsx
git commit -m "feat: page.tsx 接管原型 <App/>,web 旧 3D 组合暂下线(组件保留)"
```

> 不跑 typecheck——Task 5 集中修编译。

---

## Task 5: 适配修编译 — typecheck + build 绿

**Files:**
- Modify: `src/**` 与 `app/**` 中 TS/TSX 的兼容点(按实际错误修,最小改动)

**Interfaces:**
- Consumes: Task 1-4 的全部产物
- Produces: `npm run typecheck` + `npm run build` 双绿

> 这是迭代式 task:跑 typecheck → 读错误 → 分类 → 最小修 → 重复,直到绿。预期错误类型见下。

- [ ] **Step 1: 跑 typecheck,导出全部错误**

```bash
cd /home/ljb/program/FireRescueAI/web
npm run typecheck 2>&1 | tee /tmp/migration-typecheck.log
```

- [ ] **Step 2: 分类错误并最小化修复**

按类型处理(每类改完重跑一次 typecheck 确认收敛):

| 错误类型 | 处理策略 |
|---|---|
| `Cannot find module '@/...'` 或第三方包 | 确认 Task 1 依赖装全;`@/` 路径用双映射回退排查 |
| TS 6 更严的类型推断错误(隐式 any/未知) | 补类型注解,不降 TS 严格性 |
| Next 16 API 变化(若 `<img>` / cookie / params 等) | 按 Next 16 迁移指南改(params 现在 Promise、`<img>`→`next/image` 或 eslint 注解) |
| 原型 `'use client'` 边界问题 | App.tsx 及交互组件保持 `'use client'`;page.tsx 已是 |
| `react-day-picker` / `recharts` 等类型不匹配 | 多半是 @types 版本,按需补 `@types/react@19` 对齐 |

> 原则:**最小改动,不改原型业务逻辑**。只修兼容性,不重构。若某错误确属原型 bug 则修,否则只做类型/导入层面适配。

- [ ] **Step 3: typecheck 绿后跑 build**

```bash
npm run typecheck   # 必须先绿
npm run build 2>&1 | tee /tmp/migration-build.log
```

> 注意:`build` 不带 `NEXT_OUTPUT_STANDALONE=1`(那是 Docker 构建时才设),普通 `next build`。

- [ ] **Step 4: 修 build 错误(若有)**

build 可能暴露 typecheck 没抓到的问题(SSR 边界、`window`/`document` 在服务端引用、字体加载等)。逐个修。

> 原型组件大量用 `window`(场景命令日志、addEventListener)——Next 16 build 时若服务端渲染报错,确认这些组件有 `'use client'`(原型已是)。

- [ ] **Step 5: 双绿确认**

```bash
npm run typecheck && echo "TYPECHECK OK"
npm run build && echo "BUILD OK"
```

预期:两条都通过。

- [ ] **Step 6: Commit(可拆多个 if 改动多)**

```bash
git add -A
git commit -m "fix: 原型代码适配 Next 16 / TS 6(typecheck + build 双绿)"
```

---

## Task 6: 验证 — dev 走查 + test 不回归 + BFF 探活

**Files:** 无改动(纯验证)

**Interfaces:**
- Produces: 迁壳完成的全部硬指标证据

- [ ] **Step 1: vitest 不回归**

```bash
cd /home/ljb/program/FireRescueAI/web
npm run test
```

预期:**全绿**(web 现有 `lib/__tests__` 不受原型搬迁影响——双映射让 `@/lib/*` 仍解析到根 `lib/`)。

- [ ] **Step 2: dev 起服务**

```bash
npm run dev
# 等待 Ready,后台跑;或用 timeout 限時
```

> 用 `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` 探活,预期 200。

- [ ] **Step 3: dev 走查清单(人工/截图)**

- [ ] 深色指挥大屏主页正常渲染(背景 `#070e18`、字体 Noto Sans SC)
- [ ] 左侧模块导航 5 项可切换:态势总览 / 对象总览 / 演练对抗 / 熟悉考核 / 实战指挥
- [ ] 态势总览:GIS 占位底图 + 队站打点 + 信息卡
- [ ] 对象总览:建筑档案面板五分组(概况/供水/关键部位/消防设施/联系人)
- [ ] 演练对抗:情景参数 → 预案流式输出
- [ ] 智能体悬浮窗(右下圆形入口)可打开、多身份切换
- [ ] 顶部「演示数据」标注在
- [ ] 占位 3D 区(`ScenePlaceholder`)正常(接受过渡态)

- [ ] **Step 4: BFF 不受影响探活**

```bash
# scene-events(应 401 无 appKey 或 SSE 挂起)
curl -s -o /dev/null -w 'scene-events:%{http_code}\n' --max-time 3 http://localhost:3000/api/scene-events
# ustudio overview(应 200 或 5xx 取决于 env,关键是不 404 路由还在)
curl -s -o /dev/null -w 'overview:%{http_code}\n' --max-time 5 http://localhost:3000/api/ustudio/overview
```

预期:路由存在(非 404)。功能码取决于 env 配置,重点确认 **BFF 路由未被搬迁破坏**。

- [ ] **Step 5: 关 dev,收尾**

```bash
# 停掉 dev server
```

- [ ] **Step 6: 迁壳完成报告**

确认全部硬指标:
- [ ] `typecheck` 绿
- [ ] `build` 绿
- [ ] `test` 绿(web 现有 lib 不回归)
- [ ] `dev` 起来,5 模块 + 面板 + 智能体不回归
- [ ] mock 数据 + 「演示数据」标注在
- [ ] BFF `/api/*` 路由健在

此时迁壳阶段完成。**不主动 push**——向用户报告完成,由用户决定 push(触发 CI 部署)时机。后续进入增量阶段(接真实 3D / 后端 / 智能体)。

---

## Self-Review(plan 自检)

- **Spec 覆盖**:spec 的 6 阶段拆分 → 本计划 Task 1-6 一一对应;关键技术决策表每项都有 task 落地(路径别名→Task 3、技术栈→Task 1/5、目录→Task 3、样式→Task 2、layout/page→Task 2/4、Tailwind→Task 1/2、Next 配置不动→Global Constraints、依赖→Task 1)。✓
- **Placeholder 扫描**:无 TBD/TODO;Task 5 的修编译是迭代式(无法预列具体错误),但给出了错误分类表 + 处理策略,非占位。✓
- **类型一致性**:`@/` 双映射语义在 Task 3 定义、Task 6 验证一致;`src/App.tsx` 在 Task 3 搬入、Task 4 page 引用,路径一致。✓
- **风险对齐**:spec 风险 4 项(Next16/TS6 适配→Task 5、双映射→Task 3+6 验证、依赖版本→Task 1 Step 2 注明保 Next16、Tailwind 引入→Task 2)。✓
