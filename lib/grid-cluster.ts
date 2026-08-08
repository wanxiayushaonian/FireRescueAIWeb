// 客户端网格聚合:把点位按 cell(度)分格统计,低 zoom 用气泡替代密集 marker。
// 纯函数不依赖 leaflet;服务端 clusters 端点(water)的同构前端版,供数据量
// 千级、本来就全量在前端的图层(重点单位/重点建筑)使用。

export interface GridCluster {
  lng: number;
  lat: number;
  count: number;
}

export function gridCluster<T>(
  items: T[],
  getLng: (t: T) => number,
  getLat: (t: T) => number,
  cell: number,
): GridCluster[] {
  const cells = new Map<string, GridCluster>();
  for (const it of items) {
    const lng = getLng(it);
    const lat = getLat(it);
    if (!lng || !lat) continue; // 缺坐标不进聚合(逐点模式同样画不出)
    const gx = Math.floor(lng / cell);
    const gy = Math.floor(lat / cell);
    const key = `${gx}:${gy}`;
    let c = cells.get(key);
    if (!c) {
      c = { lng: (gx + 0.5) * cell, lat: (gy + 0.5) * cell, count: 0 };
      cells.set(key, c);
    }
    c.count += 1;
  }
  return [...cells.values()];
}
