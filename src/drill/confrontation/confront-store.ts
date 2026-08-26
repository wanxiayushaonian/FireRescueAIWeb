// 演练对抗·对抗舱 数据层(照抄原型 drillStore.ts 对抗扩展契约,秒级事件流)。
// 纯状态容器 + 纯动作:不做定时器/agent 调用(集成层负责编排后调用这些动作)。
// 时间用真实秒(startedAt / tSec),无 tick / DisasterState 参与对抗演化。

import type { EvaluationDimension, EvaluationImprovement } from '@/lib/agent-evaluate';
import { canonicalSpecialType } from './special-event-quality';

export type ConfrontKind = 'inject' | 'adjust' | 'manual' | 'evaluate';

export interface ConfrontationDelta {
  readonly fireLevelDelta?: number;
  readonly trappedDelta?: number;
  readonly damageDelta?: number;
  readonly wind?: string;
}

/** 本局可演化态势;每条特情的 delta 必须落到这里,下一轮 Agent 读取新状态。 */
export interface ConfrontationSituation {
  readonly fireLevel: number;
  readonly trappedCount: number;
  readonly damageLevel: number;
  readonly wind?: string;
}

/** P1a 证据化决策:report_decision 携带的数据依据标签(kind 对应数据权威来源)。 */
export interface DecisionEvidence {
  /** plan=正式预案 / archive=建筑档案 / force=真实力量 / water=消防水源 / knowledge=历史知识 / warning=数据告警 */
  readonly kind: 'plan' | 'archive' | 'force' | 'water' | 'knowledge' | 'warning';
  readonly label: string;
  readonly detail?: string;
}

export interface ConfrontationEvent {
  readonly id: string;
  readonly seq: number;
  readonly kind: ConfrontKind;
  readonly emergency: string;
  /** 对抗特情类型(wind_shift/explosion/...)，去重与评估的核心字段。 */
  readonly specialType?: string;
  /** 特情位置(agent 原始 location,如 "5F影院放映厅";仅 inject 事件有,供特情卡展示/复查) */
  readonly location?: string;
  readonly delta?: ConfrontationDelta;
  readonly adjustments?: readonly string[];
  readonly adopted?: boolean;
  readonly respondedWithinSec?: number;
  /** manual 事件:人工处置原因(人员填写)。 */
  readonly note?: string;
  /** manual 事件:被改派的 adjust 事件 id(评估对比"建议 vs 人工"用)。 */
  readonly supersedes?: string;
  /** P1a:决策证据标签(仅 adjust/manual 事件有)。 */
  readonly evidence?: readonly DecisionEvidence[];
  readonly tSec: number;
}

export interface ConfrontationReview {
  readonly score: number;
  readonly conclusion: string;
  readonly comments: readonly string[];
  readonly outcomes: readonly ('timely' | 'delayed' | 'ignored')[];
  readonly archived: boolean;
  /** 评估来源：agent=评估 agent 真实输出；fallback=agent 未响应时的本地规则降级打分（UI 必须显式标注）。 */
  readonly source: 'agent' | 'fallback';
  /** 分项维度评分(agent 评估才有;fallback 为空数组,UI 不渲染该区块) */
  readonly dimensions?: readonly EvaluationDimension[];
  /** 改进措施(agent 评估才有;归档时逐条回流预案库「改进措施」) */
  readonly improvements?: readonly EvaluationImprovement[];
}

export type ConfrontAgentRole = 'planner' | 'adversary' | 'commander' | 'evaluator';

export interface ConfrontAgentToolStep {
  readonly name: string;
  readonly status: 'calling' | 'done';
}

/** 可展示的执行轨迹：只记录阶段和工具名，不保存模型原始 reasoning/参数/结果。 */
export interface ConfrontAgentActivity {
  readonly role: ConfrontAgentRole;
  readonly appIdSuffix: string;
  readonly status: 'running' | 'success' | 'error';
  readonly phase: string;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly tools: readonly ConfrontAgentToolStep[];
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
  readonly situation: ConfrontationSituation;
  readonly events: readonly ConfrontationEvent[];
  readonly review: ConfrontationReview | null;
  readonly evaluating: boolean;
  readonly generation: number;
  readonly startedAt: number;
  readonly plannedTotal: number;
  readonly lastRound: { readonly score: number; readonly archived: boolean } | null;
  /** 初步部署行(预案输出 agent 真实输出;null=未生成,UI 回落静态摘要) */
  readonly deploy: readonly string[] | null;
  readonly agentActivity: ConfrontAgentActivity | null;
}

let conf: ConfrontationState = {
  active: false,
  status: 'idle',
  seedLoading: false,
  seedError: null,
  thinking: false,
  seedScenario: null,
  situation: { fireLevel: 0, trappedCount: 0, damageLevel: 0 },
  events: [],
  review: null,
  evaluating: false,
  generation: 0,
  startedAt: 0,
  plannedTotal: 0,
  lastRound: null,
  deploy: null,
  agentActivity: null,
};

let seqCounter = 0;
let idCounter = 0;

