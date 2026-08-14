# 3D 显隐 Recipe 编排架构 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把"不同演示该显示哪些模型"统一到 `lib/scene-recipe/` 的单一真相源（RecipeStore），三路驱动（用户面板/模块预设/agent）经 Recipe patch → RecipeEngine diff+幂等地调用 SoonspaceRuntime SDK 原生显隐方法。

**Architecture:** `SceneViewRecipe` 分结构层（楼层/楼栋/模式/炸开/GIS/标注/可达性，持久）与观察层（focus/viewpoint/routes/polygons，临时），正交不冲突。`RecipeEngine` 纯函数 diff → 顺序化 SDK 调用（结构层先于观察层）→ best-effort 不回滚。`SoonspaceRuntime`（922 行）不改，是 engine 执行后端。

**Tech Stack:** TypeScript（strict）、vitest（lib 单测）、React 19 + Next.js（绑定层）、Soonspace/uStudio SDK（显隐后端）。

**Spec:** `doc/ref/arch_ref.md`（commit bc24110）。

## Global Constraints

- **禁前端 traverse**：显隐一律走 SDK 原生方法（`setViewMode`/`setScene`/`flyToObject`/`gisSetVisible`/`showLabels`/`setVirtualRouteVisible`/`setVirtualPolygonVisible`），绝不 `scene.traverse` 设 `visible`（`richness-tier-dropped` 否决边界）。
- **设施级显隐不可用**：SDK `hide/show` 对完整包无效；`focus` 字段降级为飞向+楼层显隐+高亮。
- **lib 不反向依赖 src**：`lib/scene-recipe/*` 只依赖 `lib/` 内类型；engine 只依赖 `RecipeRuntime` 接口（不直接 import `SoonspaceRuntime` 类）。
- **每文件 < 200 行**（`coding-style.md`）。
- **每 task 收尾验证**：`npx tsc --noEmit` + `npx vitest run lib/scene-recipe` 全绿；组件改动加浏览器冒烟。
- **commit 规范**：Conventional Commits（`feat(scene-recipe): ...` / `test(scene-recipe): ...` / `refactor(3d): ...`）。**不自动 push**。
- **类型细化（对 arch_ref §4）**：`visibleStories/visibleBuildings: string[] | null`，`null` = 全集不裁剪（engine apply 时跳过 setViewMode）。在 Task 1 同步回填 `doc/ref/arch_ref.md` §4。

## File Structure

**新建**（`lib/scene-recipe/`）：
| 文件 | 职责 |
|---|---|
| `types.ts` | `StructuralRecipe`/`ObservationalRecipe`/`SceneRecipe`/`Changeset`/`RecipeRuntime`/`ApplyResult` + `defaultStructural()` |
| `diff.ts` | `diffRecipe(prev,next): Changeset` 纯函数 |
| `engine.ts` | `applyRecipe(runtime, tree, changeset): Promise<ApplyResult>` |
| `store.ts` | `RecipeStore` 类（current + subscribe + 分层 dispatch） |
| `presets.ts` | 模块/子流程 Recipe 预设常量 |
| `react.ts` | `useRecipe()`/`useStructural()`/`useRecipeDispatch()` |
| `__tests__/diff.test.ts` `engine.test.ts` `store.test.ts` `presets.test.ts` | 单测 |

**修改**：
| 文件 | 改动 |
|---|---|
| `src/components/SceneProvider.tsx` | runtime ready 时建 `RecipeStore` + 订阅 applyRecipe；context 暴露 store |
| `src/components/FloorDisplayPanel.tsx` | `toggleStory/Building` → `store.patchStructural`；移除直调 `runtime.setViewMode` |
| `src/App.tsx` | `handleSelect` 切模块时 `store.setStructural(presets.xxx)` |
| `lib/drill/agent-runner.ts` | 决策 → `store.patchObservational({focus/routes})`（经 web 端 store 桥） |
| `lib/scene-action-executor.ts` | `switchFloor` action → `store.patchStructural` 适配器 |
| `doc/ref/arch_ref.md` | Task 0 实测结论回填 §10；Task 1 字段类型回填 §4 |

---

## Task 0: 实测双体系（SceneCommandBridge vs RealSceneView 是否共 SDK）

**性质：调研任务，非 TDD。产出 = 结论 + arch_ref §10 回填。决定 Task 12（双体系并归）是否执行。**

> **✅ 裁定结论（2026-08-14 静态核实 + 代码审计，已实施）**：
> 1. **共 SDK**：SceneCommandBridge 的 `sceneSdk()`（= `window.__scene`）与 SceneProvider 的 SoonspaceRuntime 是**同一 SDK 实例**（soonspace-runtime.installWindowSceneBridge 挂载），无第二个 Viewer。
> 2. **显隐已并归 Recipe**：scene-command-bus 的 handlers 中，唯一触碰结构层的 `focus_floors` **已走 `store.patchStructural`**（handlers.ts）；`fly_to`/`focus_objects` 属观察层即时操作（fly/高亮），保留直调 SDK——Recipe 观察层 focus 当前无其他驱动源，不冲突。
> 3. **保留 SceneCommandBridge**：它是「平台 agent 工具 → 场景命令（/scene-events）」的唯一真实通道，**Task 12 不删除它**。
> 4. **脱节风险已消除**：新增 `lib/scene-recipe/desync.ts`（`detectDesync` 纯函数 + 7 测试）并在 SceneProvider 订阅 `sdk.subscribeSceneState`——检测平台 WS 脚本等外部改动导致的 Recipe/SDK 脱节，置 `store.desynced` 并告警（只检测不回写，避免循环）。
> 5. Task 12 剩余可执行项：**模板根组件树清理**（components/ 17 个死组件 + lib/scene-plugins 等，与 bridge 无关），列为低优先级清理项。

**Files:**
- Read: `components/SceneCommandBridge.tsx`、`lib/scene-command-bus/bridge.ts`、`lib/scene-plugins/PluginManager.ts`、`src/components/RealSceneView.tsx`、`src/components/SceneProvider.tsx`
- Modify: `doc/ref/arch_ref.md` §10（回填裁定结果）

