/**
 * DrillScenarioDef — 演练剧本定义的契约（Scenario Registry 模式）。
 *
 * 2026-08-24 精简：旧 tick 推演引擎（lib/drill：TimelineEngine/DisasterState/
 * AgentRunner 等）已从 UI 摘线并删除——演练对抗的运行时引擎是
 * src/drill/confrontation/（confront-driver + confront-store，真实秒制）。
 * 本契约只保留 DrillView/对抗舱实际消费的字段：身份 + 灾情种子参数。
 *
 * 设计原则（见 ~/.claude/rules/coding-style.md Factory & Registry）：
 * - 不可变（frozen-like，全 readonly）
 * - 剧本定义与 UI 解耦（本文件不依赖 React/DOM）
 */

/** 灾情种子参数（对抗舱开局的默认值来源）。 */
export interface ScenarioSeed {
  /** 着火层（如 '5F'）。 */
  readonly fireFloor?: string;
  /** 燃烧物质（如 '电气'）。 */
  readonly material?: string;
  /** 被困人数。 */
  readonly trappedCount?: number;
}

/**
 * 演练剧本定义。
 * DrillView 从 registry 取实例后分发：工具条下拉（id/name）+
 * 对抗舱灾情种子（scenario）。
 */
export interface DrillScenarioDef {
  /** 剧本唯一标识（registry key）。 */
  readonly id: string;
  /** 展示名（DrillToolbar 下拉显示）。 */
  readonly name: string;
  /** Soonspace 场景 ID（RealSceneView）。 */
  readonly sceneId: string;
  /** 关联建筑档案 id（znya key_buildings）。 */
  readonly buildingId: string;
  /** 本次演练 id（供 agent/录制溯源）。 */
  readonly drillId: string;
  /** 灾情种子参数（对抗舱开局默认值）。 */
  readonly scenario: ScenarioSeed;
}
