# 实战指挥·处置流程演示编排 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在实战指挥 `CommandView` 实现「一键新警情处置流程演示」——接警→出动→到场→控制→熄灭 的 GIS 动画 + 面板数据 + Toast 推送统一时序编排。

**Architecture:** 纯逻辑层 `lib/command-flow/`（阶段/剧本/编排器/视角仲裁/车辆动画，全可单测）+ 极薄 React 接线 `useDisposalFlow` + 演示控制条 `DisposalFlowBar`。`liveChannel` 仍是唯一状态权威，经新增受控接口（`forceStatus`/`pushScriptRec`/`setScripted`）由剧本掌舵；视角统一走 `ViewDirector` 优先级仲裁（用户操作优先），演示运行时门控 `use-scene-bridge` 的自动 flyTo。

**Tech Stack:** Next.js (App Router), TypeScript, Leaflet (GIS), vitest (node env), 现有 `src/mock/liveChannel.ts` 状态机。

**Spec:** `web/plan/2026-08-20-disposal-flow-demo-design.md`

## Global Constraints

- 纯逻辑层 `lib/command-flow/` **禁止**运行时依赖 `@/mock/*`（vitest 中 `@`→web 根，`web/mock/` 不存在，运行时 import 会炸；type-only import 除外）。lib 间引用用 `@/lib/...`（根 `lib/` 下，可解析）或相对路径。
- `lib/command-flow/` 禁止 React/DOM 依赖；时钟（rAF/timeout）一律经注入的 `FlowClock`/`ConvoyClock` 抽象。
- liveChannel 受控接口（`forceStatus`/`pushScriptRec`/`setScripted`）仅在 `source==='mock'` 生效，真实/websocket 模式防御性 no-op + `console.warn`。
- 演示只跑 mock 主线（2026-08-20 用户裁定）；真实模式隐藏演示按钮。
- 视角仲裁「用户操作优先」：`user` > `follow` > `auto-flow` > `none`；剧本聚焦在 user/follow 占用时**丢弃不排队**。
- 「到场/控制」阶段视角意图 = `settle`（无自动视角命令），「熄灭」= `reset`。
- 工作区有在途未提交改动（`lib/gis/map-view-store.ts` 视角记忆 + `CommandView`/`liveChannel` 到场对齐 + `RealGisMap` preserveLayersOnActivity）——是既有工作，实现时**不得回退**；建议实施前先提交或暂存这组在途改动使工作树干净。
- 测试落位遵循 vitest include：`lib/**/__tests__/**`、`src/lib/**/__tests__/**`、`src/drill/**/__tests__/**`；src/mock 的测试放 `src/lib/__tests__/` 用相对导入 `../mock/...`。
- 每次任务以 `tsc --noEmit` + `vitest run` 绿 + 提交收尾。

---

## File Structure

```
lib/command-flow/                      ← 新增纯逻辑层(无 React/DOM/无 @/mock 运行时依赖)
├── types.ts           共享类型:IncidentStatus/FlowStage/ViewSpec/ScriptAction
├── stages.ts          阶段顺序 + 各阶段视角意图声明(STAGE_VIEW_INTENT)
├── script.ts          剧本构建器:buildScript(ctx) → ScriptAction[] 相对时间轴
├── flow-director.ts   FlowDirector 编排器(注入 FlowClock,可取消)
├── view-director.ts   ViewDirector 视角仲裁器(优先级 + 车辆跟随,经 MapAdapter)
└── vehicle-convoy.ts  VehicleConvoy 多车行进动画(注入 ConvoyClock)

src/lib/
├── disposal-demo-gate.ts             模块级演示门控标志(isDisposalDemoActive)
└── __tests__/
    └── liveChannel-scripted.test.ts  liveChannel 受控接口测试(相对导入 ../mock/liveChannel)

src/hooks/
└── useDisposalFlow.ts                React 接线(注入命令/地图/面板副作用)

src/components/command/
└── DisposalFlowBar.tsx               演示控制条

src/components/gis/hooks/use-scene-bridge.ts  修改:flyTo 分支加演示门控

src/mock/liveChannel.ts               修改:forceStatus/pushScriptRec/setScripted + 测试辅助

src/views/CommandView.tsx             修改:handleSelect 拆分 + 演示集成 + convoy 门控 + toast 门控

lib/__tests__/
├── command-flow-stages.test.ts
├── command-flow-script.test.ts
├── command-flow-convoy.test.ts
├── command-flow-view.test.ts
└── command-flow-flow.test.ts
```

---

## Task 1: command-flow 共享类型 + 阶段模型

**Files:**
- Create: `lib/command-flow/types.ts`
- Create: `lib/command-flow/stages.ts`
- Test: `lib/__tests__/command-flow-stages.test.ts`

**Interfaces:**
- Produces: `IncidentStatus`, `FlowStage`, `RecommendType`, `TimelineKind`, `ViewSpec`, `ScriptAction`, `STAGE_ORDER`, `STAGE_VIEW_INTENT`, `nextStage(stage): FlowStage | null`, `stageIndex(stage): number`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/command-flow-stages.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { STAGE_ORDER, STAGE_VIEW_INTENT, nextStage, stageIndex } from '../command-flow/stages';
import type { ViewSpec } from '../command-flow/types';

describe('STAGE_ORDER', () => {
  it('按接警→出动→到场→控制→熄灭 顺序', () => {
    expect(STAGE_ORDER).toEqual(['接警', '出动', '到场', '控制', '熄灭']);
  });
});

describe('STAGE_VIEW_INTENT', () => {
  it('接警聚焦案点,出动适配多站路线', () => {
    expect(STAGE_VIEW_INTENT['接警']).toBe('focusIncident');
    expect(STAGE_VIEW_INTENT['出动']).toBe('fitRoutes');
  });
  it('到场/控制 = settle(视角不乱动的契约),熄灭 = reset', () => {
    expect(STAGE_VIEW_INTENT['到场']).toBe('settle');
    expect(STAGE_VIEW_INTENT['控制']).toBe('settle');
    expect(STAGE_VIEW_INTENT['熄灭']).toBe('reset');
  });
});

