import { describe, it, expect } from 'vitest';
import {
  DISTRICT_NAME,
  mapWaterSource,
  buildWaterDistrictStats,
  buildWaterTypeStats,
  type ZnyaWaterSource,
} from '../water-mapper';
import type { WaterSource } from '../../src/mock/types';

describe('water-mapper', () => {
  const raw: ZnyaWaterSource = {
    id: 'w1', name: 'JJ-BLHSYL-001', water_type: '市政消火栓', status: 'normal',
    location_path: '江西省九江市柴桑区沙阎路',
    longitude: 115.9117, latitude: 29.6953, district_code: '360404',
  };

  it('DISTRICT_NAME 含九江 13 区县(GB/T 2260)', () => {
    expect(DISTRICT_NAME['360402']).toBe('濂溪区');
    expect(DISTRICT_NAME['360403']).toBe('浔阳区');
    expect(DISTRICT_NAME['360404']).toBe('柴桑区');
    expect(DISTRICT_NAME['360430']).toBe('彭泽县');
    expect(DISTRICT_NAME['360481']).toBe('瑞昌市');
    expect(Object.keys(DISTRICT_NAME)).toHaveLength(13);
  });

  it('mapWaterSource 映射字段 + district_code→district', () => {
    const w: WaterSource = mapWaterSource(raw);
    expect(w.id).toBe('w1');
    expect(w.name).toBe('JJ-BLHSYL-001');
    expect(w.type).toBe('市政消火栓');
    expect(w.lng).toBe(115.9117);
    expect(w.lat).toBe(29.6953);
    expect(w.address).toBe('江西省九江市柴桑区沙阎路');
    expect(w.districtCode).toBe('360404');
    expect(w.district).toBe('柴桑区');
    expect(w.status).toBe('normal');
  });

  it('mapWaterSource 容忍空字段(坐标缺失→null,非 (0,0))', () => {
    const w = mapWaterSource({ id: 'w2', name: 'x', water_type: '消防水池', status: 'normal' });
    expect(w.lat).toBeNull();
    expect(w.lng).toBeNull();
    expect(w.address).toBe('');
    expect(w.districtCode).toBe('');
    expect(w.district).toBe('未知');
  });

  it('buildWaterDistrictStats 按区聚合 + 固定顺序', () => {
    const list = [
      mapWaterSource({ ...raw, id: 'a', district_code: '360404' }),
      mapWaterSource({ ...raw, id: 'b', district_code: '360404' }),
      mapWaterSource({ ...raw, id: 'c', district_code: '360402' }),
      mapWaterSource({ ...raw, id: 'd', district_code: '360430' }),
    ];
    const stats = buildWaterDistrictStats(list);
    expect(stats.map((s) => s.districtCode)).toEqual(['360402', '360404', '360430']);
    const cxs = Object.fromEntries(stats.map((s) => [s.districtCode, s.count]));
    expect(cxs['360402']).toBe(1);
    expect(cxs['360404']).toBe(2);
    expect(cxs['360430']).toBe(1);
  });

  it('buildWaterTypeStats 按类型聚合', () => {
    const list = [
      mapWaterSource({ ...raw, water_type: '市政消火栓' }),
      mapWaterSource({ ...raw, id: 'x', water_type: '天然水源' }),
    ];
    const stats = buildWaterTypeStats(list);
    const m = Object.fromEntries(stats.map((s) => [s.type, s.count]));
    expect(m['市政消火栓']).toBe(1);
    expect(m['天然水源']).toBe(1);
  });
});
