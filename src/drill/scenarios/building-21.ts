/**
 * 21号楼演练剧本。
 *
 * 乐盈广场 21 号楼，5 层电气起火，钢混结构。
 *
 * 2026-08-24 精简：旧 tick 引擎（seedEvents 时间线/briefing/agent 频率配置）
 * 随 lib/drill 一并删除；本文件保留真实场景 ID 常量（对抗舱在用）+
 * 灾情种子参数（DrillView/对抗舱开局默认值）。
 *
 * 常量 ID（scene_id/building_id）从 SSE 格式文档实测。
 *
 * @see plan/drill-agent-chat-sse-format.md（app_id/scene_id 实测）
 */
import type { DrillScenarioDef } from './types';
import { registerScenario } from './registry';

// ============================================================
// 常量 ID（实测，从 SSE 格式文档）
// ============================================================

/** 21号楼场景 ID（Soonspace 场景）：21D（完整包演示包），平台 2026-08-14 提供。 */
export const BUILDING_21_SCENE_ID = '478488321394200576';

/** 21号楼 znya key_buildings id。 */
export const BUILDING_21_ID = '1c2d4772-831d-4c77-b88a-f9565ad589c7';

/** 当前演练 id（占位；后续可生成唯一 id）。 */
export const BUILDING_21_DRILL_ID = 'drill-building-21-001';

// ============================================================
// 剧本定义 + 注册
// ============================================================

/** 21号楼剧本定义。 */
export const BUILDING_21_SCENARIO_DEF: DrillScenarioDef = {
  id: 'building-21',
  name: '21号楼·5层电气火灾',
  sceneId: BUILDING_21_SCENE_ID,
  buildingId: BUILDING_21_ID,
  drillId: BUILDING_21_DRILL_ID,
  scenario: {
    fireFloor: '5F',
    material: '电气',
    trappedCount: 5,
  },
};

/** 模块加载即注册（由 index.ts import 触发）。 */
registerScenario(BUILDING_21_SCENARIO_DEF);
