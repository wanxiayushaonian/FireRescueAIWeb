/**
 * 乐盈广场 21 号楼演练常量（2026-08-24 剧本机制移除后内联）。
 *
 * 原 drill/scenarios 剧本注册表仅含 21 号楼一个剧本（决赛演示固定），
 * 剧本对象只被 DrillView 用于取灾情种子默认值、被对抗舱用于取 id 常量——
 * 故移除剧本概念，常量直接内联此处。
 *
 * 常量 ID（scene_id/building_id）从 SSE 格式文档实测。
 *
 * @see plan/drill-agent-chat-sse-format.md（app_id/scene_id 实测）
 */

/** 21号楼场景 ID（Soonspace 场景）：21D（完整包演示包），平台 2026-08-14 提供。 */
export const BUILDING_21_SCENE_ID = '478488321394200576';

/** 21号楼 znya key_buildings id。 */
export const BUILDING_21_ID = '1c2d4772-831d-4c77-b88a-f9565ad589c7';

/** 当前演练 id（占位；后续可生成唯一 id）。 */
export const BUILDING_21_DRILL_ID = 'drill-building-21-001';

/** 灾情种子默认值：情景参数面板未设置参数时进入对抗模式的兜底（21号楼 5 层电气起火）。 */
export const DEFAULT_DISASTER_SEED = {
  floor: '5F',
  material: '电气',
  trapped: 5,
} as const;
