import { describe, expect, it } from 'vitest';
import { buildDrillReport } from '../drill-report';
import type { ConfrontationState } from '../confront-store';

function makeState(partial: Partial<ConfrontationState> = {}): ConfrontationState {
  return {
    active: false,
    status: 'finished',
    seedLoading: false,
    seedError: null,
    thinking: false,
    seedScenario: { building: '乐盈广场21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#T1' },
    situation: { fireLevel: 3, trappedCount: 7, damageLevel: 1, wind: '西北' },
    events: [],
    review: null,
    evaluating: false,
    generation: 1,
    startedAt: 0,
    plannedTotal: 3,
    lastRound: null,
    deploy: null,
    agentActivity: null,
    ...partial,
  };
}

describe('drill-report', () => {
  it('生成含初始部署/特情/调整/人工决策/评估的 Markdown 报告', () => {
    const state = makeState({
      deploy: ['首调康泰路专职队 5 车 28 人'],
      events: [
        {
          id: 'i1', seq: 1, kind: 'inject', specialType: 'equipment_failure',
          emergency: '供水干线爆裂', location: '5F', delta: { fireLevelDelta: 1 }, tSec: 60,
        },
        {
          id: 'a1', seq: 1, kind: 'adjust', emergency: '', adjustments: ['启用备用干线'],
          evidence: [{ kind: 'water', label: '楼体41m消火栓' }], adopted: false, respondedWithinSec: 12, tSec: 70,
        },
        {
          id: 'm1', seq: 1, kind: 'manual', emergency: '改北侧进攻',
          adjustments: ['放弃南侧内攻，改北侧楼梯间B进攻'], note: '南侧能见度不足', supersedes: 'a1', tSec: 80,
        },
        {
          id: 'e1', seq: 2, kind: 'evaluate', emergency: '评估完成', tSec: 300,
        },
      ],
      review: {
        score: 88, conclusion: '预案韧性：良好', comments: ['响应链路完整'],
        outcomes: ['delayed'], archived: true, source: 'agent',
        dimensions: [{ name: '安全管控', score: 90, comment: '措施到位' }],
        improvements: [{ content: '加强供水备份训练', target: '21号楼预案·供水节' }],
      },
    });
    const report = buildDrillReport(state, 300);
    const md = report.markdown;
    expect(md).toContain('乐盈广场21号楼 对抗演练复盘报告');
    expect(md).toContain('首调康泰路专职队 5 车 28 人');
    expect(md).toContain('特情 #1 · equipment_failure');
    expect(md).toContain('供水干线爆裂');
    expect(md).toContain('启用备用干线');
    expect(md).toContain('[消防水源] 楼体41m消火栓');
    expect(md).toContain('人工决策');
    expect(md).toContain('放弃南侧内攻，改北侧楼梯间B进攻');
    expect(md).toContain('处置原因：南侧能见度不足');
    expect(md).toContain('总分：**88**');
    expect(md).toContain('评估智能体');
    expect(md).toContain('加强供水备份训练');
  });

  it('JSON 导出包含完整事件与证据', () => {
    const state = makeState({
      events: [
        {
          id: 'a1', seq: 1, kind: 'adjust', emergency: '', adjustments: ['x'],
          evidence: [{ kind: 'warning', label: '力量明细未取得' }], tSec: 70,
        },
      ],
    });
    const json = JSON.parse(buildDrillReport(state, 70).json);
    expect(json.events[0].evidence).toEqual([{ kind: 'warning', label: '力量明细未取得' }]);
    expect(json.situation.wind).toBe('西北');
  });

  it('无 review 时不输出评估章节', () => {
    const report = buildDrillReport(makeState(), 60);
    expect(report.markdown).not.toContain('## 评估');
  });
});
