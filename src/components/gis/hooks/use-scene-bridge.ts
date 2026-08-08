'use client';
// sceneLog 订阅执行器 hook:flyTo/addMarker(坐标直达/站名命中/水源视口命中/后端 keyword 兜底,400ms×6 重试 openPopup)
// + resetView + showRoute(MCP/agent 通道,renderRoutes 渲染,跳过 source==='面板')。从 RealGisMap 抽取,行为不变。
// routeLayer 是 useLeafletMap 的可变 layers 对象字段(初始化前为 null):依赖数组含 routeLayer,
// 地图初始化完成的重渲染后重订阅拿到真实图层——与原来回调内惰性读 layers.route 等价(此前 mapRef 也为空,事件被守卫挡掉)。
import { useEffect } from 'react';
import L from 'leaflet';
import type { Station, WaterSource } from '@/mock/types';
import { fetchWaterSourcesPage } from '@/api/water';
import { subscribeSceneLog } from '@/mock/sceneLog';
import { renderRoutes, type RouteRenderItem } from '@/lib/gis/route-render';
import type { PlannedRoute } from '../DeployPanel';

export function useSceneBridge(deps: {
  mapRef: React.MutableRefObject<L.Map | null>;
  routeLayer: L.LayerGroup | null;
  defaultCenter: [number, number];          // DEFAULT_CENTER
  defaultZoom: number;                       // DEFAULT_ZOOM
  stationsRef: React.MutableRefObject<Station[]>;
  waterRef: React.MutableRefObject<WaterSource[]>;
  stationMarkers: React.MutableRefObject<Map<string, L.Marker>>;
  waterMarkers: React.MutableRefObject<Map<string, L.Marker>>;
  setPlanned: React.Dispatch<React.SetStateAction<PlannedRoute[]>>;
}): void {
  const {
    mapRef, routeLayer, defaultCenter, defaultZoom,
    stationsRef, waterRef, stationMarkers, waterMarkers, setPlanned,
  } = deps;

  // sceneLog 联动
  useEffect(() => {
    const unsub = subscribeSceneLog((_list, latest) => {
      const map = mapRef.current;
      if (!map || !latest) return;
      if (latest.action === 'flyTo' || latest.action === 'addMarker') {
        const p = latest.params as { lng?: number; lat?: number; id?: string } | undefined;
        if (typeof p?.lng === 'number' && typeof p?.lat === 'number' && (p.lng || p.lat)) {
          // 首选:params 直接带坐标(面板联动),免搜索直达;zoom 拉到点位级保证水源逐点渲染
          map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15));
          if (p.id) {
            // 点位数据在 moveend 防抖 + bbox 请求后才到位,重试几次等它渲染
            let tries = 0;
            const tryOpen = () => {
              tries += 1;
              const mk = stationMarkers.current.get(p.id!) ?? waterMarkers.current.get(p.id!);
              if (mk) mk.openPopup();
              else if (tries < 6) window.setTimeout(tryOpen, 400);
            };
            window.setTimeout(tryOpen, 400);
          }
        } else {
        const hit = stationsRef.current.find((s) => latest.target?.includes(s.name));
        if (hit) {
          map.flyTo([hit.lat, hit.lng], Math.max(map.getZoom(), 14));
          stationMarkers.current.get(hit.id)?.openPopup();
        } else {
          const w = waterRef.current.find((x) => latest.target?.includes(x.name));
          if (w) {
            // 必须飞到点位级(zoom>=15):中低 zoom 是聚合气泡,没有可弹 popup 的逐点 marker
            map.flyTo([w.lat, w.lng], Math.max(map.getZoom(), 15));
            // 点位数据在 moveend 防抖 + bbox 请求后才到位,重试几次等它渲染
            let tries = 0;
            const tryOpen = () => {
              tries += 1;
              const mk = waterMarkers.current.get(w.id);
              if (mk) mk.openPopup();
              else if (tries < 6) window.setTimeout(tryOpen, 400);
            };
            window.setTimeout(tryOpen, 400);
          } else if (latest.target) {
            // 视口内未命中(水源是视口加载):按名称关键词查后端兜底
            fetchWaterSourcesPage({ keyword: latest.target, pageSize: 5 })
              .then(({ items }) => {
                const hit = items.find((x) => latest.target?.includes(x.name)) ?? items[0];
                if (!hit || !hit.lng || !hit.lat) return;
                map.flyTo([hit.lat, hit.lng], Math.max(map.getZoom(), 15));
              })
              .catch(() => {});
          }
        }
        }
      }
      if (latest.action === 'resetView') {
        mapRef.current?.setView(defaultCenter, defaultZoom);
      }
      if (latest.action === 'showRoute' && latest.source !== '面板') {
        // MCP/agent 通道:外部写 showRoute(含 routes[])→ 渲染多 polyline(面板自己写的跳过,避免重复)
        // MCP 通道是无类型保证的运行时数据:容忍 stationName 缺失,回退"路线 N"(与重构前行为一致)
        const routes = (latest.params as {
          routes?: Array<Omit<RouteRenderItem, 'stationName'> & { stationName?: string }>;
        }).routes;
        if (routeLayer && Array.isArray(routes) && routes.length) {
          const items: RouteRenderItem[] = routes.map((r, i) => ({ ...r, stationName: r.stationName ?? `路线 ${i + 1}` }));
          const { bounds, summary } = renderRoutes(routeLayer, items);
          setPlanned(summary);
          if (bounds) map.flyToBounds(bounds, { padding: [60, 60] });
        }
      }
    });
    return () => {
      unsub();
    };
  }, [routeLayer]);
}
