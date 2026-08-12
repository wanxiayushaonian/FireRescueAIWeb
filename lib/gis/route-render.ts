// lib/gis/route-render.ts
// 多站到场路线渲染:色板/锚点/tipHtml 纯函数 + Leaflet 渲染封装(极薄,node 单测只覆盖纯函数)。
// 面板 planRoutes 与 sceneLog showRoute 执行器(MCP 通道)共用本模块——tipHtml 模板与色板只此一份。
// 与 lib/map-icons 同策略:lib 不顶层 import leaflet 运行时(其模块顶层依赖 window,node 单测会炸),
// 类型用 import type,运行时由 renderRoutes 内延迟 require(该函数只在浏览器被调用,单测不触达)。
import type L from 'leaflet';

export interface RouteRenderItem {
  stationId?: string;
  stationName: string;
  polyline: [number, number][];
  distance?: number; // 米
  duration?: number; // 秒
  trafficLights?: number;
}

export interface RouteSummary {
  stationId: string;
  stationName: string;
  distance: number;
  duration: number;
  trafficLights: number;
}

export const ROUTE_COLORS = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#f87171', '#60a5fa'] as const;

export function routeColor(idx: number): string {
  return ROUTE_COLORS[idx % ROUTE_COLORS.length];
}

/** 信息标签锚定路线分段点(按 idx 错开,避免多条叠在中点)。 */
export function routeSegIndex(polylineLength: number, idx: number): number {
  return Math.min(Math.floor(polylineLength * (0.3 + idx * 0.18)), polylineLength - 1);
}

/** 贴线 tooltip HTML(深色卡片 + 站名 + 距离/ETA/红绿灯)。 */
export function routeTipHtml(r: RouteRenderItem, idx: number): string {
  const color = routeColor(idx);
  const distKm = r.distance != null ? (r.distance / 1000).toFixed(1) : '?';
  const etaMin = r.duration != null ? String(Math.round(r.duration / 60)) : '?';
  return `<div style="background:rgba(10,20,32,.94);border:1px solid ${color}66;border-radius:5px;padding:3px 8px;color:#e6edf3;font-size:13px;white-space:nowrap;box-shadow:0 0 8px ${color}44"><span style="color:${color};font-weight:700">${r.stationName}</span> <span style="color:#9db4c8">${distKm}km · ${etaMin}分 · ${r.trafficLights ?? 0}灯</span></div>`;
}

/** 路线起点(消防站)标注 HTML:彩色圆点(与路线同色)+ 站名徽标,放在 polyline[0]。 */
export function routeStartHtml(r: RouteRenderItem, idx: number): string {
  const color = routeColor(idx);
  return `<div style="display:flex;align-items:center;gap:5px;white-space:nowrap"><span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:${color};border:2px solid #0b1220;box-shadow:0 0 0 2px ${color}66,0 0 8px ${color}88"></span><span style="background:rgba(10,20,32,.94);border:1px solid ${color}66;border-radius:4px;padding:2px 7px;color:#e6edf3;font-size:12px;font-weight:600;box-shadow:0 0 6px ${color}44">${r.stationName}</span></div>`;
}

/** 渲染多条路线到 layer(先 clearLayers),返回适窗 bounds 与面板 summary。 */
export function renderRoutes(
  layer: L.LayerGroup,
  routes: RouteRenderItem[],
): { bounds: L.LatLngBounds | null; summary: RouteSummary[] } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  layer.clearLayers();
  const allLatLngs: [number, number][] = [];
  const summary: RouteSummary[] = [];
  routes.forEach((r, idx) => {
    if (!r.polyline?.length) return;
    const color = routeColor(idx);
    L.polyline(r.polyline, { color, weight: 4, dashArray: '10 8', opacity: 0.9, className: 'route-flow' }).addTo(layer);
    const seg = routeSegIndex(r.polyline.length, idx);
    L.marker(r.polyline[seg], {
      icon: L.divIcon({ html: routeTipHtml(r, idx), className: 'route-tip-icon', iconSize: undefined, iconAnchor: [0, 0] }),
      interactive: false,
      keyboard: false,
    }).addTo(layer);
    // 起点(消防站)标注:彩色圆点 + 站名徽标,锚定圆点中心到 polyline[0]
    L.marker(r.polyline[0], {
      icon: L.divIcon({ html: routeStartHtml(r, idx), className: 'route-start-icon', iconSize: [0, 0], iconAnchor: [0, 0] }),
      interactive: false,
      keyboard: false,
    }).addTo(layer);
    r.polyline.forEach((pt) => allLatLngs.push(pt));
    summary.push({
      stationId: r.stationId ?? `ext-${idx}`,
      stationName: r.stationName,
      distance: r.distance ?? 0,
      duration: r.duration ?? 0,
      trafficLights: r.trafficLights ?? 0,
    });
  });
  return { bounds: allLatLngs.length ? L.latLngBounds(allLatLngs) : null, summary };
}
