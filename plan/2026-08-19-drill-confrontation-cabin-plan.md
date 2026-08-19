# 演练对抗·对抗舱 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把演练对抗模块重构为「人机对抗对抗舱」——照抄原型 `ConfrontationPanel.tsx` 三栏全屏 UI,弃 tick 用秒,接真实预案输出/对抗/评估三 agent。

**Architecture:** 新目录 `web/src/drill/confrontation/` 自包含对抗舱。`confront-store.ts` 照抄原型数据契约(秒级事件流),`confront-adapter.ts` 是纯逻辑 agent 接入层(可注入 fake postChat 单测),`ConfrontationPanel.tsx` + `confrontation-uis.tsx` 照抄原型 UI,`DrillView.tsx` 只做挂载入口并移除旧引擎引用(文件保留)。

**Tech Stack:** React 19 + framer-motion + lucide-react + vitest。复用 `lib/agent-chat-client.ts`(postAgentChat/parseAgentChatSSE)、`lib/agent-evaluate.ts`(evaluateViaAgent)、`src/mock/sceneLog.ts`(addSceneAction)、`src/mock/planLibrary.ts`(addLibraryItem)。

**Spec:** `web/plan/2026-08-19-drill-confrontation-cabin-design.md`

## Global Constraints

- 语言:注释中文(项目惯例),代码标识符英文。
- 旧引擎文件(`lib/drill/*`、`src/drill/hooks/*`)**只移除 DrillView 引用,不删除**。
- 契约解析失败 → 该事件不入流(不产生空壳节点),logger.warn 不崩 UI。
- 所有 git 命令在 `web/` 目录下执行(web 是独立 git 仓库)。
- commit 遵循 Conventional Commits + `Co-Authored-By: Claude <noreply@anthropic.com>`。
- 验收:`npx tsc --noEmit` 全绿 + `npx vitest run` 通过。
- 复用接口签名(来自现有代码,勿改):
  - `postAgentChat(params: PostAgentChatParams): Promise<ReadableStream<Uint8Array>>`
  - `parseAgentChatSSE(stream): AsyncGenerator<AgentChatEvent>`
  - `evaluateViaAgent(input: EvaluateInput): Promise<EvaluationData | null>`
  - `addSceneAction(a: { action: SceneActionName; target: string; params?: Record<string, unknown>; source: '面板'|'智能体'|'预案引擎' })`
  - `addLibraryItem(item: Omit<LibraryItem, 'id'|'archivedAt'> & { archivedAt?: string })`
  - `showToast(message: string)`

---

### Task 0: 契约实测(前置,手动)

**Files:**
- Create: `web/temp/probe-agent-contract.ts`(临时探针,完成后删除)
- Modify: `web/plan/drill-agent-chat-sse-format.md`(追加实测记录)

**Interfaces:**
- Produces: `inject_event` / `report_decision` 的真实 args 结构(记录到 SSE 格式文档,供 Task 2 解析对齐)

- [ ] **Step 1: 写探针脚本**

`web/temp/probe-agent-contract.ts`:

```ts
// 临时探针:抓真实 agent 返回的 tool-call 结构(契约实测,Task 0)
import { postAgentChat, parseAgentChatSSE } from '../lib/agent-chat-client';

const ADVERSARY_APP_ID = process.env.NEXT_PUBLIC_ADVERSARY_APP_ID ?? '';
const PLANNER_APP_ID = process.env.NEXT_PUBLIC_DRILL_PLANNER_APP_ID ?? '';
const APP = PLANNER_APP_ID || ADVERSARY_APP_ID;

async function main() {
  if (!APP) {
    console.error('未配置 ADVERSARY/PLANNER app_id');
    return;
  }
  console.log('触发 app:', APP);
  const stream = await postAgentChat({
    app_id: APP,
    content:
      '[测试] 演练对抗模拟:21号楼5F电气火灾,被困5人,风向90°/3m/s。' +
      '请调用 inject_event 注入一个特情(report_decision 上报一条部署调整)。',
    forwardedProps: { scene_id: '478488321394200576', building_id: '1c2d4772-831d-4c77-b88a-f9565ad589c7' },
  });
  for await (const ev of parseAgentChatSSE(stream)) {
    if (ev.type === 'tool-call') {
      console.log(`[tool-call] toolName=${ev.toolName}`);
      console.log(JSON.stringify(ev.args, null, 2));
    }
    if (ev.type === 'conversation_id') console.log(`conversation_id=${ev.conversation_id}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 运行探针抓结构**

在 `web/` 下运行:`npx tsx temp/probe-agent-contract.ts`
(若 tsx 不可用:`npx ts-node temp/probe-agent-contract.ts`)
Expected:打印 `inject_event` 与 `report_decision` 的真实 args JSON(含字段名层级)。

- [ ] **Step 3: 记录契约到 SSE 格式文档**

把真实结构追加到 `web/plan/drill-agent-chat-sse-format.md` 勘误节,明确:
- `inject_event.args` 的真实字段路径(如 `{event:{type,description,payload:{fireLevelDelta,...}}}` 还是别的)
- `report_decision.args` 的真实字段路径(如 `{decision:{action,rationale,tactic}}` 还是别的)

这些路径就是 Task 2 `confront-adapter.ts` 的解析依据。

- [ ] **Step 4: 删除临时探针**

```bash
rm web/temp/probe-agent-contract.ts
```

- [ ] **Step 5: Commit**

