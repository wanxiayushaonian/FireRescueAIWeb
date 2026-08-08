// 驾车路线数据访问层:web /api/business/route/driving(BFF 代理 znya)→ Route。
// 输入坐标须为 GCJ02(全库已统一 GCJ02,库内坐标直接传)。
import { mapRoute, type ZnyaDrivingRoute, type Route } from '@/lib/route-mapper';

/** 消防站→重点单位 驾车到场路线。from/to 均为 GCJ02 {lng,lat}。 */
export async function fetchDrivingRoute(
  from: { lng: number; lat: number },
  to: { lng: number; lat: number },
): Promise<Route> {
  const params = new URLSearchParams({
    from_lng: String(from.lng),
    from_lat: String(from.lat),
    to_lng: String(to.lng),
    to_lat: String(to.lat),
  });
  const res = await fetch(`/api/business/route/driving?${params}`);
  if (!res.ok) throw new Error(`路线规划失败 ${res.status}`);
  return mapRoute((await res.json()) as ZnyaDrivingRoute);
}
