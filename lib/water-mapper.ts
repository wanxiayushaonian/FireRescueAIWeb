import type { WaterSource } from '../src/mock/types';

/** znya /water-sources 返回项(字段对齐,read-only 快照)。 */
export interface ZnyaWaterSource {
  id: string;
  name: string;
  water_type: string;
  status: string;
  location_path?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  district_code?: string | null;
}

/** 区划码 → 区名(九江 13 区县,GB/T 2260;平台数据使用同一套码)。 */
export const DISTRICT_NAME: Record<string, string> = {
  '360402': '濂溪区',
  '360403': '浔阳区',
  '360404': '柴桑区',
  '360423': '武宁县',
  '360424': '修水县',
  '360425': '永修县',
  '360426': '德安县',
  '360428': '都昌县',
  '360429': '湖口县',
  '360430': '彭泽县',
  '360481': '瑞昌市',
  '360482': '共青城市',
  '360483': '庐山市',
};

export function mapWaterSource(raw: ZnyaWaterSource): WaterSource {
  const code = raw.district_code ?? '';
  return {
    id: raw.id,
    name: raw.name,
    type: raw.water_type,
    lat: raw.latitude ?? 0,
    lng: raw.longitude ?? 0,
    address: raw.location_path ?? '',
    districtCode: code,
    district: DISTRICT_NAME[code] ?? '未知',
    status: raw.status,
  };
}

export interface WaterDistrictStat {
  district: string;
  districtCode: string;
  count: number;
}

/** 按区聚合,固定顺序:濂溪/柴桑/浔阳/彭泽(仅返回实际出现的区)。 */
export function buildWaterDistrictStats(list: WaterSource[]): WaterDistrictStat[] {
  const map = new Map<string, WaterDistrictStat>();
  for (const w of list) {
    const cur = map.get(w.districtCode) ?? { district: w.district, districtCode: w.districtCode, count: 0 };
    cur.count += 1;
    map.set(w.districtCode, cur);
  }
  const order = ['360402', '360403', '360404', '360423', '360424', '360425', '360426', '360428', '360429', '360430', '360481', '360482', '360483'];
  return order.map((c) => map.get(c)).filter((x): x is WaterDistrictStat => !!x);
}

export interface WaterTypeStat {
  type: string;
  count: number;
}

/** 按类型聚合,顺序:市政消火栓/消防水池/天然水源(其余按字母追加)。 */
export function buildWaterTypeStats(list: WaterSource[]): WaterTypeStat[] {
  const map = new Map<string, number>();
  for (const w of list) map.set(w.type, (map.get(w.type) ?? 0) + 1);
  const order = ['市政消火栓', '消防水池', '天然水源'];
  return [...map.entries()]
    .sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a[0].localeCompare(b[0]);
    })
    .map(([type, count]) => ({ type, count }));
}
