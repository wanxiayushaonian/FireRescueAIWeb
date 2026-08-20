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
