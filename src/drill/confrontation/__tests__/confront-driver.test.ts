// ConfrontDriver.finishEvaluate 评估透传测试(2026-08-24 P1:维度/改进措施不再丢弃)。
import { describe, expect, it } from 'vitest';
import { ConfrontDriver } from '../confront-driver';
import type { ConfrontAdapter } from '../confront-adapter';
import type { EvaluationData } from '@/lib/agent-evaluate';

const SEED = { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#T1' };

function makeDriver(opts: { evaluateData: EvaluationData | null; events?: readonly { kind: string; adopted?: boolean; respondedWithinSec?: number }[] }): ConfrontDriver {
  const adapter = {
    evaluateDrill: async () => opts.evaluateData,
  } as unknown as ConfrontAdapter;
  return new ConfrontDriver({
    adapter,
    appIds: { planner: 'p', adversary: 'a' },
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
        { kind: 'inject' },
        { kind: 'adjust', adopted: true, respondedWithinSec: 10 },
        { kind: 'adjust', adopted: false, respondedWithinSec: 20 },
        { kind: 'adjust' },
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
        { kind: 'adjust', adopted: true, respondedWithinSec: 10 },
        { kind: 'adjust' },
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
        { kind: 'adjust', respondedWithinSec: 15 },
        { kind: 'adjust', respondedWithinSec: 16 },
      ],
    });
    const review = await driver.finishEvaluate(60);
    expect(review.outcomes).toEqual(['timely', 'delayed']);
  });
});