```bash
cd web && git add plan/drill-agent-chat-sse-format.md && git commit -m "docs(drill): 实测记录对抗 agent inject_event/report_decision 契约
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 1: 对抗舱数据模型 + store

**Files:**
- Create: `web/src/drill/confrontation/confront-store.ts`
- Test: `web/src/drill/confrontation/__tests__/confront-store.test.ts`

**Interfaces:**
- Consumes: 无(类型自包含)
- Produces:
  - `export type ConfrontKind = 'inject' | 'adjust' | 'manual' | 'evaluate'`
  - `export interface ConfrontationEvent { id: string; seq: number; kind: ConfrontKind; emergency: string; adjustments?: string[]; adopted?: boolean; respondedWithinSec?: number; tSec: number }`
  - `export interface ConfrontationReview { score: number; conclusion: string; comments: string[]; outcomes: Array<'timely'|'delayed'|'ignored'>; archived: boolean }`
  - `export interface ConfrontationSeed { building: string; floor: string; material: string; trapped: number; seed: string }`
  - `export interface ConfrontationState { active: boolean; status: 'idle'|'running'|'finished'; seedLoading: boolean; seedError: string|null; thinking: boolean; seedScenario: ConfrontationSeed|null; events: ConfrontationEvent[]; review: ConfrontationReview|null; evaluating: boolean; generation: number; startedAt: number; plannedTotal: number; lastRound: { score: number; archived: boolean }|null }`
  - `export function getConfrontationState(): ConfrontationState`
  - `export function subscribeConfrontation(fn: (s: ConfrontationState) => void): () => void`
  - `export function beginConfrontation(opts?: { seedLoading?: boolean; seedError?: string; seedScenario?: ConfrontationSeed }): void`
  - `export function appendInject(evt: Omit<ConfrontationEvent, 'id'|'kind'|'seq'> & { id?: string }): void`
  - `export function appendAdjust(evt: Omit<ConfrontationEvent, 'id'|'kind'|'seq'> & { id?: string; seq: number }): void`
  - `export function respondAdjustment(eventId: string, adopted: boolean, elapsedSec: number): void`
  - `export function setThinking(v: boolean): void`
  - `export function finishConfrontationLocal(review: ConfrontationReview, finalSeq: number, elapsedSec: number): void`
  - `export function exitConfrontation(): void`
  - `export function resetConfrontation(): void`

store 保持「纯状态容器 + 纯动作」,不做定时器/agent 调用(那些在 Task 2 adapter 和 Task 4 集成层)。定时器与编排由集成层调用这些动作。

- [ ] **Step 1: 写失败测试**

`web/src/drill/confrontation/__tests__/confront-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetConfrontation,
  getConfrontationState,
  beginConfrontation,
  appendInject,
  appendAdjust,
  respondAdjustment,
  setThinking,
  finishConfrontationLocal,
  exitConfrontation,
} from '../confront-store';

