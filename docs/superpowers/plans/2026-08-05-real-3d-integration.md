# 增量第一步实施计划:接真实 3D + 双通道恢复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task(inline,带 checkpoint)。Steps use checkbox (`- [ ]`)。

**Goal:** 原型 `objects`/`drill` 场景区的占位 `ScenePlaceholder` → 真实 Soonspace 3D(抽核心 `RealSceneView`),恢复双通道场景命令联动。

**Architecture:** `sceneLog` 升级为前端动作总线;新建 `RealSceneView` 订阅它、经 `scene-action-executor` 映射到 `SoonspaceRuntime` 真实 SDK;`SceneCommandBridge` 挂自研 `/scene-events` 通道;平台通道随 SDK init 自动恢复;`commandBridge` 先 stub。

**Tech Stack:** Next 16 / React 19 / TypeScript 6 / `ustudio-sdk`(内置 WS)/ `soonspacejs` / Tailwind v4 / vitest

## Global Constraints

- **纯加法为主**:新建 `RealSceneView` + `scene-action-executor`;改 `lib/soonspace-runtime.ts`(commandBridge stub)、`src/App.tsx`(接入)。**不删** `ScenePlaceholder`/`generated-panel-runtime`(留后)
- **复用不复制**:`SoonspaceRuntime` 类直接 `new`;bootstrap 走 `/api/ustudio/bootstrap`;Draco 走 `/draco/`。不抄 SoonspaceSceneViewer 的旧 UI 逻辑
- **sceneId 来源**:`process.env.NEXT_PUBLIC_SCENE_ID` 优先 → URL `?sceneId=` fallback → 都无则显示「未配置场景」提示(**不进门厅**)。运行时真实 id 由 runtime 写入 `window.__sceneId`(供 `useSceneId`/scene-command-bus)
- **TDD 范围**:`scene-action-executor` 映射逻辑(纯函数,vitest);组件集成靠 dev 走查
- **动作范围**:本步只执行 `flyTo`/`highlight`/`batchHighlight`/`switchFloor`/`resetView`;`showRoute`/`drawZone`/`addMarker`/`updatePlan` 忽略(记日志,留架构第 4 步)
- **target 形式**:只执行 target 为**疑似 id** 的动作(非空、非纯中文建筑名);名字 target 记日志跳过(待建筑档案 id 对齐)
- **master 直接做,每 task 独立 commit,不 push**(做完一起)
- **简体中文 UI** 保留;命令:`cd /home/ljb/program/FireRescueAI/web && source ~/.nvm/nvm.sh`

## File Structure

```
web/
├── src/
│   ├── components/
│   │   └── RealSceneView.tsx        ← 新建:抽核心真实 3D(bootstrap+runtime+executor+浮层)
│   ├── lib/
│   │   ├── scene-action-executor.ts ← 新建:sceneLog action → runtime 映射(纯函数,TDD)
│   │   └── scene-action-executor.test.ts ← 新建:vitest
│   ├── mock/sceneLog.ts             ← 不动(动作总线 + 日志)
│   └── App.tsx                      ← 改:objects/drill 用 RealSceneView + 挂 SceneCommandBridge
├── lib/
│   └── soonspace-runtime.ts         ← 改:commandBridge stub(panelList/panelSetVisible/showVideo)
└── components/SceneCommandBridge.tsx ← 不动(直接挂)
```

---

## Task 1: commandBridge stub

**Files:**
- Modify: `lib/soonspace-runtime.ts`(init 的 commandBridge 改 stub)

**背景**:迁壳后 `panelList/panelSetVisible`(generated-panel-runtime,旧 UI)和 `showVideo`(UStudioVideoDialog,已摘出)指向的旧 UI 不在了。先 stub,避免平台推送这些命令时调到失效函数。

- [ ] **Step 1: 找到 commandBridge 注入点**

Run: `grep -n "commandBridge" lib/soonspace-runtime.ts`
预期:`125: commandBridge: { panelList, panelSetVisible, showVideo }`(在 `sdk.init({...})` 内)

- [ ] **Step 2: 改为 stub + TODO**

把第 125 行改为:

