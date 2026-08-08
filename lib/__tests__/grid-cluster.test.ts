import { describe, it, expect } from 'vitest';
import { gridCluster } from '../grid-cluster';

describe('gridCluster', () => {
  const pts = [
    { lng: 115.991, lat: 29.701 },
    { lng: 115.993, lat: 29.704 }, // 与 1 同 0.01° 格
    { lng: 116.015, lat: 29.72 },
  ];

  it('同格合并计数,异格分开', () => {
    const cs = gridCluster(pts, (p) => p.lng, (p) => p.lat, 0.01);
    expect(cs).toHaveLength(2);
    expect(cs.map((c) => c.count).sort()).toEqual([1, 2]);
  });

  it('聚合中心为格中心', () => {
    const cs = gridCluster([pts[2]], (p) => p.lng, (p) => p.lat, 0.01);
    expect(cs[0].lng).toBeCloseTo(116.015, 3);
    expect(cs[0].lat).toBeCloseTo(29.725, 3);
  });

  it('缺坐标(0)的点不进聚合', () => {
    const cs = gridCluster([...pts, { lng: 0, lat: 0 }], (p) => p.lng, (p) => p.lat, 0.01);
    expect(cs.reduce((a, c) => a + c.count, 0)).toBe(3);
  });

  it('总数守恒', () => {
    const many = Array.from({ length: 1681 }, (_, i) => ({ lng: 115.5 + (i % 100) * 0.01, lat: 29.2 + Math.floor(i / 100) * 0.02 }));
    const cs = gridCluster(many, (p) => p.lng, (p) => p.lat, 0.05);
    expect(cs.reduce((a, c) => a + c.count, 0)).toBe(1681);
  });
});
