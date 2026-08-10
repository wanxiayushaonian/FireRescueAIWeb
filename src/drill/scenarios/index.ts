/**
 * Scenario Registry 入口。
 *
 * import 本模块即触发所有内置剧本自注册(building-21 等)到 registry。
 * DrillView 等消费方通过 getScenario/listScenarios 取剧本,不直接 import 具体剧本文件。
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.6
 */

// 副作用 import:触发剧本自注册(顺序敏感,必须在 re-export 前执行)
import './building-21';

export type { DrillScenarioDef } from './types';
export {
  DEFAULT_SCENARIO_ID,
  getScenario,
  getDefaultScenario,
  listScenarios,
  registerScenario,
} from './registry';
