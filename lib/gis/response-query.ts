// 灾情响应:5km 站筛选 + ETA 排序(纯函数)。haversineKm 复用 lib/geo-query。
import { haversineKm } from '../geo-query';

export interface StationRef {
  id: string;
  name: string;
  lng: number;
  lat: number;
}

export interface EtaItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  etaSec: number;
  distanceM: number;
}

/** 筛 center 半径 km 内的站(haversine 直线距离)。 */
export function selectWithinKm(stations: StationRef[], center: { lng: number; lat: number }, km: number): StationRef[] {
  return stations.filter((s) => haversineKm(s.lng, s.lat, center.lng, center.lat) <= km);
}

/** 按 ETA 升序(返回新数组,不改原数组)。 */
export function rankByEta(items: EtaItem[]): EtaItem[] {
  return [...items].sort((a, b) => a.etaSec - b.etaSec);
}
