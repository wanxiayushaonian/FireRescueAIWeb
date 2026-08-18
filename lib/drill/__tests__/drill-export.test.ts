// lib/drill/__tests__/drill-export.test.ts
// 演练导出:指标计算(特情间隔/结局)、检验提示、JSON/Markdown 结构
import { describe, expect, it } from 'vitest';
import { buildDrillJson, buildDrillMarkdown, computeDrillStats, statWarnings } from '../drill-export';
import type { TreeNode, TreeNodeType } from '../drill-recorder';
import type { DisasterStatus } from '../disaster-state';

function node(id: string, ts: number, type: TreeNodeType, parentId?: string): TreeNode {
  return { id, ts, type, label: `${type}-${id}`, ...(parentId ? { parentId } : {}) };
}

const STATUS = {
  clock: 45, fireLevel: 0, fireSpreadDirection: 90,
  forces: [], availableForces: { stations: 3, vehicles: 6, personnel: 24 },
  trappedCount: 0, rescuedCount: 8, buildingDamage: 0.232,
  suppressionActive: true, rescueActive: false, windDirection: 90, windSpeed: 3,
} as unknown as DisasterStatus;

const NODES: TreeNode[] = [
  node('a', 0, 'disaster'),
  node('b', 3, 'arrival'),
  node('s1', 9, 'special'),
  node('d1', 10, 'decision', 's1'),
  node('s2', 15, 'special'),
  node('d2', 16, 'decision', 's2'),
  node('s3', 40, 'special'),
];

describe('computeDrillStats:合理性指标', () => {
  it('时长/计数/特情间隔/结局', () => {
    const s = computeDrillStats(NODES, STATUS);
    expect(s.totalTicks).toBe(40);
    expect(s.eventCount).toBe(7);
    expect(s.specialCount).toBe(3);
    expect(s.specialIntervals).toEqual([6, 25]);
    expect(s.avgSpecialInterval).toBe(15.5);
    expect(s.minSpecialInterval).toBe(6);
    expect(s.decisionCount).toBe(2);
    expect(s.finalFireLevel).toBe(0);
    expect(s.finalRescued).toBe(8);
    expect(s.buildingDamagePct).toBe(23.2);
  });

  it('单个特情 → 无间隔(null)', () => {
    const s = computeDrillStats([node('s1', 5, 'special')], null);
    expect(s.specialIntervals).toEqual([]);
    expect(s.avgSpecialInterval).toBeNull();
  });
});

describe('statWarnings:检验提示', () => {
  it('特情过密 + 结局火势未控 → 两条警告', () => {
    const bad = computeDrillStats(
      [node('s1', 5, 'special'), node('s2', 7, 'special'), node('d', 8, 'decision')],
      { ...STATUS, fireLevel: 3 } as DisasterStatus,
    );
    const w = statWarnings(bad);
    expect(w.some((x) => x.includes('注入过密'))).toBe(true);
    expect(w.some((x) => x.includes('不可控'))).toBe(true);
  });

  it('全程无决策 → 提示检查指挥链路', () => {
    const s = computeDrillStats([node('a', 0, 'disaster')], STATUS);
    expect(statWarnings(s).some((x) => x.includes('未上报决策'))).toBe(true);
  });

  it('正常演练 → 无警告', () => {
    expect(statWarnings(computeDrillStats(NODES, STATUS))).toHaveLength(0);
  });
});

describe('buildDrillJson / buildDrillMarkdown:导出结构', () => {
  const input = { scenarioName: '21号楼·5层电气火灾', drillId: 'drill-1', nodes: NODES, status: STATUS };

  it('JSON 可解析,含 stats/warnings/events', () => {
    const obj = JSON.parse(buildDrillJson(input));
    expect(obj.drillId).toBe('drill-1');
    expect(obj.stats.specialCount).toBe(3);
    expect(obj.events).toHaveLength(7);
    expect(obj.events[3].parentId).toBe('s1');
    expect(Array.isArray(obj.warnings)).toBe(true);
  });

  it('Markdown 含指标表与时间线', () => {
    const md = buildDrillMarkdown(input);
    expect(md).toContain('# 演练评估导出:21号楼·5层电气火灾');
    expect(md).toContain('| 对抗特情 | 3 次 |');
    expect(md).toContain('## 事件时间线');
    expect(md).toContain('未发现明显异常');
  });

  it('有警告时 Markdown 列检验提示', () => {
    const md = buildDrillMarkdown({
      ...input,
      nodes: [node('s1', 5, 'special'), node('s2', 6, 'special'), node('d', 7, 'decision')],
    });
    expect(md).toContain('⚠');
  });
});
