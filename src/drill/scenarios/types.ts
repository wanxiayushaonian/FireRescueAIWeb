/**
 * DrillScenarioDef — 演练剧本定义的契约(Scenario Registry 模式)。
 *
 * 一个剧本自包含推演引擎所需的全部配置:身份/场景/态势初始/种子时间线/
 * agent 接线。新剧本 = 加一个文件 + registerScenario() 一行,DrillView 零改动。
 *
 * 设计原则(见 ~/.claude/rules/coding-style.md Factory & Registry):
 * - 不可变(frozen-like,全 readonly)
 * - 剧本定义与引擎逻辑解耦(本文件不依赖 React/DOM)
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.6
 */
import type { DisasterScenario } from '@/lib/drill/disaster-state';
import type { DrillEvent } from '@/lib/drill/event-bus';

/**
 * 演练剧本定义。
 * 每个字段都是推演引擎某环节的入参,DrillView 从 registry 取实例后分发。
 */
export interface DrillScenarioDef {
  /** 剧本唯一标识(registry key;用于 URL/state 持久化)。 */
  readonly id: string;
  /** 展示名(DrillToolbar 下拉显示)。 */
  readonly name: string;
  /** Soonspace 场景 ID(RealSceneView)。 */
  readonly sceneId: string;
  /** 关联建筑档案 id(znya key_buildings,6.0 建筑档案)。 */
  readonly buildingId: string;
  /** 本次演练 id(供 agent/录制溯源;占位值,6.6 后续可生成唯一 id)。 */
  readonly drillId: string;
  /** 指挥 agent app_id(平台 agent-chat SSE 路由)。 */
  readonly commanderAppId: string;
  /**
   * 对抗 agent 触发频率(每 N tick 触发一次;0=禁用对抗)。
   * MVP 默认 0,联调后按剧本配置。
   */
  readonly adversaryEveryNTicks: number;
  /** 对抗 agent app_id(未配置时 triggerAdversary no-op;由 ADVERSARY_APP_ID 环境变量注入)。 */
  readonly adversaryAppId?: string;
  /** 灾情态势初始状态(DisasterState.init 入参)。 */
  readonly scenario: DisasterScenario;
  /**
   * 剧本种子事件(按 ts 升序,EventBus.seed 注入)。
   *
   * NOTE:seed 中的 decision 事件代表**预案战术条令**,在脚本 ts 无条件生效
   * (DisasterState.tacticsActive.add),与运行时 agent 动态决策取并集。剧本作者
   * 应将其视为「指挥员已定的预案处置」,而非「给 agent 的建议」——若需让 agent
   * 全权决策,则不在 seed 中放 decision,改由 AgentRunner 运行时镜像注入。
   */
  readonly seedEvents: readonly DrillEvent[];
  /** 启动时给指挥 agent 的首条 prompt(DrillView.handleStart → triggerCommander)。 */
  readonly briefing: string;
}
