import { describe, expect, it } from 'vitest';
import {
  haversineM,
  cumulativeLengths,
  interpolateOnPolyline,
  compressDuration,
  type LatLng,
} from '../vehicle-anim';

const A: LatLng = [29.0, 115.0];
const B: LatLng = [29.001, 115.0]; // 纬度差 0.001° ≈ 111m
const C: LatLng = [29.001, 115.002]; // 经度差 0.002° ≈ 195m(cos29°≈0.875)

describe('vehicle-anim', () => {
  it('haversine:纬度 0.001° ≈ 111m,经度按 cos 缩放', () => {
    expect(haversineM(A, B)).toBeGreaterThan(105);
    expect(haversineM(A, B)).toBeLessThan(117);
    expect(haversineM(B, C)).toBeGreaterThan(180);
    expect(haversineM(B, C)).toBeLessThan(205);
  });

  it('cumulativeLengths:首项 0,逐段累加', () => {
    const acc = cumulativeLengths([A, B, C]);
    expect(acc[0]).toBe(0);
    expect(acc).toHaveLength(3);
    expect(acc[2]).toBeCloseTo(acc[1] + haversineM(B, C), 6);
  });

  it('插值:端点/中点/越界夹取/退化情形', () => {
    expect(interpolateOnPolyline([A, B], 0)).toEqual(A);
    expect(interpolateOnPolyline([A, B], 1)).toEqual(B);
    const mid = interpolateOnPolyline([A, B], 0.5)!;
    expect(mid[0]).toBeCloseTo((A[0] + B[0]) / 2, 9);
    // 越界夹取
    expect(interpolateOnPolyline([A, B], 5)).toEqual(B);
    expect(interpolateOnPolyline([A, B], -1)).toEqual(A);
    // 多段:第一段末尾应等于 B
    const atB = interpolateOnPolyline([A, B, C], haversineM(A, B) / (haversineM(A, B) + haversineM(B, C)));
    expect(atB?.[0]).toBeCloseTo(B[0], 9);
    // 退化
    expect(interpolateOnPolyline([], 0.5)).toBeNull();
    expect(interpolateOnPolyline([A], 0.5)).toEqual(A);
  });

  it('compressDuration:1min真实=6s演示,夹取 20-50s;无 ETA 回退 30s', () => {
    expect(compressDuration(60)).toBe(20000); // 6s → 夹下限 20s
    expect(compressDuration(5 * 60)).toBe(30000); // 5min → 30s
    expect(compressDuration(10 * 60)).toBe(50000); // 10min → 夹上限
    expect(compressDuration(undefined)).toBe(30000);
    expect(compressDuration(0)).toBe(30000);
  });
});
