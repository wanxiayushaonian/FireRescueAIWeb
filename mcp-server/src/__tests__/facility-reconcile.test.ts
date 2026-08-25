import { describe, expect, it } from 'vitest';
import { normalizeFacilityType, reconcileFacilityCounts } from '../facility-reconcile.js';

describe('facility-reconcile', () => {
  it('将 znya 中英文/自由设施类型归一为场景中文类型', () => {
    expect(normalizeFacilityType('室内消火栓系统')).toBe('室内消火栓');
    expect(normalizeFacilityType('PointSmokeDetector 烟感')).toBe('感烟探测器');
    expect(normalizeFacilityType('应急照明灯')).toBe('应急照明');
  });

  it('返回 matched/ledger_only/scene_only/count_mismatch', () => {
    const out = reconcileFacilityCounts(
      [
        { facilityType: '消火栓', status: '正常' },
        { facilityType: '消火栓', status: '正常' },
        { facilityType: '感烟探测器', status: '离线' },
        { facilityType: '灭火器', status: '正常' },
      ],
      {
        total: 10,
        fireByTypeLabel: { '室内消火栓': 2, '感烟探测器': 3, '排烟风机': 1 },
        fireByFloor: { '5F': 6 },
        floors: ['5F'],
      },
    );
    expect(out.data.differences).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: '室内消火栓', status: 'matched' }),
      expect.objectContaining({ type: '感烟探测器', status: 'count_mismatch' }),
      expect.objectContaining({ type: '灭火器箱', status: 'ledger_only' }),
      expect.objectContaining({ type: '排烟风机', status: 'scene_only' }),
    ]));
    expect(out.data.ledger.byStatus).toEqual({ '正常': 3, '离线': 1 });
    expect(out.meta.completeness).toBe(1);
  });

  it('场景离线时保留台账且明确告警', () => {
    const out = reconcileFacilityCounts([{ facilityType: '消火栓' }], null, { sceneOnline: false });
    expect(out.data.scene).toBeNull();
    expect(out.meta.completeness).toBe(0.5);
    expect(out.meta.warnings.join()).toContain('不在线');
  });
});
