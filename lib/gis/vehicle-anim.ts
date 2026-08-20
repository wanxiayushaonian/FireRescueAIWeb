// GIS 车辆行进动画纯函数:派遣路线 polyline 上按进度插值车标位置。
// Leaflet marker 由调用方驱动(setLatLng),本模块只提供可单测的几何/时长计算。

export type LatLng = [number, number]; // [lat, lng]

/** Haversine 两点距离(米,纬度差分近似足够演示;Leaflet 自带 distanceTo 但属运行时)。 */
export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const rad = (d: number): number => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** 折线累积长度(米);不足两点的折线返回 [0]。 */
export function cumulativeLengths(polyline: LatLng[]): number[] {
  const acc: number[] = [0];
  for (let i = 1; i < polyline.length; i += 1) {
    acc.push(acc[i - 1] + haversineM(polyline[i - 1], polyline[i]));
  }
  return acc;
}

/**
 * 按进度(0..1,沿线长度等比)取插值点。
 * 空折线返回 null;progress 夹取 [0,1];退化为单点折线返回该点。
 */
export function interpolateOnPolyline(polyline: LatLng[], progress: number): LatLng | null {
  if (polyline.length === 0) return null;
  if (polyline.length === 1) return polyline[0];
  const p = Math.min(1, Math.max(0, progress));
  const acc = cumulativeLengths(polyline);
  const target = acc[acc.length - 1] * p;
  for (let i = 1; i < acc.length; i += 1) {
    if (target <= acc[i]) {
      const seg = acc[i] - acc[i - 1];
      const t = seg > 0 ? (target - acc[i - 1]) / seg : 0;
      const a = polyline[i - 1];
      const b = polyline[i];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
  }
  return polyline[polyline.length - 1];
}

/**
 * 真实 ETA(秒)→ 演示行进时长(毫秒):按 1 分钟真实 = 6 秒演示线性压缩,
 * 夹取 [20s, 50s](太短看不清、太长拖节奏);无 ETA 回退 30s。
 */
export function compressDuration(realSec: number | undefined | null): number {
  if (realSec == null || !Number.isFinite(realSec) || realSec <= 0) return 30000;
  const ms = (realSec / 60) * 6000;
  return Math.min(50000, Math.max(20000, ms));
}
