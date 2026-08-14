// GIS 建筑联动 Mock（模块一联动补全）—— 全部为演示数据
// 最近队站：复用既有 STATIONS（含经纬度），按球面距离确定性计算；
// ETA = 距离 / 30km/h × 1.25 绕行系数，四舍五入到分钟。
// fetchXxx() 返回 Promise，模拟延迟 300-800ms，支持 state=loading|empty|error|ok 演示参数。
import type { FetchState } from './types';
import { STATIONS } from './stations';
import { BUILDING_LIST } from './building';

// GIS 建筑对象
export interface GisBuilding {
  id: string;
  name: string;
  category: '高层建筑' | '综合体' | '酒店';
  address: string;
  lng: number;
  lat: number;
}

// 最近队站（由既有 Station mock + 建筑坐标计算生成）
export interface NearbyStation {
  stationId: string;
  name: string;
  type: string;
  distanceKm: number;        // 球面距离，保留 1 位小数
  etaMin: number;            // 预计到场分钟 = distanceKm / 30 * 60 * 1.25，取整
  available: '在位' | '部分出警';
  routeSummary: string;      // '珠江路 → 中山路 → 北门桥'
  routeMidpoint: { lng: number; lat: number }; // flyTo 用
  lng: number;
  lat: number;
}

// 周边水源
export interface NearbyWaterSource {
  id: string;
  name: string;
  type: '市政消火栓' | '消防水池' | '天然水源' | '水泵接合器';
  distanceM: number;         // 按升序返回
  status: '正常' | '告警' | '离线';
  note: string;              // '东侧路口' / '800m³' / '码头可停靠'
  lng: number;
  lat: number;
}

const CATEGORY: Record<string, GisBuilding['category']> = {
  jm: '高层建筑',
  zysc: '综合体',
  bjhld: '酒店',
};

export const GIS_BUILDINGS: GisBuilding[] = BUILDING_LIST.map((b) => ({
  id: b.id,
  name: b.name,
  category: CATEGORY[b.id] ?? '高层建筑',
  address: b.address,
  lng: b.lng,
  lat: b.lat,
}));

/** 球面距离（haversine），单位 km */
export function haversineKm(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 到场时间估算：城区平均时速 30km/h × 1.25 绕行系数，四舍五入到分钟 */
export function estimateEtaMin(distanceKm: number): number {
  return Math.max(1, Math.round((distanceKm / 30) * 60 * 1.25));
}

/** mock 固定途经主干路文本（确定性，接入平台后由路径规划 SDK 替换） */
const ROUTE_SUMMARY: Record<string, string> = {
  'st-001': '龙蟠路 → 北京东路 → 北门桥',
  'st-002': '云锦路 → 中山路 → 珠江路',
  'st-003': '云锦路 → 长江路 → 中山路',
  'st-004': '珠江路 → 中山路 → 北门桥',
  'st-005': '滨江大道 → 扬子江大道 → 云锦路',
  'st-006': '中山路 → 珠江路 → 北门桥',
  'st-007': '中山路 → 长江路 → 珠江路',
  'st-008': '北京东路 → 中山路 → 珠江路',
};

/** 计算最近 N 个队站（确定性） */
export function computeNearbyStations(building: GisBuilding, topN = 3): NearbyStation[] {
  return STATIONS.map((s) => {
    // mock 站坐标恒定非 null,但类型已放宽为可空;此处显式断言(mock 数据保证)
    const lng = s.lng as number;
    const lat = s.lat as number;
    const distanceKm = +haversineKm(building.lng, building.lat, lng, lat).toFixed(1);
    return {
      stationId: s.id,
      name: s.name,
      type: s.type,
      distanceKm,
      etaMin: estimateEtaMin(distanceKm),
      available: s.personnel % 4 === 0 ? '部分出警' : '在位',
      routeSummary:
        ROUTE_SUMMARY[s.id] ?? `${s.address.split(' ')[0]} → 中山路 → 目的地`,
      routeMidpoint: {
        lng: +(((lng + building.lng) / 2).toFixed(4)),
        lat: +(((lat + building.lat) / 2).toFixed(4)),
      },
      lng,
      lat,
    } satisfies NearbyStation;
  })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, topN);
}

/** 周边水源 mock（确定性，按建筑散布，含 1 条告警示例） */
const WATER_SEED: Record<string, Array<[string, NearbyWaterSource['type'], number, NearbyWaterSource['status'], string, number, number]>> = {
  jm: [
    ['大厦 B2 消防水池 800m³', '消防水池', 0, '正常', '地下二层', 118.7835, 32.0671],
    ['大厦南门水泵接合器 ×2', '水泵接合器', 15, '正常', '南门入口', 118.7836, 32.0669],
    ['珠江路消火栓 J-021', '市政消火栓', 120, '正常', '东侧路口', 118.7847, 32.0668],
    ['中山路消火栓 J-104', '市政消火栓', 260, '告警', '压力不足', 118.7823, 32.0693],
    ['玄武湖取水口', '天然水源', 850, '正常', '码头可停靠', 118.7901, 32.0748],
  ],
  zysc: [
    ['商场 B3 消防水池 600m³', '消防水池', 0, '正常', '地下三层', 118.7789, 32.0412],
    ['中山南路消火栓 J-058', '市政消火栓', 90, '正常', '西侧路口', 118.7781, 32.0415],
    ['商场北门水泵接合器 ×2', '水泵接合器', 20, '正常', '北门入口', 118.7789, 32.0415],
    ['淮海路消火栓 J-077', '市政消火栓', 310, '正常', '路口东南角', 118.7809, 32.0431],
  ],
  bjhld: [
    ['酒店 B1 消防水池 500m³', '消防水池', 0, '正常', '地下一层', 118.7412, 32.0088],
    ['扬子江大道消火栓 J-112', '市政消火栓', 140, '正常', '酒店正门东侧', 118.7424, 32.0091],
    ['酒店西门水泵接合器 ×1', '水泵接合器', 25, '告警', '接口锈蚀待检', 118.741, 32.009],
    ['滨江天然水源取水口', '天然水源', 460, '正常', '码头可停靠', 118.7389, 32.0102],
  ],
};

export function getWaterSources(buildingId: string, radiusM = 500): NearbyWaterSource[] {
  return (WATER_SEED[buildingId] ?? [])
    .filter(([, , d]) => d <= radiusM)
    .map(([name, type, distanceM, status, note, lng, lat], i) => ({
      id: `${buildingId}-ws-${i + 1}`,
      name,
      type,
      distanceM,
      status,
      note,
      lng,
      lat,
    }))
    .sort((a, b) => a.distanceM - b.distanceM);
}

export interface FetchOptions {
  state?: FetchState;
}

function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
}

export async function fetchNearbyStations(
  buildingId: string,
  opts: FetchOptions = {},
): Promise<NearbyStation[]> {
  await delay();
  if (opts.state === 'error') throw new Error('演示：模拟请求失败');
  if (opts.state === 'empty') return [];
  const b = GIS_BUILDINGS.find((x) => x.id === buildingId);
  if (!b) return [];
  return computeNearbyStations(b, 3);
}

export async function fetchNearbyWaterSources(
  buildingId: string,
  radiusM = 500,
  opts: FetchOptions = {},
): Promise<NearbyWaterSource[]> {
  await delay();
  if (opts.state === 'error') throw new Error('演示：模拟请求失败');
  if (opts.state === 'empty') return [];
  return getWaterSources(buildingId, radiusM);
}
