/**
 * Scenario Registry 单测。
 *
 * 覆盖:
 * - registry CRUD(register/get/list/重复覆盖)
 * - building-21 剧本定义内容(字段完整性 + seedEvents ts 升序 + 火势曲线关键节点)
 *
 * 放 lib/__tests__ 因根 vitest 仅覆盖 lib/(见 test-coverage-layout 记忆);
 * 被测在 src/drill/scenarios/,经 @ alias(@=repo root)import。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerScenario,
  getScenario,
  listScenarios,
  _clearRegistryForTests,
} from '@/src/drill/scenarios/registry';
import type { DrillScenarioDef } from '@/src/drill/scenarios/types';
import { BUILDING_21_SCENARIO_DEF } from '@/src/drill/scenarios/building-21';
import { DisasterState } from '@/lib/drill/disaster-state';

/** 构造最小合法剧本定义(测试用 factory)。 */
function makeDef(id: string, name = id): DrillScenarioDef {
  return {
    id,
    name,
    sceneId: `scene-${id}`,
    buildingId: `bldg-${id}`,
    drillId: `drill-${id}`,
    commanderAppId: `app-${id}`,
    adversaryEveryNTicks: 0,
    scenario: {
      firePoint: { x: 0, y: 0 },
      material: '电气',
      trappedCount: 1,
      windDirection: 0,
      windSpeed: 0,
      buildingStructure: 'concrete',
      initialFireLevel: 1,
    },
    seedEvents: [],
    briefing: `briefing-${id}`,
  };
}

// ============================================================
// Registry CRUD
// ============================================================

describe('scenario-registry CRUD', () => {
  beforeEach(() => _clearRegistryForTests());

  it('register 后可 get', () => {
    const def = makeDef('a');
    registerScenario(def);
    expect(getScenario('a')).toBe(def);
  });

  it('未注册 id get 返回 undefined', () => {
    expect(getScenario('not-exist')).toBeUndefined();
  });

  it('list 返回全部已注册剧本', () => {
    registerScenario(makeDef('a'));
    registerScenario(makeDef('b'));
    const list = listScenarios();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('空 registry list 返回空数组', () => {
    expect(listScenarios()).toEqual([]);
  });

  it('重复 id 后注册覆盖', () => {
    registerScenario(makeDef('a', 'first'));
    registerScenario(makeDef('a', 'second'));
    expect(getScenario('a')?.name).toBe('second');
    expect(listScenarios()).toHaveLength(1);
  });
});

// ============================================================
// building-21 剧本定义内容(不依赖 registry 全局状态)
// ============================================================

describe('building-21 剧本定义', () => {
  it('身份字段完整(sceneId/buildingId/commanderAppId/drillId 非空)', () => {
    const def = BUILDING_21_SCENARIO_DEF;
    expect(def.id).toBe('building-21');
    expect(def.name).toBeTruthy();
    expect(def.sceneId).toBeTruthy();
    expect(def.buildingId).toBeTruthy();
    expect(def.commanderAppId).toBeTruthy();
    expect(def.drillId).toBeTruthy();
    expect(def.briefing).toBeTruthy();
  });

  it('seedEvents 按 ts 升序(稳定,EventBus.seed 契约)', () => {
    const tsList = BUILDING_21_SCENARIO_DEF.seedEvents.map((e) => e.ts);
    const sorted = [...tsList].sort((a, b) => a - b);
    expect(tsList).toEqual(sorted);
  });

  it('seedEvents 事件 id 唯一(事件树去重依赖)', () => {
    const ids = BUILDING_21_SCENARIO_DEF.seedEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('seedEvents 含关键节点(起火/到场/复燃特情/坍塌特情/出水/搜救/扑灭)', () => {
    const types = BUILDING_21_SCENARIO_DEF.seedEvents.map((e) => e.type);
    expect(types).toContain('disaster');
    expect(types).toContain('arrival');
    expect(types).toContain('special');
    expect(types).toContain('decision');
    expect(types).toContain('status');
  });

  it('钢混结构 + 初起火势(状态机推演基线)', () => {
    expect(BUILDING_21_SCENARIO_DEF.scenario.buildingStructure).toBe('concrete');
    expect(BUILDING_21_SCENARIO_DEF.scenario.initialFireLevel ?? 1).toBe(1);
  });

  it('两支到场力量 ETA 合理(最近站先到 + 增援后到)', () => {
    const arrivals = BUILDING_21_SCENARIO_DEF.seedEvents.filter(
      (e) => e.type === 'arrival',
    );
    expect(arrivals).toHaveLength(2);
    // 最近站 ETA 小于增援
    const etas = arrivals.map((e) => Number(e.payload.eta));
    expect(etas[0]).toBeLessThanOrEqual(etas[1]);
  });

  it('对抗特情含 fireLevelDelta 或 trappedDelta(驱动态势突变)', () => {
    const specials = BUILDING_21_SCENARIO_DEF.seedEvents.filter(
      (e) => e.type === 'special',
    );
    expect(specials.length).toBeGreaterThanOrEqual(1);
    for (const s of specials) {
      const hasDelta =
        s.payload.fireLevelDelta != null || s.payload.trappedDelta != null;
      expect(hasDelta).toBe(true);
    }
  });
});

// ============================================================
// 火势曲线契约(DisasterState 回放 seedEvents,验证非纯信息性)
// 防 regression:有人删 fireLevelDelta / 改 ETA 会破坏曲线
// ============================================================

/** 回放 building-21 seedEvents 到 DisasterState,返回每 tick 的 fireLevel 序列。 */
function replayFireCurve(): number[] {
  const state = new DisasterState();
  state.init(BUILDING_21_SCENARIO_DEF.scenario);
  const events = BUILDING_21_SCENARIO_DEF.seedEvents;
  const maxTs = events.reduce((m, e) => Math.max(m, e.ts), 0);
  const levels: number[] = [state.getStatus().fireLevel];
  for (let clock = 1; clock <= maxTs; clock++) {
    const evs = events.filter((e) => e.ts === clock);
    state.tick(evs);
    levels.push(state.getStatus().fireLevel);
  }
  return levels;
}

describe('building-21 火势曲线(状态机回放)', () => {
  it('峰值火势达 3 级(电气复燃特情 fireLevelDelta 所致)', () => {
    const peak = Math.max(...replayFireCurve());
    expect(peak).toBe(3);
  });

  it('回放结束后明火扑灭(fireLevel=0)', () => {
    const levels = replayFireCurve();
    expect(levels[levels.length - 1]).toBe(0);
  });

  it('曲线非平坦(有升有降,非纯信息性)', () => {
    const levels = replayFireCurve();
    const set = new Set(levels);
    expect(set.size).toBeGreaterThanOrEqual(3); // 至少经历 3 个不同等级
  });
});
