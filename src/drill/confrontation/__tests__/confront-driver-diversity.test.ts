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
});
