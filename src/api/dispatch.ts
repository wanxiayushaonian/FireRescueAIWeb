// AI 智能派遣数据访问层:web /api/business/dispatch/plan(BFF 代理 znya)→ 多站到场路线。
// 复用 zyna plan_dispatch(MCP plan_dispatch 工具同源):不传 station_ids 时由后端自动
// 推荐主力站(支队/救援大队/救援站,排除机关/勤务/机动)最近 3 个。
// 输入坐标 GCJ02(全库统一);返回 polyline 为 [[lat,lng]](Leaflet 原生顺序,与 RouteRenderItem 同构)。
import type { RouteRenderItem } from '@/lib/gis/route-render';

/** plan_dispatch 成功响应(routes 已与 RouteRenderItem 同构,无需 mapper)。 */
interface DispatchResponse {
  ok: boolean;
  error?: string;
  target?: string;
  lng?: number;
  lat?: number;
  routes?: RouteRenderItem[];
}

/**
 * AI 智能派遣:给定目标,后端自动推荐主力站并规划到场路线。
 * @param target {name, lng, lat} —— 优先传坐标(省去后端名称解析);name 仅作日志/场景动作展示。
 */
export async function fetchAiDispatch(target: {
  name: string;
  lng: number;
  lat: number;
}): Promise<{ target: string; routes: RouteRenderItem[] }> {
  const res = await fetch('/api/business/dispatch/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: target.name, target_lng: target.lng, target_lat: target.lat }),
  });
  if (!res.ok) throw new Error(`AI 派遣请求失败 ${res.status}`);
  const data = (await res.json()) as DispatchResponse;
  if (!data.ok) throw new Error(data.error || 'AI 派遣未能规划路线');
  return { target: data.target || target.name, routes: data.routes ?? [] };
}
