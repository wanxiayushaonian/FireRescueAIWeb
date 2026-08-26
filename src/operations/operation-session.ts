// 统一作战会话：演练(source=drill)与实战(source=live)共用的接警→方案→处置基线。
// 不持有 3D/GIS/UI 状态；页面只是同一会话的不同投影。

import type { DecisionEvidence } from '../drill/confrontation/confront-store';

export type OperationSource = 'drill' | 'live';
export type OperationSessionStatus = 'assessing' | 'planned' | 'active' | 'closed';
export type PlanProposalSource = 'agent' | 'fallback';

export interface OperationScenario {
  readonly buildingId: string;
  readonly buildingName: string;
  readonly floor: string;
  readonly material: string;
  readonly trapped: number;
  readonly sceneId?: string;
  readonly lng?: number;
  readonly lat?: number;
}

/** Planner 的可审计初始方案；所有字段来自同一次 preflight 调用。 */
export interface OperationPlanProposal {
  readonly source: PlanProposalSource;
  readonly responseLevel: string;
  readonly forces: readonly string[];
  readonly tactics: readonly string[];
  readonly keyPoints: readonly string[];
  readonly routes: {
    readonly attack: readonly string[];
    readonly evacuate: readonly string[];
  };
  readonly safetyControls: readonly string[];
  readonly reinforcementTriggers: readonly string[];
  readonly evidence: readonly DecisionEvidence[];
  readonly warnings: readonly string[];
  readonly generatedAt: number;
}

export interface OperationSession {
  readonly id: string;
  readonly source: OperationSource;
  readonly status: OperationSessionStatus;
  readonly scenario: OperationScenario;
  readonly initialPlan: OperationPlanProposal | null;
  /** 人工/现场确认后的有效部署；空时以 initialPlan 为准。 */
  readonly effectivePlan: readonly string[] | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

let current: OperationSession | null = null;
const listeners = new Set<(session: OperationSession | null) => void>();

function clone(session: OperationSession | null): OperationSession | null {
  if (!session) return null;
  return {
    ...session,
    scenario: { ...session.scenario },
    initialPlan: session.initialPlan ? {
      ...session.initialPlan,
      forces: [...session.initialPlan.forces],
      tactics: [...session.initialPlan.tactics],
      keyPoints: [...session.initialPlan.keyPoints],
      routes: {
        attack: [...session.initialPlan.routes.attack],
        evacuate: [...session.initialPlan.routes.evacuate],
      },
      safetyControls: [...session.initialPlan.safetyControls],
      reinforcementTriggers: [...session.initialPlan.reinforcementTriggers],
      evidence: session.initialPlan.evidence.map((item) => ({ ...item })),
      warnings: [...session.initialPlan.warnings],
    } : null,
    effectivePlan: session.effectivePlan ? [...session.effectivePlan] : null,
  };
}

function emit(): void {
  const snapshot = clone(current);
  for (const listener of listeners) listener(snapshot);
}

function nextId(source: OperationSource): string {
  return `op_${source}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function startOperationSession(source: OperationSource, scenario: OperationScenario): OperationSession {
  const now = Date.now();
  current = {
    id: nextId(source),
    source,
    status: 'assessing',
    scenario: { ...scenario },
    initialPlan: null,
    effectivePlan: null,
    createdAt: now,
    updatedAt: now,
  };
  emit();
  return clone(current)!;
}

export function setOperationInitialPlan(sessionId: string, plan: OperationPlanProposal): void {
  if (!current || current.id !== sessionId) return;
  current = {
    ...current,
    status: 'planned',
    initialPlan: clone({ ...current, initialPlan: plan })!.initialPlan,
    updatedAt: Date.now(),
  };
  emit();
}

export function setOperationEffectivePlan(sessionId: string, lines: readonly string[]): void {
  if (!current || current.id !== sessionId) return;
  current = {
    ...current,
    effectivePlan: [...lines],
    updatedAt: Date.now(),
  };
  emit();
}

export function setOperationStatus(sessionId: string, status: OperationSessionStatus): void {
  if (!current || current.id !== sessionId) return;
  current = { ...current, status, updatedAt: Date.now() };
  emit();
}

export function getOperationSession(): OperationSession | null {
  return clone(current);
}

export function subscribeOperationSession(listener: (session: OperationSession | null) => void): () => void {
  listeners.add(listener);
  listener(clone(current));
  return () => listeners.delete(listener);
}

/** 测试/重新开局使用；生产只会以新会话覆盖当前会话。 */
export function __resetOperationSessionForTest(): void {
  current = null;
  emit();
}
