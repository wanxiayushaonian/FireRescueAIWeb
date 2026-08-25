import { describe, expect, it } from 'vitest';
import { evaluateSpecialQuality, specialTextSimilarity } from '../special-event-quality';
import type { ConfrontationEvent } from '../confront-store';

const prior: ConfrontationEvent = {
  id: 'e1', seq: 1, kind: 'inject', specialType: 'explosion',
  emergency: '5F影院放映厅因电气线路短路引发局部轰燃', location: '5F影院放映厅', tSec: 20,
};

describe('special-event-quality', () => {
  it('相同类型即使换描述也拒绝', () => {
    const out = evaluateSpecialQuality(
      { specialType: 'explosion', emergency: 'B1变配电间发生爆燃', location: 'B1', delta: { fireLevelDelta: 1 } },
      [prior],
    );
    expect(out.duplicate).toBe(true);
    expect(out.reason).toContain('已使用');
  });

  it('类型缺失时仍能拦截轻微改写的重复描述', () => {
    const candidate = '5F影院放映区电气线路短路发生局部轰燃';
    expect(specialTextSimilarity(candidate, prior.emergency)).toBeGreaterThanOrEqual(0.5);
    expect(evaluateSpecialQuality({ emergency: candidate, delta: { fireLevelDelta: 1 } }, [prior]).duplicate).toBe(true);
  });

  it('不同类型的合理特情通过', () => {
    const out = evaluateSpecialQuality(
      { specialType: 'equipment_failure', emergency: '主供水干线水带爆裂，内攻供水中断', location: '1F东侧', delta: { damageDelta: 1 } },
      [prior],
    );
    expect(out).toMatchObject({ accepted: true, duplicate: false, canonicalType: 'equipment_failure' });
  });

  it('没有态势增量的“只有文案”特情被拒绝', () => {
    const out = evaluateSpecialQuality(
      { specialType: 'wind_shift', emergency: '风向突变', location: '5F' },
      [],
    );
    expect(out).toMatchObject({ accepted: false, duplicate: false });
    expect(out.reason).toContain('增量');
  });
});
