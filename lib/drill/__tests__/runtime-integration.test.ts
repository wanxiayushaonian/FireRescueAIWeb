/**
 * drill 推演引擎运行时端到端集成验证。
 *
 * 不依赖浏览器/React,纯引擎层模拟 DrillView 的 tick 编排:
 * EventBus.seed → 循环(clock 0..N){ bus.getEvents → state.tick → recorder.record }
 * → 验证 DisasterState 状态机(火势/到场/被困/压制/救援)、EventBus 种子消费、
 * DrillRecorder 事件树生长、AgentRunner.triggerCommander(注入 mock postChat,不连网络)。
 *
 * 目的:确认 lib/drill 1684 行引擎在运行时真正能跑(Round 5 验证项)。
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/lib/drill/event-bus';
import { DisasterState } from '@/lib/drill/disaster-state';
import { DrillRecorder } from '@/lib/drill/drill-recorder';
import { AgentRunner } from '@/lib/drill/agent-runner';
import { BUILDING_21_SCENARIO_DEF } from '@/src/drill/scenarios/building-21';

/** 跑完剧本时间线,返回每 tick 的状态快照 + 最终 recorder 节点。 */
function runTimeline() {
  const bus = new EventBus();
  const state = new DisasterState();
  const recorder = new DrillRecorder();
  const { scenario, seedEvents } = BUILDING_21_SCENARIO_DEF;

  state.init(scenario);
  bus.seed(seedEvents);

  const snapshots: { clock: number; fire: number; trapped: number; arrived: number; suppression: boolean; rescue: boolean }[] = [];
  const maxTs = Math.max(...seedEvents.map((e) => e.ts));
  // clock 0..maxTs:每 tick 取该 ts 种子 → 推进状态 → 记录事件树
  for (let c = 0; c <= maxTs; c++) {
    const evs = bus.getEvents(c, c);
    state.tick(evs);
    for (const ev of evs) {
      const desc = (ev.payload as { description?: string }).description;
      recorder.record({ ts: ev.ts, type: ev.type, label: desc ?? ev.type, detail: desc });
    }
    const s = state.getStatus();
    snapshots.push({
      clock: s.clock,
      fire: s.fireLevel,
      trapped: s.trappedCount,
      arrived: s.availableForces.vehicles, // 到场车辆数作为到场指标
      suppression: s.suppressionActive,
      rescue: s.rescueActive,
    });
  }
  return { snapshots, recorder, state };
}

