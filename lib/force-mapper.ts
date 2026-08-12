import type { ResourceItem, Station } from '../src/mock/types';

/** znya /fire-stations 返回(与 znya 字段对齐,read-only 快照)。 */
export interface ZnyaStation {
  id: string;
  name: string;
  station_type: string;
  address?: string | null;
  longitude?: number | null;
  latitude?: number | null;
  duty_phone?: string | null;
  status: string;
  extra_attrs?: {
    commander?: string | null;
    personnel_count?: number | null;
    vehicle_summary?: Record<string, number> | null;
    equipment?: string | null;
  } | null;
}

/** znya /fire-force-items 返回项（新分类体系）。 */
export interface ZnyaForceItem {
  id: string;
  ref_type: string;
  ref_id: string;
  force_type: string;
  name: string;
  subtype: string;
  status: string;
  district_code?: string | null;
}

const sumVehicle = (summary?: Record<string, number> | null): number =>
  Object.values(summary ?? {}).reduce((a, b) => a + b, 0);

export function mapStation(raw: ZnyaStation): Station {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.station_type as Station['type'],
    contact: raw.extra_attrs?.commander ?? '',
    dutyPhone: raw.duty_phone ?? '',
    address: raw.address ?? '',
    lng: raw.longitude ?? 0,
    lat: raw.latitude ?? 0,
    personnel: raw.extra_attrs?.personnel_count ?? 0,
    vehicles: sumVehicle(raw.extra_attrs?.vehicle_summary),
    status: raw.status ?? 'normal',
  };
}

// ============ 新分类体系 ============

/** 人员分类：干部 / 消防员 */
export const PERSONNEL_CATEGORIES = ['干部', '消防员'] as const;

/** 车辆分类：9 类消防车 + 6 类船艇 */
export const VEHICLE_CATEGORIES = [
  '水罐消防车',
  '泡沫消防车',
  '压缩空气泡沫消防车',
  '大吨位水罐泡沫消防车',
  '登高平台消防车',
  '云梯消防车',
  '举高喷射消防车',
  '抢险救援消防车',
  '通信前突/指挥车',
  '其他消防车',
  '消防船艇',
] as const;

/** 装备分类：按实战合并 */
export const EQUIPMENT_CATEGORIES = [
  '防护装备',
  '灭火器材',
  '破拆救生',
  '通信器材',
  '无人机',
  '其他',
] as const;

/** 车辆编码 → 分类名映射（8 位编码前 4 位） */
const VEHICLE_CODE_MAP: Record<string, string> = {
  '2101': '水罐消防车',
  '2102': '泡沫消防车',
  '2103': '压缩空气泡沫消防车',
  '2104': '大吨位水罐泡沫消防车',
  '2105': '登高平台消防车',
  '2106': '云梯消防车',
  '2107': '举高喷射消防车',
  '2108': '抢险救援消防车',
  '2109': '通信前突/指挥车',
  '2199': '其他消防车',
  '2201': '消防船艇',
  '2202': '消防船艇',
  '2203': '消防船艇',
  '2204': '消防船艇',
  '2205': '消防船艇',
  '2299': '消防船艇',
};

/** 装备编码 → 分类名映射（8 位编码前 2 位） */
const EQUIPMENT_CODE_MAP: Record<string, string> = {
  '11': '防护装备',
  '12': '防护装备',
  '31': '灭火器材',
  '32': '灭火器材',
  '53': '破拆救生',
  '54': '破拆救生',
  '63': '通信器材',
  '64': '通信器材',
  '67': '无人机',
};

/** 根据原始 subtype/编码推断新分类 */
function inferVehicleCategory(subtype: string, code?: string): string {
  // 优先按编码匹配
  if (code && code.length >= 4) {
    const prefix = code.slice(0, 4);
    if (VEHICLE_CODE_MAP[prefix]) return VEHICLE_CODE_MAP[prefix];
  }
  // 按 subtype 关键词匹配
  if (subtype.includes('水罐')) return '水罐消防车';
  if (subtype.includes('泡沫')) return '泡沫消防车';
  if (subtype.includes('登高') || subtype.includes('云梯') || subtype.includes('举高')) return '登高平台消防车';
  if (subtype.includes('抢险')) return '抢险救援消防车';
  if (subtype.includes('通信') || subtype.includes('指挥')) return '通信前突/指挥车';
  if (subtype.includes('船') || subtype.includes('艇')) return '消防船艇';
  return '其他消防车';
}

