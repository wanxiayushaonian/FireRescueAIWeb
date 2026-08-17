/**
 * 21号楼演练剧本(真实版,替代 placeholder)。
 *
 * 乐盈广场 21 号楼,5 层电气起火,钢混结构。完整灾情演化时间线:
 * 初起 → 烟气蔓延 → 力量到场 → 排烟 → 火势升级 → 电气复燃(对抗特情) →
 * 出水压制 → 增援 → 坍塌新增被困(对抗特情) → 搜救 → 泡沫覆盖 → 明火扑灭。
 *
 * 火势曲线(状态机推演验证):1 →(ts8)→ 2 →(ts9 复燃)→ 3 →(ts12)→ 2 →
 * (ts15)→ 1 →(ts18)→ 0(灭)。有升有降有特情,非纯信息性。
 *
 * 常量 ID(scene_id/building_id/app_id)从 SSE 格式文档实测。
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.6
 * @see plan/drill-agent-chat-sse-format.md(app_id/scene_id 实测)
 */
import type { DrillEvent } from '@/lib/drill/event-bus';
import type { DrillScenarioDef } from './types';
import { registerScenario } from './registry';
import { ADVERSARY_APP_ID, DRILL_COMMANDER_APP_ID } from '@/lib/agent-app-ids';

// ============================================================
// 常量 ID(实测,从 SSE 格式文档)
// ============================================================

/** 21号楼场景 ID(Soonspace 场景):21D(完整包演示包),平台 2026-08-14 提供。 */
export const BUILDING_21_SCENE_ID = '478488321394200576';

/** 21号楼 znya key_buildings id。 */
export const BUILDING_21_ID = '1c2d4772-831d-4c77-b88a-f9565ad589c7';

/** 主智能体 app_id(指挥 agent)。原 2084563280205111297 实测 AppNotFound,改用「总智能体」(见 lib/agent-app-ids)。 */
export const COMMANDER_APP_ID = '2087535122373074946';

/** 当前演练 id(占位;后续可生成唯一 id)。 */
export const BUILDING_21_DRILL_ID = 'drill-building-21-001';

// ============================================================
// 种子事件时间线(按 ts 升序)
// ============================================================

/**
 * 21号楼种子事件。
 *
 * ETA 语义(见 disaster-state.advanceForces):arrival 注册后,从下一 tick 起
 * ETA 递减,归零转 arrived。故 ts=T 注册 eta=E → ts=T+E 到场。
 *
 * 预设 decision 事件代表「指挥员按预案处置」,与运行时 agent 动态决策叠加
 * (agent 在线时经 AgentRunner 镜像注入,不冲突)。
 */