```ts
      // TODO(增量后续):重接到原型 UI——panelList/panelSetVisible → 原型 DraggablePanel 系统,
      // showVideo → 原型 VideoPlaybackPanel。迁壳后旧 UI(generated-panel-runtime / UStudioVideoDialog)
      // 已不挂载,先 stub 避免平台推送这些命令时调失效函数。
      commandBridge: {
        panelList: () => [],
        panelSetVisible: async () => ({}) as never,
        showVideo: () => {},
      },
```

> `panelList/panelSetVisible/showVideo` 的 import(第 14 行 `generated-panel-runtime`、第 72 行 `showVideo = showUStudioVideo`)**保留**(后续重接要用)。仅 init 处用 stub。若 typecheck 报"未使用 import",用 `// eslint-disable-next-line` 或保留一个引用(见 Step 3)。

- [ ] **Step 3: 处理未使用 import(若 typecheck 报)**

若 TS 报 `panelList`/`panelSetVisible`/`showVideo` 未使用,在文件内加一个保留引用(避免删 import):

```ts
// 保留引用,供后续 commandBridge 重接(见 sdk.init commandBridge stub)
void panelList; void panelSetVisible; void showVideo;
```

- [ ] **Step 4: typecheck 验证**

Run: `npx tsc --noEmit`(后台,等通知)
预期:绿。

- [ ] **Step 5: Commit**

```bash
git add lib/soonspace-runtime.ts
git commit -m "fix(runtime): commandBridge 改 stub(迁壳后旧 UI 已下线,平台 panel/video 命令先空实现)"
```

---

## Task 2: scene-action-executor(TDD)

**Files:**
- Create: `src/lib/scene-action-executor.ts`
- Test: `src/lib/scene-action-executor.test.ts`

**Interfaces:**
- Consumes: `SceneAction`(`src/mock/sceneLog.ts`)、`SoonspaceRuntime` 公开方法
- Produces: `mapSceneAction(action, runtime)` 纯函数 + `subscribeSceneActions(runtime)` 订阅器

**背景**:把 `sceneLog` action 映射到 `SoonspaceRuntime` SDK 调用,纯函数可测。RealSceneView 用它订阅执行。

- [ ] **Step 1: 写失败测试**

`src/lib/scene-action-executor.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mapSceneAction } from './scene-action-executor';
import type { SceneAction } from '@/mock/sceneLog';

function makeRuntime() {
  return {
    flyToObject: vi.fn(),
    highlightObject: vi.fn(),
    clearObjectHighlight: vi.fn(),
    setViewMode: vi.fn(),
    resetCamera: vi.fn(),
  };
}

describe('mapSceneAction', () => {
  it('flyTo + id target → runtime.flyToObject(id)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '460054423520694453', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(true);
    expect(r.flyToObject).toHaveBeenCalledWith('460054423520694453');
  });

  it('flyTo + 中文建筑名 target → 不执行(记日志,待 id 对齐)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '金茂大厦', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/id/i);
    expect(r.flyToObject).not.toHaveBeenCalled();
  });

  it('highlight → runtime.highlightObject(id, color)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'highlight', target: 'obj-123', source: '面板' };
    mapSceneAction(a, r);
    expect(r.highlightObject).toHaveBeenCalledWith('obj-123', expect.anything());
  });

  it('switchFloor → runtime.setViewMode(按 params.storyIds)', () => {
    const r = makeRuntime();
    const a: SceneAction = {
      ts: '00:00:00', action: 'switchFloor', target: '5F', source: '面板',
      params: { storyIds: ['story-5'] },
    };
    mapSceneAction(a, r);
    expect(r.setViewMode).toHaveBeenCalled();
  });

  it('resetView → runtime.resetCamera()', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'resetView', target: '', source: '面板' };
    mapSceneAction(a, r);
    expect(r.resetCamera).toHaveBeenCalled();
  });

  it('showRoute/drawZone/addMarker/updatePlan → 忽略(留架构第4步)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'showRoute', target: 'r1', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/忽略|未实现/);
  });

  it('空 target → 不执行', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '', source: '面板' };
    expect(mapSceneAction(a, r).executed).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/scene-action-executor.test.ts`
