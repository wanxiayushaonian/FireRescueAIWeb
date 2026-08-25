import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfrontDriver } from '../confront-driver';
import type { ConfrontAdapter, ConfrontRoundContext, SpecialEventOutput } from '../confront-adapter';
import type { ConfrontationEvent } from '../confront-store';

const seed = { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#T' };
const prior: ConfrontationEvent = {
  id: 'e1', seq: 1, kind: 'inject', specialType: 'explosion',
  emergency: '5F影院电气短路引发轰燃', location: '5F影院', tSec: 10,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ConfrontDriver 特情去重与角色分工', () => {
  it('拒绝重复候选并带原因重试一次', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const contexts: ConfrontRoundContext[] = [];
    const outputs: SpecialEventOutput[] = [
      { specialType: 'explosion', emergency: 'B1变配电间爆燃' },
      { specialType: 'equipment_failure', emergency: '主供水干线爆裂', location: '1F', delta: { damageDelta: 1 } },
    ];
    const adapter = {
      injectSpecial: vi.fn(async (_ctx, round: ConfrontRoundContext) => {
        contexts.push(round);
        return outputs.shift() ?? null;
      }),
    } as unknown as ConfrontAdapter;
    const onInject = vi.fn();
    const onFail = vi.fn();
    const driver = new ConfrontDriver({
      adapter,
      appIds: { planner: 'planner', adversary: 'adversary', commander: 'commander' },
      buildingId: 'b', sceneId: 's', drillId: 'd', seed,
      getState: () => ({
        events: [prior],
        situation: { fireLevel: 2, trappedCount: 5, damageLevel: 0 },
        deploy: ['初始部署'],
      }),
    });
    driver.scheduleInject(1, { onThinking: vi.fn(), onInject, onInjectFail: onFail });
    await vi.advanceTimersByTimeAsync(15_001);
    await vi.waitFor(() => expect(onInject).toHaveBeenCalledTimes(1));
    expect(adapter.injectSpecial).toHaveBeenCalledTimes(2);
    expect(contexts[1].rejectionReason).toContain('explosion');
    expect(onInject).toHaveBeenCalledWith(expect.objectContaining({ specialType: 'equipment_failure' }));
    expect(onFail).not.toHaveBeenCalled();
    driver.clearAll();
  });

  it('动态调整调用 commander 而非 planner', async () => {
    vi.useFakeTimers();
    const seenAppIds: string[] = [];
    const adapter = {
      generateAdjustment: vi.fn(async (ctx) => {
        seenAppIds.push(ctx.appId);
        return { adjustments: ['改从背风面进攻'] };
      }),
    } as unknown as ConfrontAdapter;
    const driver = new ConfrontDriver({
      adapter,
      appIds: { planner: 'planner', adversary: 'adversary', commander: 'commander' },
      buildingId: 'b', sceneId: 's', drillId: 'd', seed,
      getState: () => ({ events: [prior], situation: { fireLevel: 2, trappedCount: 5, damageLevel: 0 }, deploy: [] }),
    });
    const onAdjust = vi.fn();
    driver.scheduleAdjustment('风向突变', { onAdjust });
    await vi.advanceTimersByTimeAsync(2501);
    await vi.waitFor(() => expect(onAdjust).toHaveBeenCalled());
    expect(seenAppIds).toEqual(['commander']);
  });

  it('P0:存在人工改派时 Commander 收到 manualBaseline,且无人工时不含该字段', async () => {
    vi.useFakeTimers();
    const manualEvent: ConfrontationEvent = {
      id: 'cm1', seq: 1, kind: 'manual', emergency: '撤出5F改外部压制',
      adjustments: ['撤出5F内攻', '改高喷车外部压制'], note: '5F结构不稳', tSec: 60,
    };
    const contexts: ConfrontRoundContext[] = [];
    const adapter = {
      generateAdjustment: vi.fn(async (_ctx, _injectText, round: ConfrontRoundContext) => {
        contexts.push(round);
        return { adjustments: ['按人工基线细化'] };
      }),
    } as unknown as ConfrontAdapter;
    const driver = new ConfrontDriver({
      adapter,
      appIds: { planner: 'planner', adversary: 'adversary', commander: 'commander' },
      buildingId: 'b', sceneId: 's', drillId: 'd', seed,
      getState: () => ({
        events: [prior, manualEvent],
        situation: { fireLevel: 2, trappedCount: 5, damageLevel: 1 },
        deploy: ['初始部署'],
      }),
    });
    driver.scheduleAdjustment('特情2', { onAdjust: vi.fn() });
    await vi.advanceTimersByTimeAsync(2501);
    await vi.waitFor(() => expect(contexts.length).toBe(1));
    expect(contexts[0].manualBaseline).toMatchObject({
      lines: ['撤出5F内攻', '改高喷车外部压制'],
      note: '5F结构不稳',
      atSec: 60,
    });
    driver.clearAll();

    // 无人工作出时,Commander 上下文不含 manualBaseline
    const noManual: ConfrontRoundContext[] = [];
    const adapter2 = {
      generateAdjustment: vi.fn(async (_ctx, _injectText, round: ConfrontRoundContext) => {
        noManual.push(round);
        return { adjustments: ['x'] };
      }),
    } as unknown as ConfrontAdapter;
    const driver2 = new ConfrontDriver({
      adapter: adapter2,
      appIds: { planner: 'planner', adversary: 'adversary', commander: 'commander' },
      buildingId: 'b', sceneId: 's', drillId: 'd', seed,
      getState: () => ({ events: [prior], situation: { fireLevel: 2, trappedCount: 5, damageLevel: 0 }, deploy: ['初始部署'] }),
    });
    driver2.scheduleAdjustment('特情', { onAdjust: vi.fn() });
    await vi.advanceTimersByTimeAsync(2501);
    await vi.waitFor(() => expect(noManual.length).toBe(1));
    expect(noManual[0].manualBaseline).toBeUndefined();
    driver2.clearAll();
  });

  it('Adversary 真实请求整个期间保持 thinking=true，并透传工具进度', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    let resolveAgent!: (value: SpecialEventOutput) => void;
    const pending = new Promise<SpecialEventOutput>((resolve) => { resolveAgent = resolve; });
    const adapter = {
      injectSpecial: vi.fn(async (_ctx, _round, progress) => {
        progress?.({ type: 'tool-call', toolName: 'query_key_parts' });
        return pending;
      }),
    } as unknown as ConfrontAdapter;
    const onThinking = vi.fn();
    const onStart = vi.fn();
    const onProgress = vi.fn();
    const onInject = vi.fn();
    const driver = new ConfrontDriver({
      adapter,
      appIds: { planner: 'planner', adversary: 'adversary', commander: 'commander' },
      buildingId: 'b', sceneId: 's', drillId: 'd', seed,
    });
    driver.scheduleInject(0, { onThinking, onStart, onProgress, onInject, onInjectFail: vi.fn() });
    await vi.advanceTimersByTimeAsync(25_001);
    expect(onThinking).toHaveBeenLastCalledWith(true);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith({ type: 'tool-call', toolName: 'query_key_parts' });

    resolveAgent({
      specialType: 'collapse', emergency: '5F吊顶局部坍塌', location: '5F', delta: { damageDelta: 1 },
    });
    await vi.waitFor(() => expect(onInject).toHaveBeenCalledTimes(1));
    expect(onThinking).toHaveBeenLastCalledWith(false);
    driver.clearAll();
  });
});
