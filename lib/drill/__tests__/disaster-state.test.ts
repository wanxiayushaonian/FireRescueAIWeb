import { describe, it, expect } from 'vitest';
import {
  DisasterState,
  DEFAULT_DISASTER_RULES,
  STRUCTURE_FIRE_MODIFIER,
  type DisasterScenario,
} from '../disaster-state';
import type { DrillEvent } from '../event-bus';

/**
 * DisasterState 单测 —— 验证火势/到场/战术/被困/损伤 的规则推进。
 * 纯逻辑,确定性:相同 init + events → 相同 getStatus()。
 *
 * 默认规则(fireEscalateTicks=5, fireSuppressTicks=3, rescuePerTick=2):
 * - 混合结构(modifier=1.0):每 5 tick 升一级,每 3 tick 降一级
 * - 木质(modifier=0.6):每 ceil(5*0.6)=3 tick 升一级(更快)
 * - 钢混(modifier=1.5):每 ceil(5*1.5)=8 tick 升一级(更慢)
 */

const SCENARIO: DisasterScenario = {
  firePoint: { x: 100, y: 200 },
  material: '办公用品',
  trappedCount: 10,
  windDirection: 90,
  windSpeed: 3,
  buildingStructure: 'mixed',
  initialFireLevel: 1,
};

/** 构造 arrival 事件。 */
function arrivalEvent(
  ts: number,
  p: { forceId: string; stations?: number; vehicles?: number; personnel?: number; eta: number },
): DrillEvent {
  return {
    id: `arr-${p.forceId}`,
    ts,
    type: 'arrival',
    payload: {
      forceId: p.forceId,
      stations: p.stations ?? 1,
      vehicles: p.vehicles ?? 2,
      personnel: p.personnel ?? 10,
      eta: p.eta,
    },
  };
}

/** 构造 decision 事件。 */
function decisionEvent(
  ts: number,
  tactic: 'water' | 'foam' | 'rescue' | 'ventilation',
  extra: Record<string, unknown> = {},
): DrillEvent {
  return {
    id: `dec-${ts}-${tactic}`,
    ts,
    type: 'decision',
    payload: { tactic, ...extra },
  };
}

/** 构造 special 事件。 */
function specialEvent(
  ts: number,
  payload: Record<string, unknown>,
): DrillEvent {
  return { id: `spec-${ts}`, ts, type: 'special', payload };
}

/** 连续推 N 个 tick(不传事件)。 */
function runTicks(state: DisasterState, n: number): void {
  for (let i = 0; i < n; i++) {
    state.tick([]);
  }
}