预期:FAIL(`mapSceneAction` 未定义)。

- [ ] **Step 3: 实现最小版**

`src/lib/scene-action-executor.ts`:

```typescript
import type { SceneAction } from '@/mock/sceneLog';

/** id 判定:非空、非纯中文(粗略区分场景对象 id 与建筑名)。待建筑档案 id 对齐后可收紧。 */
function looksLikeId(target: string): boolean {
  if (!target) return false;
  return !/[一-龥]/.test(target);
}

const HIGHLIGHT_COLOR = '#f87171';
const IGNORED = new Set(['showRoute', 'hideRoute', 'drawZone', 'drawRoute', 'clearTactical', 'addMarker', 'removeMarker', 'updatePlan']);

export type SceneExecutorRuntime = {
  flyToObject: (id: string) => unknown;
  highlightObject: (id: string, color?: string) => unknown;
  clearObjectHighlight: (id: string) => unknown;
  setViewMode: (...args: unknown[]) => unknown;
  resetCamera: () => unknown;
};

export type MapResult = { executed: boolean; reason?: string };

export function mapSceneAction(action: SceneAction, runtime: SceneExecutorRuntime): MapResult {
  const { action: name, target, params } = action;
  if (IGNORED.has(name)) return { executed: false, reason: `忽略:${name} 留架构第4步` };
  switch (name) {
    case 'flyTo':
    case 'highlight':
    case 'batchHighlight': {
      if (!looksLikeId(target)) return { executed: false, reason: 'target 非 id(待建筑档案 id 对齐)' };
      if (name === 'flyTo') {
        runtime.flyToObject(target);
      } else {
        runtime.highlightObject(target, HIGHLIGHT_COLOR);
      }
      return { executed: true };
    }
    case 'switchFloor': {
      const storyIds = Array.isArray((params as { storyIds?: unknown })?.storyIds)
        ? (params as { storyIds: string[] }).storyIds
        : [];
      runtime.setViewMode({ mode: 'story' }, undefined, storyIds);
      return { executed: true };
    }
    case 'resetView': {
      runtime.resetCamera();
      return { executed: true };
    }
    default:
      return { executed: false, reason: `未知 action:${name}` };
  }
}

/** 订阅 sceneLog,每条 action 映射执行;返回退订函数。 */
export function subscribeSceneActions(runtime: SceneExecutorRuntime): () => void {
  // 延迟导入避免循环
  return require('@/mock/sceneLog').subscribeSceneLog((_list, latest) => {
    if (!latest) return;
    const res = mapSceneAction(latest, runtime);
    if (!res.executed && res.reason) console.warn('[real-scene] action skipped', latest.action, res.reason);
  });
}
```

> `require` 在 ESM 不可用——改用动态 import 或顶层 import。实现时用顶层 `import { subscribeSceneLog } from '@/mock/sceneLog'`(无循环风险,sceneLog 不导本文件)。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/scene-action-executor.test.ts`
预期:PASS(7 tests)。

- [ ] **Step 5: Commit**

```bash
git add src/lib/scene-action-executor.ts src/lib/scene-action-executor.test.ts
git commit -m "feat(scene): scene-action-executor(sceneLog action → runtime 映射,TDD)"
```

---

## Task 3: RealSceneView 组件(抽核心)

**Files:**
- Create: `src/components/RealSceneView.tsx`

**Interfaces:**
- Consumes: `SoonspaceRuntime`、`/api/ustudio/bootstrap`、`scene-action-executor`、`SceneInfoCard`/`SceneLogPanel`(`SceneOverlays`)、`SCENE_ID`
- Produces: 真实 3D 场景区组件(runtime init → `window.__sceneId` → `ustudio:scene` 事件)

- [ ] **Step 1: 新建 RealSceneView.tsx 骨架**

`src/components/RealSceneView.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { SoonspaceRuntime } from '@/lib/soonspace-runtime';
import { subscribeSceneActions } from '@/lib/scene-action-executor';
import { SceneInfoCard, SceneLogPanel } from '@/components/SceneOverlays';
import DemoTag from '@/components/DemoTag';