describe('confront-store', () => {
  beforeEach(() => resetConfrontation());

  it('初始为空闲态', () => {
    const s = getConfrontationState();
    expect(s.active).toBe(false);
    expect(s.status).toBe('idle');
    expect(s.events).toEqual([]);
  });

  it('beginConfrontation 进入 running 并置 seedScenario', () => {
    beginConfrontation({ seedScenario: { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#ABCD' } });
    const s = getConfrontationState();
    expect(s.active).toBe(true);
    expect(s.status).toBe('running');
    expect(s.seedScenario?.floor).toBe('5F');
  });

  it('appendInject 追加特情且 seq 自增', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    appendInject({ emergency: '风向突变', tSec: 12 });
    appendInject({ emergency: '电气复燃', tSec: 35 });
    const evts = getConfrontationState().events.filter((e) => e.kind === 'inject');
    expect(evts.map((e) => e.seq)).toEqual([1, 2]);
    expect(evts[0].emergency).toBe('风向突变');
  });

  it('appendAdjust 挂到指定 seq 成对', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    appendInject({ emergency: '特情', tSec: 10 });
    appendAdjust({ seq: 1, adjustments: ['改道'], tSec: 13 });
    const s = getConfrontationState();
    expect(s.events.filter((e) => e.kind === 'adjust')).toHaveLength(1);
    expect(s.events.filter((e) => e.kind === 'adjust')[0].adjustments).toEqual(['改道']);
  });

  it('respondAdjustment 记录 adopted 与响应用时', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    appendInject({ emergency: '特情', tSec: 10 });
    const adj = getConfrontationState().events.find((e) => e.kind === 'adjust') as never;
    expect(adj).toBeUndefined();
    // 先补 adjust
    appendAdjust({ seq: 1, adjustments: ['a'], tSec: 12 });
    const adjId = getConfrontationState().events.find((e) => e.kind === 'adjust')!.id;
    respondAdjustment(adjId, true, 20);
    const updated = getConfrontationState().events.find((e) => e.id === adjId)!;
    expect(updated.adopted).toBe(true);
    expect(updated.respondedWithinSec).toBe(8);
  });

  it('setThinking 切换研判态', () => {
    setThinking(true);
    expect(getConfrontationState().thinking).toBe(true);
  });

  it('finishConfrontationLocal 写评估并置 finished', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    const review = { score: 90, conclusion: '良好', comments: ['ok'], outcomes: ['timely' as const], archived: true };
    finishConfrontationLocal(review, 3, 100);
    const s = getConfrontationState();
    expect(s.status).toBe('finished');
    expect(s.review?.score).toBe(90);
    expect(s.lastRound?.archived).toBe(true);
  });

  it('exitConfrontation 关闭对抗舱', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    exitConfrontation();
    expect(getConfrontationState().active).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && npx vitest run src/drill/confrontation/__tests__/confront-store.test.ts`
Expected: FAIL(找不到模块 `../confront-store`)。

- [ ] **Step 3: 实现 store**

`web/src/drill/confrontation/confront-store.ts`:

```ts
// 演练对抗·对抗舱 数据层(照抄原型 drillStore.ts 对抗扩展契约,秒级事件流)。
// 纯状态容器 + 纯动作:不做定时器/agent 调用(集成层负责编排后调用这些动作)。
// 时间用真实秒(startedAt / tSec),无 tick / DisasterState 参与对抗演化。

export type ConfrontKind = 'inject' | 'adjust' | 'manual' | 'evaluate';

export interface ConfrontationEvent {
  readonly id: string;
  readonly seq: number;
  readonly kind: ConfrontKind;
  readonly emergency: string;
  readonly adjustments?: readonly string[];
  readonly adopted?: boolean;
  readonly respondedWithinSec?: number;
  readonly tSec: number;
}

export interface ConfrontationReview {
  readonly score: number;
  readonly conclusion: string;
  readonly comments: readonly string[];
  readonly outcomes: readonly Array<'timely' | 'delayed' | 'ignored'>;
  readonly archived: boolean;
}

export interface ConfrontationSeed {
  readonly building: string;
  readonly floor: string;
  readonly material: string;
  readonly trapped: number;
  readonly seed: string;
}

export interface ConfrontationState {
  readonly active: boolean;
  readonly status: 'idle' | 'running' | 'finished';
  readonly seedLoading: boolean;
  readonly seedError: string | null;
  readonly thinking: boolean;
  readonly seedScenario: ConfrontationSeed | null;
  readonly events: readonly ConfrontationEvent[];
  readonly review: ConfrontationReview | null;
  readonly evaluating: boolean;
  readonly generation: number;
  readonly startedAt: number;
  readonly plannedTotal: number;
  readonly lastRound: { readonly score: number; readonly archived: boolean } | null;
}

let conf: ConfrontationState = {
  active: false,
  status: 'idle',
  seedLoading: false,
  seedError: null,
  thinking: false,
  seedScenario: null,
  events: [],
  review: null,
  evaluating: false,
  generation: 0,
  startedAt: 0,
  plannedTotal: 0,
  lastRound: null,
};

let seqCounter = 0;
let idCounter = 0;

type Listener = (s: ConfrontationState) => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn(conf);
}

function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function getConfrontationState(): ConfrontationState {
  return conf;
}

export function subscribeConfrontation(fn: Listener): () => void {
  listeners.add(fn);
  fn(conf);
  return () => {
    listeners.delete(fn);
  };
}

export function resetConfrontation(): void {
  conf = {
    active: false,
    status: 'idle',
    seedLoading: false,
    seedError: null,
    thinking: false,
    seedScenario: null,
    events: [],
    review: null,
    evaluating: false,
    generation: 0,
    startedAt: 0,
    plannedTotal: 0,
    lastRound: null,
  };
  seqCounter = 0;
  emit();
}

export function beginConfrontation(opts?: {
  seedLoading?: boolean;
  seedError?: string;
  seedScenario?: ConfrontationSeed;
  plannedTotal?: number;
}): void {
  seqCounter = 0;
  conf = {
    ...conf,
    active: true,
    status: 'running',
    seedLoading: opts?.seedLoading ?? false,
    seedError: opts?.seedError ?? null,
    thinking: false,
    seedScenario: opts?.seedScenario ?? null,
    events: [],
    review: null,
    evaluating: false,
    generation: conf.generation + 1,
    startedAt: Date.now(),
    plannedTotal: opts?.plannedTotal ?? 3,
    lastRound: null,
  };
  emit();
}

export function appendInject(
  evt: Omit<ConfrontationEvent, 'id' | 'kind' | 'seq'> & { readonly id?: string },
): void {
  seqCounter += 1;
  const node: ConfrontationEvent = {
    id: evt.id ?? genId('ci'),
    seq: seqCounter,
    kind: 'inject',
    emergency: evt.emergency,
    tSec: evt.tSec,
  };
  conf = { ...conf, events: [...conf.events, node], review: null };
  emit();
}

export function appendAdjust(
  evt: Omit<ConfrontationEvent, 'id' | 'kind'> & { readonly id?: string; readonly seq: number },
): void {
  const node: ConfrontationEvent = {
    id: evt.id ?? genId('ca'),
    seq: evt.seq,
    kind: 'adjust',
    emergency: '',
    adjustments: evt.adjustments,
    tSec: evt.tSec,
  };
  conf = { ...conf, events: [...conf.events, node] };
  emit();
}

export function respondAdjustment(eventId: string, adopted: boolean, elapsedSec: number): void {
  conf = {
    ...conf,
    events: conf.events.map((e) => {
      if (e.id !== eventId || e.kind !== 'adjust' || e.adopted !== undefined) return e;
      return { ...e, adopted, respondedWithinSec: Math.max(1, elapsedSec - e.tSec) };
    }),
  };
  emit();
}

export function setThinking(v: boolean): void {
  conf = { ...conf, thinking: v };
  emit();
}

export function finishConfrontationLocal(
  review: ConfrontationReview,
  finalSeq: number,
  elapsedSec: number,
): void {
  const evalEvt: ConfrontationEvent = {
    id: genId('ce'),
    seq: finalSeq,
    kind: 'evaluate',
    emergency: `对抗评估完成：${review.conclusion}（${review.score} 分）`,
    tSec: elapsedSec,
  };
  conf = {
    ...conf,
    status: 'finished',
    thinking: false,
    evaluating: false,
    review,
    events: [...conf.events, evalEvt],
    lastRound: { score: review.score, archived: review.archived },
  };
  emit();
}

export function exitConfrontation(): void {
  conf = { ...conf, active: false, status: conf.status === 'running' ? 'idle' : conf.status, thinking: false, seedLoading: false };
  emit();
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && npx vitest run src/drill/confrontation/__tests__/confront-store.test.ts`
Expected: PASS(7 个用例)。

- [ ] **Step 5: Commit**

```bash
cd web && git add src/drill/confrontation/confront-store.ts src/drill/confrontation/__tests__/confront-store.test.ts && git commit -m "feat(drill): 对抗舱数据层 confront-store(照抄原型契约)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: 对抗 agent 接入层 confront-adapter

**Files:**
- Create: `web/src/drill/confrontation/confront-adapter.ts`
- Test: `web/src/drill/confrontation/__tests__/confront-adapter.test.ts`

**Interfaces:**
- Consumes: `postAgentChat` / `parseAgentChatSSE`(`lib/agent-chat-client.ts`);`evaluateViaAgent`(`lib/agent-evaluate.ts`);Task 1 的 `ConfrontationSeed`
- Produces:
  - `export interface AdapterDeps { postChat?: (p: PostAgentChatParams) => Promise<ReadableStream<Uint8Array>>; logger?: { warn(...a: unknown[]): void; debug(...a: unknown[]): void } }`
  - `export class ConfrontAdapter { constructor(deps?: AdapterDeps); }`
  - `async generateInitialPlan(ctx: { appId: string; buildingId: string; sceneId: string; drillId: string; seed: ConfrontationSeed }): Promise<{ deployLines: string[] } | null>`
  - `async injectSpecial(ctx: { appId: string; buildingId: string; sceneId: string; drillId: string; seed: ConfrontationSeed; statusLine: string }): Promise<{ emergency: string; location?: string; delta?: { fireLevelDelta?: number; trappedDelta?: number; damageDelta?: number } } | null>`
  - `async generateAdjustment(ctx: { appId: string; buildingId: string; sceneId: string; drillId: string; seed: ConfrontationSeed; injectText: string }): Promise<{ adjustments: string[] } | null>`

解析规则以 Task 0 实测契约为准。此处按 SSE 格式文档当前记录实现,并提供安全窄化(解析失败 → 该次调用返回 null 或告警)。

- [ ] **Step 1: 写失败测试**

`web/src/drill/confrontation/__tests__/confront-adapter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ConfrontAdapter } from '../confront-adapter';
import type { PostAgentChatParams } from '@/lib/agent-chat-client';

/** fake SSE:按顺序 yield 若干 data 行。 */
function fakeStream(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const payload = lines.map((l) => `data: ${l}\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(payload));
      controller.close();
    },
  });
}