describe('DisasterState', () => {
  // ============================================================
  // init / 初始状态
  // ============================================================

  it('init 设置初始状态(fireLevel/trapped/wind/损伤=0/无力量)', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    const s = state.getStatus();
    expect(s.clock).toBe(0);
    expect(s.fireLevel).toBe(1);
    expect(s.trappedCount).toBe(10);
    expect(s.rescuedCount).toBe(0);
    expect(s.buildingDamage).toBe(0);
    expect(s.forces).toEqual([]);
    expect(s.availableForces).toEqual({ stations: 0, vehicles: 0, personnel: 0 });
    expect(s.suppressionActive).toBe(false);
    expect(s.rescueActive).toBe(false);
    expect(s.windDirection).toBe(90);
    expect(s.windSpeed).toBe(3);
    expect(s.fireSpreadDirection).toBe(90); // 等于风向
  });

  it('init 默认 initialFireLevel=1(省略时)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: undefined });
    expect(state.getStatus().fireLevel).toBe(1);
  });

  it('init 可重置(多次调用回到 t=0)', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    runTicks(state, 20);
    expect(state.getStatus().clock).toBe(20);

    state.init(SCENARIO);
    expect(state.getStatus().clock).toBe(0);
    expect(state.getStatus().fireLevel).toBe(1);
  });

  // ============================================================
  // 火势规则 —— 蔓延(无压制)
  // ============================================================

  it('火势无压制时每 N tick 升一级(mixed:5 tick → +1)', () => {
    const state = new DisasterState();
    state.init(SCENARIO); // initialFireLevel=1
    runTicks(state, 4);
    expect(state.getStatus().fireLevel).toBe(1); // 4 tick 仍未升级
    runTicks(state, 1); // 第 5 tick
    expect(state.getStatus().fireLevel).toBe(2); // 升级
    runTicks(state, 5); // 再 5 tick
    expect(state.getStatus().fireLevel).toBe(3);
  });

  it('火势封顶在 fireMaxLevel(=4),不继续升级', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 4 });
    runTicks(state, 20);
    expect(state.getStatus().fireLevel).toBe(4);
  });

  it('火势在 0(熄灭)时不自行升级(hold)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 0 });
    runTicks(state, 20);
    expect(state.getStatus().fireLevel).toBe(0);
  });

  it('木质结构蔓延更快(modifier=0.6 → 每 ceil(5*0.6)=3 tick 升一级)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, buildingStructure: 'wood', initialFireLevel: 1 });
    runTicks(state, 2);
    expect(state.getStatus().fireLevel).toBe(1);
    runTicks(state, 1); // 第 3 tick
    expect(state.getStatus().fireLevel).toBe(2); // 升级
  });

  it('钢混结构蔓延更慢(modifier=1.5 → 每 ceil(5*1.5)=8 tick 升一级)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, buildingStructure: 'concrete', initialFireLevel: 1 });
    runTicks(state, 7);
    expect(state.getStatus().fireLevel).toBe(1);
    runTicks(state, 1); // 第 8 tick
    expect(state.getStatus().fireLevel).toBe(2);
  });

  // ============================================================
  // 到场力量 —— ETA 倒计时
  // ============================================================

  it('arrival 事件注册力量(eta=0 立即到场)', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    state.tick([arrivalEvent(0, { forceId: 'f1', eta: 0 })]);

    const s = state.getStatus();
    expect(s.forces).toHaveLength(1);
    expect(s.forces[0].status).toBe('arrived');
    expect(s.availableForces).toEqual({ stations: 1, vehicles: 2, personnel: 10 });
  });

  it('ETA 倒计时:eta=3 表示 3 tick 后到场(tick1 注册, tick4 到场)', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    state.tick([arrivalEvent(0, { forceId: 'f1', eta: 3 })]);

    // tick 1 处理后:力量 en_route, eta=3(advanceForces 先于事件,新力量本 tick 不递减)
    let s = state.getStatus();
    expect(s.forces[0].status).toBe('en_route');
    expect(s.forces[0].eta).toBe(3);
    expect(s.availableForces.vehicles).toBe(0);

    runTicks(state, 1); // tick 2: advanceForces → eta=2
    expect(state.getStatus().forces[0].eta).toBe(2);

    runTicks(state, 1); // tick 3: eta=1
    expect(state.getStatus().forces[0].eta).toBe(1);

    runTicks(state, 1); // tick 4: eta=0 → arrived
    s = state.getStatus();
    expect(s.forces[0].status).toBe('arrived');
    expect(s.availableForces.vehicles).toBe(2);
  });

  it('ETA=1 表示 1 tick 后到场', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    state.tick([arrivalEvent(0, { forceId: 'f1', eta: 1 })]);

    expect(state.getStatus().forces[0].status).toBe('en_route');
    runTicks(state, 1); // 下一 tick advanceForces → eta=0 → arrived
    expect(state.getStatus().forces[0].status).toBe('arrived');
  });

  it('同 forceId 不重复注册', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    state.tick([arrivalEvent(0, { forceId: 'f1', eta: 0 })]);
    state.tick([arrivalEvent(1, { forceId: 'f1', eta: 0 })]);

    expect(state.getStatus().forces).toHaveLength(1);
  });

  it('多支力量独立倒计时(分别到场)', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    state.tick([
      arrivalEvent(0, { forceId: 'f1', eta: 1 }),
      arrivalEvent(0, { forceId: 'f2', eta: 3 }),
    ]);

    runTicks(state, 1);
    const s1 = state.getStatus();
    expect(s1.forces.find((f) => f.forceId === 'f1')?.status).toBe('arrived');
    expect(s1.forces.find((f) => f.forceId === 'f2')?.status).toBe('en_route');
    expect(s1.availableForces.stations).toBe(1); // 仅 f1

    runTicks(state, 2);
    const s2 = state.getStatus();
    expect(s2.forces.find((f) => f.forceId === 'f2')?.status).toBe('arrived');
    expect(s2.availableForces.stations).toBe(2);
  });

  // ============================================================
  // 战术 —— 压制火势
  // ============================================================

  it('压制生效(water + 到场消防车):每 3 tick 降一级', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 3 });

    // tick 0: 派一辆消防车(eta=0 立即到场)+ 下达 water 决策
    state.tick([
      arrivalEvent(0, { forceId: 'f1', vehicles: 2, eta: 0 }),
      decisionEvent(0, 'water'),
    ]);

    expect(state.getStatus().suppressionActive).toBe(true);
    expect(state.getStatus().fireLevel).toBe(3); // 本 tick 尚未降(计数器刚启动)

    runTicks(state, 3); // 3 tick 后降一级
    expect(state.getStatus().fireLevel).toBe(2);

    runTicks(state, 3);
    expect(state.getStatus().fireLevel).toBe(1);

    runTicks(state, 3);
    expect(state.getStatus().fireLevel).toBe(0); // 降到最低
  });

  it('压制到 0 后停止(suppressionActive 但 fireLevel=0 → hold)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 1 });
    state.tick([
      arrivalEvent(0, { forceId: 'f1', vehicles: 1, eta: 0 }),
      decisionEvent(0, 'water'),
    ]);
    runTicks(state, 5); // 足够降到 0
    expect(state.getStatus().fireLevel).toBe(0);

    // 继续推进,火势保持 0(不会重新升级,因 fireLevel=0 不进入蔓延分支)
    runTicks(state, 20);
    expect(state.getStatus().fireLevel).toBe(0);
  });

  it('foam 同样触发压制(与 water 等效)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 2 });
    state.tick([
      arrivalEvent(0, { forceId: 'f1', vehicles: 1, eta: 0 }),
      decisionEvent(0, 'foam'),
    ]);
    expect(state.getStatus().suppressionActive).toBe(true);
    runTicks(state, 3);
    expect(state.getStatus().fireLevel).toBe(1);
  });

  it('有 water 决策但无到场消防车 → 压制不生效,火势继续蔓延', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 1 });
    state.tick([
      arrivalEvent(0, { forceId: 'f1', vehicles: 2, eta: 5 }), // 还在路上
      decisionEvent(0, 'water'),
    ]);
    expect(state.getStatus().suppressionActive).toBe(false); // 无到场消防车

    // 火势仍按蔓延规则(mixed:5 tick 升一级)
    runTicks(state, 5);
    expect(state.getStatus().fireLevel).toBe(2);
  });

  it('模式切换重置计数器(蔓延→压制→再蔓延)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 1 });

    // 蔓延 3 tick(计数器=3/5,未升级)
    runTicks(state, 3);
    expect(state.getStatus().fireLevel).toBe(1);

    // 切到压制:消防车到场 + water(本 tick advanceFire 已计入 suppress 计数器=1)
    state.tick([
      arrivalEvent(3, { forceId: 'f1', vehicles: 1, eta: 0 }),
      decisionEvent(3, 'water'),
    ]);
    // 压制需要 fireSuppressTicks(3) tick 降一级;决策 tick 已计 1,再 1 tick → 计数器=2
    runTicks(state, 1);
    expect(state.getStatus().fireLevel).toBe(1); // 计数器=2,仍未降
    runTicks(state, 1); // 计数器=3 → 降
    expect(state.getStatus().fireLevel).toBe(0);
  });

  // ============================================================
  // 战术 —— 救援被困
  // ============================================================

  it('救援生效(rescue + 到场人员):每 tick 救出 rescuePerTick(=2)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 1, trappedCount: 10 });
    state.tick([
      arrivalEvent(0, { forceId: 'f1', personnel: 10, eta: 0 }),
      decisionEvent(0, 'rescue'),
    ]);

    expect(state.getStatus().rescueActive).toBe(true);

    // 初始 tick 已救 2 人;再 3 tick → 共 4 tick * 2 = 8 人
    runTicks(state, 3);
    const s = state.getStatus();
    expect(s.rescuedCount).toBe(8); // 4 tick * 2/tick
    expect(s.trappedCount).toBe(2); // 10 - 8
  });

  it('救援到 0 后停止(不低于 0)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, trappedCount: 3 });
    state.tick([
      arrivalEvent(0, { forceId: 'f1', personnel: 5, eta: 0 }),
      decisionEvent(0, 'rescue'),
    ]);

    runTicks(state, 10); // 远超所需
    const s = state.getStatus();
    expect(s.trappedCount).toBe(0);
    expect(s.rescuedCount).toBe(3); // 不超过初始被困数
  });

  it('有 rescue 决策但无到场人员 → 救援不生效', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, trappedCount: 10 });
    state.tick([
      arrivalEvent(0, { forceId: 'f1', personnel: 10, eta: 5 }), // 还在路上
      decisionEvent(0, 'rescue'),
    ]);
    expect(state.getStatus().rescueActive).toBe(false);

    runTicks(state, 3);
    expect(state.getStatus().rescuedCount).toBe(0);
  });

  // ============================================================
  // 特情(special)—— 对抗注入
  // ============================================================

  it('special fireLevelDelta 即时改变火势(爆炸 +2)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 1 });
    state.tick([specialEvent(0, { description: '爆炸', fireLevelDelta: 2 })]);
    expect(state.getStatus().fireLevel).toBe(3);
  });

  it('special fireLevelDelta 封顶在 fireMaxLevel', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 3 });
    state.tick([specialEvent(0, { description: '连环爆炸', fireLevelDelta: 10 })]);
    expect(state.getStatus().fireLevel).toBe(4);
  });

  it('special trappedDelta 即时改变被困(坍塌 +5)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, trappedCount: 10 });
    state.tick([specialEvent(0, { description: '坍塌', trappedDelta: 5 })]);
    expect(state.getStatus().trappedCount).toBe(15);
  });

  it('special damageDelta 即时改变损伤', () => {
    const state = new DisasterState();
    state.init(SCENARIO); // initialFireLevel=1
    state.tick([specialEvent(0, { description: '结构损伤', damageDelta: 0.5 })]);
    // special 加 0.5;本 tick 还叠加损伤增长(base 0.001 + perLevel 0.003 * fireLevel 1 = 0.004)
    expect(state.getStatus().buildingDamage).toBeCloseTo(0.504, 5);
  });

  // ============================================================
  // 建筑损伤
  // ============================================================

  it('建筑损伤每 tick 按 fireLevel 线性增长(base + perLevel * level)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 2 });
    state.tick([]); // 1 tick
    const expectedDmg = DEFAULT_DISASTER_RULES.damageGrowthBase +
      DEFAULT_DISASTER_RULES.damageGrowthPerLevel * 2;
    expect(state.getStatus().buildingDamage).toBeCloseTo(expectedDmg, 5);
  });

  it('建筑损伤封顶 1.0', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 4 });
    runTicks(state, 200); // 足够长时间
    const dmg = state.getStatus().buildingDamage;
    expect(dmg).toBeLessThanOrEqual(1.0);
    expect(dmg).toBeCloseTo(1.0, 2);
  });

  // ============================================================
  // 确定性(回溯/测试核心保证)
  // ============================================================

  it('确定性:相同 init + 相同 events 序列 → 相同演化', () => {
    const buildEvents = (tick: number): DrillEvent[] => {
      if (tick === 0) {
        return [
          arrivalEvent(0, { forceId: 'f1', vehicles: 2, personnel: 10, eta: 2 }),
          decisionEvent(0, 'water'),
          decisionEvent(0, 'rescue'),
        ];
      }
      if (tick === 5) {
        return [specialEvent(5, { description: '坍塌', trappedDelta: 3, fireLevelDelta: 1 })];
      }
      return [];
    };

    function runSim(): { clock: number; fireLevel: number; trapped: number; rescued: number } {
      const s = new DisasterState();
      s.init({ ...SCENARIO, initialFireLevel: 2, trappedCount: 8 });
      for (let t = 0; t < 15; t++) {
        s.tick(buildEvents(t));
      }
      const st = s.getStatus();
      return { clock: st.clock, fireLevel: st.fireLevel, trapped: st.trappedCount, rescued: st.rescuedCount };
    }

    const r1 = runSim();
    const r2 = runSim();
    expect(r2).toEqual(r1);
  });

  // ============================================================
  // 端到端集成场景
  // ============================================================

  it('端到端:着火→蔓延→消防车到场→压制→救援→火灭', () => {
    const state = new DisasterState();
    state.init({
      ...SCENARIO,
      initialFireLevel: 1,
      trappedCount: 10,
      buildingStructure: 'mixed',
    });

    // tick 0-4:无压制,火势 5 tick 后升到 2
    runTicks(state, 5);
    expect(state.getStatus().fireLevel).toBe(2);

    // tick 5:派遣消防队(eta=2)+ 下达 water/rescue
    state.tick([
      arrivalEvent(5, { forceId: 'brigade1', vehicles: 3, personnel: 15, eta: 2 }),
      decisionEvent(5, 'water'),
      decisionEvent(5, 'rescue'),
    ]);
    expect(state.getStatus().suppressionActive).toBe(false); // 消防车还在路上

    runTicks(state, 2); // tick 6-7:消防车到场
    expect(state.getStatus().suppressionActive).toBe(true);
    expect(state.getStatus().rescueActive).toBe(true);

    // tick 7 后:火势每 3 tick 降一级;被困每 tick 减 2
    const fireAt7 = state.getStatus().fireLevel;
    runTicks(state, 3);
    expect(state.getStatus().fireLevel).toBe(fireAt7 - 1); // 降一级

    // 困减员验证(从 tick 7 到 tick 10 = 3 tick,每 tick 减 2 = 6 人)
    runTicks(state, 0); // noop(只读)
    const rescuedSoFar = state.getStatus().rescuedCount;
    expect(rescuedSoFar).toBeGreaterThanOrEqual(6); // 至少 6 人已救

    // 继续到火灭
    runTicks(state, 20);
    expect(state.getStatus().fireLevel).toBe(0);
    expect(state.getStatus().trappedCount).toBe(0); // 全部救出
  });

  // ============================================================
  // I-2/I-3:malformed payload 运行时窄化(不 NaN/throw,forces 数值非负有限)
  // ============================================================

  it('malformed arrival {vehicles: -5} → forces 非负有限(Math.max(0, ...|0) 下界)', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    state.tick([arrivalEvent(0, { forceId: 'f1', stations: -3, vehicles: -5, personnel: -2, eta: -1 })]);
    const f = state.getStatus().forces[0];
    expect(f.stations).toBe(0);
    expect(f.vehicles).toBe(0);
    expect(f.personnel).toBe(0);
    expect(f.eta).toBe(0);
    expect(f.status).toBe('arrived'); // eta=0 → 立即到场
    expect(Number.isFinite(f.stations)).toBe(true);
    expect(Number.isFinite(f.vehicles)).toBe(true);
  });

  it('malformed arrival {vehicles: "oops"} → 字符串非有限兜底为 0', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    state.tick([arrivalEvent(0, { forceId: 'f1', vehicles: 'oops' as unknown as number, eta: 0 })]);
    const f = state.getStatus().forces[0];
    expect(f.vehicles).toBe(0); // Number('oops')=NaN → toNonNegInt→0
    expect(Number.isFinite(f.vehicles)).toBe(true);
  });

  it('malformed arrival {} → 缺字段用默认(全部 0),不崩', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    state.tick([{ id: 'arr-empty', ts: 0, type: 'arrival', payload: {} }]);
    const f = state.getStatus().forces[0];
    expect(f).toBeDefined();
    expect(f.stations).toBe(0);
    expect(f.vehicles).toBe(0);
    expect(f.personnel).toBe(0);
    expect(f.eta).toBe(0);
    expect(Number.isFinite(f.stations)).toBe(true);
  });

  it('malformed decision {tactic: "bogus"} → 跳过,不污染 tacticsActive', () => {
    const state = new DisasterState();
    state.init(SCENARIO);
    state.tick([arrivalEvent(0, { forceId: 'f1', vehicles: 1, eta: 0 })]);
    state.tick([{ id: 'dec-bad', ts: 1, type: 'decision', payload: { tactic: 'bogus' } }]);
    // 非法 tactic 被跳过,压制不生效 → 火势仍蔓延
    expect(state.getStatus().suppressionActive).toBe(false);
    runTicks(state, 5);
    expect(state.getStatus().fireLevel).toBe(2); // 蔓延升一级
  });

  it('malformed special {fireLevelDelta: "boom"} → 非有限→跳过,fireLevel 不变不崩', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 2 });
    state.tick([specialEvent(0, { description: '坏数据', fireLevelDelta: 'boom' })]);
    expect(state.getStatus().fireLevel).toBe(2); // 未变(非有限→undefined→跳过)
  });

  // ============================================================
  // I-4:fireLevelDelta 分数 → fireLevel 仍整数(Math.round)
  // ============================================================

  it('special fireLevelDelta 分数(0.5)→ fireLevel 取整后仍整数', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 1 });
    state.tick([specialEvent(0, { description: '半级', fireLevelDelta: 0.5 })]);
    const level = state.getStatus().fireLevel;
    expect(Number.isInteger(level)).toBe(true);
    expect(level).toBe(2); // Math.round(1 + 0.5) = 2
  });

  it('special fireLevelDelta 负分数(-0.5)→ 取整降级,仍整数', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 2 });
    state.tick([specialEvent(0, { description: '降半级', fireLevelDelta: -0.5 })]);
    const level = state.getStatus().fireLevel;
    expect(Number.isInteger(level)).toBe(true);
    expect(level).toBe(2); // Math.round(2 - 0.5) = Math.round(1.5) = 2
  });

  // ============================================================
  // I-5:tactic 语义锁定(一旦下达持续生效,无超时/撤销)
  // ============================================================

  it('tactic 持续生效:决策后停发 N tick(20),suppressionActive 仍 true(锁定现行行为)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 3 });

    // tick 0:消防车到场 + water 决策
    state.tick([
      arrivalEvent(0, { forceId: 'f1', vehicles: 2, eta: 0 }),
      decisionEvent(0, 'water'),
    ]);
    expect(state.getStatus().suppressionActive).toBe(true);

    // 停发任何事件 20 tick —— 无超时/撤销,water 决策锁定
    runTicks(state, 20);
    const s = state.getStatus();
    expect(s.suppressionActive).toBe(true); // 仍生效
    // 消防车仍在场(力量不消失)
    expect(s.availableForces.vehicles).toBe(2);
  });

  it('tactic 持续生效:rescue 决策后停发,rescueActive 仍 true(持续救出)', () => {
    const state = new DisasterState();
    state.init({ ...SCENARIO, initialFireLevel: 1, trappedCount: 50 });

    state.tick([
      arrivalEvent(0, { forceId: 'f1', personnel: 10, eta: 0 }),
      decisionEvent(0, 'rescue'),
    ]);
    expect(state.getStatus().rescueActive).toBe(true);

    runTicks(state, 20);
    const s = state.getStatus();
    expect(s.rescueActive).toBe(true);
    expect(s.rescuedCount).toBeGreaterThan(0); // 持续救出
  });
});