type View = 'loading' | 'ready' | 'error' | 'no-scene';

function resolveSceneId(): string | null {
  if (typeof window === 'undefined') return null;
  const fromEnv = process.env.NEXT_PUBLIC_SCENE_ID?.trim();
  if (fromEnv) return fromEnv;
  return new URLSearchParams(window.location.search).get('sceneId')?.trim() || null;
}

export function RealSceneView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SoonspaceRuntime | null>(null);
  const [view, setView] = useState<View>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsub: (() => void) | undefined;
    const sceneId = resolveSceneId();
    if (!sceneId) { setView('no-scene'); return; }

    (async () => {
      try {
        const res = await fetch(`/api/ustudio/bootstrap?sceneId=${encodeURIComponent(sceneId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('bootstrap 失败:' + res.status);
        const data = await res.json();
        if (disposed) return;
        if (data?.empty) { setError(data.message || '场景不存在'); setView('error'); return; }

        const runtime = new SoonspaceRuntime();
        runtimeRef.current = runtime;
        await runtime.init(containerRef.current!, sceneId, (p) => {
          if (!disposed && p.stage === 'ready') setView('ready');
        });
        if (disposed) { await runtime.dispose(); return; }

        const sdk = runtime.getSdk();
        if (sdk) {
          unsub = subscribeSceneActions({
            flyToObject: (id) => runtime.flyToObject(id),
            highlightObject: (id, c) => runtime.highlightObject(id, c),
            clearObjectHighlight: (id) => runtime.clearObjectHighlight(id),
            setViewMode: (...args) => sdk.setViewMode(...(args as [unknown, unknown, string[]])),
            resetCamera: () => {/* TODO: runtime.resetCamera 或 setCameraViewpoint 默认 */},
          });
        }
      } catch (e) {
        if (!disposed) { setError(e instanceof Error ? e.message : '场景加载失败'); setView('error'); }
      }
    })();

    return () => {
      disposed = true;
      unsub?.();
      void runtimeRef.current?.dispose();
      runtimeRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-bg-grid">
      <div ref={containerRef} className="absolute inset-0" />
      {view === 'loading' && (
        <div className="absolute inset-0 grid place-items-center text-text-2 text-sm">场景加载中…</div>
      )}
      {view === 'no-scene' && (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="rounded-xl border border-dashed border-line-glow bg-bg-panel/40 px-8 py-6">
            <div className="text-text-1 font-bold mb-1">未配置场景</div>
            <div className="text-text-2 text-sm">设 NEXT_PUBLIC_SCENE_ID 或 URL ?sceneId=</div>
            <DemoTag className="mt-3" />
          </div>
        </div>
      )}
      {view === 'error' && (
        <div className="absolute inset-0 grid place-items-center text-center text-red text-sm">{error}</div>
      )}
      <SceneInfoCard />
      <SceneLogPanel />
    </div>
  );
}

export default RealSceneView;
```

- [ ] **Step 2: 确认 runtime 方法签名**

Run:
```bash
grep -nE "flyToObject|resetCamera|setCameraViewpoint|highlightObject|clearObjectHighlight" lib/soonspace-runtime.ts
```
- 若 `flyToObject` 存在 → 直接用
- 若无 `resetCamera` → `resetCamera` 用 `setCameraViewpoint(默认视角)` 或先空(TODO)
- 实现时按实际签名调整 Step 1 的 `subscribeSceneActions` 适配

- [ ] **Step 3: typecheck 验证**

Run: `npx tsc --noEmit`
预期:绿。若 `runtime.flyToObject`/`sdk.setViewMode` 签名不匹配,按 Step 2 结果修正。

- [ ] **Step 4: Commit**

```bash
git add src/components/RealSceneView.tsx
git commit -m "feat(scene): RealSceneView(抽 SoonspaceSceneViewer 核心,订阅 sceneLog 执行真实 SDK)"
```

---

## Task 4: App.tsx 接入 + 挂 SceneCommandBridge

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 改场景区 + 挂 SceneCommandBridge**

在 `src/App.tsx`:

① 顶部加 import:
```tsx
import RealSceneView from '@/components/RealSceneView';
import { SceneCommandBridge } from '@/components/SceneCommandBridge';
```

② 场景区(原 153-157 行附近):
```tsx
{module === 'overview' ? (
  <GisMapPlaceholder />
) : module === 'training' ? null : module === 'command' ? null : (
  <RealSceneView />
)}
```
> `training`/`command` 仍走 `TrainingView`/`CommandView`(它们在前面的三元,这里只替换 `objects`/`drill` 原先落到的 `ScenePlaceholder`)。实际改动:把原来 `: <ScenePlaceholder />` 改成 `: <RealSceneView />`。`ScenePlaceholder` import 可保留(不报错)或删。

③ 在 `<main>` 内(或 layout)挂一次 `<SceneCommandBridge />`(全局):
```tsx
<SceneCommandBridge />
<AgentChat ... />
```

- [ ] **Step 2: typecheck 验证**

Run: `npx tsc --noEmit`
预期:绿。

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): objects/drill 场景区换 RealSceneView + 挂 SceneCommandBridge"
```

---

## Task 5: 验证(typecheck + build + test + dev 走查)

**Files:** 无改动(纯验证)

- [ ] **Step 1: typecheck + build + vitest 全绿**

```bash
npx tsc --noEmit && echo "TC OK"
npm run build && echo "BUILD OK"
npx vitest run && echo "TEST OK"
```
预期:三条全绿(vitest 含 Task 2 新测试 + 迁壳前 82 测试)。

- [ ] **Step 2: dev 起来,走查**

```bash
npm run dev   # 后台/交互
```
- [ ] `objects` 模块:中央区显示**真实 3D 场景**(非占位雷达/立方体)
- [ ] `drill` 模块:同上真实 3D
- [ ] `overview` 模块:仍 `GisMapPlaceholder`(不变)
- [ ] 切 `objects`↔`drill`:runtime 不泄漏(无报错/卡顿)
- [ ] `SceneLogPanel` 动作流水显示
- [ ] 智能体 flyTo(若 target 是 id):镜头真实移动
- [ ] 点建筑档案设施(target 是中文):**记日志跳过**(console.warn,target 非 id)——预期过渡态

- [ ] **Step 3: commandBridge stub 不报错验证**

dev 控制台无 `panelList is not a function` 之类。若平台推送 panel 命令(若有 agent 连),stub 兜底。

- [ ] **Step 4: SCENE_ID 检查**

- 若本地 `.env.local` 配了 `NEXT_PUBLIC_SCENE_ID`(或 URL `?sceneId=`)→ 真实场景加载
- 若无 → `objects`/`drill` 显示「未配置场景」提示(让用户补 env 或 URL)

- [ ] **Step 5: 收尾 + 报告**

停 dev。硬指标:typecheck/build/test 绿 + dev 真实 3D 可见 + 联动初通。**不 push**(等用户决定)。向用户报告完成 + 下一步(架构第 2 步:Python 业务后端骨架)。

---

## Self-Review

- **Spec 覆盖**:spec 决策表 5 项 → Task 1(commandBridge stub ②)、Task 2+3(RealSceneView 抽核心 Q3 + 动作映射 ③ + sceneLog 总线)、Task 4(挂 SceneCommandBridge + 接入 Q2)、Task 1(平台通道随 SDK 自动 ✓ 无需单独 task)。✓
- **Placeholder 扫描**:Task 3 Step 2 的 `resetCamera` 标 TODO(签名待查,给了 fallback 方案),非占位;其余代码完整。✓
- **类型一致**:`SceneAction`/`SoonspaceRuntime` 方法名在 Task 2/3 一致;`SceneCommandBridge` 直接 import 用。✓
- **TDD**:Task 2 先测后实现(7 tests 覆盖映射);组件靠 dev 走查(spec 已认可)。✓
- **风险对齐**:spec 风险 4 项(SCENE_ID 缺失→Task 5 Step 4;target 名字/id→Task 2 测覆盖 + Task 3 过渡;legacy.css 不用→Task 3 自写 Tailwind;切换 dispose→Task 3 cleanup + manageSceneBridge)。✓