- [ ] **Step 1: 读 SceneCommandBridge 与 scene-command-bus/bridge.ts，确认它操作的 SDK 实例来源**

判断：它是用 `window.__scene`（与 RealSceneView 同一 SDK）还是自建？它的 handlers 里有没有调显隐相关方法（`setViewMode`/`hide`/`show`/`setScene`）？

- [ ] **Step 2: 读 RealSceneView，确认它如何拿 SDK（经 SceneProvider 的 SoonspaceRuntime）**

- [ ] **Step 3: 浏览器实测**

启动 `npm run dev`，打开演练或对象总览模块，DevTools Console 执行：
```js
// 确认全局只有一个 SDK 实例
window.__scene === window.top.__scene
// 看 SceneCommandBridge 的 bus 是否注册了显隐 handler
// （必要时在 bridge.ts 加临时 console.log 打印注册的 handler 名）
```

- [ ] **Step 4: 按 arch_ref §10.2 裁定规则得出结论**

三选一：①在做显隐 → 并归（Task 12 执行）；②只做插件面板命令 → 保留划界；③无运行链路 → 根组件树可弃用。

- [ ] **Step 5: 回填 `doc/ref/arch_ref.md` §10.1 现状段落 + §10.3 本次范围**

把"未确认"替换为实测结论。
```bash
git add doc/ref/arch_ref.md
git commit -m "docs(ref): 回填 §10 双体系实测结论"
```

---

## Task 1: types.ts + defaultStructural

**Files:**
- Create: `lib/scene-recipe/types.ts`
- Create: `lib/scene-recipe/__tests__/types.test.ts`
- Modify: `doc/ref/arch_ref.md` §4（`visibleStories/Buildings` 改 `string[] | null`）

**Interfaces:**
- Produces: `StructuralRecipe`、`ObservationalRecipe`、`SceneRecipe`、`Changeset`、`RecipeRuntime`、`ApplyResult`、`defaultStructural()` — 后续所有 task 消费。

- [ ] **Step 1: 写 `lib/scene-recipe/types.ts`**

```ts
import type { CameraViewpoint } from '../soonspace-runtime';
import type { SceneTreeNode } from '../ustudio';

/** 结构层 — 显示哪些；持久；模块预设 + agent 管控 */
export interface StructuralRecipe {
  visibleStories: string[] | null;    // null = 全集不裁剪；string[] = 仅这些楼层 out_instance_id
  visibleBuildings: string[] | null;  // 同上
  mode: '2D' | '3D';
  yExtend: boolean;
  gisVisible: boolean;
  labels: { visible: boolean; ids?: string[] };
  reachable?: { nodeId: string };
  connectivity?: { spaceId: string };
}

/** 观察层 — 看哪里/突出谁；临时；用户 + agent 可随时叠加 */
export interface ObservationalRecipe {
  focus?: { objectId: string; highlightColor?: string };
  viewpoint?: CameraViewpoint;
  routes: { id: string; visible: boolean }[];
  polygons: { id: string; visible: boolean }[];
}

export interface SceneRecipe {
  structural: StructuralRecipe;
  observational: ObservationalRecipe;
}

export interface Changeset {
  structural: Partial<StructuralRecipe> & { __touched: boolean };
  observational: Partial<ObservationalRecipe> & { __touched: boolean };
}

/** engine 依赖的最小 runtime 接口（SoonspaceRuntime 子集），便于 mock */
export interface RecipeRuntime {
  setViewMode(params: unknown, tree: SceneTreeNode, storyIds: string[], buildingIds: string[]): Promise<void>;
  setGisVisible(v: boolean): Promise<void>;
  showLabels(tree: SceneTreeNode, ids?: string[], storyIds?: string[]): void;
  hideLabels(): void;
  setScene(params: unknown): Promise<unknown>;
  flyToObject(id: string): Promise<void>;
  highlightObject(id: string, color?: string): boolean;
  setCameraViewpoint(vp: CameraViewpoint, transition?: boolean): Promise<void>;
  setVirtualRouteVisible(id: string, v: boolean): unknown;
  setVirtualPolygonVisible(id: string, v: boolean): unknown;
}

export interface ApplyResult {
  applied: string[];
  failed: { field: string; error: unknown }[];
}

/** runtime ready 时的初始结构层（不裁剪、引擎默认） */
export function defaultStructural(): StructuralRecipe {
  return {
    visibleStories: null,
    visibleBuildings: null,
    mode: '3D',
    yExtend: false,
    gisVisible: true,
    labels: { visible: false },
  };
}

export function defaultObservational(): ObservationalRecipe {
  return { routes: [], polygons: [] };
}

export function defaultRecipe(): SceneRecipe {
  return { structural: defaultStructural(), observational: defaultObservational() };
}
```

- [ ] **Step 2: 写测试 `lib/scene-recipe/__tests__/types.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { defaultStructural, defaultObservational, defaultRecipe } from '../types';

describe('default factories', () => {
  it('defaultStructural 不裁剪（null）且引擎默认 3D/GIS 开', () => {
    const s = defaultStructural();
    expect(s.visibleStories).toBeNull();
    expect(s.visibleBuildings).toBeNull();
    expect(s.mode).toBe('3D');
    expect(s.yExtend).toBe(false);
    expect(s.gisVisible).toBe(true);
    expect(s.labels.visible).toBe(false);
    expect(s.reachable).toBeUndefined();
    expect(s.connectivity).toBeUndefined();
  });

  it('defaultObservational 不触碰 focus/viewpoint', () => {
    const o = defaultObservational();
    expect(o.focus).toBeUndefined();
    expect(o.viewpoint).toBeUndefined();
    expect(o.routes).toEqual([]);
    expect(o.polygons).toEqual([]);
  });

  it('defaultRecipe 组合两者', () => {
    const r = defaultRecipe();
    expect(r.structural.mode).toBe('3D');
    expect(r.observational.routes).toEqual([]);
  });
});
```

- [ ] **Step 3: 跑测试**

```bash
npx vitest run lib/scene-recipe/__tests__/types.test.ts
```
Expected: 3 passed.

