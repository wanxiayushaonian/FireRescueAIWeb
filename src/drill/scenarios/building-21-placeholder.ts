/**
 * 21号楼占位剧本(6.5 MVP,6.6 完善)。
 *
 * 提供推演引擎所需的最小剧本:
 * - BUILDING_21_SCENARIO:DisasterState.init 的入参(着火点/物质/被困/风向/建筑结构)
 * - BUILDING_21_SEED_EVENTS: EventBus.seed 的剧本事件(按 ts 有序)
 * - 常量 ID:场景/建筑/指挥 agent(从 SSE 格式文档实测)
 *
 * 注意:6.5 占位,6.6 补充真实剧本(更细时间线 + 真实力量 ETA + 对抗 agent app_id)。
 *
 * @see plan/drill-agent-chat-sse-format.md(app_id/scene_id 实测)
 */
import type { DisasterScenario } from '@/lib/drill/disaster-state';
import type { DrillEvent } from '@/lib/drill/event-bus';

// ============================================================
// 常量 ID(实测,从 SSE 格式文档)
// ============================================================

/** 21号楼场景 ID(Soonspace 场景)。 */
export const BUILDING_21_SCENE_ID = '465718852859613184';

/** 21号楼 znya key_buildings id。 */
export const BUILDING_21_ID = '1c2d4772-831d-4c77-b88a-f9565ad589c7';

/** 主智能体 app_id(指挥 agent)。 */
export const COMMANDER_APP_ID = '2084563280205111297';

/** 当前演练 id(占位;6.6 按需生成唯一 id)。 */
export const BUILDING_21_DRILL_ID = 'drill-building-21-001';

// ============================================================
// 剧本:DisasterScenario
// ============================================================

/**
 * 21号楼灾情初始态势。
 * initialFireLevel=1(初起火);concrete 钢混结构(STRUCTURE_FIRE_MODIFIER=1.5,较耐燃)。
 */
export const BUILDING_21_SCENARIO: DisasterScenario = {
  firePoint: { x: 0, y: 0 },
  material: '电气',
  trappedCount: 5,
  windDirection: 90,
  windSpeed: 3,
  buildingStructure: 'concrete',
  initialFireLevel: 1,
};

// ============================================================
// 剧本事件:按 ts 有序 seed
// ============================================================

/**
 * 21号楼种子事件(按 ts 升序)。
 *
 * 时间线(MVP):
 * - ts=0:灾情事件(21号楼5层电气起火)——信息性,不驱动状态机(initialFireLevel 已设)
 * - ts=2:最近站力量到场(1站2车8人,ETA=3 → ts=5 到场)
 * - ts=3:灾情蔓延状态(火势发展,信息性)
 * - ts=4:增援力量(2站4车16人,ETA=5 → ts=9 到场)
 * - ts=8:灾情发展状态(火势扩大)
 *
 * ETA 语义(见 disaster-state.advanceForces):arrival 注册后,从下一 tick 起 ETA 递减,
 * ETA 归零转 arrived。
 */
export const BUILDING_21_SEED_EVENTS: readonly DrillEvent[] = [
  {
    id: 'seed-b21-disaster-0',
    ts: 0,
    type: 'disaster',
    payload: {
      description: '21号楼5层电气起火,火势初起阶段',
      location: '5F',
      material: '电气',
    },
  },
  {
    id: 'seed-b21-arrival-2',
    ts: 2,
    type: 'arrival',
    payload: {
      forceId: 'b21-nearest-station',
      stations: 1,
      vehicles: 2,
      personnel: 8,
      eta: 3,
    },
  },
  {
    id: 'seed-b21-status-3',
    ts: 3,
    type: 'status',
    payload: {
      description: '火势发展,烟气蔓延至6层,能见度下降',
    },
  },
  {
    id: 'seed-b21-arrival-4',
    ts: 4,
    type: 'arrival',
    payload: {
      forceId: 'b21-support-station',
      stations: 2,
      vehicles: 4,
      personnel: 16,
      eta: 5,
    },
  },
  {
    id: 'seed-b21-status-8',
    ts: 8,
    type: 'status',
    payload: {
      description: '火势持续扩大,有向7层蔓延风险',
    },
  },
];
