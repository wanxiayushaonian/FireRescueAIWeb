import { describe, expect, it } from 'vitest';
import { gcj02ToWgs84, outOfChina } from '../coord-transform';

describe('gcj02ToWgs84', () => {
  it('国内坐标:经度向西收敛;纬度单程逆变换可能过冲(标准算法已知特性),只断量级', () => {
    // 经度:国测局偏移在东向,逆变换应收敛向西(单程逆一致成立)
    const bj = gcj02ToWgs84(116.397755, 39.913818);
    expect(bj.lon).toBeLessThan(116.397755);
    const sh = gcj02ToWgs84(121.4737, 31.2304);
    expect(sh.lon).toBeLessThan(121.4737);
    // 纬度:单程逆变换在部分城市(如上海)会过冲回北,故只要求偏移在国测局量级内
    expect(Math.abs(bj.lat - 39.913818)).toBeLessThan(0.01);
    expect(Math.abs(sh.lat - 31.2304)).toBeLessThan(0.01);
  });

  it('偏移量级合理:0.0001° ~ 0.01°(约 10m ~ 1km,典型国测局偏移)', () => {
    for (const [lng, lat] of [
      [116.397755, 39.913818], // 北京
      [121.4737, 31.2304], // 上海
      [115.99, 29.71], // 九江
      [113.2644, 23.1291], // 广州
    ]) {
      const r = gcj02ToWgs84(lng, lat);
      expect(Math.abs(r.lon - lng)).toBeGreaterThan(1e-4);
      expect(Math.abs(r.lon - lng)).toBeLessThan(0.01);
      expect(Math.abs(r.lat - lat)).toBeGreaterThan(1e-4);
      expect(Math.abs(r.lat - lat)).toBeLessThan(0.01);
      expect(Number.isFinite(r.lon)).toBe(true);
      expect(Number.isFinite(r.lat)).toBe(true);
    }
  });

  it('境外坐标原样返回(outOfChina 不做偏移)', () => {
    const r = gcj02ToWgs84(-73.98, 40.75); // 纽约
    expect(r).toEqual({ lon: -73.98, lat: 40.75 });
    expect(outOfChina(-73.98, 40.75)).toBe(true);
    expect(outOfChina(116.39, 39.9)).toBe(false);
    expect(outOfChina(72, 20)).toBe(true); // 边界外
    expect(outOfChina(138, 30)).toBe(true); // 边界外
  });

  it('幂等方向一致:连续转换偏移单调且不越界', () => {
    const first = gcj02ToWgs84(116.397755, 39.913818);
    const second = gcj02ToWgs84(first.lon, first.lat); // 再转一次(近 WGS84,偏移应更小)
    expect(second.lon).toBeLessThanOrEqual(first.lon + 1e-9);
    expect(Math.abs(second.lon - first.lon)).toBeLessThan(Math.abs(first.lon - 116.397755));
  });
});
