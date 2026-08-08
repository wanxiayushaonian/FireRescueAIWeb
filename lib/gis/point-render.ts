// lib/gis/point-render.ts
// 点位渲染的视口裁剪与密度判定(纯函数,node 可测)。
// 用途:zoom 进入逐点级别后,只渲染视野内点位;视野内数量超阈值时回落客户端聚合气泡(不藏数据)。

/** 视口内点位数上限:超过则回落聚合气泡。 */
export const POINT_CAP = 800;

export interface ViewportBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** 视口裁剪:只保留 bounds 内(含边界)的点。九江不涉及 antimeridian,直接区间比较。 */
export function cullToBounds<T>(
  items: T[],
  getLng: (t: T) => number,
  getLat: (t: T) => number,
  b: ViewportBounds,
): T[] {
  return items.filter((t) => {
    const lng = getLng(t);
    const lat = getLat(t);
    return lng >= b.west && lng <= b.east && lat >= b.south && lat <= b.north;
  });
}

/** 密度判定:视口内点数 > cap 回落聚合;等于 cap 仍逐点。 */
export function decidePointRender(countInView: number, cap: number = POINT_CAP): 'points' | 'cluster' {
  return countInView > cap ? 'cluster' : 'points';
}
