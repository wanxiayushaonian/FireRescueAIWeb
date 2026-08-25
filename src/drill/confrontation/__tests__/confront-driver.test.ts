// ConfrontDriver.finishEvaluate 评估透传测试(2026-08-24 P1:维度/改进措施不再丢弃)。
import { describe, expect, it } from 'vitest';
import { ConfrontDriver } from '../confront-driver';
import type { ConfrontAdapter } from '../confront-adapter';
import type { EvaluationData } from '@/lib/agent-evaluate';
import type { ConfrontationEvent } from '../confront-store';

const SEED = { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#T1' };

function event(
  kind: ConfrontationEvent['kind'],
  extra: Partial<ConfrontationEvent> = {},
): ConfrontationEvent {
  return { id: `${kind}-1`, seq: 1, kind, emergency: '', tSec: 1, ...extra };
}

function makeDriver(opts: { evaluateData: EvaluationData | null; events?: readonly ConfrontationEvent[] }): ConfrontDriver {
  const adapter = {
    evaluateDrill: async () => opts.evaluateData,
  } as unknown as ConfrontAdapter;
  return new ConfrontDriver({
    adapter,
    appIds: { planner: 'p', adversary: 'a', commander: 'c' },
    buildingId: 'b',
    sceneId: 's',
    drillId: 'd',
    seed: SEED,
    events: opts.events ?? [],
  });
}

const AGENT_DATA: EvaluationData = {
  score: 88,
  conclusion: '预案韧性：良好',
  opinions: ['响应链路完整'],
  dimensions: [
    { name: '响应速度', score: 75, comment: '部分单元展开滞后' },
    { name: '安全管控', score: 90, comment: '措施到位' },
  ],
  improvements: [
    { content: '开展电气火灾初期侦察专项训练', target: '21号楼预案·初期处置节' },
  ],
};

describe('finishEvaluate', () => {
  it('agent 评估:维度分项与改进措施随 review 透传', async () => {
    const driver = makeDriver({
      evaluateData: AGENT_DATA,
      events: [
        event('inject', { specialType: 'wind_shift', emergency: '风向突变' }),
        event('adjust', { adopted: true, respondedWithinSec: 10 }),
        event('adjust', { adopted: false, respondedWithinSec: 20 }),
        event('adjust'),
      ],
    });
    const review = await driver.finishEvaluate(188);
    expect(review.source).toBe('agent');
    expect(review.score).toBe(88);
    expect(review.archived).toBe(true); // ≥85 归档
    expect(review.outcomes).toEqual(['timely', 'delayed', 'ignored']);
    expect(review.dimensions).toEqual(AGENT_DATA.dimensions);
    expect(review.improvements).toEqual(AGENT_DATA.improvements);
  });

  it('agent 未响应:本地规则降级打分,无维度/改进措施', async () => {
    const driver = makeDriver({
      evaluateData: null,
      events: [
        event('adjust', { adopted: true, respondedWithinSec: 10 }),
        event('adjust'),
      ],
    });
    const review = await driver.finishEvaluate(120);
    expect(review.source).toBe('fallback');
    expect(review.score).toBe(92 - 8); // 1 条 ignored
    expect(review.archived).toBe(false);
    expect(review.dimensions).toBeUndefined();
    expect(review.improvements).toBeUndefined();
    expect(review.comments.length).toBeGreaterThan(0);
  });

  it('respondedWithinSec=15 边界判 timely,16 判 delayed', async () => {
    const driver = makeDriver({
      evaluateData: AGENT_DATA,
      events: [
        event('adjust', { respondedWithinSec: 15 }),
        event('adjust', { respondedWithinSec: 16 }),
      ],
    });
    const review = await driver.finishEvaluate(60);
    expect(review.outcomes).toEqual(['timely', 'delayed']);
  });

  it('评估 Agent 收到初始部署、最终态势、特情类型和完整决策轨迹', async () => {
    let process: Record<string, unknown> | undefined;
    const events = [
      event('inject', {
        specialType: 'equipment_failure',
        emergency: '主供水干线中断',
        location: '1F',
        delta: { damageDelta: 1 },
      }),
      event('adjust', {
        adjustments: ['启用备用供水干线'],
        adopted: true,
        respondedWithinSec: 9,
      }),
    ];
    const adapter = {
      evaluateDrill: async (input: { process: Record<string, unknown> }) => {
        process = input.process;
        return AGENT_DATA;
      },
    } as unknown as ConfrontAdapter;
    const driver = new ConfrontDriver({
      adapter,
      appIds: { planner: 'p', adversary: 'a', commander: 'c' },
      buildingId: 'b', sceneId: 's', drillId: 'd', seed: SEED,
      getState: () => ({
        events,
        situation: { fireLevel: 2, trappedCount: 5, damageLevel: 1 },
        deploy: ['首调2站5车'],
      }),
    });
    await driver.finishEvaluate(80);
    expect(process).toMatchObject({
      initialPlan: ['首调2站5车'],
      finalSituation: { fireLevel: 2, trappedCount: 5, damageLevel: 1 },
      uniqueSpecialTypes: ['equipment_failure'],
      timeline: [
        expect.objectContaining({ kind: 'inject', type: 'equipment_failure', delta: { damageDelta: 1 } }),
        expect.objectContaining({ kind: 'adjust', adopted: true, respondedWithinSec: 9 }),
      ],
    });
  });
});
