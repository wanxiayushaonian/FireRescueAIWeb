import { describe, it, expect } from 'vitest';
import { buildActionItems, filterActionItems, filterUnits, buildAddressDefs } from '../gis/palette-items';

describe('buildActionItems', () => {
  it('矢量底图时首项为"切换卫星底图",无路线时无清空项', () => {
    const items = buildActionItems({ baseMap: 'vector', hasPlanned: false, drawMode: false });
    expect(items[0].title).toBe('切换卫星底图');
    expect(items.map((i) => i.id)).toEqual(['toggle-base', 'batch-geocode', 'toggle-draw']);
  });
  it('有路线时插入清空项;绘制中显示取消划定', () => {
    const items = buildActionItems({ baseMap: 'satellite', hasPlanned: true, drawMode: true });
    expect(items.map((i) => i.id)).toEqual(['toggle-base', 'batch-geocode', 'clear-route', 'toggle-draw']);
    expect(items[0].title).toBe('切换矢量底图');
    expect(items[3].title).toBe('取消划定区域');
  });
});

describe('filterActionItems / filterUnits / buildAddressDefs', () => {
  it('动作按 title/id 过滤', () => {
    const items = buildActionItems({ baseMap: 'vector', hasPlanned: false, drawMode: false });
    expect(filterActionItems(items, '卫星').map((i) => i.id)).toEqual(['toggle-base']);
  });
  it('单位:空查询返回 [],命中按名称/类型,截 6', () => {
    const units = Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: `化工厂${i}`, unitType: '化工', district: null }));
    expect(filterUnits(units, '')).toEqual([]);
    expect(filterUnits(units, '化工厂').length).toBe(6);
  });
  it('地址候选截 6 且 id 带坐标', () => {
    const cs = Array.from({ length: 8 }, (_, i) => ({ lng: 116 + i * 0.001, lat: 29.7, address: `地址${i}`, level: '兴趣点' }));
    const defs = buildAddressDefs(cs);
    expect(defs.length).toBe(6);
    expect(defs[0].id).toBe('addr-116-29.7');
    expect(defs[0].group).toBe('地址');
  });
});