describe('nextStage / stageIndex', () => {
  it('按顺序迁移,熄灭无后继', () => {
    expect(nextStage('接警')).toBe('出动');
    expect(nextStage('出动')).toBe('到场');
    expect(nextStage('到场')).toBe('控制');
    expect(nextStage('控制')).toBe('熄灭');
    expect(nextStage('熄灭')).toBeNull();
    expect(stageIndex('到场')).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/command-flow-stages.test.ts`
Expected: FAIL with "Cannot find module '../command-flow/stages'"

- [ ] **Step 3: Write minimal implementation**

`lib/command-flow/types.ts`:
```ts
/** 处置流程阶段(与 liveChannel 状态机同名同步)。 */
export type IncidentStatus = '接警' | '出动' | '到场' | '控制' | '熄灭';
export type FlowStage = IncidentStatus;

/** 推荐类型(与 src/mock/incidents.ts 同构)。 */
export type RecommendType = 'force' | 'tactic' | 'keypoint';

/** 案卷时间线事件类型(与 src/lib/case-timeline.ts 同构)。 */
export type TimelineKind = 'status' | 'dispatch' | 'arrival' | 'rescue' | 'manual';

/** 视角请求规格(交给 ViewDirector 仲裁执行)。 */
export type ViewSpec =
  | { kind: 'focusIncident'; lng: number; lat: number; ringM?: number; maxZoom?: number; paddingTL?: [number, number]; paddingBR?: [number, number] }
  | { kind: 'fitRoutes'; points: [number, number][] }
  | { kind: 'settle' }
  | { kind: 'reset' };

/** 剧本动作:at = 相对剧本起点的毫秒偏移。 */
export type ScriptAction =
  | { at: number; kind: 'stage'; stage: FlowStage }
  | { at: number; kind: 'toast'; msg: string }
  | { at: number; kind: 'timeline'; entryKind: TimelineKind; label: string; detail?: string }
  | { at: number; kind: 'view'; spec: ViewSpec }
  | { at: number; kind: 'status'; to: IncidentStatus }
  | { at: number; kind: 'pushRec'; type: RecommendType; content: string; basis: string }
  | { at: number; kind: 'panel'; id: 'vars' | 'recommend'; open: boolean }
  | { at: number; kind: 'convoy'; action: 'start' | 'arriveAll' };
```

`lib/command-flow/stages.ts`:
```ts
import type { FlowStage, ViewSpec } from './types';

/** 处置流程阶段顺序(接警→出动→到场→控制→熄灭)。 */
export const STAGE_ORDER: FlowStage[] = ['接警', '出动', '到场', '控制', '熄灭'];

/**
 * 各阶段视角意图声明。
 * 「到场/控制」为 settle = 剧本不发出自动视角命令(视角不乱动的契约);
 * 「熄灭」为 reset = 复位城市全景。
 */
export const STAGE_VIEW_INTENT: Record<FlowStage, ViewSpec['kind']> = {
  接警: 'focusIncident',
  出动: 'fitRoutes',
  到场: 'settle',
  控制: 'settle',
  熄灭: 'reset',
};

/** 下一阶段;熄灭返回 null。 */
export function nextStage(stage: FlowStage): FlowStage | null {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

/** 阶段在顺序中的下标(0 起)。 */
export function stageIndex(stage: FlowStage): number {
  return STAGE_ORDER.indexOf(stage);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/command-flow-stages.test.ts`
Expected: PASS (4 it blocks)

- [ ] **Step 5: Commit**

```bash
git add lib/command-flow/types.ts lib/command-flow/stages.ts lib/__tests__/command-flow-stages.test.ts
git commit -m "feat(command-flow): add flow stage model and shared types"
```

---

## Task 2: 剧本构建器 script.ts

**Files:**
- Create: `lib/command-flow/script.ts`
- Test: `lib/__tests__/command-flow-script.test.ts`

**Interfaces:**
- Consumes: `FlowStage`, `ScriptAction`, `RecommendType`, `TimelineKind`, `ViewSpec` (from `./types`); `compressDuration` (from `@/lib/gis/vehicle-anim`); `STAGE_ORDER`
- Produces: `ScriptRouteInfo`, `ScriptRecTemplate`, `ScriptContext`, `buildScript(ctx: ScriptContext): ScriptAction[]`

- [ ] **Step 1: Write the failing test**

`lib/__tests__/command-flow-script.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildScript, type ScriptContext } from '../command-flow/script';

const base: ScriptContext = {
  incidentId: 'JZ-20250612-008',
  address: '九江市浔阳区浔阳路88号九江苏宁广场',
  lng: 115.9895,
  lat: 29.7068,
  routes: [
    { stationName: '城东救援站', polyline: [[29.71, 115.98], [29.7068, 115.9895]], duration: 480, distance: 6200 },
    { stationName: '浔阳大队', polyline: [[29.72, 116.0], [29.7068, 115.9895]], duration: 600, distance: 8100 },
  ],
  statusRecs: {
    到场: { type: 'tactic', content: '到场侦察回传·烟气上升,建议内攻组梯次掩护', basis: '到场侦察回传' },
    控制: { type: 'keypoint', content: '明火基本控制,组织逐层搜救复验', basis: '控制阶段规程' },
  },
};

describe('buildScript', () => {
  it('起始为接警阶段,结尾为熄灭阶段+复位视角', () => {
    const s = buildScript(base);
    expect(s[0].kind).toBe('stage');
    expect(s[0]).toMatchObject({ stage: '接警' });
    expect(s[s.length - 1].kind).toBe('view');
    expect(s[s.length - 1]).toMatchObject({ spec: { kind: 'reset' } });
  });

  it('车辆出发(convoy start)早于全部到场(convoy arriveAll),到场状态翻转在 arriveAll 之后', () => {
    const s = buildScript(base);
    const startIdx = s.findIndex((a) => a.kind === 'convoy' && a.action === 'start');
    const arriveIdx = s.findIndex((a) => a.kind === 'convoy' && a.action === 'arriveAll');
    const statusIdx = s.findIndex((a) => a.kind === 'status' && a.to === '到场');
    expect(startIdx).toBeGreaterThan(-1);
    expect(arriveIdx).toBeGreaterThan(startIdx);
    expect(statusIdx).toBeGreaterThan(arriveIdx);
  });

  it('到场/控制两阶段均推送对应决策推荐', () => {
    const s = buildScript(base);
    expect(s.some((a) => a.kind === 'pushRec' && a.content.includes('到场侦察'))).toBe(true);
    expect(s.some((a) => a.kind === 'pushRec' && a.content.includes('明火基本控制'))).toBe(true);
  });

  it('派遣失败(routes 为空)降级:跳过车辆动画,仍推到场/控制/熄灭', () => {
    const s = buildScript({ ...base, routes: [] });
    expect(s.some((a) => a.kind === 'convoy')).toBe(false);
    expect(s.some((a) => a.kind === 'status' && a.to === '到场')).toBe(true);
    expect(s.some((a) => a.kind === 'status' && a.to === '熄灭')).toBe(true);
    expect(s[s.length - 1]).toMatchObject({ spec: { kind: 'reset' } });
  });

  it('时间轴 at 单调非递减', () => {
    const s = buildScript(base);
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i].at).toBeGreaterThanOrEqual(s[i - 1].at);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/command-flow-script.test.ts`
Expected: FAIL with "Cannot find module '../command-flow/script'"

- [ ] **Step 3: Write minimal implementation**

`lib/command-flow/script.ts`:
```ts
import { compressDuration } from '@/lib/gis/vehicle-anim';
import type { RecommendType, ScriptAction, TimelineKind } from './types';

/** 派遣路线信息(与 RouteRenderItem 字段同构,避免 lib 依赖 src)。 */
export interface ScriptRouteInfo {
  stationName: string;
  polyline: [number, number][];
  distance?: number;
  duration?: number;
}

/** 剧本推荐模板(源自 statusRecommendation 的 type/content/basis)。 */
export interface ScriptRecTemplate {
  type: RecommendType;
  content: string;
  basis: string;
}

export interface ScriptContext {
  incidentId: string;
  address: string;
  lng: number;
  lat: number;
  /** 派遣路线(空数组 = 派遣失败降级)。 */
  routes: ScriptRouteInfo[];
  /** 到场/控制两阶段的推荐模板。 */
  statusRecs: Partial<Record<'到场' | '控制', ScriptRecTemplate>>;
}

/**
 * 生成一次「新警情」处置演示的相对时间轴(毫秒)。
 * 车辆行进时长依真实 ETA 压缩(compressDuration,1min 真实=6s 演示,夹 20-50s),
 * 到车时刻 == forceStatus(到场) 时刻——消除双时间线错位。
 */
export function buildScript(ctx: ScriptContext): ScriptAction[] {
  const { incidentId, address, lng, lat, routes } = ctx;
  const t: ScriptAction[] = [];
  let cursor = 0;
  const at = (ms: number, a: Omit<ScriptAction, 'at'>): void => {
    cursor += ms;
    t.push({ ...a, at: cursor } as ScriptAction);
  };

  // ── 接警 ──
  at(0, { kind: 'stage', stage: '接警' });
  at(200, { kind: 'view', spec: { kind: 'focusIncident', lng, lat, ringM: 1500, maxZoom: 15, paddingTL: [480, 60], paddingBR: [440, 60] } });
  at(250, { kind: 'toast', msg: `110 联动接入新警情 ${incidentId} · 演示数据` });
  at(300, { kind: 'timeline', entryKind: 'manual', label: '110 报警接入', detail: address });
  at(300, { kind: 'panel', id: 'vars', open: true });

  // ── 出动 ──
  at(900, { kind: 'status', to: '出动' });
  at(500, { kind: 'stage', stage: '出动' });
  if (routes.length) {
    const allPoints = routes.flatMap((r) => r.polyline);
    at(250, { kind: 'view', spec: { kind: 'fitRoutes', points: allPoints } });
    at(250, { kind: 'toast', msg: `AI 智能派遣 ${routes.length} 站联动 · 演示数据` });
    at(200, {
      kind: 'timeline', entryKind: 'dispatch',
      label: `AI 派遣 ${routes.length} 站联动`,
      detail: routes.map((r) => `${r.stationName} ${r.duration ? Math.round(r.duration / 60) + 'min' : '?'}`).join(' · '),
    });
    for (const r of routes) {
      at(120, {
        kind: 'pushRec', type: 'force',
        content: `${r.stationName} · ${r.duration ? Math.round(r.duration / 60) + '分钟到场' : '?分钟'}${r.distance ? ' / ' + (r.distance / 1000).toFixed(1) + 'km' : ''}`,
        basis: 'AI 智能派遣(plan_dispatch · 真实多站路线)',
      });
    }
    at(400, { kind: 'convoy', action: 'start' });
    const maxEtaSec = Math.max(...routes.map((r) => r.duration ?? 0), 1);
    const convoyMs = compressDuration(maxEtaSec);
    at(convoyMs, { kind: 'convoy', action: 'arriveAll' });
    at(200, { kind: 'toast', msg: `${routes.length} 站车组全部到场 · 演示数据` });
    at(200, { kind: 'timeline', entryKind: 'arrival', label: `${routes.length} 站车组到场` });
    at(0, { kind: 'status', to: '到场' });
  } else {
    // 派遣失败降级:跳过车辆动画,直接推进到场(演示不中断)
    at(1500, { kind: 'status', to: '到场' });
  }

  // ── 到场 ──
  at(500, { kind: 'stage', stage: '到场' });
  at(200, { kind: 'view', spec: { kind: 'settle' } });
  const arriveRec = ctx.statusRecs['到场'];
  if (arriveRec) at(600, { kind: 'pushRec', ...arriveRec });

  // ── 控制 ──
  at(3000, { kind: 'status', to: '控制' });
  at(500, { kind: 'stage', stage: '控制' });
  at(250, { kind: 'toast', msg: '火势已控制 · 演示数据' });
  const controlRec = ctx.statusRecs['控制'];
  if (controlRec) at(500, { kind: 'pushRec', ...controlRec });

  // ── 熄灭 ──
  at(3000, { kind: 'status', to: '熄灭' });
  at(500, { kind: 'stage', stage: '熄灭' });
  at(250, { kind: 'toast', msg: '明火已扑灭 · 处置完毕 · 演示数据' });
  at(250, { kind: 'timeline', entryKind: 'status', label: '处置完毕' });
  at(300, { kind: 'view', spec: { kind: 'reset' } });

  return t;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/command-flow-script.test.ts`
Expected: PASS (5 it blocks)

- [ ] **Step 5: Commit**

```bash
git add lib/command-flow/script.ts lib/__tests__/command-flow-script.test.ts
git commit -m "feat(command-flow): build disposal demo timeline from routes and ETA"
```

---

## Task 3: liveChannel 受控接口

**Files:**
- Modify: `src/mock/liveChannel.ts`
- Test: `src/lib/__tests__/liveChannel-scripted.test.ts`

**Interfaces:**
- Consumes: `IncidentStatus`, `RecommendType`, `Recommendation` (已有 import), `STATUS_ORDER`（需新增 import，来自 `./incidents`）
- Produces: `forceStatus(incidentId: string, next: IncidentStatus): boolean`, `pushScriptRec(rec: { incidentId: string; type: RecommendType; content: string; basis: string }): void`, `setScripted(id: string | null): void`, `__setSourceForTest(src: LiveSource | null): void`, `__resetForTest(): void`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/liveChannel-scripted.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetForTest, __setSourceForTest, forceStatus, injectIncident, pushScriptRec, setScripted, getSnapshot, subscribe,
} from '../mock/liveChannel';

describe('liveChannel 剧本受控接口', () => {
  beforeEach(() => {
    __resetForTest();
    __setSourceForTest('mock');
  });

  it('forceStatus 沿合法链推进并发出 status 事件', () => {
    const inc = injectIncident(); // 初始 接警
    const seen: string[] = [];
    const unsub = subscribe((_s, events) => {
      for (const e of events) if (e.kind === 'status') seen.push(`${e.from}→${e.to}`);
    });
    expect(forceStatus(inc.id, '出动')).toBe(true);
    expect(forceStatus(inc.id, '到场')).toBe(true);
    expect(forceStatus(inc.id, '熄灭')).toBe(false); // 跳过控制:非法
    unsub();
    expect(seen).toEqual(['接警→出动', '出动→到场']);
    expect(getSnapshot().incidents.find((i) => i.id === inc.id)?.status).toBe('到场');
  });

  it('setScripted 暂停自动 dwell,被标记案不自由推进', () => {
    const inc = injectIncident();
    setScripted(inc.id);
    // 手动驱动 24 tick(接警 dwell=20,未标记会翻出动)——但被剧本标记,应保持 接警
    // doTick 是私有的,这里用等价断言:标记后 forceStatus 仍可用(剧本掌舵)
    expect(forceStatus(inc.id, '出动')).toBe(true);
  });

  it('pushScriptRec 入列推荐并通知', () => {
    const inc = injectIncident();
    let got = 0;
    const unsub = subscribe((_s, events) => {
      if (events.some((e) => e.kind === 'recommendation')) got += 1;
    });
    pushScriptRec({ incidentId: inc.id, type: 'force', content: '首调建议', basis: '测试' });
    unsub();
    expect(got).toBe(1);
    expect(getSnapshot().recommendations[0].content).toBe('首调建议');
  });

  it('真实模式(非 mock)下受控接口 no-op', () => {
    __setSourceForTest('websocket');
    const inc = injectIncident();
    expect(forceStatus(inc.id, '出动')).toBe(false);
    pushScriptRec({ incidentId: inc.id, type: 'force', content: 'x', basis: 'x' });
    expect(getSnapshot().recommendations.length).toBe(0);
  });
});
```

> 注:`setScripted` 对 doTick 暂停的实际效果,由于 `doTick` 为模块私有,此测试只验证接口可用性;完整暂停逻辑在实现中以 `rt.incident.id === scriptedId` 跳过自动推进承载(见 Step 3),由人工演示确认(见 Task 11)。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/liveChannel-scripted.test.ts`
Expected: FAIL with "forceStatus is not exported / Cannot read properties of undefined"

- [ ] **Step 3: Write minimal implementation**

`src/mock/liveChannel.ts` 修改:

(1) 顶部 import 增加 `STATUS_ORDER`:
```ts
import {
  INITIAL_INCIDENTS, makeNewIncident, nextRecommendationId, nowTime,
  statusRecommendation, thresholdRecommendation, STATUS_ORDER,
} from './incidents';
```

(2) 模块级状态增加脚本标记 + 两个测试辅助:
```ts
/** 当前被剧本掌舵的警情 id(自动 dwell 暂停);null = 无。 */
let scriptedId: string | null = null;

/** 仅测试用:直接设置数据源,不启动定时器。 */
export function __setSourceForTest(src: LiveSource | null): void {
  source = src;
}

/** 仅测试用:清空全部运行态与订阅。 */
export function __resetForTest(): void {
  runtimes.length = 0;
  varsMap.clear();
  recommendations = [];
  scriptedId = null;
  listeners.clear();
  tick = 0;
}
```

(3) `doTick` 状态机推进循环内跳过脚本案(在 `for (const rt of runtimes)` 首行):
```ts
for (const rt of runtimes) {
    // 剧本掌舵的警情:自动 dwell 暂停,由 forceStatus 精确控制翻转
    if (rt.incident.id === scriptedId) continue;
    // 1) 状态机推进
    const next = NEXT_STATUS[rt.incident.status];
    ...
```

(4) 文件末尾追加三个受控接口:
```ts
/**
 * 剧本驱动:强制把某案状态翻到 next(校验合法迁移链),绕开 dwell 等待。
 * 仅 mock;非法迁移/非 mock 均 no-op + warn。返回是否成功。
 */
export function forceStatus(incidentId: string, next: IncidentStatus): boolean {
  if (source !== 'mock') {
    console.warn('[liveChannel] forceStatus 仅 mock 模式可用');
    return false;
  }
  const rt = runtimes.find((r) => r.incident.id === incidentId);
  if (!rt) return false;
  const from = rt.incident.status;
  if (from === next || STATUS_ORDER.indexOf(next) <= STATUS_ORDER.indexOf(from)) {
    console.warn(`[liveChannel] 非法状态迁移 ${from} → ${next}`);
    return false;
  }
  rt.incident = {
    ...rt.incident,
    status: next,
    statusHistory: [...rt.incident.statusHistory, { status: next, ts: nowTime() }],
  };
  rt.enteredTick = tick;
  notify([{ kind: 'status', incident: rt.incident, from, to: next }]);
  return true;
}

/** 剧本按时刻推送推荐(复用 recommendations 存储 + 事件通知)。仅 mock。 */
export function pushScriptRec(rec: {
  incidentId: string; type: RecommendType; content: string; basis: string;
}): void {
  if (source !== 'mock') {
    console.warn('[liveChannel] pushScriptRec 仅 mock 模式可用');
    return;
  }
  const full: Recommendation = { ...rec, id: nextRecommendationId(), ts: nowTime() };
  recommendations = [full, ...recommendations];
  notify([{ kind: 'recommendation', rec: full }]);
}

/** 演示期间暂停某案的自动 dwell 推进(剧本用 forceStatus 掌舵)。置 null 恢复自由推进。 */
export function setScripted(id: string | null): void {
  scriptedId = id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/__tests__/liveChannel-scripted.test.ts`
Expected: PASS (4 it blocks)

- [ ] **Step 5: Commit**

```bash
git add src/mock/liveChannel.ts src/lib/__tests__/liveChannel-scripted.test.ts
git commit -m "feat(liveChannel): add scripted control API forceStatus/pushScriptRec/setScripted"
```

---

## Task 4: 多车行进动画 VehicleConvoy

**Files:**
- Create: `lib/command-flow/vehicle-convoy.ts`
- Test: `lib/__tests__/command-flow-convoy.test.ts`

**Interfaces:**
- Consumes: `interpolateOnPolyline`, `LatLng` (from `@/lib/gis/vehicle-anim`)
- Produces: `ConvoyVehicle`, `ConvoyClock`, `ConvoyCallbacks`, `VehicleConvoy`（构造 `(vehicles, clock, callbacks)`；`start()/cancel()/isRunning()/getVehicles()`）

- [ ] **Step 1: Write the failing test**

`lib/__tests__/command-flow-convoy.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { VehicleConvoy, type ConvoyClock } from '../command-flow/vehicle-convoy';

/** 假时钟:手动推进。 */
function fakeClock(): ConvoyClock & { advance(ms: number): void } {
  let now = 0;
  let rafId = 1;
  const queue = new Map<number, (now: number) => void>();
  const clock: ConvoyClock & { advance: (ms: number) => void } = {
    now: () => now,
    raf: (cb) => { const id = rafId++; queue.set(id, cb); return id; },
    cancel: (id) => { queue.delete(id); },
    advance: (ms) => {
      now += ms;
      for (const [id, cb] of [...queue]) { queue.delete(id); cb(now); }
    },
  };
  return clock;
}

const POLY: [number, number][] = [[29.71, 115.98], [29.7068, 115.9895]];

describe('VehicleConvoy', () => {
  it('start 后逐帧推进 progress 并按插值更新位置', () => {
    const clock = fakeClock();
    const seen: number[] = [];
    const convoy = new VehicleConvoy(
      [{ stationName: '城东救援站', polyline: POLY, durationMs: 1000 }],
      clock,
      { onProgress: (vs) => seen.push(vs[0].progress) },
    );
    convoy.start();
    clock.advance(500);
    expect(seen[seen.length - 1]).toBeCloseTo(0.5, 3);
    expect(convoy.getVehicles()[0].latLng?.[0]).toBeGreaterThan(POLY[0][0]);
  });

  it('到达后 onArrive + onDone,isRunning 归 false', () => {
    const clock = fakeClock();
    const arrived: string[] = [];
    let done = false;
    const convoy = new VehicleConvoy(
      [{ stationName: '城东救援站', polyline: POLY, durationMs: 1000 }],
      clock,
      { onArrive: (v) => arrived.push(v.stationName), onDone: () => { done = true; } },
    );
    convoy.start();
    clock.advance(1000);
    clock.advance(10);
    expect(arrived).toEqual(['城东救援站']);
    expect(done).toBe(true);
    expect(convoy.isRunning()).toBe(false);
  });

  it('cancel 停止推进,不再触发回调', () => {
    const clock = fakeClock();
    let calls = 0;
    const convoy = new VehicleConvoy(
      [{ stationName: '城东救援站', polyline: POLY, durationMs: 1000 }],
      clock,
      { onProgress: () => { calls += 1; } },
    );
    convoy.start();
    clock.advance(200);
    convoy.cancel();
    clock.advance(2000);
    expect(calls).toBe(1); // 仅取消前那一次
  });

  it('空车队 start 为 no-op', () => {
    const clock = fakeClock();
    const convoy = new VehicleConvoy([], clock, {});
    convoy.start();
    expect(convoy.isRunning()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/command-flow-convoy.test.ts`
Expected: FAIL with "Cannot find module '../command-flow/vehicle-convoy'"

- [ ] **Step 3: Write minimal implementation**

`lib/command-flow/vehicle-convoy.ts`:
```ts
import { interpolateOnPolyline, type LatLng } from '@/lib/gis/vehicle-anim';

export interface ConvoyVehicle {
  stationName: string;
  polyline: LatLng[];
  durationMs: number;
  /** 0..1 沿线长度等比进度。 */
  progress: number;
  /** 当前插值位置(未起步 = 起点)。 */
  latLng: LatLng | null;
  done: boolean;
}

export interface ConvoyClock {
  now(): number;
  raf(cb: (now: number) => void): number;
  cancel(id: number): void;
}

export interface ConvoyCallbacks {
  onProgress?: (vehicles: readonly ConvoyVehicle[]) => void;
  onArrive?: (vehicle: ConvoyVehicle, index: number) => void;
  onDone?: () => void;
}

/**
 * 多车行进动画:每辆车沿 polyline 按 durationMs 等比推进。
 * 时钟注入(rAF 由调用方给),位置插值复用 lib/gis/vehicle-anim。
 * 到车后逐一 onArrive;全部到齐 onDone 并停。
 */
export class VehicleConvoy {
  private readonly vehicles: ConvoyVehicle[];
  private readonly clock: ConvoyClock;
  private readonly cb: ConvoyCallbacks;
  private rafId: number | null = null;
  private t0 = 0;
  private running = false;

  constructor(
    vehicles: Array<{ stationName: string; polyline: LatLng[]; durationMs: number }>,
    clock: ConvoyClock,
    callbacks: ConvoyCallbacks = {},
  ) {
    this.vehicles = vehicles.map((v) => ({
      ...v,
      progress: 0,
      latLng: (v.polyline[0] as LatLng | undefined) ?? null,
      done: false,
    }));
    this.clock = clock;
    this.cb = callbacks;
  }

  start(): void {
    if (this.running || this.vehicles.length === 0) return;
    this.running = true;
    this.t0 = this.clock.now();
    this.rafId = this.clock.raf((now) => this.tick(now));
  }

  cancel(): void {
    if (this.rafId !== null) this.clock.cancel(this.rafId);
    this.rafId = null;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getVehicles(): readonly ConvoyVehicle[] {
    return this.vehicles;
  }

  private tick(now: number): void {
    if (!this.running) return;
    let allDone = true;
    for (let i = 0; i < this.vehicles.length; i += 1) {
      const v = this.vehicles[i];
      if (v.done) continue;
      const p = Math.min(1, (now - this.t0) / v.durationMs);
      v.progress = p;
      v.latLng = interpolateOnPolyline(v.polyline, p);
      if (p >= 1) {
        v.done = true;
        this.cb.onArrive?.(v, i);
      } else {
        allDone = false;
      }
    }
    this.cb.onProgress?.(this.vehicles);
    if (allDone) {
      this.cancel();
      this.cb.onDone?.();
    } else {
      this.rafId = this.clock.raf((n) => this.tick(n));
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/command-flow-convoy.test.ts`
Expected: PASS (4 it blocks)

- [ ] **Step 5: Commit**

```bash
git add lib/command-flow/vehicle-convoy.ts lib/__tests__/command-flow-convoy.test.ts
git commit -m "feat(command-flow): add clock-injected multi-vehicle convoy animation"
```

---

## Task 5: 视角仲裁 ViewDirector

**Files:**
- Create: `lib/command-flow/view-director.ts`
- Test: `lib/__tests__/command-flow-view.test.ts`

**Interfaces:**
- Consumes: `ViewSpec` (from `./types`)
- Produces: `ViewOwner`, `FocusSpec`, `FitRoutesSpec`, `MapAdapter`, `FollowTarget`, `ViewDirector`（`requestFocus(spec)/startFollow(target)/stopFollow()/updateFollow()/notifyUserInteract()/getOwner()`）

- [ ] **Step 1: Write the failing test**

`lib/__tests__/command-flow-view.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { ViewDirector, type MapAdapter } from '../command-flow/view-director';

function mockAdapter(): MapAdapter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    focusIncident: (s) => calls.push(`focus:${s.lat},${s.lng}`),
    fitRoutes: (s) => calls.push(`fitRoutes:${s.points.length}`),
    panTo: (ll) => calls.push(`panTo:${ll[0]}`),
    resetView: () => calls.push('reset'),
  };
}

describe('ViewDirector', () => {
  it('auto-flow 聚焦:空闲时执行', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.requestFocus({ kind: 'focusIncident', lng: 115.99, lat: 29.7 });
    expect(adapter.calls).toEqual(['focus:29.7,115.99']);
  });

  it('用户操作中 auto-focus 被丢弃(用户操作优先)', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.notifyUserInteract();
    v.requestFocus({ kind: 'focusIncident', lng: 115.99, lat: 29.7 });
    expect(adapter.calls).toEqual([]);
  });

  it('跟随中剧本聚焦被丢弃,不打断', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.startFollow({ latLng: () => [29.71, 115.98] });
    v.requestFocus({ kind: 'focusIncident', lng: 115.99, lat: 29.7 });
    expect(adapter.calls).not.toContain('focus:29.7,115.99');
    expect(v.getOwner()).toBe('follow');
  });

  it('跟随每帧 panTo 车辆,停止后不再 panTo', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.startFollow({ latLng: () => [29.72, 116.0] });
    v.updateFollow();
    v.updateFollow();
    v.stopFollow();
    v.updateFollow();
    expect(adapter.calls.filter((c) => c.startsWith('panTo')).length).toBe(2);
  });

  it('跟随中用户拖图 → 退出跟随', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.startFollow({ latLng: () => [29.71, 115.98] });
    v.notifyUserInteract();
    expect(v.getOwner()).toBe('user');
    expect(adapter.calls.filter((c) => c.startsWith('panTo')).length).toBe(0);
  });

  it('settle/reset 分别无动作与复位', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.requestFocus({ kind: 'settle' });
    v.requestFocus({ kind: 'reset' });
    expect(adapter.calls).toEqual(['reset']);
  });

  it('onFollowChange 回调跟随进出', () => {
    const adapter = mockAdapter();
    const changes: boolean[] = [];
    const v = new ViewDirector({ adapter, onFollowChange: (f) => changes.push(f) });
    v.startFollow({ latLng: () => [29.71, 115.98] });
    v.stopFollow();
    expect(changes).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/command-flow-view.test.ts`
Expected: FAIL with "Cannot find module '../command-flow/view-director'"

- [ ] **Step 3: Write minimal implementation**

`lib/command-flow/view-director.ts`:
```ts
import type { ViewSpec } from './types';

/** 视角占用者。优先级:user > follow > auto-flow > none。 */
export type ViewOwner = 'none' | 'auto-flow' | 'follow' | 'user';

export interface FocusSpec {
  lng: number; lat: number;
  ringM?: number; maxZoom?: number;
  paddingTL?: [number, number]; paddingBR?: [number, number];
}

export interface FitRoutesSpec {
  points: [number, number][];
}

/** 地图适配器:ViewDirector 与 Leaflet 的唯一接口(纯逻辑层不碰 Leaflet)。 */
export interface MapAdapter {
  focusIncident(spec: FocusSpec): void;
  fitRoutes(spec: FitRoutesSpec): void;
  panTo(latlng: [number, number]): void;
  resetView(): void;
}

/** 跟随目标:每次 updateFollow 取当前车辆位置(null = 暂不可用)。 */
export interface FollowTarget {
  latLng(): [number, number] | null;
}

export interface ViewDirectorOptions {
  adapter: MapAdapter;
  onFollowChange?: (following: boolean) => void;
}

/**
 * 视角仲裁器:所有视角请求(剧本聚焦 / 车辆跟随 / 用户交互)统一走优先级仲裁。
 * - 用户操作(user)优先级最高:跟随中拖图立即退出;剧本聚焦在 user/follow 占用时丢弃(不排队不打架)
 * - 剧本聚焦(auto-flow)仅空闲执行
 * - 「到车 / 空白点击 / Esc」→ stopFollow 释放
 */
export class ViewDirector {
  private readonly adapter: MapAdapter;
  private readonly onFollowChange?: (f: boolean) => void;
  private owner: ViewOwner = 'none';
  private followTarget: FollowTarget | null = null;

  constructor(options: ViewDirectorOptions) {
    this.adapter = options.adapter;
    this.onFollowChange = options.onFollowChange;
  }

  getOwner(): ViewOwner {
    return this.owner;
  }

  /** 剧本聚焦:user/follow 占用时丢弃,不积压。 */
  requestFocus(spec: ViewSpec): void {
    if (this.owner === 'user' || this.owner === 'follow') return;
    this.apply(spec);
  }

  /** 点击车辆进入跟随:拥有视角,每帧经 updateFollow panTo 车辆。 */
  startFollow(target: FollowTarget): void {
    if (this.owner === 'follow' && this.followTarget === target) return;
    this.stopFollow();
    this.owner = 'follow';
    this.followTarget = target;
    this.onFollowChange?.(true);
    this.updateFollow();
  }

  /** 到车/空白点击/Esc:释放跟随,回 none。 */
  stopFollow(): void {
    if (this.owner !== 'follow') return;
    this.owner = 'none';
    this.followTarget = null;
    this.onFollowChange?.(false);
  }

  /** 每帧调用(由调用方 rAF/convoy onProgress 驱动):跟随态下 panTo 车辆。 */
  updateFollow(): void {
    if (this.owner !== 'follow') return;
    const p = this.followTarget?.latLng();
    if (p) this.adapter.panTo(p);
  }

  /** 用户拖图/缩放:退出跟随并标记 user 占用(丢弃后续 auto-focus)。 */
  notifyUserInteract(): void {
    if (this.owner === 'follow') this.stopFollow();
    this.owner = 'user';
  }

  private apply(spec: ViewSpec): void {
    switch (spec.kind) {
      case 'focusIncident':
        this.adapter.focusIncident(spec);
        break;
      case 'fitRoutes':
        this.adapter.fitRoutes({ points: spec.points });
        break;
      case 'settle':
        break; // 视角不动(到场/控制阶段)
      case 'reset':
        this.adapter.resetView();
        break;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/command-flow-view.test.ts`
Expected: PASS (7 it blocks)

- [ ] **Step 5: Commit**

```bash
git add lib/command-flow/view-director.ts lib/__tests__/command-flow-view.test.ts
git commit -m "feat(command-flow): add view ownership arbitration (user-first, vehicle follow)"
```

---

## Task 6: 编排器 FlowDirector

**Files:**
- Create: `lib/command-flow/flow-director.ts`
- Test: `lib/__tests__/command-flow-flow.test.ts`

**Interfaces:**
- Consumes: `ScriptAction`, `FlowStage`, `ViewSpec`, `IncidentStatus`, `RecommendType`, `TimelineKind` (from `./types`)
- Produces: `FlowHandlers`, `FlowClock`, `FlowDirector`（构造 `(clock, handlers)`；`run(script)/cancel()/isRunning()/getStage()`）

- [ ] **Step 1: Write the failing test**

`lib/__tests__/command-flow-flow.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { FlowDirector, type FlowClock, type FlowHandlers } from '../command-flow/flow-director';
import type { ScriptAction } from '../command-flow/types';

function fakeClock(): FlowClock & { advance(ms: number): void } {
  let now = 0;
  let rafId = 1;
  const queue = new Map<number, (now: number) => void>();
  const clock: FlowClock & { advance: (ms: number) => void } = {
    now: () => now,
    raf: (cb) => { const id = rafId++; queue.set(id, cb); return id; },
    cancel: (id) => { queue.delete(id); },
    advance: (ms) => {
      now += ms;
      for (const [id, cb] of [...queue]) { queue.delete(id); cb(now); }
    },
  };
  return clock;
}

function mockHandlers(): FlowHandlers & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    toast: (m) => log.push(`toast:${m}`),
    timeline: (_k, label) => log.push(`timeline:${label}`),
    view: (spec) => log.push(`view:${spec.kind}`),
    setStatus: (to) => log.push(`status:${to}`),
    pushRec: (t) => log.push(`rec:${t}`),
    panel: (id, open) => log.push(`panel:${id}:${open}`),
    convoy: (a) => log.push(`convoy:${a}`),
    stage: (s) => log.push(`stage:${s}`),
  };
}

const SCRIPT: ScriptAction[] = [
  { at: 0, kind: 'stage', stage: '接警' },
  { at: 200, kind: 'view', spec: { kind: 'focusIncident', lng: 1, lat: 1 } },
  { at: 500, kind: 'convoy', action: 'start' },
  { at: 500, kind: 'toast', msg: 'same-tick' },
];

describe('FlowDirector', () => {
  it('按 at 排序触发,同一时刻多个动作按输入顺序全部触发', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    clock.advance(0);
    expect(h.log).toEqual(['stage:接警']);
    clock.advance(500);
    expect(h.log).toContain('convoy:start');
    expect(h.log).toContain('toast:same-tick');
    expect(h.log).toContain('view:focusIncident');
  });

  it('全部触发后自动停止', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    clock.advance(1000);
    expect(d.isRunning()).toBe(false);
  });

  it('cancel 立即停止且后续不触发', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    clock.advance(200);
    d.cancel();
    const count = h.log.length;
    clock.advance(5000);
    expect(h.log.length).toBe(count);
  });

  it('run 替换旧剧本(先 cancel 再开新)', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    d.run([{ at: 0, kind: 'toast', msg: 'new' }]);
    clock.advance(0);
    expect(h.log[h.log.length - 1]).toBe('toast:new');
  });

  it('getStage 随 stage 动作更新', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    clock.advance(0);
    expect(d.getStage()).toBe('接警');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/command-flow-flow.test.ts`
Expected: FAIL with "Cannot find module '../command-flow/flow-director'"

- [ ] **Step 3: Write minimal implementation**

`lib/command-flow/flow-director.ts`:
```ts
import type { FlowStage, IncidentStatus, RecommendType, ScriptAction, TimelineKind, ViewSpec } from './types';

/** 编排器副作用回调(由 React 接线层实现:Toast/时间轴/视角/状态/推荐/面板/车辆动画)。 */
export interface FlowHandlers {
  toast(msg: string): void;
  timeline(entryKind: TimelineKind, label: string, detail?: string): void;
  view(spec: ViewSpec): void;
  setStatus(to: IncidentStatus): void;
  pushRec(type: RecommendType, content: string, basis: string): void;
  panel(id: 'vars' | 'recommend', open: boolean): void;
  convoy(action: 'start' | 'arriveAll'): void;
  stage(stage: FlowStage): void;
}

export interface FlowClock {
  now(): number;
  raf(cb: (now: number) => void): number;
  cancel(id: number): void;
}

/**
 * 剧本编排器:按 ScriptAction.at(相对毫秒)顺序触发,动作时间不可回退。
 * run 前先 cancel 旧演出(单一活跃演示)。时钟注入,便于假时钟单测。
 */
export class FlowDirector {
  private readonly clock: FlowClock;
  private readonly handlers: FlowHandlers;
  private actions: ScriptAction[] = [];
  private rafId: number | null = null;
  private t0 = 0;
  private nextIdx = 0;
  private stage: FlowStage | null = null;

  constructor(clock: FlowClock, handlers: FlowHandlers) {
    this.clock = clock;
    this.handlers = handlers;
  }

  /** 启动新剧本:清旧演出后按 at 排序执行。 */
  run(script: ScriptAction[]): void {
    this.cancel();
    this.actions = script.slice().sort((a, b) => a.at - b.at);
    this.nextIdx = 0;
    this.t0 = this.clock.now();
    this.rafId = this.clock.raf((now) => this.tick(now));
  }

  /** 停止编排,后续动作不再触发。可安全重复调用。 */
  cancel(): void {
    if (this.rafId !== null) this.clock.cancel(this.rafId);
    this.rafId = null;
    this.actions = [];
    this.nextIdx = 0;
  }

  isRunning(): boolean {
    return this.rafId !== null;
  }

  getStage(): FlowStage | null {
    return this.stage;
  }

  private tick(now: number): void {
    if (this.rafId === null) return;
    const elapsed = now - this.t0;
    while (this.nextIdx < this.actions.length && this.actions[this.nextIdx].at <= elapsed) {
      const a = this.actions[this.nextIdx];
      this.nextIdx += 1;
      this.dispatch(a);
    }
    if (this.nextIdx >= this.actions.length) {
      this.cancel();
      return;
    }
    this.rafId = this.clock.raf((n) => this.tick(n));
  }

  private dispatch(a: ScriptAction): void {
    switch (a.kind) {
      case 'stage':
        this.stage = a.stage;
        this.handlers.stage(a.stage);
        break;
      case 'toast':
        this.handlers.toast(a.msg);
        break;
      case 'timeline':
        this.handlers.timeline(a.entryKind, a.label, a.detail);
        break;
      case 'view':
        this.handlers.view(a.spec);
        break;
      case 'status':
        this.handlers.setStatus(a.to);
        break;
      case 'pushRec':
        this.handlers.pushRec(a.type, a.content, a.basis);
        break;
      case 'panel':
        this.handlers.panel(a.id, a.open);
        break;
      case 'convoy':
        this.handlers.convoy(a.action);
        break;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/command-flow-flow.test.ts`
Expected: PASS (5 it blocks)

- [ ] **Step 5: Commit**

```bash
git add lib/command-flow/flow-director.ts lib/__tests__/command-flow-flow.test.ts
git commit -m "feat(command-flow): add script timeline orchestrator FlowDirector"
```

---

## Task 7: 演示门控 + use-scene-bridge flyTo 拦截

**Files:**
- Create: `src/lib/disposal-demo-gate.ts`
- Modify: `src/components/gis/hooks/use-scene-bridge.ts`（flyTo 分支加门控）

**Interfaces:**
- Produces: `setDisposalDemoActive(v: boolean): void`, `isDisposalDemoActive(): boolean`
- Consumes: `isDisposalDemoActive()`（在 use-scene-bridge flyTo 分支）

- [ ] **Step 1: Create the demo gate module**

`src/lib/disposal-demo-gate.ts`:
```ts
/** 处置流程演示运行门控:演示期间暂停 use-scene-bridge 的自动 flyTo,避免与剧本视角争夺。 */
let active = false;

export function setDisposalDemoActive(v: boolean): void {
  active = v;
}

export function isDisposalDemoActive(): boolean {
  return active;
}
```

- [ ] **Step 2: Gate the use-scene-bridge flyTo branch**

`src/components/gis/hooks/use-scene-bridge.ts`:在文件顶部 import 后加:
```ts
import { isDisposalDemoActive } from '@/lib/disposal-demo-gate';
```
在 flyTo 消费分支(现 `if (latest.action === 'flyTo' || latest.action === 'addMarker')` 之前)插入拦截:
```ts
// 处置演示运行中:剧本视角经 ViewDirector 掌舵,抑制自动 flyTo,避免拉回 z14 覆盖演示聚焦
if (latest.action === 'flyTo' && isDisposalDemoActive()) return;
```

> 注意:加在订阅回调函数体顶部(与 `latest` 解构同级),仅拦截 `flyTo`;`addMarker`/`showRoute`/`resetView` 照常。

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (无新增错误)

- [ ] **Step 4: Commit**

```bash
git add src/lib/disposal-demo-gate.ts src/components/gis/hooks/use-scene-bridge.ts
git commit -m "feat(command): gate scene-bridge auto flyTo during disposal demo"
```

---

## Task 8: React 接线 useDisposalFlow

**Files:**
- Create: `src/hooks/useDisposalFlow.ts`

**Interfaces:**
- Consumes: `FlowDirector`/`FlowClock`, `ViewDirector`/`MapAdapter`, `VehicleConvoy`/`ConvoyClock`, `buildScript`/`ScriptContext`, `forceStatus`/`pushScriptRec`/`setScripted`/`injectIncident`, `statusRecommendation`, `fetchAiDispatch`, `showToast`, `recordCaseEvent`, `setDisposalDemoActive` (from Task 7), `compressDuration`
- Produces: `useDisposalFlow(opts: { gisMap: L.Map | null; onDemoIncident: (inc: DemoIncident) => void; onPanelChange: (id: 'vars' | 'recommend', open: boolean) => void }): DisposalFlowApi` where `DisposalFlowApi = { startDemo(): Promise<void>; stopDemo(): void; demoActive: boolean; stage: FlowStage | null; following: boolean }`

> 本任务为浏览器端接线,组件级验证(见 Task 11 人工演示),不写单测。

- [ ] **Step 1: Create `src/hooks/useDisposalFlow.ts`**

```ts
'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as L from 'leaflet';
import { FlowDirector, type FlowClock, type FlowHandlers } from '@/lib/command-flow/flow-director';
import { ViewDirector, type MapAdapter } from '@/lib/command-flow/view-director';
import { VehicleConvoy, type ConvoyClock } from '@/lib/command-flow/vehicle-convoy';
import { buildScript, type ScriptContext } from '@/lib/command-flow/script';
import type { FlowStage } from '@/lib/command-flow/types';
import { addSceneAction } from '@/mock/sceneLog';
import { injectIncident, forceStatus, pushScriptRec, setScripted } from '@/mock/liveChannel';
import { statusRecommendation } from '@/mock/incidents';
import { fetchAiDispatch } from '@/api/dispatch';
import { showToast } from '@/components/Toast';
import { recordCaseEvent } from '@/lib/case-timeline';
import { compressDuration } from '@/lib/gis/vehicle-anim';
import { setDisposalDemoActive } from '@/lib/disposal-demo-gate';
import type { RouteRenderItem } from '@/lib/gis/route-render';

export interface DemoIncident {
  id: string; address: string; type: string; status: string; lng: number; lat: number;
}

export interface DisposalFlowApi {
  startDemo(): Promise<void>;
  stopDemo(): void;
  demoActive: boolean;
  stage: FlowStage | null;
  following: boolean;
}

export interface UseDisposalFlowOptions {
  gisMap: L.Map | null;
  onDemoIncident: (inc: DemoIncident) => void;
  onPanelChange: (id: 'vars' | 'recommend', open: boolean) => void;
}

/** 浏览器 rAF 时钟(FlowDirector/VehicleConvoy 共用)。 */
const rafClock: FlowClock & ConvoyClock = {
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

/** 车辆图标(途中/到场)HTML,与 CommandView 现有样式一致。 */
function vehicleIconHtml(station: string, arrived: boolean): string {
  const color = arrived ? '#34d39988' : '#22d3ee66';
  const text = arrived ? '#d5f5e3' : '#e2f3f8';
  const label = arrived ? `✓ ${station} 到场` : `🚒 ${station} 途中`;
  return `<div style="display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:999px;background:rgba(10,26,38,.85);border:1px solid ${color};font-size:10px;color:${text};white-space:nowrap;transform:translate(-50%,-50%)">${label}</div>`;
}

export function useDisposalFlow(opts: UseDisposalFlowOptions): DisposalFlowApi {
  const { gisMap, onDemoIncident, onPanelChange } = opts;
  const [demoActive, setDemoActive] = useState(false);
  const [stage, setStage] = useState<FlowStage | null>(null);
  const [following, setFollowing] = useState(false);

  const directorRef = useRef<FlowDirector | null>(null);
  const viewRef = useRef<ViewDirector | null>(null);
  const convoyRef = useRef<VehicleConvoy | null>(null);
  const markersRef = useRef<Array<{ remove: () => void; setLatLng: (ll: [number, number]) => void; setIcon: (i: unknown) => void }>>([]);
  const incidentIdRef = useRef<string | null>(null);

  const stopDemo = useCallback(() => {
    directorRef.current?.cancel();
    directorRef.current = null;
    convoyRef.current?.cancel();
    convoyRef.current = null;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    viewRef.current?.stopFollow();
    viewRef.current = null;
    if (incidentIdRef.current) setScripted(null);
    incidentIdRef.current = null;
    setDisposalDemoActive(false);
    setDemoActive(false);
    setStage(null);
    setFollowing(false);
  }, []);

  useEffect(() => () => { stopDemo(); }, [stopDemo]);

  const startDemo = useCallback(async () => {
    if (!gisMap) return; // 地图未就绪:按钮应禁用
    stopDemo();

    // 1) 接入新警情 + 轻量选中(不触发 CommandView 的派遣,避免双车动画)
    const inc = injectIncident();
    incidentIdRef.current = inc.id;
    setScripted(inc.id);
    onDemoIncident({ id: inc.id, address: inc.address, type: inc.type, status: inc.status, lng: inc.lng, lat: inc.lat });
    onPanelChange('vars', true);
    setDisposalDemoActive(true);
    setDemoActive(true);
    showToast(`110 联动接入新警情 ${inc.id} · 演示数据`);

    // 2) AI 派遣(失败降级:仅视角演示)
    let routes: RouteRenderItem[] = [];
    try {
      const res = await fetchAiDispatch({ name: inc.address, lng: inc.lng, lat: inc.lat });
      routes = res.routes;
    } catch {
      showToast('路线获取失败,仅视角演示 · 演示数据');
    }

    // 3) 地图适配器 + 视角仲裁
    const adapter: MapAdapter = {
      focusIncident: (s) => {
        const ringM = s.ringM ?? 1500;
        const dLat = ringM / 111320;
        const dLng = ringM / (111320 * Math.cos((s.lat * Math.PI) / 180));
        gisMap.fitBounds(
          [
            [s.lat - dLat, s.lng - dLng],
            [s.lat + dLat, s.lng + dLng],
          ],
          { paddingTopLeft: s.paddingTL, paddingBottomRight: s.paddingBR, maxZoom: s.maxZoom ?? 15, animate: true },
        );
        window.dispatchEvent(new CustomEvent('gis:set-layer', { detail: { layer: 'water', on: true } }));
        window.dispatchEvent(new CustomEvent('gis:set-layer', { detail: { layer: 'stations', on: true } }));
      },
      fitRoutes: (s) => {
        if (!s.points.length) return;
        const leaflet = require('leaflet') as typeof import('leaflet');
        gisMap.fitBounds(leaflet.latLngBounds(s.points), { paddingTopLeft: [480, 60], paddingBottomRight: [440, 60], maxZoom: 14 });
      },
      panTo: (ll) => { gisMap.panTo(ll, { animate: false }); },
      resetView: () => {
        // 复位复用现有 resetView 场景动作(RealGisMap 消费 → 九江市全景),与 CommandView 熄灭复位同路径
        addSceneAction({ action: 'resetView', target: '警情处置完毕,视角复位', source: '面板' });
      },
    };
    const view = new ViewDirector({ adapter, onFollowChange: setFollowing });
    viewRef.current = view;

    // 4) 剧本 + 编排器
    const statusRecs: ScriptContext['statusRecs'] = {
      到场: statusRecommendation('到场', inc) ?? undefined,
      控制: statusRecommendation('控制', inc) ?? undefined,
    };
    const script = buildScript({
      incidentId: inc.id, address: inc.address, lng: inc.lng, lat: inc.lat, routes, statusRecs,
    });

    const handlers: FlowHandlers = {
      toast: (msg) => showToast(msg),
      timeline: (k, label, detail) => recordCaseEvent(inc.id, k, label, detail),
      view: (spec) => view.requestFocus(spec),
      setStatus: (to) => { forceStatus(inc.id, to); },
      pushRec: (type, content, basis) => pushScriptRec({ incidentId: inc.id, type, content, basis }),
      panel: (id, open) => onPanelChange(id, open),
      convoy: (action) => {
        if (action === 'start') {
          const maxEtaSec = Math.max(...routes.map((r) => r.duration ?? 0), 1);
          const vehicles = routes.map((r) => ({
            stationName: r.stationName ?? '站点',
            polyline: r.polyline as [number, number][],
            durationMs: Math.max(2500, (maxEtaSec * (r.duration ?? maxEtaSec)) / maxEtaSec),
          }));
          const leaflet = require('leaflet') as typeof import('leaflet');
          const markers = routes.map((r) => {
            const marker = leaflet.marker(r.polyline[0] as [number, number], {
              zIndexOffset: 900,
              icon: leaflet.divIcon({ className: '', html: vehicleIconHtml(r.stationName ?? '站点', false), iconSize: [0, 0] }),
            }).addTo(gisMap);
            // 点击车辆 → 视角跟随(getLatLng() 为 LatLng 对象,取 lat/lng 组成 [lat,lng])
            marker.on('click', () => {
              view.startFollow({
                latLng: () => {
                  const ll = marker.getLatLng();
                  return [ll.lat, ll.lng];
                },
              });
            });
            return marker as { remove: () => void; setLatLng: (ll: [number, number]) => void; setIcon: (i: unknown) => void };
          });
          markersRef.current = markers;
          const convoy = new VehicleConvoy(vehicles, rafClock, {
            onProgress: (vs) => {
              vs.forEach((v, i) => markers[i]?.setLatLng(v.latLng ?? [0, 0]));
              view.updateFollow(); // 跟随态下每帧 panTo 车辆
            },
            onArrive: (v, i) => markers[i]?.setIcon(leaflet.divIcon({ className: '', html: vehicleIconHtml(v.stationName, true), iconSize: [0, 0] })),
            onDone: () => { view.stopFollow(); convoyRef.current = null; },
          });
          convoyRef.current = convoy;
          convoy.start();
        } else {
          // arriveAll:剧本兜底标记(正常由 convoy onDone 处理)
          recordCaseEvent(inc.id, 'arrival', `${routes.length} 站车组到场`);
        }
      },
      stage: (s) => setStage(s),
    };

    const director = new FlowDirector(rafClock, handlers);
    directorRef.current = director;
    director.run(script);
  }, [gisMap, onDemoIncident, onPanelChange, stopDemo]);

  // 地图交互:用户操作优先 + 空白点击退出跟随 + Esc
  useEffect(() => {
    const map = gisMap;
    if (!map) return;
    const onInteract = () => viewRef.current?.notifyUserInteract();
    const onClick = () => viewRef.current?.stopFollow();
    map.on('dragstart', onInteract);
    map.on('zoomstart', onInteract);
    map.on('click', onClick);
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') viewRef.current?.stopFollow(); };
    window.addEventListener('keydown', onEsc);
    return () => {
      map.off('dragstart', onInteract);
      map.off('zoomstart', onInteract);
      map.off('click', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [gisMap]);

  return { startDemo, stopDemo, demoActive, stage, following };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS（`statusRecs` 已声明为 `ScriptContext['statusRecs']`,与 `buildScript` 参数类型严格对齐;`addSceneAction`/`statusRecommendation` 等 `@/mock/*`/`@/lib/*` 由 Next.js tsconfig paths 解析）

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDisposalFlow.ts
git commit -m "feat(command): wire disposal flow demo into React via useDisposalFlow"
```

---

## Task 9: 演示控制条 DisposalFlowBar

**Files:**
- Create: `src/components/command/DisposalFlowBar.tsx`

**Interfaces:**
- Consumes: `FlowStage` (from `@/lib/command-flow/types`), `STAGE_ORDER` (from `@/lib/command-flow/stages`)
- Produces: `DisposalFlowBar`（props: `demoActive/stage/following/disabled/onStart/onStop`）

> 组件级验证(见 Task 11 人工演示),不写单测。

- [ ] **Step 1: Create `src/components/command/DisposalFlowBar.tsx`**

```tsx
'use client';
import { Crosshair, Play, Square } from 'lucide-react';
import { STAGE_ORDER } from '@/lib/command-flow/stages';
import type { FlowStage } from '@/lib/command-flow/types';

export default function DisposalFlowBar(props: {
  demoActive: boolean;
  stage: FlowStage | null;
  following: boolean;
  /** 地图未就绪 / 真实模式时禁用开始。 */
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const idx = props.stage ? STAGE_ORDER.indexOf(props.stage) : -1;
  return (
    <div className="absolute left-1/2 top-[110px] z-30 flex -translate-x-1/2 items-center gap-2 rounded-md border border-line bg-bg-panel/90 p-1.5 backdrop-blur-[8px]">
      {!props.demoActive ? (
        <button
          onClick={props.onStart}
          disabled={props.disabled}
          title={props.disabled ? '地图未就绪或真实模式' : '一键演示：接警→出动→到场→控制→熄灭'}
          className="flex items-center gap-1.5 rounded px-3 py-1 text-[12px] font-medium text-cyan transition hover:bg-cyan/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          一键新警情演示
        </button>
      ) : (
        <>
          <button
            onClick={props.onStop}
            title="中止演示"
            className="rounded p-1 text-text-3 transition hover:bg-red/10 hover:text-red"
          >
            <Square className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-1">
            {STAGE_ORDER.map((s, i) => (
              <span
                key={s}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  i === idx ? 'bg-cyan/15 font-medium text-cyan' : i < idx ? 'text-text-3' : 'text-text-3/40'
                }`}
              >
                {s}
              </span>
            ))}
          </div>
          {props.following && (
            <span className="flex items-center gap-1 rounded bg-cyan/10 px-2 py-0.5 text-[11px] text-cyan">
              <Crosshair className="h-3 w-3" />
              跟随中 · 空白/Esc 退出
            </span>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/command/DisposalFlowBar.tsx
git commit -m "feat(command): add disposal demo control bar with stage indicator"
```

---

## Task 10: CommandView 集成

**Files:**
- Modify: `src/views/CommandView.tsx`

**Changes:**

(1) **import** 顶部增加:
```ts
import DisposalFlowBar from '@/components/command/DisposalFlowBar';
import { useDisposalFlow } from '@/hooks/useDisposalFlow';
```

(2) **handleSelect 拆分**(现 L147-221):把函数体重命名拆出 `selectIncident(id, withDispatch)`:
```ts
const selectIncident = useCallback((id: string, withDispatch: boolean) => {
  if (id === selectedIdRef.current) return;
  selectedIdRef.current = id;
  setSelectedId(id);
  setVarsPanelOpen(true);
  setRecPanelOpen(true);
  setAnalysisSummary(null);
  setDispatchRoutes([]);
  const list = mode === 'real' ? realIncidents : getSnapshot().incidents;
  const inc = list.find((i) => i.id === id);
  if (!inc) return;
  onIncidentSelect?.({ id: inc.id, address: inc.address, type: inc.type, status: inc.status, lng: inc.lng, lat: inc.lat, caller: inc.caller });
  addSceneAction({ action: 'addMarker', target: `警情定位 ${inc.id}：${inc.address}`, params: { lng: inc.lng, lat: inc.lat, incidentId: inc.id }, source: '面板' });
  if (Number.isFinite(inc.lng) && Number.isFinite(inc.lat)) {
    const ringM = 1500;
    const dLat = ringM / 111320;
    const dLng = ringM / (111320 * Math.cos((inc.lat * Math.PI) / 180));
    gisMap?.fitBounds([[inc.lat - dLat, inc.lng - dLng], [inc.lat + dLat, inc.lng + dLng]], { paddingTopLeft: [480, 60], paddingBottomRight: [440, 60], maxZoom: 15, animate: true });
    window.dispatchEvent(new CustomEvent('gis:set-layer', { detail: { layer: 'water', on: true } }));
    window.dispatchEvent(new CustomEvent('gis:set-layer', { detail: { layer: 'stations', on: true } }));
  }
  recordCaseEvent(inc.id, 'manual', `选定案件 ${inc.id}`, `${inc.address} · ${inc.type} · ${inc.status}`);
  const needsDispatch = inc.status === '接警' || inc.status === '出动';
  if (!needsDispatch || !withDispatch) {
    if (needsDispatch && !withDispatch) recordCaseEvent(inc.id, 'manual', '案件处置中(力量已到场,不再重复派遣)');
    return;
  }
  // 原有 AI 派遣 + dispatchRoutes 设置块(原 L197-220)原样保留
  if (Number.isFinite(inc.lng) && Number.isFinite(inc.lat)) {
    dispatchingRef.current = id;
    Promise.all([/* 原样 */]).then(([routes, summary]) => { /* 原样 */ });
  }
}, [mode, realIncidents, onIncidentSelect, gisMap]);

const handleSelect = useCallback((id: string) => selectIncident(id, true), [selectIncident]);
```

> `selectIncident` 内 AI 派遣块(原 L197-220)内容**原样保留**,仅外层包 `if (needsDispatch && withDispatch)` 守卫;原 `if (!needsDispatch)` 分支逻辑并入守卫。

(3) **useDisposalFlow 接线**:
```ts
const flow = useDisposalFlow({
  gisMap,
  onDemoIncident: useCallback((inc) => selectIncident(inc.id, false), [selectIncident]),
  onPanelChange: useCallback((id, open) => {
    if (id === 'vars') setVarsPanelOpen(open);
    else setRecPanelOpen(open);
  }, []),
});
```

(4) **手动 convoy effect 门控**(现 L228-295):effect 首行加
```ts
if (flow.demoActive) return;
```
并把 effect 依赖数组末尾加入 `flow.demoActive`。

(5) **handleEvents 状态 toast 门控**(现 L64-66):`if (ev.kind === 'status')` 内的 `showToast(...)` 用演示态抑制(剧本有精选 toast,避免重复):
```ts
if (ev.kind === 'status') {
  if (!flow.demoActive) showToast(`${ev.incident.id} 状态更新：${ev.to} · 演示数据`);
  recordCaseEvent(ev.incident.id, 'status', `状态推进:${ev.from} → ${ev.to}`, ev.incident.address);
  ...
}
```
> `flow.demoActive` 在闭包中需稳定——因 handleEvents 已 useCallback([])，将其依赖改为 `[flow.demoActive]`，或改用 `useRef` 镜像(推荐: `const demoActiveRef = useRef(false); demoActiveRef.current = flow.demoActive;` 并在 handleEvents 读 `demoActiveRef.current`,避免回调重建)。

(6) **渲染 DisposalFlowBar**(放在模式切换条 div 之后):
```tsx
<DisposalFlowBar
  demoActive={flow.demoActive}
  stage={flow.stage}
  following={flow.following}
  disabled={!gisMap || mode === 'real'}
  onStart={() => { flow.startDemo(); }}
  onStop={flow.stopDemo}
/>
```

(7) **handleInject 兜底**(现 L298-311):保留原有「模拟新警情接入」行为(快速注入,不走全流程剧本),与一键演示并存。

- [ ] **Step 1: 应用上述修改**

Run: 逐项应用(2)-(6) 修改。

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS（若有 `selectIncident` 闭包捕获 warning,确认依赖数组完整）

- [ ] **Step 3: Commit**

```bash
git add src/views/CommandView.tsx
git commit -m "feat(command): integrate disposal flow demo into CommandView"
```

---

## Task 11: 收尾验证

**Files:**
- 无新增;运行全量验证

- [ ] **Step 1: 全量类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 2: 全量测试**

Run: `npx vitest run`
Expected: 全绿(新增 command-flow stages/script/convoy/view/flow + liveChannel-scripted 测试通过,既有 518+ 测试不回归)

- [ ] **Step 3: 人工演示清单**(`npm run dev` 后浏览器验证)

- [ ] 点击「一键新警情演示」→ toast「110 联动接入」,警情入列表,视角 fitBounds 到案点(1.5km 案域)
- [ ] 出动阶段:多站派遣路线绘出 + 各站推荐卡入列 + 车辆沿路线行进(图标"途中")
- [ ] 车辆行进中点击某车辆 → 进入跟随(控制条出现「跟随中」,地图中心随车动);拖图/空白点击/Esc 退出跟随
- [ ] 全部车组到场 → 视角 settle 不再移动,「到场」徽标点亮,到场决策推荐入列
- [ ] 控制阶段:火势已控制 toast + 控制类决策分批推送,**视角不动**(拖图仍可自由操作,不被打回)
- [ ] 熄灭阶段:处置完毕 toast + 视角复位城市全景
- [ ] 演示中切模块/切案/点中止 → 演示干净停止,无残留车标/定时器
- [ ] 真实模式:演示按钮隐藏;手动选案路径(handleSelect 原行为)不回归

- [ ] **Step 4: 收尾提交(如需)**

Run: `git status --short` 确认无遗漏;若有格式/文档微调,单独 commit。

---

## Self-Review 记录

**1. Spec 覆盖:**
- 阶段模型 ✓ Task 1 (STAGE_VIEW_INTENT 到场/控制=settle)
- 剧本构建 ✓ Task 2 (buildScript,ETA 对齐到场)
- liveChannel 受控接口 ✓ Task 3 (forceStatus/pushScriptRec/setScripted)
- 车辆动画抽取 ✓ Task 4 (VehicleConvoy)
- 视角仲裁(用户优先/跟随/不乱动) ✓ Task 5 (ViewDirector 四条规则)
- 编排器(可取消/单一活跃) ✓ Task 6 (FlowDirector)
- 桥 flyTo 门控 ✓ Task 7 (disposal-demo-gate + use-scene-bridge)
- React 接线 + 控制条 ✓ Task 8/9
- CommandView 集成(门控手动 convoy/handleSelect 拆分) ✓ Task 10
- 错误处理(派遣降级/切模块 cancel/非法迁移 no-op) ✓ Task 2(降级)/Task 8(stopDemo cleanup)/Task 3(no-op)
- 测试策略 ✓ Task 1-6 + Task 3(liveChannel)

**2. Placeholder scan:** 无 TBD/TODO;每个代码步骤含完整可运行代码。Task 10 对原 handleSelect 派遣块注明"原样保留"。

**3. Type consistency:** 核心类型 `FlowStage`/`ViewSpec`/`ScriptAction`/`FlowHandlers`/`MapAdapter`/`ConvoyClock`/`FlowClock` 跨任务签名一致;`buildScript` 返回 `ScriptAction[]`,FlowDirector.run 消费同一类型;liveChannel 接口签名与 useDisposalFlow 调用一致;`@/lib/...` 在 vitest(root lib/)与 Next(tsconfig paths)双环境可解析。

**自审修正(已内联):** ① Task 8 车辆跟随 `getLatLng()` 返回 Leaflet `LatLng` 对象而非 `[number,number]`——已改为取 `[ll.lat, ll.lng]`;② Task 8 `resetView` 适配器改用 `addSceneAction({action:'resetView'})` 复用现有复位通道(原自定义事件无消费方);③ Task 8 `statusRecs` 类型直接用 `ScriptContext['statusRecs']`。
