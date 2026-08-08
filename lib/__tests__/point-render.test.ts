// lib/__tests__/point-render.test.ts
import { describe, it, expect } from 'vitest';
import { POINT_CAP, cullToBounds, decidePointRender } from '../gis/point-render';

describe('cullToBounds', () => {
  const b = { west: 115, south: 29, east: 116, north: 30 };
  const items = [
    { id: 'in', lng: 115.5, lat: 29.5 },
    { id: 'out-lng', lng: 116.5, lat: 29.5 },
    { id: 'out-lat', lng: 115.5, lat: 28.5 },
    { id: 'edge', lng: 116, lat: 30 },
  ];
  it('只保留边界内(含边界)的点', () => {
    const r = cullToBounds(items, (t) => t.lng, (t) => t.lat, b);
    expect(r.map((t) => t.id)).toEqual(['in', 'edge']);
  });
  it('空数组返回空', () => {
    expect(cullToBounds([] as Array<{ lng: number; lat: number }>, (t) => t.lng, (t) => t.lat, b)).toEqual([]);
  });
});

describe('decidePointRender', () => {
  it('count > cap 回落聚合;等于 cap 仍逐点', () => {
    expect(decidePointRender(POINT_CAP, POINT_CAP)).toBe('points');
    expect(decidePointRender(POINT_CAP + 1, POINT_CAP)).toBe('cluster');
    expect(decidePointRender(0, POINT_CAP)).toBe('points');
  });
  it('默认 cap 为 POINT_CAP(800)', () => {
    expect(POINT_CAP).toBe(800);
    expect(decidePointRender(801)).toBe('cluster');
  });
});