// 双通道入库去重:同一 tool-call 会沿 adapter(聊天流解析)与场景总线(MCP 命令)
// 各送达一次。内容完全相同的 inject/adjust 在窗口内只落第一条——否则每条调整双倍入库,
// 评估 outcomes 与特情↔调整配对全被污染(2026-08-25 验收实测:4 条特情评出 9 行"特情")。
const DEDUP_WINDOW_MS = 30_000;
const recentEventKeys = new Map<string, number>();

function dedupNormalize(value?: string): string {
  return (value ?? '').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

export type DedupCandidate =
  | { readonly kind: 'inject'; readonly specialType?: string; readonly emergency?: string; readonly location?: string }
  | { readonly kind: 'adjust'; readonly adjustments?: readonly string[] };

function dedupKeyOf(candidate: DedupCandidate): string {
  return candidate.kind === 'inject'
    // specialType 归一到 canonical(两条通道可能分别携带原始别名与 canonical 形态)
    ? `inject|${canonicalSpecialType({ specialType: candidate.specialType, emergency: candidate.emergency ?? '', location: candidate.location })}|${dedupNormalize(candidate.emergency)}|${dedupNormalize(candidate.location)}`
    // adjustments 用空串连接:adapter 的 [action, rationale] 两行与总线的 "action:rationale" 合并行收敛同 key
    : `adjust|${(candidate.adjustments ?? []).map(dedupNormalize).join('')}`;
}

function pruneDedup(now: number): void {
  for (const [key, at] of recentEventKeys) {
    if (now - at > DEDUP_WINDOW_MS) recentEventKeys.delete(key);
  }
}

/** 命中重复(窗口内同内容已入库)返回 true;未命中登记本次。 */
function hitOrMarkDuplicate(candidate: DedupCandidate): boolean {
  const now = Date.now();
  pruneDedup(now);
  const key = dedupKeyOf(candidate);
  const at = recentEventKeys.get(key);
  recentEventKeys.set(key, now);
  return at !== undefined && now - at <= DEDUP_WINDOW_MS;
}

/** 只读查询(场景总线 handler 幂等应答用:同内容已在库则跳过质量门直接 ok)。 */
export function isDuplicateEvent(candidate: DedupCandidate): boolean {
  const now = Date.now();
  pruneDedup(now);
  const at = recentEventKeys.get(dedupKeyOf(candidate));
  return at !== undefined && now - at <= DEDUP_WINDOW_MS;
}

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
    events: s.events.map((e) => ({
      ...e,
      delta: e.delta ? { ...e.delta } : undefined,
      evidence: e.evidence ? e.evidence.map((ev) => ({ ...ev })) : undefined,
    })),
    seedScenario: s.seedScenario ? { ...s.seedScenario } : null,
    situation: { ...s.situation },
    review: s.review ? { ...s.review } : null,
    lastRound: s.lastRound ? { ...s.lastRound } : null,
    agentActivity: s.agentActivity ? {
      ...s.agentActivity,
      tools: s.agentActivity.tools.map((tool) => ({ ...tool })),
    } : null,
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
  recentEventKeys.clear();
  conf = {
    active: false,
    status: 'idle',
    seedLoading: false,
    seedError: null,
    thinking: false,
    seedScenario: null,
    situation: { fireLevel: 0, trappedCount: 0, damageLevel: 0 },
    events: [],
    review: null,
    evaluating: false,
    generation: 0,
    startedAt: 0,
    plannedTotal: 0,
    lastRound: null,
    deploy: null,
    agentActivity: null,
  };
  seqCounter = 0;
  emit();
}