export const BUILDING_21_SEED_EVENTS: readonly DrillEvent[] = [
  // ts=0:灾情事件(信息性;initialFireLevel 已设)
  {
    id: 'seed-b21-disaster-0',
    ts: 0,
    type: 'disaster',
    payload: {
      description: '21号楼5层电气起火,初起阶段,有人员被困',
      location: '5F',
      material: '电气',
    },
  },
  // ts=2:烟气蔓延(信息性)
  {
    id: 'seed-b21-status-2',
    ts: 2,
    type: 'status',
    payload: {
      description: '烟气经管道井向上蔓延(烟囱效应),6层开始进烟',
    },
  },
  // ts=3:最近站力量派遣(ETA=3 → ts=6 到场)
  {
    id: 'seed-b21-arrival-3',
    ts: 3,
    type: 'arrival',
    payload: {
      forceId: 'b21-nearest-station',
      stations: 1,
      vehicles: 2,
      personnel: 8,
      eta: 3,
    },
  },
  // ts=5:火势发展(信息性)
  {
    id: 'seed-b21-status-5',
    ts: 5,
    type: 'status',
    payload: {
      description: '5层火势发展,烟气积聚至6-7层,能见度下降',
    },
  },
  // ts=7:预案决策——排烟通风(非压制战术;让火势继续 escalate 到 ts=8 升级)
  {
    id: 'seed-b21-decision-7-vent',
    ts: 7,
    type: 'decision',
    payload: {
      tactic: 'ventilation',
      decisionText: '到场后启动机械排烟,降低6-7层烟气浓度,为内攻创造条件',
    },
  },
  // ts=9:对抗特情——电气短路复燃(fireLevelDelta +1;此时 fireLevel=2(ts8 escalate 所致),+1 → 3)
  {
    id: 'seed-b21-special-9',
    ts: 9,
    type: 'special',
    payload: {
      description: '电气线路短路复燃,火势突然加剧,引燃周边可燃物',
      fireLevelDelta: 1,
    },
  },
  // ts=10:状态(信息性)
  {
    id: 'seed-b21-status-10',
    ts: 10,
    type: 'status',
    payload: {
      description: '复燃后火势猛烈(3级),5-6层全面燃烧,热辐射强烈',
    },
  },
  // ts=10:预案决策——出水压制
  {
    id: 'seed-b21-decision-10-water',
    ts: 10,
    type: 'decision',
    payload: {
      tactic: 'water',
      decisionText: '部署两支水枪出水压制5层火点,控制火势蔓延',
    },
  },
  // ts=11:增援力量派遣(ETA=5 → ts=16 到场)
  {
    id: 'seed-b21-arrival-11',
    ts: 11,
    type: 'arrival',
    payload: {
      forceId: 'b21-support-station',
      stations: 2,
      vehicles: 4,
      personnel: 16,
      eta: 5,
    },
  },
  // ts=12:状态(信息性)
  {
    id: 'seed-b21-status-12',
    ts: 12,
    type: 'status',
    payload: {
      description: '出水压制见效,火势开始收缩(2级),但仍未控制',
    },
  },
  // ts=14:状态(信息性)
  {
    id: 'seed-b21-status-14',
    ts: 14,
    type: 'status',
    payload: {
      description: '增援力量途中,火势维持2级,内攻组持续推进',
    },
  },
  // ts=15:对抗特情——局部吊顶坍塌(新增被困)
  {
    id: 'seed-b21-special-15',
    ts: 15,
    type: 'special',
    payload: {
      description: '5层局部吊顶受热坍塌,3名被困人员转移至新区域',
      trappedDelta: 3,
    },
  },
  // ts=15:预案决策——组织搜救(rescue 激活后每 tick 救出 rescuePerTick 人)
  {
    id: 'seed-b21-decision-15-rescue',
    ts: 15,
    type: 'decision',
    payload: {
      tactic: 'rescue',
      decisionText: '坍塌后新增被困,立即组织搜救组进入5层搜救',
    },
  },
  // ts=16:状态(信息性)
  {
    id: 'seed-b21-status-16',
    ts: 16,
    type: 'status',
    payload: {
      description: '增援力量到场,火势降至1级,搜救持续进行',
    },
  },
  // ts=18:预案决策——泡沫覆盖(电气设备复燃区改用泡沫)
  {
    id: 'seed-b21-decision-18-foam',
    ts: 18,
    type: 'decision',
    payload: {
      tactic: 'foam',
      decisionText: '电气设备复燃区改用泡沫覆盖,彻底窒息灭火',
    },
  },
  // ts=20:状态(信息性)
  {
    id: 'seed-b21-status-20',
    ts: 20,
    type: 'status',
    payload: {
      description: '明火扑灭,继续出水冷却监护,清点被困人员',
    },
  },
];

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
  // 指挥 agent:NEXT_PUBLIC_DRILL_COMMANDER_APP_ID 注入专属「演练指挥官」应用(未配回退通用 app,
  // 无指挥角色配置——决策只调无关工具、3D 零联动,2026-08-17 演练实测)
  commanderAppId: DRILL_COMMANDER_APP_ID,
  // 对抗 agent:ADVERSARY_APP_ID(NEXT_PUBLIC_ADVERSARY_APP_ID)注入即启用(每 5 tick 注入一次特情);
  // 未配置时保持 0 禁用(triggerAdversary 对空 appId 也是 no-op,双保险)
  adversaryEveryNTicks: ADVERSARY_APP_ID ? 5 : 0,
  adversaryAppId: ADVERSARY_APP_ID || undefined,
  scenario: {
    firePoint: { x: 0, y: 0 },
    material: '电气',
    trappedCount: 5,
    windDirection: 90,
    windSpeed: 3,
    buildingStructure: 'concrete',
    initialFireLevel: 1,
  },
  seedEvents: BUILDING_21_SEED_EVENTS,
  briefing:
    '演练开始:21号楼5层电气起火,火势初起,钢混结构,有人员被困。' +
    '请评估态势、部署力量、下达战术决策(出水压制/排烟/搜救/泡沫)。',
};

/** 模块加载即注册(由 index.ts import 触发)。 */
registerScenario(BUILDING_21_SCENARIO_DEF);