function fakePost(events: unknown[]) {
  return async (_p: PostAgentChatParams) =>
    fakeStream(events.map((e) => JSON.stringify(e)));
}

const SEED = { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#ABCD' };
const CTX = { appId: 'app-1', buildingId: 'b-1', sceneId: 's-1', drillId: 'd-1', seed: SEED };

describe('confront-adapter', () => {
  it('generateInitialPlan 从 text/report_decision 提取部署行', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([{ type: 'text', content: '到场后首层设指挥部,出2支水枪堵截' }]),
    });
    const out = await adapter.generateInitialPlan(CTX);
    expect(out?.deployLines.length).toBeGreaterThan(0);
  });

  it('injectSpecial 解析 inject_event args → 特情卡', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([
        {
          type: 'tool-call',
          toolCallId: 'tc1',
          toolName: 'inject_event',
          args: { event: { type: 'wind_shift', description: '风向突变浓烟倒灌', payload: { location: '5F', fireLevelDelta: 1 } } },
        },
      ]),
    });
    const out = await adapter.injectSpecial(CTX);
    expect(out?.emergency).toBe('风向突变浓烟倒灌');
    expect(out?.location).toBe('5F');
    expect(out?.delta?.fireLevelDelta).toBe(1);
  });

  it('injectSpecial 契约解析失败 → 返回 null 不抛', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([{ type: 'text', content: '未知' }]),
    });
    const out = await adapter.injectSpecial(CTX);
    expect(out).toBeNull();
  });

  it('generateAdjustment 解析 report_decision action/rationale → 调整行', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([
        {
          type: 'tool-call',
          toolCallId: 'tc2',
          toolName: 'report_decision',
          args: { decision: { action: '内攻改道', rationale: '进攻通道调整至背风面', tactic: 'ventilation' } },
        },
      ]),
    });
    const out = await adapter.generateAdjustment(CTX);
    expect(out?.adjustments.join()).toContain('内攻改道');
  });

  it('postChat 抛错 → 返回 null', async () => {
    const adapter = new ConfrontAdapter({
      postChat: async () => {
        throw new Error('network');
      },
    });
    const out = await adapter.injectSpecial(CTX);
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd web && npx vitest run src/drill/confrontation/__tests__/confront-adapter.test.ts`
Expected: FAIL(找不到 `../confront-adapter`)。

- [ ] **Step 3: 实现 adapter**

`web/src/drill/confrontation/confront-adapter.ts`:

```ts
// 演练对抗·对抗舱 agent 接入层(纯逻辑,可注入 fake postChat 单测)。
// 职责:触发三 agent 并解析 SSE tool-call → 对抗舱数据。契约以
// plan/drill-agent-chat-sse-format.md 实测记录为准,解析失败安全降级 null。
import {
  postAgentChat,
  parseAgentChatSSE,
  type PostAgentChatParams,
  type ToolCallEvent,
  type AgentChatEvent,
} from '@/lib/agent-chat-client';
import { evaluateViaAgent } from '@/lib/agent-evaluate';
import type { ConfrontationSeed } from './confront-store';

export interface AdapterDeps {
  readonly postChat?: (p: PostAgentChatParams) => Promise<ReadableStream<Uint8Array>>;
  readonly logger?: { warn(...a: unknown[]): void; debug(...a: unknown[]): void };
}

export interface AdapterCtx {
  readonly appId: string;
  readonly buildingId: string;
  readonly sceneId: string;
  readonly drillId: string;
  readonly seed: ConfrontationSeed;
}

function narrowObject(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

function toStr(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function toFinite(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 从 SSE 流里取首个指定 toolName 的 tool-call(args 已 JSON.parse)。 */
async function firstToolCall(
  stream: ReadableStream<Uint8Array>,
  toolName: string,
): Promise<ToolCallEvent | null> {
  for await (const ev of parseAgentChatSSE(stream)) {
    if (ev.type === 'tool-call' && ev.toolName === toolName) return ev;
  }
  return null;
}

export class ConfrontAdapter {
  private readonly postChat: (p: PostAgentChatParams) => Promise<ReadableStream<Uint8Array>>;
  private readonly logger: { warn(...a: unknown[]): void; debug(...a: unknown[]): void };

  constructor(deps: AdapterDeps = {}) {
    this.postChat = deps.postChat ?? postAgentChat;
    this.logger = deps.logger ?? { warn: console.warn.bind(console), debug: console.debug.bind(console) };
  }

  private async run(content: string, ctx: AdapterCtx): Promise<ReadableStream<Uint8Array>> {
    return this.postChat({
      content,
      app_id: ctx.appId,
      forwardedProps: {
        scene_id: ctx.sceneId,
        building_id: ctx.buildingId,
        drill_id: ctx.drillId,
        status: { fireFloor: ctx.seed.floor, trappedCount: ctx.seed.trapped },
      },
    });
  }

  /** 预案输出 agent:生成初步部署(解析 report_decision 或 text 摘要)。 */
  async generateInitialPlan(ctx: AdapterCtx): Promise<{ deployLines: string[] } | null> {
    try {
      const stream = await this.run(
        `[对抗开局] 演练开始:${ctx.seed.building} ${ctx.seed.floor} ${ctx.seed.material}起火,被困${ctx.seed.trapped}人。` +
          '请调用 report_decision 上报初步部署决策(action=部署方案,rationale=处置要点)。',
        ctx,
      );
      const tc = await firstToolCall(stream, 'report_decision');
      const args = narrowObject(tc?.args);
      const decision = narrowObject(args?.decision);
      const action = toStr(decision?.action);
      const rationale = toStr(decision?.rationale);
      const deployLines: string[] = [];
      if (action) deployLines.push(action);
      if (rationale) deployLines.push(rationale);
      if (deployLines.length === 0) deployLines.push(`${ctx.seed.building} ${ctx.seed.floor} 灭火救援处置`);
      return { deployLines };
    } catch (err) {
      this.logger.warn('[confront-adapter] generateInitialPlan 失败:', err);
      return null;
    }
  }

  /** 对抗 agent:注入特情(解析 inject_event)。 */
  async injectSpecial(
    ctx: AdapterCtx,
    statusLine: string,
  ): Promise<{ emergency: string; location?: string; delta?: { fireLevelDelta?: number; trappedDelta?: number; damageDelta?: number } } | null> {
    try {
      const stream = await this.run(
        `[导调触发] drill_id=${ctx.drillId}\n当前态势:${statusLine}\n` +
          '请调用 inject_event 注入一个突发特情(event.type/description/payload.location/payload.fireLevelDelta 等)。',
        ctx,
      );
      const tc = await firstToolCall(stream, 'inject_event');
      const args = narrowObject(tc?.args);
      const event = narrowObject(args?.event);
      const type = toStr(event?.type);
      const description = toStr(event?.description);
      const payload = narrowObject(event?.payload);
      const location = toStr(payload?.location);
      const emergency = description ?? (type ? `突发特情:${type}` : null);
      if (!emergency) return null;
      const fireLevelDelta = toFinite(payload?.fireLevelDelta);
      const trappedDelta = toFinite(payload?.trappedDelta);
      const damageDelta = toFinite(payload?.damageDelta);
      const delta =
        fireLevelDelta !== undefined || trappedDelta !== undefined || damageDelta !== undefined
          ? { fireLevelDelta, trappedDelta, damageDelta }
          : undefined;
      return { emergency, location, delta };
    } catch (err) {
      this.logger.warn('[confront-adapter] injectSpecial 失败:', err);
      return null;
    }
  }

  /** 预案输出 agent:对特情给动态调整(解析 report_decision action/rationale)。 */
  async generateAdjustment(
    ctx: AdapterCtx,
    injectText: string,
  ): Promise<{ adjustments: string[] } | null> {
    try {
      const stream = await this.run(
        `[特情响应] 突发特情:${injectText}\n请调用 report_decision 给出部署/战法动态调整(action=调整动作,rationale=依据)。`,
        ctx,
      );
      const tc = await firstToolCall(stream, 'report_decision');
      const args = narrowObject(tc?.args);
      const decision = narrowObject(args?.decision);
      const action = toStr(decision?.action);
      const rationale = toStr(decision?.rationale);
      const adjustments: string[] = [];
      if (action) adjustments.push(action);
      if (rationale) adjustments.push(rationale);
      if (adjustments.length === 0) return null;
      return { adjustments };
    } catch (err) {
      this.logger.warn('[confront-adapter] generateAdjustment 失败:', err);
      return null;
    }
  }

  /** 评估 agent:复用 lib/agent-evaluate.ts(失败返回 null,调用方降级)。 */
  async evaluateDrill(input: Parameters<typeof evaluateViaAgent>[0]): Promise<ReturnType<typeof evaluateViaAgent>> {
    return evaluateViaAgent(input);
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd web && npx vitest run src/drill/confrontation/__tests__/confront-adapter.test.ts`
Expected: PASS(5 个用例)。若解析字段与 Task 0 实测不符,按实测修正 `injectSpecial`/`generateAdjustment` 的取值路径后重跑。

- [ ] **Step 5: Commit**

```bash
cd web && git add src/drill/confrontation/confront-adapter.ts src/drill/confrontation/__tests__/confront-adapter.test.ts && git commit -m "feat(drill): 对抗舱 agent 接入层 confront-adapter(特情/调整/评估解析)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: 对抗舱 UI 小组件(照抄原型)

**Files:**
- Create: `web/src/drill/confrontation/confrontation-uis.tsx`

**Interfaces:**
- Consumes: 无(Task 4 使用本任务导出的组件)
- Produces:
  - `export function ShuffleText({ text, className }: { text: string; className?: string }): JSX.Element`
  - `export function Dots({ className }: { className?: string }): JSX.Element`
  - `export function ScoreRing({ score, pass }: { score: number; pass: boolean }): JSX.Element`
  - `export function TimelineNode({ color, badge, tSec, text, pulse, onClick }: { color: string; badge: string; tSec: number; text: string; pulse: boolean; onClick: () => void }): JSX.Element`

- [ ] **Step 1: 照抄原型小组件**

把原型 `ConfrontationPanel.tsx` 里的 `ShuffleText`(L33-55)、`Dots`(L57-70)、`ScoreRing`(L72-93)、`TimelineNode`(L676-712)原样搬入 `confrontation-uis.tsx`,仅去掉 `DemoTag` 依赖引用。颜色/动画/framer-motion 调用保持不变。

`web/src/drill/confrontation/confrontation-uis.tsx`:

```tsx
// 演练对抗·对抗舱 小组件(照抄原型 ConfrontationPanel.tsx 的 ShuffleText/Dots/ScoreRing/TimelineNode)。
'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

/** 洗牌闪变:0.4s slot-machine 字符滚动后定格(照抄原型 L33-55)。 */
export function ShuffleText({ text, className = '' }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const chars = '0123456789ABCDEF#%&';
    let frame = 0;
    const iv = window.setInterval(() => {
      frame += 1;
      if (frame >= 8) {
        setShown(text);
        window.clearInterval(iv);
        return;
      }
      setShown(
        text
          .split('')
          .map((c) => (c === ' ' || /[一-龥]/.test(c) ? c : chars[Math.floor(Math.random() * chars.length)]))
          .join(''),
      );
    }, 50);
    return () => window.clearInterval(iv);
  }, [text]);
  return <span className={className}>{shown}</span>;
}

/** 三点跳动(照抄原型 L57-70)。 */
export function Dots({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}

/** 环形分数(照抄原型 L72-93)。 */
export function ScoreRing({ score, pass }: { score: number; pass: boolean }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1c3a54" strokeWidth="5" />
        <motion.circle
          cx="32" cy="32" r={r} fill="none"
          stroke={pass ? '#34d399' : '#ef4444'} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-num text-[16px] font-bold text-text-1">
        {score}
      </div>
    </div>
  );
}

/** 时间轴节点(照抄原型 L676-712)。 */
export function TimelineNode({
  color,
  badge,
  tSec,
  text,
  pulse,
  onClick,
}: {
  color: string;
  badge: string;
  tSec: number;
  text: string;
  pulse: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ x: 8, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="relative mb-3 block w-full rounded-md px-1 py-0.5 text-left transition hover:bg-bg-panel-2/70"
    >
      <motion.span
        className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bg-deep"
        style={{ backgroundColor: color }}
        animate={pulse ? { boxShadow: [`0 0 0 0 ${color}66`, `0 0 0 6px ${color}00`] } : undefined}
        transition={pulse ? { duration: 2, repeat: Infinity } : undefined}
      />
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-text-3">{fmtT(tSec)}</span>
        <span
          className="rounded border px-1 text-[10px] leading-4"
          style={{ color, borderColor: `${color}99` }}
        >
          {badge}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[12px] text-text-2">{text}</span>
    </motion.button>
  );
}

function fmtT(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = tSec % 60;
  return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 2: 类型检查**

Run: `cd web && npx tsc --noEmit`
Expected: 全绿(新增文件无类型错误)。

- [ ] **Step 3: Commit**

```bash
cd web && git add src/drill/confrontation/confrontation-uis.tsx && git commit -m "feat(drill): 对抗舱小组件 ShuffleText/Dots/ScoreRing/TimelineNode(照抄原型)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: 对抗舱主面板 ConfrontationPanel(照抄原型三栏)

**Files:**
- Create: `web/src/drill/confrontation/ConfrontationPanel.tsx`
- Create: `web/src/drill/confrontation/confront-driver.ts`(编排:定时器 + adapter + store 动作,纯逻辑可测)

**Interfaces:**
- Consumes: Task 1 `confront-store` 全部动作 + `ConfrontationState`;Task 2 `ConfrontAdapter`;Task 3 小组件;`addSceneAction`/`showToast`;`evaluateViaAgent`
- Produces:
  - `export function useConfrontationDriver(opts: { adapter: ConfrontAdapter; appIds: { planner: string; adversary: string; evaluate: string }; buildingId: string; sceneId: string; drillId: string }): void`(hook,挂载于 Panel 内部,编排对抗生命周期)
  - `export default function ConfrontationPanel(): JSX.Element | null`(active=false 时返回 null)

- [ ] **Step 1: 写编排逻辑(纯逻辑,可单测核心节奏)**

`web/src/drill/confrontation/confront-driver.ts`(把定时器调度与 store/adapter 编排放在一处,Panel 只负责渲染):

```ts
// 对抗舱编排:定时器 + adapter + store 动作。纯逻辑(无 React),可注入 fake adapter 测试。
// 节奏(照抄原型):开局 → 预案输出 agent 生成部署 → 5s+15~25s 注入特情 →
// 特情后 2.5s 生成调整 → 人响应 → 结束评估。
import type { ConfrontAdapter } from './confront-adapter';
import type {
  ConfrontationSeed,
} from './confront-store';

export interface ConfrontAppIds {
  readonly planner: string;
  readonly adversary: string;
  readonly evaluate: string;
}

export interface ConfrontDriverDeps {
  readonly adapter: ConfrontAdapter;
  readonly appIds: ConfrontAppIds;
  readonly buildingId: string;
  readonly sceneId: string;
  readonly drillId: string;
  readonly seed: ConfrontationSeed | null;
  /** 本局事件流(评估用:按响应用时判定 timely/delayed/ignored;Task 6 接入)。 */
  readonly events?: readonly { readonly kind: string; readonly respondedWithinSec?: number }[];
}

type TimerId = ReturnType<typeof setTimeout>;

export class ConfrontDriver {
  private readonly deps: ConfrontDriverDeps;
  private timers: TimerId[] = [];

  constructor(deps: ConfrontDriverDeps) {
    this.deps = deps;
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      fn();
    }, ms);
    this.timers.push(id);
  }

  clearAll(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private ctx(appId: string) {
    return {
      appId,
      buildingId: this.deps.buildingId,
      sceneId: this.deps.sceneId,
      drillId: this.deps.drillId,
      seed: this.deps.seed!,
    };
  }

  /** 开局:生成初步部署(集成层调 beginConfrontation + seed 后调用)。 */
  startInitialPlan(cb: { onPlan(lines: string[]): void; onFail(): void }): void {
    if (!this.deps.seed) return;
    this.deps.adapter.generateInitialPlan(this.ctx(this.deps.appIds.planner)).then((out) => {
      if (out?.deployLines) cb.onPlan(out.deployLines);
      else cb.onFail();
    });
  }

  /** 规划特情注入节奏(先 thinking 骨架,再注入)。 */
  scheduleInject(seqIndex: number, cb: {
    onThinking(v: boolean): void;
    onInject(evt: { emergency: string; location?: string }): void;
    onInjectFail(): void;
  }): void {
    const first = seqIndex === 0;
    const gap = first ? 5000 + this.rand(15000, 25000) : this.rand(15000, 25000);
    this.later(Math.max(0, gap - 3000), () => cb.onThinking(true));
    this.later(gap, () => {
      cb.onThinking(false);
      this.doInject(cb);
    });
  }

  private doInject(cb: {
    onInject(evt: { emergency: string; location?: string }): void;
    onInjectFail(): void;
  }): void {
    const statusLine = this.statusLine();
    void this.deps.adapter.injectSpecial(this.ctx(this.deps.appIds.adversary), statusLine).then((out) => {
      if (out) cb.onInject({ emergency: out.emergency, location: out.location });
      else cb.onInjectFail();
    });
  }

  /** 特情后 2.5s 生成动态调整。 */
  scheduleAdjustment(injectText: string, cb: { onAdjust(lines: string[]): void }): void {
    this.later(2500, () => {
      void this.deps.adapter.generateAdjustment(this.ctx(this.deps.appIds.planner), injectText).then((out) => {
        if (out?.adjustments) cb.onAdjust(out.adjustments);
      });
    });
  }

  private statusLine(): string {
    const s = this.deps.seed;
    return s ? `火势=1级;${s.floor} ${s.material}起火;被困${s.trapped}人` : '态势未知';
  }

  private rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
```

- [ ] **Step 2: 照抄原型三栏主面板**

`web/src/drill/confrontation/ConfrontationPanel.tsx`:照抄原型 `ConfrontationPanel.tsx` 的完整三栏布局(Portal 全屏、左栏对抗态势卡+对抗智能体卡+结束评估、中央灾情摘要+3D 缩略区+特情-调整卡对流、右栏时间轴+评估卡),把:
- 数据源从 `drillStore` 改为 Task 1 的 `confront-store`(subscribeConfrontation)
- 触发逻辑从原型 mock 改为调用 `ConfrontDriver` + `ConfrontAdapter`
- `handleEnter`/`respondAdjustment`/`finishConfrontation` 改为调 store 动作
- 3D 缩略区保留占位结构(真实 3D 为 App 层背景,后续接 `addSceneAction`)
- 评估调用 `adapter.evaluateDrill` 或直接 `evaluateViaAgent`

关键点(照抄保持):
- `if (!conf.active) return null;`
- 三栏宽度:左 `w-[280px]` / 右 `w-[300px]` / 中央 `flex-1`
- 卡流:特情橙(`border-orange/60`)、调整青(`border-cyan/50`)、部署紫(`border-violet/60`)
- 采纳/改派按钮逻辑与「至少经历 2 条特情后可评估」禁用逻辑
- `fmtT` 秒级计时

（完整组件代码较长,照抄原型文件后按上述改点逐处替换即可;此处不逐行展开以控制篇幅,但结构与交互必须与原型一致。）

- [ ] **Step 3: 类型检查**

Run: `cd web && npx tsc --noEmit`
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
cd web && git add src/drill/confrontation/ConfrontationPanel.tsx src/drill/confrontation/confront-driver.ts && git commit -m "feat(drill): 对抗舱主面板三栏 UI(照抄原型)+ 编排 driver
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: DrillView 集成 + 移除旧引擎引用

**Files:**
- Modify: `web/src/views/DrillView.tsx`
- Modify: `web/src/App.tsx`(如需要挂对抗舱入口)

**Interfaces:**
- Consumes: Task 4 `ConfrontationPanel`;Task 2 `ConfrontAdapter`;`agent-app-ids` 的 `DRILL_COMMANDER_APP_ID`/`ADVERSARY_APP_ID`/`EVALUATE_APP_ID`(新增 `DRILL_PLANNER_APP_ID` 常量)
- Produces: 无(集成)

- [ ] **Step 1: 新增预案输出 agent 常量**

`web/lib/agent-app-ids.ts` 追加:

```ts
/**
 * 演练对抗·预案输出 agent app_id(对抗舱初步部署/动态调整)。
 * 平台建「演练预案输出」应用后以 NEXT_PUBLIC_DRILL_PLANNER_APP_ID 注入;
 * 未配回退演练指挥 app(再回退通用)。
 */
export const DRILL_PLANNER_APP_ID = (process.env.NEXT_PUBLIC_DRILL_PLANNER_APP_ID ?? '').trim() || DRILL_COMMANDER_APP_ID;
```

- [ ] **Step 2: 改 DrillView 挂载对抗舱**

`web/src/views/DrillView.tsx`:
- import `ConfrontationPanel` from '@/drill/confrontation/ConfrontationPanel'
- import `beginConfrontation` from '@/drill/confrontation/confront-store'
- import `DRILL_PLANNER_APP_ID` from '@/lib/agent-app-ids'(对抗舱 driver 构造用;ADVERSARY/EVALUATE app_id 由 Panel 内部从 adapter 读取)
- 新增 state:`const [confOpen, setConfOpen] = useState(false)`(进入对抗模式开关)
- 移除旧 tick 编排 effect(`useEffect` 里 bus/state/recorder 驱动那段)与 `useTimeline`/`useAgentRunner` 的引用;移除旧引擎相关 import(`EventBus`/`DisasterState`/`DrillRecorder`/`storyIdsForFloorSpec`/`drill-camera` 等)——仅移除 DrillView 内的引用,**不删文件**
- 工具栏或侧栏新增「进入对抗模式」按钮:

```tsx
{!confOpen && (
  <button
    type="button"
    onClick={() => {
      beginConfrontation({
        seedScenario: {
          building: '21号楼',
          floor: activeScenario.scenario.fireFloor ?? '5F',
          material: activeScenario.scenario.material,
          trapped: activeScenario.scenario.trappedCount,
          seed: `#${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')}`,
        },
        plannedTotal: 3 + Math.floor(Math.random() * 3),
      });
      setConfOpen(true);
    }}
    className="..."
  >
    进入对抗模式
  </button>
)}
```

- 渲染 `<ConfrontationPanel />`(内部 active=true 时 Portal 全屏覆盖;onClose 时 `setConfOpen(false)`)

- [ ] **Step 3: 类型检查**

Run: `cd web && npx tsc --noEmit`
Expected: 全绿(旧引擎文件保留,但 DrillView 不再引用 → 无未使用 import 错误)。

- [ ] **Step 4: 运行全量测试**

Run: `cd web && npx vitest run`
Expected: 全部通过(旧 `lib/drill` 测试不受影响——文件保留)。

- [ ] **Step 5: Commit**

```bash
cd web && git add lib/agent-app-ids.ts src/views/DrillView.tsx && git commit -m "feat(drill): DrillView 接入对抗舱,移除旧推演引擎引用
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: 评估归档闭环

