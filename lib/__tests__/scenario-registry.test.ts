/**
 * Scenario Registry 单测。
 *
 * 覆盖:
 * - registry CRUD(register/get/list/重复覆盖)
 * - building-21 剧本定义内容(身份字段 + 灾情种子参数)
 *
 * 放 lib/__tests__ 因根 vitest 仅覆盖 lib/(见 test-coverage-layout 记忆);
 * 被测在 src/drill/scenarios/,经 @ alias(@=repo root)import。
 *
 * 2026-08-24:旧 tick 引擎(lib/drill)删除后,剧本契约精简为身份+种子参数,
 * 原 seedEvents/火势曲线回放断言随引擎一并移除。
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

/** 构造最小合法剧本定义(测试用 factory)。 */
function makeDef(id: string, name = id): DrillScenarioDef {
  return {
    id,
    name,
    sceneId: `scene-${id}`,
    buildingId: `bldg-${id}`,
    drillId: `drill-${id}`,
    scenario: { fireFloor: '5F', material: '电气', trappedCount: 1 },
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
  it('身份字段完整(sceneId/buildingId/drillId 非空)', () => {
    const def = BUILDING_21_SCENARIO_DEF;
    expect(def.id).toBe('building-21');
    expect(def.name).toBeTruthy();
    expect(def.sceneId).toBeTruthy();
    expect(def.buildingId).toBeTruthy();
    expect(def.drillId).toBeTruthy();
  });

  it('灾情种子参数完整(对抗舱开局默认值)', () => {
    const { scenario } = BUILDING_21_SCENARIO_DEF;
    expect(scenario.fireFloor).toBeTruthy();
    expect(scenario.material).toBeTruthy();
    expect(scenario.trappedCount).toBeGreaterThan(0);
  });
});
