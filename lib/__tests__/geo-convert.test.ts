import { describe, it, expect } from 'vitest';
import { bd09ToWgs84, wgs84ToBd09 } from '../geo-convert';

// 往返误差受 gcj02ToWgs84 近似反解限制(单向误差 < 1e-5),故容差取 1e-4(约 11m)。
const EPS = 1e-4;

describe('geo-convert', () => {
  it('bd09ToWgs84 南京坐标往返后回到原点(误差 < 1e-4)', () => {
    const wgs = bd09ToWgs84(118.7969, 32.0603);
    const back = wgs84ToBd09(wgs.lng, wgs.lat);
    expect(Math.abs(back.lng - 118.7969)).toBeLessThan(EPS);
    expect(Math.abs(back.lat - 32.0603)).toBeLessThan(EPS);
  });

  it('wgs84ToBd09 已知对:天安门 WGS84 (116.3913,39.9073) 转 BD09 ≈ (116.4038,39.9151)', () => {
    const bd = wgs84ToBd09(116.3913, 39.9073);
    expect(Math.abs(bd.lng - 116.4038)).toBeLessThan(0.01);
    expect(Math.abs(bd.lat - 39.9151)).toBeLessThan(0.01);
  });

  it('零/极值输入不抛错', () => {
    expect(() => bd09ToWgs84(0, 0)).not.toThrow();
    expect(() => wgs84ToBd09(180, 90)).not.toThrow();
  });
});
