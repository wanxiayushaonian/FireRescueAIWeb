// ConfrontDriver.finishEvaluate 评估透传测试(2026-08-24 P1:维度/改进措施不再丢弃)。
import { describe, expect, it } from 'vitest';
import { ConfrontDriver } from '../confront-driver';
import type { ConfrontAdapter } from '../confront-adapter';
import type { EvaluationData } from '@/lib/agent-evaluate';
import type { ConfrontationEvent } from '../confront-store';

const SEED = { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#T1' };

let eventSeq = 0;
function event(
  kind: ConfrontationEvent['kind'],
  extra: Partial<ConfrontationEvent> = {},
): ConfrontationEvent {
  eventSeq += 1;
  return { id: `${kind}-${eventSeq}`, seq: 1, kind, emergency: '', tSec: 1, ...extra };
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
  it('agent 评估:维度分项与改进措施随 review 透传,outcomes 按特情配对', async () => {
    const driver = makeDriver({
      evaluateData: AGENT_DATA,
      events: [
        event('inject', { specialType: 'wind_shift', emergency: '风向突变', tSec: 10 }),
        event('adjust', { adopted: true, respondedWithinSec: 10, tSec: 20 }),
        event('inject', { specialType: 'explosion', emergency: '配电间爆炸', tSec: 30 }),
        event('adjust', { adopted: false, respondedWithinSec: 20, tSec: 40 }),
        event('inject', { specialType: 'collapse', emergency: '局部坍塌', tSec: 50 }),
        event('adjust', { tSec: 60 }),
      ],
    });
    const review = await driver.finishEvaluate(188);
    expect(review.source).toBe('agent');
    expect(review.score).toBe(88);
    expect(review.archived).toBe(true); // ≥85 归档
    // 行数=特情数:3 条特情 → timely/delayed/ignored 各一
    expect(review.outcomes).toEqual(['timely', 'delayed', 'ignored']);
    expect(review.dimensions).toEqual(AGENT_DATA.dimensions);
    expect(review.improvements).toEqual(AGENT_DATA.improvements);
  });

  it('Planner 初始部署上报(seq=0)不占特情结果行', async () => {
    const driver = makeDriver({
      evaluateData: AGENT_DATA,
      events: [
        event('adjust', { seq: 0, adjustments: ['首调2站5车'], tSec: 5 }), // Planner 上报
        event('inject', { specialType: 'explosion', emergency: '配电间爆炸', tSec: 10 }),
        event('adjust', { seq: 1, adjustments: ['撤出内攻'], respondedWithinSec: 12, tSec: 20 }),
      ],
    });
    const review = await driver.finishEvaluate(60);
    expect(review.outcomes).toEqual(['timely']);
  });

  it('agent 未响应:本地规则降级打分,无维度/改进措施', async () => {
    const driver = makeDriver({
      evaluateData: null,
      events: [
        event('inject', { specialType: 'wind_shift', emergency: '风向突变', tSec: 10 }),
        event('adjust', { tSec: 20 }), // 未响应 → ignored
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
        event('inject', { emergency: 'a', tSec: 10 }),
        event('adjust', { respondedWithinSec: 15, tSec: 20 }),
        event('inject', { emergency: 'b', tSec: 30 }),
        event('adjust', { respondedWithinSec: 16, tSec: 40 }),
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

  it('P0:评估进程携带 manualDecisions(建议↔人工成对),供评估对比', async () => {
    let process: Record<string, unknown> | undefined;
    const adj = { id: 'adj-1', seq: 1, kind: 'adjust' as const, emergency: '', adjustments: ['agent:撤出5F'], adopted: false, respondedWithinSec: 9, tSec: 20 };
    const manual = { id: 'cm-1', seq: 1, kind: 'manual' as const, emergency: '人工:改外部压制', adjustments: ['人工:高喷车外部压制'], note: '5F结构不稳', supersedes: 'adj-1', tSec: 60 };
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
        events: [event('inject', { specialType: 'collapse', emergency: '坍塌', tSec: 10 }), adj, manual],
        situation: { fireLevel: 2, trappedCount: 5, damageLevel: 1 },
        deploy: ['初始部署'],
      }),
    });
    await driver.finishEvaluate(90);
    expect(process).toMatchObject({
      manualDecisions: [
        {
          round: 1,
          atSec: 60,
          agentSuggestion: ['agent:撤出5F'],
          humanDecision: ['人工:高喷车外部压制'],
          note: '5F结构不稳',
          responseSec: 9,
        },
      ],
    });
  });
});
