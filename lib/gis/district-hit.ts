// lib/gis/district-hit.ts
// 鼠标经纬度 → 区县命中(射线法 point-in-polygon)。
// 区县识别不依赖可见多边形交互:大比例尺下区划边界已移出视野/不可点击,
// 但鼠标所在经纬度仍可反查属于哪个区县(GCJ02,与库内坐标一致)。
// GeoJSON 结构(DataV):FeatureCollection,feature.geometry 为 MultiPolygon,
// coordinates: [polygon][ring][lng, lat];properties.adcode = 6 位区划码。
export interface DistrictHit {
  adcode: string;
  name: string;
}

export interface DistrictIndex {
  adcode: string;
  name: string;
  /** MultiPolygon 的所有外环(lng/lat 数组,按 GeoJSON 原序) */
  rings: number[][][];
}

/** 从边界 GeoJSON 构建区县索引(仅 level === 'district')。 */
export function buildDistrictIndex(data: {
  features?: Array<{
    properties?: { adcode?: string | number; name?: string; level?: string } | null;
    geometry?: { type?: string; coordinates?: unknown } | null;
  }>;
}): DistrictIndex[] {
  const idx: DistrictIndex[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties;
    if (!p || p.level !== 'district' || p.adcode == null) continue;
    const coords = f.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length === 0) continue;
    // MultiPolygon: 每 polygon 取第一个 ring(外环);Polygon: 单 ring
    const polys = f.geometry?.type === 'Polygon' ? [coords] : (coords as unknown[][][]);
    const rings: number[][][] = [];
    for (const poly of polys) {
      if (Array.isArray(poly[0]) && Array.isArray(poly[0][0])) rings.push(poly[0] as number[][]);
    }
    if (rings.length === 0) continue;
    idx.push({ adcode: String(p.adcode), name: p.name ?? String(p.adcode), rings });
  }
  return idx;
}

/** 射线法:点是否在多边形内(支持带洞多边形,只判外环足够,洞数量极少)。 */
export function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** 经纬度命中区县;未命中返回 null。 */
export function hitDistrict(lng: number, lat: number, index: DistrictIndex[]): DistrictHit | null {
  for (const d of index) {
    for (const ring of d.rings) {
      if (pointInRing(lng, lat, ring)) return { adcode: d.adcode, name: d.name };
    }
  }
  return null;
}