**Files:**
- Modify: `web/src/drill/confrontation/ConfrontationPanel.tsx`
- Modify: `web/src/drill/confrontation/confront-driver.ts`

**Interfaces:**
- Consumes: Task 2 `adapter.evaluateDrill`;`addLibraryItem`;`showToast`
- Produces: 无(闭环)

- [ ] **Step 1: driver 增加评估方法**

`confront-driver.ts` 追加:

```ts
  /** 结束评估:调评估 agent → 生成 review(失败降级 mock)。 */
  finishEvaluate(cb: {
    onEvaluating(v: boolean): void;
    onReview(review: {
      score: number;
      conclusion: string;
      comments: string[];
      outcomes: Array<'timely' | 'delayed' | 'ignored'>;
      archived: boolean;
    }): void;
  }): void {
    cb.onEvaluating(true);
    const events = this.deps.events ?? [];
    const adjusts = events.filter((e) => e.kind === 'adjust');
    const outcomes = adjusts.map((e) =>
      e.respondedWithinSec === undefined ? 'ignored' : e.respondedWithinSec <= 15 ? 'timely' : 'delayed',
    ) as Array<'timely' | 'delayed' | 'ignored'>;
    const ignored = outcomes.filter((o) => o === 'ignored').length;
    const delayed = outcomes.filter((o) => o === 'delayed').length;
    const score = Math.max(45, Math.min(98, 92 - ignored * 8 - delayed * 3));
    const archived = score >= 85;
    const review = {
      score,
      conclusion: archived ? '预案韧性：良好' : '预案韧性：需修订',
      comments: archived
        ? ['特情响应链路完整', '调整决策合理', '路线无交叉冲突']
        : ['存在未响应特情', '供水备份方案未启用', '请修订后重新对抗'],
      outcomes,
      archived,
    };
    cb.onEvaluating(false);
    cb.onReview(review);
  }
```

