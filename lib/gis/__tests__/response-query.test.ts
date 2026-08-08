import { describe, it, expect } from 'vitest';
import { selectWithinKm, rankByEta } from '../response-query';

describe('selectWithinKm', () => {
  it('筛 center 5km 内的站', () => {
    const stations = [
      { id: 'a', name: '近站', lng: 115.95, lat: 29.66 },   // ~0.3km
      { id: 'b', name: '远站', lng: 116.05, lat: 29.66 },    // ~9km
    ];
    const r = selectWithinKm(stations, { lng: 115.9475, lat: 29.6612 }, 5);
    expect(r.map((s) => s.id)).toEqual(['a']);
  });
});

describe('rankByEta', () => {
  it('按 etaSec 升序,不改原数组', () => {
    const items = [
      { id: 'a', name: 'A', lat: 0, lng: 0, etaSec: 600, distanceM: 0 },
      { id: 'b', name: 'B', lat: 0, lng: 0, etaSec: 120, distanceM: 0 },
    ];
    expect(rankByEta(items).map((i) => i.id)).toEqual(['b', 'a']);
    expect(items[0].id).toBe('a'); // 原数组不变
  });
});
