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

/** znya /fire-force-items 返回项。 */
export interface ZnyaForceItem {
  id: string;
  ref_type: string;
  ref_id: string;
  force_type: string;
  name: string;
  subtype: string;
  status: string;
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
  };
}

export function mapResource(raw: ZnyaForceItem): ResourceItem {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.force_type as ResourceItem['category'],
    subtype: raw.subtype,
    stationId: raw.ref_id,
    status: raw.status as ResourceItem['status'],
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

/** 队站按 station.type 分组;人员/车辆/装备按 subtype 分组。 */
export function buildResourceTree(
  stations: Station[],
  resources: ResourceItem[],
): ResourceTreeGroup[] {
  const groupBy = <T>(list: T[], key: (t: T) => string) => {
    const map = new Map<string, number>();
    for (const t of list) map.set(key(t), (map.get(key(t)) ?? 0) + 1);
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  };
  // 固定顺序(队站类型)→ 树显示稳定;与 mock RESOURCE_TREE 一致(救援大队在前)。
  const stationTypes = ['特勤消防站', '普通消防站', '专职消防站', '微型消防站', '水上消防站'];
  return [
    { category: '队站', children: groupBy(stations, (s) => s.type) },
    { category: '人员', children: groupBy(resources.filter((r) => r.category === '人员'), (r) => r.subtype) },
    { category: '车辆', children: groupBy(resources.filter((r) => r.category === '车辆'), (r) => r.subtype) },
    { category: '装备', children: groupBy(resources.filter((r) => r.category === '装备'), (r) => r.subtype) },
  ].map((g) => g.category === '队站'
    ? { ...g, children: [...g.children].sort((a, b) => stationTypes.indexOf(a.name) - stationTypes.indexOf(b.name)) }
    : g);
}
