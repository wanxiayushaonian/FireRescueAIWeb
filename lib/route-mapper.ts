// 驾车路线数据映射:znya /route/driving → Route 形状。
// 后端返回 polyline 为 GCJ02 [lng,lat];Leaflet 渲染需 [lat,lng],此处翻转(坐标系不变)。
export interface ZnyaDrivingRoute {
  distance: number; // 米
  duration: number; // 秒
  traffic_lights: number;
  polyline: number[][]; // [[lng, lat], ...] GCJ02
}

export interface Route {
  distance: number; // 米
  duration: number; // 秒
  trafficLights: number;
  polyline: [number, number][]; // [lat, lng] Leaflet 渲染顺序(GCJ02)
}

/** 映射 znya 驾车路线 → Route([lng,lat]→[lat,lng] 翻转;GCJ02 坐标系不变)。 */
export function mapRoute(z: ZnyaDrivingRoute): Route {
  return {
    distance: z.distance,
    duration: z.duration,
    trafficLights: z.traffic_lights,
    polyline: z.polyline.map((p) => [p[1], p[0]] as [number, number]),
  };
}