function inferEquipmentCategory(subtype: string, code?: string): string {
  // 优先按编码匹配
  if (code && code.length >= 2) {
    const prefix = code.slice(0, 2);
    if (EQUIPMENT_CODE_MAP[prefix]) return EQUIPMENT_CODE_MAP[prefix];
  }
  // 按 subtype 关键词匹配
  if (subtype.includes('防护') || subtype.includes('服') || subtype.includes('盔')) return '防护装备';
  if (subtype.includes('灭火') || subtype.includes('水带') || subtype.includes('枪')) return '灭火器材';
  if (subtype.includes('破拆') || subtype.includes('救生') || subtype.includes('绳')) return '破拆救生';
  if (subtype.includes('通信') || subtype.includes('电台')) return '通信器材';
  if (subtype.includes('无人机') || subtype.includes('UAV')) return '无人机';
  return '其他';
}

export function mapResource(raw: ZnyaForceItem): ResourceItem {
  const category = raw.force_type as ResourceItem['category'];
  let subtype = raw.subtype;

  // 根据分类推断新 subtype
  if (category === '车辆') {
    subtype = inferVehicleCategory(raw.subtype, raw.subtype);
  } else if (category === '装备') {
    subtype = inferEquipmentCategory(raw.subtype, raw.subtype);
  } else if (category === '人员') {
    // 人员按职务推断：干部 vs 消防员
    const isCadre = /站长|指导员|副站长|大队长|教导员|副大队长|干部|参谋|科员|科长|副科长|文员|职级/.test(raw.subtype);
    subtype = isCadre ? '干部' : '消防员';
  }

  return {
    id: raw.id,
    name: raw.name,
    category,
    subtype,
    stationId: raw.ref_id,
    status: raw.status as ResourceItem['status'],
    districtCode: raw.district_code ?? undefined,
  };
}

export interface ForceStat { value: number; delta?: string }

/** 顺序固定:队站 / 人员 / 车辆 / 装备(对齐 ForceResourcePanel 卡片)。 */
export function buildForceStats(stations: Station[], resources: ResourceItem[]): ForceStat[] {
  const countBy = (c: ResourceItem['category']) => resources.filter((r) => r.category === c).length;
  return [
    { value: stations.length },
    { value: countBy('人员') },
    { value: countBy('车辆') },
    { value: countBy('装备') },
  ];
}

export interface ResourceTreeGroup {
  category: string;
  children: Array<{ name: string; count: number }>;
}

/** 队站按 station.type 分组;人员/车辆/装备按新分类体系分组。 */
export function buildResourceTree(
  stations: Station[],
  resources: ResourceItem[],
): ResourceTreeGroup[] {
  const groupBy = <T>(list: T[], key: (t: T) => string) => {
    const map = new Map<string, number>();
    for (const t of list) map.set(key(t), (map.get(key(t)) ?? 0) + 1);
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  };

  // 队站类型固定顺序
  const stationTypes = ['支队', '救援大队', '救援站', '政府专职站', '企业专职站', '单位专职站', '其他专职站', '志愿消防站', '特勤消防站', '普通消防站', '专职消防站', '微型消防站', '水上消防站'];

  // 人员按新分类
  const personnel = resources.filter((r) => r.category === '人员');
  const personnelTree = groupBy(personnel, (r) => r.subtype);

  // 车辆按新分类
  const vehicles = resources.filter((r) => r.category === '车辆');
  const vehiclesTree = groupBy(vehicles, (r) => r.subtype);

  // 装备按新分类
  const equipment = resources.filter((r) => r.category === '装备');
  const equipmentTree = groupBy(equipment, (r) => r.subtype);

  return [
    {
      category: '队站',
      children: groupBy(stations, (s) => s.type).sort(
        (a, b) => stationTypes.indexOf(a.name) - stationTypes.indexOf(b.name),
      ),
    },
    {
      category: '人员',
      children: PERSONNEL_CATEGORIES.map((cat) => ({
        name: cat,
        count: personnelTree.find((c) => c.name === cat)?.count ?? 0,
      })).filter((c) => c.count > 0),
    },
    {
      category: '车辆',
      children: VEHICLE_CATEGORIES.map((cat) => ({
        name: cat,
        count: vehiclesTree.find((c) => c.name === cat)?.count ?? 0,
      })).filter((c) => c.count > 0),
    },
    {
      category: '装备',
      children: EQUIPMENT_CATEGORIES.map((cat) => ({
        name: cat,
        count: equipmentTree.find((c) => c.name === cat)?.count ?? 0,
      })).filter((c) => c.count > 0),
    },
  ];
}
