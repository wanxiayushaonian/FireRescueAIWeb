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
  readonly outcomes: readonly ('timely' | 'delayed' | 'ignored')[];
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
  /** 初步部署行(预案输出 agent 真实输出;null=未生成,UI 回落静态摘要) */
  readonly deploy: readonly string[] | null;
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
  deploy: null,
};

let seqCounter = 0;
let idCounter = 0;

type Listener = (s: ConfrontationState) => void;
const listeners = new Set<Listener>();

function emit(): void {
  for (const fn of listeners) fn(cloneState(conf));
}

function genId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

function cloneState(s: ConfrontationState): ConfrontationState {
  return {
    ...s,
    events: s.events.map((e) => ({ ...e })),
    seedScenario: s.seedScenario ? { ...s.seedScenario } : null,
    review: s.review ? { ...s.review } : null,
    lastRound: s.lastRound ? { ...s.lastRound } : null,
  };
}

export function getConfrontationState(): ConfrontationState {
  return cloneState(conf);
}

export function subscribeConfrontation(fn: Listener): () => void {
  listeners.add(fn);
  fn(cloneState(conf));
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
    deploy: null,
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
    deploy: null,
  };
  emit();
}

/** 初步部署行(预案输出 agent 返回时写入;开局重置为 null)。 */
export function setDeployLines(lines: readonly string[]): void {
  conf = { ...conf, deploy: [...lines] };
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
  evt: Omit<ConfrontationEvent, 'id' | 'kind' | 'emergency'> & {
    readonly id?: string;
    readonly seq: number;
    readonly emergency?: string;
  },
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

/** 重显上一局(exit 后状态保留,只把面板 active 置回;一级预案面板「上一局对抗」按钮用)。 */
export function reopenConfrontation(): void {
  conf = { ...conf, active: true };
  emit();
}

export function exitConfrontation(): void {
  conf = { ...conf, active: false, status: conf.status === 'running' ? 'idle' : conf.status, thinking: false, seedLoading: false };
  emit();
}