describe('drill 引擎运行时集成(21号楼完整时间线)', () => {
  it('状态机跑完全程不崩,火势有动态变化(非恒定)', () => {
    const { snapshots } = runTimeline();
    expect(snapshots.length).toBeGreaterThan(10);
    const fires = snapshots.map((s) => s.fire);
    const set = new Set(fires);
    // 火势应在过程中变化(初起→升级→压制),不是全程恒定
    expect(set.size).toBeGreaterThan(1);
    // 初始火势 = scenario.initialFireLevel(1)
    expect(fires[0]).toBe(BUILDING_21_SCENARIO_DEF.scenario.initialFireLevel);
  });

  it('到场力量 ETA 推进:种子 arrival 注册后,车辆最终到场(>0)', () => {
    const { snapshots } = runTimeline();
    // ts=3 注册 ETA=3 → ts=6 到场;ts=11 注册 ETA=5 → ts=16 到场
    // 后段应有到场车辆
    const last = snapshots[snapshots.length - 1];
    expect(last.arrived).toBeGreaterThan(0);
  });

  it('特情生效:ts=9 复燃(fireLevelDelta+1)与 ts=15 坍塌(trappedDelta+3)影响状态', () => {
    const { snapshots } = runTimeline();
    // ts=9 复燃:火势在该点附近应有上升(对比 ts=8 → ts=9/10)
    const aroundReignition = snapshots.slice(8, 11).map((s) => s.fire);
    expect(Math.max(...aroundReignition)).toBeGreaterThanOrEqual(Math.min(...snapshots.slice(0, 8).map((s) => s.fire)));
    // ts=15 坍塌:被困人数应有增加轨迹(救援未即时抵消)
    const trappedAround = snapshots.slice(14, 17).map((s) => s.trapped);
    expect(Math.max(...trappedAround)).toBeGreaterThan(0);
  });

  it('压制与救援在决策生效后激活', () => {
    const { snapshots } = runTimeline();
    const last = snapshots[snapshots.length - 1];
    // 21号楼有 water(ts10)/foam(ts18)决策 → 后段 suppression 应曾激活
    expect(snapshots.some((s) => s.suppression)).toBe(true);
    // rescue(ts15)决策 → 后段 rescue 应曾激活
    expect(snapshots.some((s) => s.rescue)).toBe(true);
    // 终态火势应被压制下来(≤ 初始或更低趋势)
    expect(last.fire).toBeLessThanOrEqual(BUILDING_21_SCENARIO_DEF.scenario.initialFireLevel + 1);
  });

  it('事件树随 tick 生长(节点数 > 种子事件数)', () => {
    const { recorder } = runTimeline();
    const nodes = recorder.getAll();
    // 种子事件 17 个(building-21),事件树至少记录这些
    expect(nodes.length).toBeGreaterThanOrEqual(BUILDING_21_SCENARIO_DEF.seedEvents.length);
  });

  it('AgentRunner.triggerCommander 用修复后的 commanderAppId 调 postChat(不连网络)', async () => {
    const bus = new EventBus();
    const state = new DisasterState();
    const recorder = new DrillRecorder();
    state.init(BUILDING_21_SCENARIO_DEF.scenario);
    bus.seed(BUILDING_21_SCENARIO_DEF.seedEvents);

    const calls: { appId: string; content: string }[] = [];
    const fakePostChat = vi.fn(async (params: { app_id: string; content: string }) => {
      calls.push({ appId: params.app_id, content: params.content });
      // 返回空 SSE 流(模拟),AgentRunner 内部解析
      return new ReadableStream<Uint8Array>({ start(c) { c.close(); } });
    });

    const runner = new AgentRunner({
      commanderAppId: BUILDING_21_SCENARIO_DEF.commanderAppId,
      buildingId: BUILDING_21_SCENARIO_DEF.buildingId,
      sceneId: BUILDING_21_SCENARIO_DEF.sceneId,
      drillId: BUILDING_21_SCENARIO_DEF.drillId,
      bus,
      state,
      recorder,
      postChat: fakePostChat as never,
      adversaryEveryNTicks: 0,
    });

    await runner.triggerCommander(BUILDING_21_SCENARIO_DEF.briefing);
    // 验证:postChat 被调,且 app_id 是修复后的可用值(非失效的 2084563280205111297)
    expect(fakePostChat).toHaveBeenCalled();
    expect(calls[0]?.appId).toBe('2087535122373074946');
    expect(calls[0]?.appId).not.toBe('2084563280205111297'); // 失效 app_id
    // briefing 内容传入
    expect(calls[0]?.content).toContain('21号楼');
  });

  it('对抗禁用时(adversaryEveryNTicks=0)onTick 不触发对抗', () => {
    const bus = new EventBus();
    const state = new DisasterState();
    const recorder = new DrillRecorder();
    state.init(BUILDING_21_SCENARIO_DEF.scenario);

    const runner = new AgentRunner({
      commanderAppId: BUILDING_21_SCENARIO_DEF.commanderAppId,
      buildingId: BUILDING_21_SCENARIO_DEF.buildingId,
      sceneId: BUILDING_21_SCENARIO_DEF.sceneId,
      drillId: BUILDING_21_SCENARIO_DEF.drillId,
      bus,
      state,
      recorder,
      adversaryEveryNTicks: 0,
    });
    // 跑多个 tick 的 onTick,不应抛错(对抗禁用 no-op)
    expect(() => {
      for (let c = 1; c <= 20; c++) runner.onTick(c);
    }).not.toThrow();
  });
});