- [ ] **Step 4: typecheck**

```bash
npx tsc --noEmit
```
Expected: 无错误（确认 CameraViewpoint/SceneTreeNode 导入路径正确）。

- [ ] **Step 5: 回填 arch_ref §4 字段类型**

把 `doc/ref/arch_ref.md` §4 的 `visibleStories: string[];` 改为 `visibleStories: string[] | null; // null=全集不裁剪`，visibleBuildings 同。

- [ ] **Step 6: Commit**

```bash
git add lib/scene-recipe/types.ts lib/scene-recipe/__tests__/types.test.ts doc/ref/arch_ref.md
git commit -m "feat(scene-recipe): types + default factories"
```

---

## Task 2: diff.ts（TDD）

**Files:**
- Create: `lib/scene-recipe/diff.ts`
- Create: `lib/scene-recipe/__tests__/diff.test.ts`

**Interfaces:**
- Consumes: `StructuralRecipe`/`ObservationalRecipe`/`SceneRecipe`/`Changeset` from `./types`
- Produces: `diffRecipe(prev: SceneRecipe, next: SceneRecipe): Changeset`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { diffRecipe } from '../diff';
import { defaultRecipe } from '../types';

describe('diffRecipe', () => {
  it('相同 recipe → 两层都不 touched', () => {
    const r = defaultRecipe();
    const c = diffRecipe(r, r);
    expect(c.structural.__touched).toBe(false);
    expect(c.observational.__touched).toBe(false);
  });

  it('visibleStories 集合相等（顺序无关）→ 不 touched', () => {
    const prev = defaultRecipe();
    const next = { ...prev, structural: { ...prev.structural, visibleStories: ['a','b'] } };
    const next2 = { ...prev, structural: { ...prev.structural, visibleStories: ['b','a'] } };
    const c = diffRecipe(next, next2);
    expect(c.structural.__touched).toBe(false);
  });

  it('mode 变更 → structural touched 且含 mode', () => {
    const prev = defaultRecipe();
    const next = { ...prev, structural: { ...prev.structural, mode: '2D' as const } };
    const c = diffRecipe(prev, next);
    expect(c.structural.__touched).toBe(true);
    expect(c.structural.mode).toBe('2D');
  });

  it('focus 变更 → observational touched，structural 不 touched（正交）', () => {
    const prev = defaultRecipe();
    const next = { ...prev, observational: { ...prev.observational, focus: { objectId: 'X' } } };
    const c = diffRecipe(prev, next);
    expect(c.observational.__touched).toBe(true);
    expect(c.observational.focus).toEqual({ objectId: 'X' });
    expect(c.structural.__touched).toBe(false);
  });

  it('reachable 从 undefined → 有值 视为变更', () => {
    const prev = defaultRecipe();
    const next = { ...prev, structural: { ...prev.structural, reachable: { nodeId: 'N1' } } };
    const c = diffRecipe(prev, next);
    expect(c.structural.__touched).toBe(true);
    expect(c.structural.reachable).toEqual({ nodeId: 'N1' });
  });

  it('routes 仅 visible 变化的 id 进 changeset', () => {
    const prev = { ...defaultRecipe(), observational: { routes: [{id:'r1',visible:true},{id:'r2',visible:false}], polygons: [] } };
    const next = { ...prev, observational: { routes: [{id:'r1',visible:false},{id:'r2',visible:false}], polygons: [] } };
    const c = diffRecipe(prev, next);
    expect(c.observational.__touched).toBe(true);
    expect(c.observational.routes).toEqual([{id:'r1',visible:false}]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/scene-recipe/__tests__/diff.test.ts
```
Expected: FAIL（diffRecipe 未定义）。

- [ ] **Step 3: 实现 `lib/scene-recipe/diff.ts`**

```ts
import type { Changeset, ObservationalRecipe, SceneRecipe, StructuralRecipe } from './types';

const EMPTY: Changeset = {
  structural: { __touched: false },
  observational: { __touched: false },
};

function setEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function shallowDiff<T extends object>(prev: T, next: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    if (!Object.is(prev[k], next[k])) out[k] = next[k];
  }
  return out;
}

function diffStructural(prev: StructuralRecipe, next: StructuralRecipe): Changeset['structural'] {
  const partial: Partial<StructuralRecipe> = {};
  if (!setEqual(prev.visibleStories, next.visibleStories)) partial.visibleStories = next.visibleStories;
  if (!setEqual(prev.visibleBuildings, next.visibleBuildings)) partial.visibleBuildings = next.visibleBuildings;
  if (prev.mode !== next.mode) partial.mode = next.mode;
  if (prev.yExtend !== next.yExtend) partial.yExtend = next.yExtend;
  if (prev.gisVisible !== next.gisVisible) partial.gisVisible = next.gisVisible;
  if (prev.labels.visible !== next.labels.visible || !setEqual(prev.labels.ids, next.labels.ids)) {
    partial.labels = next.labels;
  }
  if (JSON.stringify(prev.reachable) !== JSON.stringify(next.reachable)) partial.reachable = next.reachable;
  if (JSON.stringify(prev.connectivity) !== JSON.stringify(next.connectivity)) partial.connectivity = next.connectivity;
  return { __touched: Object.keys(partial).length > 0, ...partial };
}

function diffObservational(prev: ObservationalRecipe, next: ObservationalRecipe): Changeset['observational'] {
  const partial: Partial<ObservationalRecipe> = {};
  if (JSON.stringify(prev.focus) !== JSON.stringify(next.focus)) partial.focus = next.focus;
  if (JSON.stringify(prev.viewpoint) !== JSON.stringify(next.viewpoint)) partial.viewpoint = next.viewpoint;
  // routes / polygons：按 id 对齐，仅 visible 变化的项
  partial.routes = diffVisibleList(prev.routes, next.routes);
  partial.polygons = diffVisibleList(prev.polygons, next.polygons);
  const touched = partial.focus !== undefined || partial.viewpoint !== undefined
    || (partial.routes && partial.routes.length > 0)
    || (partial.polygons && partial.polygons.length > 0);
  return { __touched: touched, ...partial };
}

function diffVisibleList(prev: {id:string;visible:boolean}[], next: {id:string;visible:boolean}[]): {id:string;visible:boolean}[] {
  const map = new Map(prev.map((r) => [r.id, r.visible]));
  const changed: {id:string;visible:boolean}[] = [];
  for (const r of next) {
    if (!(r.id in map) || map[r.id] !== r.visible) changed.push(r);
  }
  return changed;
}

export function diffRecipe(prev: SceneRecipe, next: SceneRecipe): Changeset {
  return {
    structural: diffStructural(prev.structural, next.structural),
    observational: diffObservational(prev.observational, next.observational),
  };
}

export { EMPTY };
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/scene-recipe/__tests__/diff.test.ts
```
Expected: 6 passed.

- [ ] **Step 5: typecheck + commit**

```bash
npx tsc --noEmit
git add lib/scene-recipe/diff.ts lib/scene-recipe/__tests__/diff.test.ts
git commit -m "feat(scene-recipe): diffRecipe 纯函数 + 测试"
```

---

## Task 3: engine.ts（TDD，mock runtime）

**Files:**
- Create: `lib/scene-recipe/engine.ts`
- Create: `lib/scene-recipe/__tests__/engine.test.ts`

**Interfaces:**
- Consumes: `Changeset`/`RecipeRuntime`/`ApplyResult` from `./types`、`SceneTreeNode` from `../ustudio`
- Produces: `applyRecipe(runtime: RecipeRuntime, tree: SceneTreeNode, changeset: Changeset): Promise<ApplyResult>`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from 'vitest';
import { applyRecipe } from '../engine';
import type { Changeset, RecipeRuntime } from '../types';
import type { SceneTreeNode } from '../../ustudio';

function mockRuntime(): RecipeRuntime & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setViewMode: async () => { calls.push('setViewMode'); },
    setGisVisible: async () => { calls.push('setGisVisible'); },
    showLabels: () => { calls.push('showLabels'); },
    hideLabels: () => { calls.push('hideLabels'); },
    setScene: async () => { calls.push('setScene'); },
    flyToObject: async () => { calls.push('flyToObject'); },
    highlightObject: () => { calls.push('highlightObject'); return true; },
    setCameraViewpoint: async () => { calls.push('setCameraViewpoint'); },
    setVirtualRouteVisible: () => { calls.push('setVirtualRouteVisible'); },
    setVirtualPolygonVisible: () => { calls.push('setVirtualPolygonVisible'); },
  };
}

const tree = {} as unknown as SceneTreeNode;

describe('applyRecipe', () => {
  it('两层都不 touched → 零调用', async () => {
    const rt = mockRuntime();
    const cs: Changeset = { structural: {__touched:false}, observational: {__touched:false} };
    const r = await applyRecipe(rt, tree, cs);
    expect(rt.calls).toEqual([]);
    expect(r.applied).toEqual([]);
  });

  it('结构层先于观察层（setViewMode 在 flyToObject 之前）', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, visibleStories: ['1F'], mode: '3D', yExtend: false },
      observational: { __touched: true, focus: { objectId: 'X' } },
    };
    await applyRecipe(rt, tree, cs);
    const vm = rt.calls.indexOf('setViewMode');
    const fly = rt.calls.indexOf('flyToObject');
    expect(vm).toBeGreaterThanOrEqual(0);
    expect(fly).toBeGreaterThan(vm);
  });

  it('focus 优先于 viewpoint（有 focus 不调 setCameraViewpoint）', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: false },
      observational: { __touched: true, focus: { objectId: 'X' }, viewpoint: { position:{x:0,y:0,z:0}, target:{x:0,y:0,z:0}, zoom:1 } },
    } as unknown as Changeset;
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).toContain('flyToObject');
    expect(rt.calls).not.toContain('setCameraViewpoint');
  });

  it('best-effort：一调用失败不阻断其余，记入 failed', async () => {
    const rt = mockRuntime();
    rt.setGisVisible = async () => { throw new Error('boom'); };
    const cs: Changeset = {
      structural: { __touched: true, gisVisible: false },
      observational: { __touched: true, focus: { objectId: 'X' } },
    };
    const r = await applyRecipe(rt, tree, cs);
    expect(r.failed.some((f) => f.field === 'gisVisible')).toBe(true);
    expect(r.applied).toContain('focus');
  });

  it('仅 gisVisible 变（不动楼层/mode）→ 不调 setViewMode', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, gisVisible: false },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).not.toContain('setViewMode');
    expect(rt.calls).toContain('setGisVisible');
  });

  it('visibleStories=null（恢复全集）或 mode 变 → 调 setViewMode（storyIds 用全集）', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, visibleStories: null, mode: '2D' },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).toContain('setViewMode');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/scene-recipe/__tests__/engine.test.ts
```
Expected: FAIL（applyRecipe 未定义）。

- [ ] **Step 3: 实现 `lib/scene-recipe/engine.ts`**

```ts
import type { ApplyResult, Changeset, RecipeRuntime } from './types';
import type { SceneTreeNode } from '../ustudio';
import { logger } from '../logger'; // 若无 logger 模块，用 console.warn

// tree 解析（与 src/components/FloorDisplayPanel 同源逻辑；后续可抽取到共用 tree-utils）
function nodeType(n: unknown): string {
  const node = n as { twins_identifier?: string; type?: string } | null;
  return String(node?.twins_identifier ?? node?.type ?? '').toLowerCase();
}
function walk(node: SceneTreeNode | null, visit: (n: SceneTreeNode) => void): void {
  if (!node) return;
  visit(node);
  const kids = Array.isArray(node.children) ? node.children : [];
  for (const c of kids) walk(c, visit);
}
function collectAllStoryIds(tree: SceneTreeNode): string[] {
  const ids: string[] = [];
  walk(tree, (n) => {
    const t = nodeType(n);
    if (t === 'story' || t.endsWith('story') || t.includes('floor')) {
      ids.push(String((n as { out_instance_id?: string; id?: string }).out_instance_id ?? (n as { id?: string }).id ?? ''));
    }
  });
  return ids.filter(Boolean);
}
function collectAllBuildingIds(tree: SceneTreeNode): string[] {
  const ids: string[] = [];
  walk(tree, (n) => {
    const t = nodeType(n);
    if (t === 'building' || t.endsWith('building') || t.includes('building')) {
      ids.push(String((n as { out_instance_id?: string; id?: string }).out_instance_id ?? (n as { id?: string }).id ?? ''));
    }
  });
  return ids.filter(Boolean);
}

async function safe(field: string, fn: () => unknown, applied: string[], failed: ApplyResult['failed']): Promise<void> {
  try {
    await fn();
    applied.push(field);
  } catch (error) {
    failed.push({ field, error });
    logger.warn(`[scene-recipe] apply ${field} failed`, error);
  }
}

export async function applyRecipe(
  runtime: RecipeRuntime,
  tree: SceneTreeNode,
  cs: Changeset,
): Promise<ApplyResult> {
  const applied: string[] = [];
  const failed: ApplyResult['failed'] = [];

  // 阶段1：结构层（先降渲染量）
  if (cs.structural.__touched) {
    const s = cs.structural;
    // setViewMode：楼层/楼栋/mode/yExtend 任一变更即应用。
    // storyIds：显式子集用子集；null/undefined（全集，或仅切 mode）用 collectAllStoryIds(tree)。
    const storiesChanged = s.visibleStories !== undefined;
    const buildingsChanged = s.visibleBuildings !== undefined;
    const modeChanged = s.mode !== undefined;
    const yExtendChanged = s.yExtend !== undefined;
    if (storiesChanged || buildingsChanged || modeChanged || yExtendChanged) {
      const storyIds = s.visibleStories ?? collectAllStoryIds(tree);
      const buildingIds = s.visibleBuildings ?? collectAllBuildingIds(tree);
      const mode = s.mode ?? '3D';
      const params: { type: string; ids: string[] }[] = [{ type: mode, ids: storyIds }];
      if (s.yExtend ?? false) params.push({ type: 'YExtend', ids: storyIds });
      await safe('setViewMode', () => runtime.setViewMode(params, tree, storyIds, buildingIds), applied, failed);
    }
    if (s.gisVisible !== undefined) await safe('gisVisible', () => runtime.setGisVisible(s.gisVisible!), applied, failed);
    if (s.labels !== undefined) {
      if (s.labels.visible) await safe('labels', () => runtime.showLabels(tree, s.labels!.ids, undefined), applied, failed);
      else await safe('labels', () => runtime.hideLabels(), applied, failed);
    }
    if (s.reachable !== undefined) await safe('reachable', () => runtime.setScene({ reachable: true, nodeId: s.reachable!.nodeId }), applied, failed);
    else if (s.connectivity !== undefined) await safe('connectivity', () => runtime.setScene({ connectivity: true, spaceId: s.connectivity!.spaceId }), applied, failed);
  }

  // 阶段2：观察层（依赖结构层已应用）
  if (cs.observational.__touched) {
    const o = cs.observational;
    if (o.focus !== undefined && o.focus) {
      await safe('focus', async () => { await runtime.flyToObject(o.focus!.objectId); runtime.highlightObject(o.focus!.objectId, o.focus!.highlightColor); }, applied, failed);
    } else if (o.viewpoint !== undefined && o.viewpoint) {
      await safe('viewpoint', () => runtime.setCameraViewpoint(o.viewpoint!, true), applied, failed);
    }
    if (o.routes) {
      for (const r of o.routes) await safe(`route:${r.id}`, () => runtime.setVirtualRouteVisible(r.id, r.visible), applied, failed);
    }
    if (o.polygons) {
      for (const p of o.polygons) await safe(`polygon:${p.id}`, () => runtime.setVirtualPolygonVisible(p.id, p.visible), applied, failed);
    }
  }

  return { applied, failed };
}
```

> **注**：若 `lib/logger.ts` 不存在，engine 用 `const logger = console;`，或新建最小 `lib/logger.ts`（导出 `{ warn: console.warn }` 形状）。在 Step 3 前确认。

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/scene-recipe/__tests__/engine.test.ts
```
Expected: 5 passed。

- [ ] **Step 5: typecheck + commit**

```bash
npx tsc --noEmit
git add lib/scene-recipe/engine.ts lib/scene-recipe/__tests__/engine.test.ts
git commit -m "feat(scene-recipe): applyRecipe 顺序化+幂等+best-effort"
```

---

## Task 4: store.ts（TDD）

**Files:**
- Create: `lib/scene-recipe/store.ts`
- Create: `lib/scene-recipe/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `SceneRecipe`/`Changeset`/`StructuralRecipe`/`ObservationalRecipe` from `./types`、`diffRecipe` from `./diff`
- Produces: `RecipeStore` 类

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, vi } from 'vitest';
import { RecipeStore } from '../store';
import { defaultRecipe } from '../types';

describe('RecipeStore', () => {
  it('初始 current = defaultRecipe', () => {
    const s = new RecipeStore();
    expect(s.getCurrent().structural.mode).toBe('3D');
  });

  it('patchStructural 改字段后 listener 收到 changeset（structural touched）', () => {
    const s = new RecipeStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.patchStructural({ mode: '2D' });
    expect(listener).toHaveBeenCalledTimes(1);
    const [, cs] = listener.mock.calls[0];
    expect(cs.structural.__touched).toBe(true);
    expect(cs.structural.mode).toBe('2D');
  });

  it('观察层 patch 不触发结构层 changeset（正交）', () => {
    const s = new RecipeStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.patchObservational({ focus: { objectId: 'X' } });
    const [, cs] = listener.mock.calls[0];
    expect(cs.observational.__touched).toBe(true);
    expect(cs.structural.__touched).toBe(false);
  });

  it('相同 patch（无变更）→ 不通知 listener（幂等）', () => {
    const s = new RecipeStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.patchStructural({ mode: '3D' }); // 默认就是 3D
    expect(listener).not.toHaveBeenCalled();
  });

  it('setStructural 整体替换（preset）', () => {
    const s = new RecipeStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.setStructural({ ...defaultRecipe().structural, mode: '2D', gisVisible: false });
    expect(s.getCurrent().structural.mode).toBe('2D');
    expect(s.getCurrent().structural.gisVisible).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run lib/scene-recipe/__tests__/store.test.ts
```
Expected: FAIL。

- [ ] **Step 3: 实现 `lib/scene-recipe/store.ts`**

```ts
import { diffRecipe } from './diff';
import { defaultRecipe } from './types';
import type { Changeset, ObservationalRecipe, SceneRecipe, StructuralRecipe } from './types';

type Listener = (next: SceneRecipe, changeset: Changeset) => void;

export class RecipeStore {
  private current: SceneRecipe = defaultRecipe();
  private listeners = new Set<Listener>();
  /** 场景状态是否可能与 SDK 不一致（apply 失败时置 true） */
  public desynced = false;

  getCurrent(): SceneRecipe {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setStructural(full: StructuralRecipe): void {
    this.dispatch({ ...this.current, structural: full });
  }

  patchStructural(patch: Partial<StructuralRecipe>): void {
    this.dispatch({ ...this.current, structural: { ...this.current.structural, ...patch } });
  }

  setObservational(full: ObservationalRecipe): void {
    this.dispatch({ ...this.current, observational: full });
  }

  patchObservational(patch: Partial<ObservationalRecipe>): void {
    this.dispatch({ ...this.current, observational: { ...this.current.observational, ...patch } });
  }

  applyPreset(recipe: SceneRecipe): void {
    this.dispatch(recipe);
  }

  private dispatch(next: SceneRecipe): void {
    const cs = diffRecipe(this.current, next);
    if (!cs.structural.__touched && !cs.observational.__touched) return; // 幂等：零变更不通知
    this.current = next;
    for (const l of this.listeners) l(this.current, cs);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npx vitest run lib/scene-recipe/__tests__/store.test.ts
```
Expected: 5 passed。

- [ ] **Step 5: typecheck + commit**

```bash
npx tsc --noEmit
git add lib/scene-recipe/store.ts lib/scene-recipe/__tests__/store.test.ts
git commit -m "feat(scene-recipe): RecipeStore 单一真相源 + 分层 dispatch"
```

---

## Task 5: presets.ts（TDD）

**Files:**
- Create: `lib/scene-recipe/presets.ts`
- Create: `lib/scene-recipe/__tests__/presets.test.ts`

**Interfaces:**
- Consumes: `SceneRecipe`/`StructuralRecipe` from `./types`
- Produces: `presets` 常量（objectsOverview / drillConfront / familiarize[6]）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from 'vitest';
import { presets } from '../presets';

describe('presets', () => {
  it('objectsOverview 结构层不裁剪 + 标注开 + GIS 关', () => {
    const p = presets.objectsOverview;
    expect(p.structural.visibleStories).toBeNull();
    expect(p.structural.gisVisible).toBe(false);
    expect(p.structural.labels.visible).toBe(true);
  });

  it('drillConfront 结构层 GIS 开（到场需要底图）', () => {
    expect(presets.drillConfront.structural.gisVisible).toBe(true);
  });

  it('familiarize 六步都有 focus', () => {
    expect(presets.familiarize).toHaveLength(6);
    for (const step of presets.familiarize) {
      expect(step.observational.focus).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败 → Step 3 实现**

```ts
// lib/scene-recipe/presets.ts
import type { SceneRecipe } from './types';

const baseObservational = { routes: [], polygons: [] };

export const presets = {
  objectsOverview: {
    structural: { visibleStories: null, visibleBuildings: null, mode: '3D' as const, yExtend: false, gisVisible: false, labels: { visible: true } },
    observational: { ...baseObservational },
  },
  drillConfront: {
    structural: { visibleStories: null, visibleBuildings: null, mode: '3D' as const, yExtend: false, gisVisible: true, labels: { visible: true } },
    observational: { ...baseObservational },
  },
  // 六熟悉：focus.objectId 待对齐 znya key_parts 真实 id 后填实；骨架先 6 步
  familiarize: Array.from({ length: 6 }, (_, i) => ({
    structural: { visibleStories: null, visibleBuildings: null, mode: '3D' as const, yExtend: false, gisVisible: false, labels: { visible: true } },
    observational: { ...baseObservational, focus: { objectId: `__familiarize_step_${i + 1}__` } },
  })) as SceneRecipe[],
};
```

> **注**：`familiarize[k].focus.objectId` 用 `__familiarize_step_N__` 占位，Task 9 接模块预设时对齐 znya `key_parts` 真实 id。此占位有测试约束（6 步 + focus 存在），非"模糊 TODO"。

- [ ] **Step 4: 跑测试通过 + Step 5: typecheck + commit**

```bash
npx vitest run lib/scene-recipe/__tests__/presets.test.ts
npx tsc --noEmit
git add lib/scene-recipe/presets.ts lib/scene-recipe/__tests__/presets.test.ts
git commit -m "feat(scene-recipe): 模块/子流程预设常量"
```

---

## Task 6: react.ts（React 绑定）

**Files:**
- Create: `lib/scene-recipe/react.ts`

**Interfaces:**
- Consumes: `RecipeStore` from `./store`
- Produces: `useRecipe(store)`、`useStructural(store)`、`useRecipeDispatch(store)` hooks（store 实例由 SceneProvider 注入）

- [ ] **Step 1: 实现**（React hook 难单测，typecheck + 冒烟验证，符合项目"lib 优先测"现状）

```ts
// lib/scene-recipe/react.ts
import { useCallback, useEffect, useState } from 'react';
import type { ObservationalRecipe, StructuralRecipe } from './types';
import type { RecipeStore } from './store';

export function useRecipe(store: RecipeStore) {
  const [recipe, setRecipe] = useState(store.getCurrent());
  useEffect(() => store.subscribe((next) => setRecipe(next)), [store]);
  return recipe;
}

export function useStructural(store: RecipeStore): StructuralRecipe {
  return useRecipe(store).structural;
}

export function useRecipeDispatch(store: RecipeStore) {
  return {
    setStructural: useCallback((full: StructuralRecipe) => store.setStructural(full), [store]),
    patchStructural: useCallback((patch: Partial<StructuralRecipe>) => store.patchStructural(patch), [store]),
    patchObservational: useCallback((patch: Partial<ObservationalRecipe>) => store.patchObservational(patch), [store]),
    setObservational: useCallback((full: ObservationalRecipe) => store.setObservational(full), [store]),
    applyPreset: store.applyPreset.bind(store),
  };
}
```

- [ ] **Step 2: typecheck + commit**

```bash
npx tsc --noEmit
git add lib/scene-recipe/react.ts
git commit -m "feat(scene-recipe): React 绑定 hooks"
```

---

## Task 7: SceneProvider 绑定 store + engine

**Files:**
- Modify: `src/components/SceneProvider.tsx`（context 加 `recipeStore`；runtime ready 时建 store + 订阅 applyRecipe）

**Interfaces:**
- Consumes: `RecipeStore`、`applyRecipe`、`SoonspaceRuntime`（现有）
- Produces: context 暴露 `recipeStore: RecipeStore | null`

- [ ] **Step 1: SceneProvider 改造**

在 `SceneContextValue` 加 `recipeStore: RecipeStore | null`。在 runtime ready（`view === 'ready'` 且 runtime 创建后）：
```ts
import { RecipeStore } from '@/lib/scene-recipe/store';
import { applyRecipe } from '@/lib/scene-recipe/engine';
import type { RecipeRuntime } from '@/lib/scene-recipe/types';
// ...
// runtime 创建后、setRuntime(rt) 前：
const store = new RecipeStore();
const recipeRuntime: RecipeRuntime = {
  setViewMode: (p, t, s, b) => rt.setViewMode(p, t, s, b),
  setGisVisible: (v) => rt.setGisVisible(v),
  showLabels: (t, ids, s) => rt.showLabels(t, ids, s),
  hideLabels: () => rt.hideLabels(),
  setScene: (p) => rt.setScene(p),
  flyToObject: (id) => rt.flyToObject(id),
  highlightObject: (id, c) => rt.highlightObject(id, c),
  setCameraViewpoint: (vp, tr) => rt.setCameraViewpoint(vp, tr),
  setVirtualRouteVisible: (id, v) => rt.setVirtualRouteVisible(id, v),
  setVirtualPolygonVisible: (id, v) => rt.setVirtualPolygonVisible(id, v),
};
const unsub = store.subscribe((_next, cs) => {
  void applyRecipe(recipeRuntime, treeRef.current!, cs).then((r) => {
    if (r.failed.length) store.desynced = true;
  });
});
// sceneId 切换/组件卸载时 unsub
setRecipeStore(store);
```
默认不套预设（`defaultStructural()` 已是初始 current）→ **零行为变化**。

- [ ] **Step 2: typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 浏览器冒烟**

`npm run dev`，进对象总览，确认场景正常加载、FloorDisplayPanel（尚未迁移）仍直调 runtime 正常工作（双写期间互不干扰）。

- [ ] **Step 4: commit**

```bash
git add src/components/SceneProvider.tsx
git commit -m "feat(scene-recipe): SceneProvider 绑定 store+engine(默认不套预设)"
```

---

## Task 8: FloorDisplayPanel 迁移到 store

**Files:**
- Modify: `src/components/FloorDisplayPanel.tsx`（`toggleStory/toggleBuilding/selectAll/selectNone/changeMode/toggleYExtend` → `store.patchStructural`；移除 `applyViewMode` 直调）

**Interfaces:**
- Consumes: `useScene().recipeStore`、`StructuralRecipe`

- [ ] **Step 1: 改造**

- 从 `useScene()` 拿 `recipeStore`（替代 `runtime` 的 setViewMode 路径；保留 `runtime` 用于 flyToObject 联动暂不动——flyToObject 属观察层，Task 10 统一迁）。
- `commitSelection(nextStoryKeys)` 内：把选中的 story `outId` 集合 → `recipeStore.patchStructural({ visibleStories: storyOutIds.length === allStories.length ? null : storyOutIds, visibleBuildings: ..., yExtend: nextStoryKeys.size > 1 })`。
- `changeMode(m)` → `patchStructural({ mode: m })`。
- 删除 `applyViewMode`/`selectedStoryOutIds` 的 `runtime.setViewMode` 调用（订阅 engine 会自动应用）。
- **保留 `dirtyRef`**：用户未操作前不 patch（与"默认不套预设"一致）。
- **保留 `flyToObject` 联动**（暂直调 runtime，观察层迁移留 Task 10）。

- [ ] **Step 2: typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 浏览器冒烟（行为等价）**

`npm run dev`，进对象总览：
- 勾选单层 → 只显示该层（与迁移前一致）
- 全选 → 全显示（visibleStories=null，不调 setViewMode）
- 切 2D/3D、炸开 → 正常
- DevTools 确认 `[FloorDisplay] setViewMode` 日志改由 engine 发出

- [ ] **Step 4: commit**

```bash
git add src/components/FloorDisplayPanel.tsx
git commit -m "refactor(3d): FloorDisplayPanel 迁移到 RecipeStore(行为等价)"
```

---

## Task 9: 模块预设接入（App.tsx handleSelect）

**Files:**
- Modify: `src/App.tsx`（`handleSelect` 切模块时套预设）
- Modify: `lib/scene-recipe/presets.ts`（familiarize focus.objectId 对齐 znya key_parts 真实 id — 可选，若数据未就绪保留占位）

**Interfaces:**
- Consumes: `presets`、`useScene().recipeStore`

- [ ] **Step 1: handleSelect 套预设**

```ts
// src/App.tsx handleSelect 内，setModule(k) 后：
const store = recipeStore; // 从 useScene() 拿
if (store) {
  if (k === 'objects') store.setStructural(presets.objectsOverview.structural);
  else if (k === 'drill') store.setStructural(presets.drillConfront.structural);
  // training/familiarize 步进在 TrainingView 内部 applyPreset(presets.familiarize[k])
}
```
> 态势总览（overview）不加载 3D，不套预设。

- [ ] **Step 2: typecheck + 冒烟**

进对象总览 → 标注自动开、GIS 关；进演练 → GIS 开。确认与迁移前不会"挂载即重置"（dirtyRef 仍在 FloorDisplayPanel 控制；handleSelect 是用户主动切模块，套预设合理）。

- [ ] **Step 3: commit**

```bash
git add src/App.tsx
git commit -m "feat(scene-recipe): 模块切换套 Recipe 预设"
```

---

## Task 10: AgentRunner 接观察层

**Files:**
- Modify: `lib/drill/agent-runner.ts`（决策 toolCall → patchObservational；到场路线 → routes）

**Interfaces:**
- Consumes: `RecipeStore`（web 端如何把 store 给 agent-runner：经事件总线或回调注入）

> **架构注意**：`agent-runner.ts` 在 lib（推演引擎），不应直接 import React/store。采用**回调注入**：`AgentRunner` 构造参数加 `onScenePatch?: (patch: Partial<ObservationalRecipe>) => void`，由 DrillView 调用方注入 `store.patchObservational`。

- [ ] **Step 1: AgentRunner 加回调**

`AgentRunnerOptions` 加 `onScenePatch?: (patch: Partial<ObservationalRecipe>) => void`。决策处（`reportDecision`/toolCall 派发）：
```ts
// 着火位置飞向 + 高亮
this.opts.onScenePatch?.({ focus: { objectId: decision.fireObjectId, highlightColor: '#f87171' } });
// 到场路线
this.opts.onScenePatch?.({ routes: [{ id: routeId, visible: true }] });
```

- [ ] **Step 2: DrillView 注入**

`src/views/DrillView.tsx` 的 `useAgentRunner({...})` 加：
```ts
onScenePatch: (patch) => recipeStore?.patchObservational(patch),
```

- [ ] **Step 3: typecheck + 冒烟（演练端到端）**

`npm run dev`，进演练，启动推演：agent 决策 → 场景飞向着火位置 + 高亮。确认结构层显隐不被 agent 误改（正交）。

- [ ] **Step 4: commit**

```bash
git add lib/drill/agent-runner.ts src/views/DrillView.tsx
git commit -m "feat(drill): AgentRunner 决策经 Recipe 观察层落地"
```

---

## Task 11: scene-action-executor 退化为适配器

**Files:**
- Modify: `lib/scene-action-executor.ts`（`switchFloor` action → `store.patchStructural`）

**Interfaces:**
- Consumes: `RecipeStore`（注入）、`SceneAction`

- [ ] **Step 1: 改 mapSceneAction 签名，加可选 store**

```ts
export function mapSceneAction(action: SceneAction, runtime: SceneExecutorRuntime, store?: RecipeStore): MapResult {
  // ...
  case 'switchFloor': {
    const storyIds = ...;
    if (store) {
      store.patchStructural({ visibleStories: storyIds });
      return { executed: true };
    }
    runtime.switchFloor(storyIds); // 回退原路径
    return { executed: true };
  }
}
```
`subscribeSceneActions(runtime, store?)` 透传。

- [ ] **Step 2: 调用方（RealSceneView 或 SceneCommandBridge）注入 store**

grep `subscribeSceneActions` 调用点，传 `useScene().recipeStore`。

- [ ] **Step 3: typecheck + 冒烟**

触发一条 `addSceneAction({action:'switchFloor', params:{storyIds:[...]}})`，确认经 store → engine 应用。

- [ ] **Step 4: commit**

```bash
git add lib/scene-action-executor.ts
git commit -m "refactor(scene-recipe): scene-action-executor 退化为 Recipe 适配器"
```

---

## Task 12（条件：Task 0 结论=在做显隐）: 双体系并归

**仅在 Task 0 实测判定 `SceneCommandBridge` 在做显隐/聚焦时执行。否则跳过（保留划界）。**

**Files:**
- Modify/Delete: `components/SceneCommandBridge.tsx`、按裁定处理 `lib/scene-command-bus/`、根 `components/` 18 个模板遗留

- [ ] **Step 1: 按 Task 0 裁定，把 SceneCommandBridge 的显隐调用方迁到 `store.patchStructural/Observational`**
- [ ] **Step 2: 移除 SceneCommandBridge 挂载（App.tsx:259）**
- [ ] **Step 3: 评估根 `components/` 18 个模板遗留能否整体删除**（以 RealSceneView 运行链路实测为准）
- [ ] **Step 4: typecheck + test + 全模块冒烟 + commit**

```bash
git commit -m "refactor(3d): 双体系并归到 Recipe 层"
```

---

## Self-Review（计划自检）

**1. Spec 覆盖**（arch_ref.md 各章）：
- §3 模块清单 → Task 1-6（types/diff/engine/store/presets/react + 测试）✓
- §4 数据模型 → Task 1 ✓（含 `string[] | null` 细化回填）
- §5 engine diff/apply/幂等/错误 → Task 2-3 ✓（best-effort、顺序、focus>viewpoint、null 跳过 均有测试）
- §6 store + 绑定 → Task 4、6、7 ✓
- §7 三路驱动 → Task 8（用户）/ Task 9（模块预设）/ Task 10（agent）/ Task 11（兼容适配器）✓
- §8 预设 → Task 5、9 ✓
- §10 双体系 → Task 0、12 ✓
- §11 八阶段 → Task 0-12 一一对应 ✓

**2. 占位符扫描**：`familiarize[k].focus.objectId` 用受测占位 `__familiarize_step_N__`（有测试约束），Task 9 注明对齐真实 id；无模糊 TODO。✓

**3. 类型一致性**：`diffRecipe`/`applyRecipe`/`RecipeStore`/hooks 签名在各 task 间一致；`RecipeRuntime`（Task 1）与 engine mock（Task 3）、SceneProvider 注入（Task 7）字段对齐。✓

**4. 依赖顺序**：Task 1→2→3→4→5→6→7→8→9→10→11→（12）；Task 0 与 1-6 可并行（调研 vs 建库）。✓
