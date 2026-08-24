/**
 * Scenario barrel 自注册契约测试。
 *
 * 关键:本文件**只从 barrel**(@/src/drill/scenarios = index.ts)import,
 * 不直接 import building-21/registry。若 index.ts 遗漏 `import './building-21'`,
 * 生产代码(DrillView import barrel)会拿到空 registry,而本测试会失败——
 * 真正保护架构契约(对比 scenario-registry.test.ts 直接 import building-21,
 * 无法发现 barrel 遗漏)。
 */
import { describe, it, expect } from 'vitest';
import {
  getScenario,
  getDefaultScenario,
  listScenarios,
  DEFAULT_SCENARIO_ID,
} from '@/src/drill/scenarios';

describe('scenario barrel 自注册契约', () => {
  it('import barrel 后默认剧本已注册(index.ts 副作用触发)', () => {
    expect(getScenario(DEFAULT_SCENARIO_ID)).toBeDefined();
    expect(listScenarios().some((s) => s.id === DEFAULT_SCENARIO_ID)).toBe(true);
  });

  it('getDefaultScenario 返回默认剧本(非空)', () => {
    const def = getDefaultScenario();
    expect(def.id).toBe(DEFAULT_SCENARIO_ID);
    expect(def.scenario.fireFloor).toBeTruthy();
  });
});