export function beginConfrontation(opts?: {
  seedLoading?: boolean;
  seedError?: string;
  seedScenario?: ConfrontationSeed;
  plannedTotal?: number;
  /** 一级作战会话已形成的初始部署；存在时二级对抗不再重复调用 Planner。 */
  initialDeploy?: readonly string[];
}): void {
  seqCounter = 0;
  recentEventKeys.clear();
  conf = {
    ...conf,
    active: true,
    status: 'running',
    seedLoading: opts?.seedLoading ?? false,
    seedError: opts?.seedError ?? null,
    thinking: false,
    seedScenario: opts?.seedScenario ?? null,
    situation: {
      fireLevel: opts?.seedScenario ? 1 : 0,
      trappedCount: opts?.seedScenario?.trapped ?? 0,
      damageLevel: 0,
    },
    events: [],
    review: null,
    evaluating: false,
    generation: conf.generation + 1,
    startedAt: Date.now(),
    plannedTotal: opts?.plannedTotal ?? 3,
    lastRound: null,
    deploy: opts?.initialDeploy ? [...opts.initialDeploy] : null,
    agentActivity: null,
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
  if (hitOrMarkDuplicate({ kind: 'inject', specialType: evt.specialType, emergency: evt.emergency, location: evt.location })) return;
  seqCounter += 1;
  const node: ConfrontationEvent = {
    id: evt.id ?? genId('ci'),
    seq: seqCounter,
    kind: 'inject',
    emergency: evt.emergency,
    specialType: evt.specialType,
    location: evt.location,
    delta: evt.delta ? { ...evt.delta } : undefined,
    tSec: evt.tSec,
  };
  const delta = evt.delta;
  conf = {
    ...conf,
    situation: {
      fireLevel: Math.max(0, Math.min(5, conf.situation.fireLevel + (delta?.fireLevelDelta ?? 0))),
      trappedCount: Math.max(0, conf.situation.trappedCount + (delta?.trappedDelta ?? 0)),
      damageLevel: Math.max(0, Math.min(5, conf.situation.damageLevel + (delta?.damageDelta ?? 0))),
      ...(delta?.wind ? { wind: delta.wind } : conf.situation.wind ? { wind: conf.situation.wind } : {}),
    },
    events: [...conf.events, node],
    review: null,
  };
  emit();
}

export function appendAdjust(
  evt: Omit<ConfrontationEvent, 'id' | 'kind' | 'emergency'> & {
    readonly id?: string;
    readonly seq: number;
    readonly emergency?: string;
  },
): void {  if (hitOrMarkDuplicate({ kind: 'adjust', adjustments: evt.adjustments })) return;
  const node: ConfrontationEvent = {
    id: evt.id ?? genId('ca'),
    seq: evt.seq,
    kind: 'adjust',
    emergency: '',
    adjustments: evt.adjustments,
    evidence: evt.evidence ? evt.evidence.map((ev) => ({ ...ev })) : undefined,
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

/** P0 人工决策闭环:人工改派工作台保存时落独立 manual 事件。
 *  seq = 被改派调整对应的特情轮次;emergency = 首行摘要(时间轴/快照用)。 */
export function appendManualDecision(evt: {
  readonly seq: number;
  readonly lines: readonly string[];
  readonly note?: string;
  readonly supersedes?: string;
  readonly tSec: number;
}): void {
  const node: ConfrontationEvent = {
    id: genId('cm'),
    seq: evt.seq,
    kind: 'manual',
    emergency: evt.lines[0] ?? '人工决策',
    adjustments: [...evt.lines],
    note: evt.note,
    supersedes: evt.supersedes,
    tSec: evt.tSec,
  };
  conf = { ...conf, events: [...conf.events, node] };
  emit();
}

/** 当前有效部署基线:有任一人工决策后,以最近一次人工方案为准(后续轮次 Commander 必须尊重);
 *  否则为 Planner 初始部署。 */
export function selectEffectiveDeploy(
  state: Pick<ConfrontationState, 'events' | 'deploy'>,
): { readonly lines: readonly string[]; readonly source: 'planner' | 'manual'; readonly note?: string; readonly atSec?: number } | null {
  const manual = [...state.events].reverse().find((e) => e.kind === 'manual' && e.adjustments?.length);
  if (manual?.adjustments) {
    return { lines: manual.adjustments, source: 'manual', note: manual.note, atSec: manual.tSec };
  }
  return state.deploy?.length ? { lines: state.deploy, source: 'planner' } : null;
}

export function setThinking(v: boolean): void {
  conf = { ...conf, thinking: v };
  emit();
}

export function startAgentActivity(
  role: ConfrontAgentRole,
  appId: string,
  phase: string,
): void {
  conf = {
    ...conf,
    thinking: role === 'adversary',
    agentActivity: {
      role,
      appIdSuffix: appId.slice(-6) || '未配置',
      status: 'running',
      phase,
      startedAt: Date.now(),
      tools: [],
    },
  };
  emit();
}

export function updateAgentActivity(update: {
  phase?: string;
  toolName?: string;
  toolStatus?: ConfrontAgentToolStep['status'];
}): void {
  const activity = conf.agentActivity;
  if (!activity || activity.status !== 'running') return;
  let tools = activity.tools;
  if (update.toolName) {
    if (update.toolStatus === 'done') {
      let updated = false;
      tools = tools.map((tool) => {
        if (!updated && tool.name === update.toolName && tool.status === 'calling') {
          updated = true;
          return { ...tool, status: 'done' as const };
        }
        return tool;
      });
      if (!updated) tools = [...tools, { name: update.toolName, status: 'done' as const }];
    } else {
      tools = [...tools, { name: update.toolName, status: 'calling' as const }];
    }
  }
  conf = {
    ...conf,
    agentActivity: {
      ...activity,
      phase: update.phase ?? activity.phase,
      tools,
    },
  };
  emit();
}

export function finishAgentActivity(status: 'success' | 'error', phase: string): void {
  const activity = conf.agentActivity;
  if (!activity) return;
  conf = {
    ...conf,
    thinking: false,
    agentActivity: {
      ...activity,
      status,
      phase,
      finishedAt: Date.now(),
      tools: activity.tools.map((tool) => ({ ...tool, status: 'done' })),
    },
  };
  emit();
}

export function setEvaluating(v: boolean): void {
  conf = { ...conf, evaluating: v };
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
  conf = {
    ...conf,
    active: false,
    status: conf.status === 'running' ? 'idle' : conf.status,
    thinking: false,
    seedLoading: false,
    agentActivity: conf.agentActivity?.status === 'running' ? null : conf.agentActivity,
  };
  emit();
}
