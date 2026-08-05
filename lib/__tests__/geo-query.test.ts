import { describe, it, expect } from 'vitest';
import { haversineKm, filterByRadius } from '../geo-query';

describe('geo-query', () => {
  it('haversineKm:南京(118.7969,32.0603)→上海(121.4737,31.2304)约 270km', () => {
    const d = haversineKm(118.7969, 32.0603, 121.4737, 31.2304);
    expect(Math.abs(d - 270)).toBeLessThan(3);
  });

  it('haversineKm:同点距离 0', () => {
    expect(haversineKm(118.7969, 32.0603, 118.7969, 32.0603)).toBe(0);
  });

  it('filterByRadius:过滤半径内的站(5000m)', () => {
    const stations = [
      { name: '城东', lng: 118.797, lat: 32.06 },
      { name: '城西', lng: 119.5, lat: 32.06 }, // ~66km 外
    ];
    const hit = filterByRadius(stations, { lng: 118.7969, lat: 32.0603 }, 5000, (s) => ({ lng: s.lng, lat: s.lat }));
    expect(hit.map((s) => s.name)).toEqual(['城东']);
  });

  it('filterByRadius:空集边界', () => {
    expect(filterByRadius([], { lng: 0, lat: 0 }, 1000, (x) => x)).toEqual([]);
  });
});