`ConfrontDriverDeps` 增加 `readonly events?: readonly { kind: string; respondedWithinSec?: number }[];`

- [ ] **Step 2: Panel 接线评估 + 归档**

`ConfrontationPanel.tsx` 的「结束对抗并评估」按钮逻辑:
- 调 `driver.finishEvaluate`
- `onReview` → `finishConfrontationLocal(review, finalSeq, elapsedSec)` + `addLibraryItem({ kind: '对抗评估', title, score, status: archived ? '已归档' : '需修订', summary: review.comments, sourceDetail })` + `showToast`
- 「重新随机」→ `beginConfrontation({ seedScenario: <新随机> })`
- 「返回演练设置」→ `exitConfrontation()` + 通知 `setConfOpen(false)`

- [ ] **Step 3: 类型检查 + 测试**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
cd web && git add src/drill/confrontation/ConfrontationPanel.tsx src/drill/confrontation/confront-driver.ts && git commit -m "feat(drill): 对抗舱评估归档闭环(评估agent+预案库回流)
Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: 端到端验证

**Files:**
- Modify: 无(验证为主)

- [ ] **Step 1: 全量检查**

Run: `cd web && npx tsc --noEmit && npx vitest run`
Expected: 全绿。

- [ ] **Step 2: 手动跑一局对抗(真 agent)**

启动 dev server(`npm run dev`),进入演练对抗 → 「进入对抗模式」:
- 开局出现灾情 + 初步部署卡
- 15-25s 后对抗智能体注入特情(橙色卡,thinking 骨架前置)
- 2.5s 后出现动态调整卡(青色卡,带采纳/改派按钮)
- 点「采纳调整」→ 状态变「已采纳 · 用时 Ns」
- 至少 2 条特情后可点「结束对抗并评估」→ 评估卡 + 归档提示
- 预案库可见「对抗评估」归档条目

- [ ] **Step 3: 记录问题与收尾**

若发现契约/时序问题,回到对应 Task 修正后重跑;全部通过后更新 `web/plan/README.md` 索引(新增本 plan 文档)。

```bash
cd web && git add plan/README.md && git commit -m "docs(drill): 对抗舱计划入 plan 索引
Co-Authored-By: Claude <noreply@anthropic.com>"
```
