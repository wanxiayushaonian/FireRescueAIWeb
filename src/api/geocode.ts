// 地理编码查询:web /api/business/geocode(BFF 代理 znya)→ GCJ02 候选。
// 用于重点单位/建筑坐标修正:查询地址得候选 → 写入或地图拾取微调。
export interface GeoCandidate {
  lng: number; // GCJ02
  lat: number; // GCJ02
  address: string; // formatted_address
  level: string; // 坐标级别(兴趣点/门牌号/单元楼等)
}

/** 地址 → GCJ02 坐标候选列表(高德 v3 地理编码,默认限定九江市)。 */
export async function fetchGeocode(address: string, city = '九江'): Promise<GeoCandidate[]> {
  const params = new URLSearchParams({ address, city });
  const res = await fetch(`/api/business/geocode?${params}`);
  if (!res.ok) throw new Error(`地理编码失败 ${res.status}`);
  return res.json();
}
