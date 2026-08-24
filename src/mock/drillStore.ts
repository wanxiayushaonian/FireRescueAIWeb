// 演练共享 store：情景参数设置面板（写）与预案输出展示面板（读）通过此 store 通信。
// 两面板互不直接引用，App 只需分别挂载即可。
// 对抗模式（confrontation）状态已迁移至 src/drill/confrontation/confront-store.ts（本文件的旧对抗扩展已删除）。
import type { DrillPlan } from './types';
import type { EmergencyEvent, EvaluationResult, ScenarioParams } from './drill';
import { addLibraryItem, patchLibraryItem } from './planLibrary';
import { createPlan } from '@/api/plans';
import { DRILL_DEMO_BUILDING_ID } from '@/api/building-profile';

export type PlanPhase = 'idle' | 'generating' | 'done';

export interface DrillState {
  /** 最近一次确认的情景参数（null = 未生成过） */
  scenario: ScenarioParams | null;
  phase: PlanPhase;
  plan: DrillPlan | null;
  /** 已注入的突发特情（追加到「处置要点」组末尾） */
  emergencies: EmergencyEvent[];
  evaluating: boolean;
  evaluation: EvaluationResult | null;
  /** 评估次数（影响 mock 评估规则） */
  evaluatedCount: number;
  /** 每次重新生成 +1，供输出面板重置流式进度 */
  generation: number;
}

let state: DrillState = {
  scenario: null,
  phase: 'idle',
  plan: null,
  emergencies: [],
  evaluating: false,
  evaluation: null,
  evaluatedCount: 0,
  generation: 0,
};

type Listener = (s: DrillState) => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function getDrillState(): DrillState {
  return state;
}

export function subscribeDrill(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/** 开始生成：清空上一轮特情/评估，进入 generating */
export function beginGenerate(scenario: ScenarioParams) {
  state = {
    ...state,
    scenario,
    phase: 'generating',
    plan: null,
    emergencies: [],
    evaluating: false,
    evaluation: null,
    generation: state.generation + 1,
  };
  emit();
}

/** 生成完成：写入预案内容（输出面板负责分组流式展示） */
export function finishGenerate(plan: DrillPlan) {
  state = { ...state, phase: 'done', plan };
  emit();
}

export function injectEmergency(e: EmergencyEvent) {
  state = { ...state, emergencies: [...state.emergencies, e], evaluation: null };
  emit();
}

export function beginEvaluate() {
  state = { ...state, evaluating: true, evaluation: null };
  emit();
}

export function finishEvaluate(r: EvaluationResult) {
  state = { ...state, evaluating: false, evaluation: r, evaluatedCount: state.evaluatedCount + 1 };
  emit();
  // 预案评估归档闭环：合格（archived）即入预案库可查
  if (r.archived) {
    const item = addLibraryItem({
      kind: '演练预案',
      title: `${state.scenario?.buildingName ?? '未指定建筑'}火灾处置预案（演练版）`,
      buildingName: state.scenario?.buildingName,
      score: r.score,
      status: '已归档',
      summary: r.opinions,
      sourceDetail: `来源：演练对抗 · 预案评估（评估分 ${r.score}/100，${state.scenario?.floor ?? ''} 情景）`,
    });
    // 真实化：同步在正式预案库建档（21号楼；fire-and-forget）
    void archiveDrillPlanToBackend(state.scenario, r, item.id);
  }
}

/** 演练建筑 mock id → znya key_building_id 映射（仅 21号楼 有真实档案；其余演示建筑仅本地归档） */
const MOCK_BUILDING_TO_ZNYA: Record<string, string> = { jm: DRILL_DEMO_BUILDING_ID };

/**
 * 归档真实化：评估通过后在正式预案库（emergency_plans）建档 draft 记录。
 * fire-and-forget——成功后回写本地条目标记；后端不可达则保持本地归档（演示数据标注），不打扰用户。
 */
async function archiveDrillPlanToBackend(
  scenario: ScenarioParams | null,
  r: EvaluationResult,
  localItemId: string,
): Promise<void> {
  if (!scenario) return;
  const keyBuildingId = MOCK_BUILDING_TO_ZNYA[scenario.buildingId];
  if (!keyBuildingId) return;
  try {
    const plan = await createPlan({
      name: `${scenario.buildingName}火灾处置预案（演练版）`,
      key_building_id: keyBuildingId,
      plan_type: '演练预案',
    });
    if (plan?.id) patchLibraryItem(localItemId, { backendPlanId: plan.id });
  } catch {
    // 后端不通：仅本地归档
  }
}
