'use client';
// sceneLog 订阅执行器 hook:flyTo/addMarker(坐标直达/站名命中/水源视口命中/后端 keyword 兜底,400ms×6 重试 openPopup)
// + resetView + showRoute(MCP/agent 通道,renderRoutes 渲染,跳过 source==='面板')。从 RealGisMap 抽取,行为不变。
// routeLayer 是 useLeafletMap 的可变 layers 对象字段(初始化前为 null):依赖数组含 routeLayer,
// 地图初始化完成的重渲染后重订阅拿到真实图层。与原实现(回调内惰性读 layers.route)的差异窗口仅为
// 挂载首个 commit → mapInited 重渲染之间;showRoute 生产方(面板/MCP/agent 通道)不会在组件挂载瞬间派发,
// 且窗口内 mapRef 也为空、事件被守卫挡掉,故功能等价。
import { useEffect } from 'react';
import L from 'leaflet';
import type { Station, WaterSource } from '@/mock/types';
import { fetchWaterSourcesPage } from '@/api/water';
import { subscribeSceneLog } from '@/mock/sceneLog';
import { renderRoutes, type RouteRenderItem } from '@/lib/gis/route-render';
import { drawFlyToPulse, clearFlyToPulse } from '@/lib/gis/flyto-pulse';
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
  keyUnitMarkers: React.MutableRefObject<Map<string, L.Marker>>;
  setPlanned: React.Dispatch<React.SetStateAction<PlannedRoute[]>>;
  /** flyTo 携带 layer 时回调(RealGisMap 据此自动打开未开启的图层;agent gis_fly_to 联动)。 */
  onFlyToLayer?: (layer: string) => void;
  /** 响应分析回调(实战指挥模块选中警情时触发,画分层响应圈+ETA)。 */
  onAnalyzeResponse?: (target: { name: string; lng: number; lat: number }) => void;
}): void {
  const {
    mapRef, routeLayer, defaultCenter, defaultZoom,
    stationsRef, waterRef, stationMarkers, waterMarkers, keyUnitMarkers, setPlanned, onFlyToLayer, onAnalyzeResponse,
  } = deps;

  // sceneLog 联动
  useEffect(() => {
    const unsub = subscribeSceneLog((_list, latest) => {
      const map = mapRef.current;
      if (!map || !latest) return;
      if (latest.action === 'flyTo' || latest.action === 'addMarker') {
        const p = latest.params as { lng?: number; lat?: number; id?: string; zoom?: number; layer?: string } | undefined;
        if (typeof p?.lng === 'number' && typeof p?.lat === 'number' && (p.lng || p.lat)) {
          // 目标点位的图层未开时先开(agent 飞向水源/单位等,看不到 marker 就不知道飞向了什么)
          if (p.layer) onFlyToLayer?.(p.layer);
          // 首选:params 直接带坐标(面板联动),免搜索直达;zoom 拉到点位级保证水源逐点渲染
          // (agent gis_fly_to 可带 zoom 覆盖默认 15;只放大不缩小,保持用户已放大的视野)
          const targetZoom = typeof p.zoom === 'number' && p.zoom > 0 ? p.zoom : 15;
          map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), targetZoom));
          // 脉冲标记:坐标级视觉反馈(不依赖图层数据是否已加载),下一次飞行/复位时替换或清除
          drawFlyToPulse(map, { lat: p.lat, lng: p.lng, label: latest.target });
          if (p.id) {
            // 点位数据在 moveend 防抖 + bbox 请求后才到位,重试几次等它渲染
            let tries = 0;
            const tryOpen = () => {
              tries += 1;
              const mk = stationMarkers.current.get(p.id!) ?? waterMarkers.current.get(p.id!) ?? keyUnitMarkers.current.get(p.id!);
              if (mk) {
                // 选中态高亮(发光外圈,不依赖 popup 打开;popup 打开也会经 popupopen 加同 class)
                mk.getElement()?.classList.add('gis-marker-active');
                mk.openPopup();
              } else if (tries < 6) window.setTimeout(tryOpen, 400);
            };
            window.setTimeout(tryOpen, 400);
          }
        } else {
        const hit = stationsRef.current.find((s) => latest.target?.includes(s.name));
        if (hit && hit.lng != null && hit.lat != null) {
          map.flyTo([hit.lat, hit.lng], Math.max(map.getZoom(), 14));
          const mk = stationMarkers.current.get(hit.id);
          if (mk) {
            mk.getElement()?.classList.add('gis-marker-active');
            mk.openPopup();
          }
        } else {
          const w = waterRef.current.find((x) => latest.target?.includes(x.name));
          if (w && w.lng != null && w.lat != null) {
            // 必须飞到点位级(zoom>=15):中低 zoom 是聚合气泡,没有可弹 popup 的逐点 marker
            map.flyTo([w.lat, w.lng], Math.max(map.getZoom(), 15));
            // 点位数据在 moveend 防抖 + bbox 请求后才到位,重试几次等它渲染
            let tries = 0;
            const tryOpen = () => {
              tries += 1;
              const mk = waterMarkers.current.get(w.id);
              if (mk) {
                mk.getElement()?.classList.add('gis-marker-active');
                mk.openPopup();
              } else if (tries < 6) window.setTimeout(tryOpen, 400);
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
      if (latest.action === 'addMarker') {
        // 实战指挥模块选中警情:params 携带 incidentId → 触发响应分析(分层响应圈+ETA)
        // 其他模块的 addMarker(水源/站等)不带 incidentId,不受影响
        const p = latest.params as { incidentId?: string; lng?: number; lat?: number } | undefined;
        if (p?.incidentId && typeof p.lng === 'number' && typeof p.lat === 'number') {
          onAnalyzeResponse?.({ name: latest.target, lng: p.lng, lat: p.lat });
        }
      }
      if (latest.action === 'resetView') {
        mapRef.current?.setView(defaultCenter, defaultZoom);
        const m = mapRef.current;
        if (m) clearFlyToPulse(m);
      }
      if (latest.action === 'showRoute' && latest.source !== '面板') {
        // MCP/agent 通道:外部写 showRoute(含 routes[])→ 渲染多 polyline(面板自己写的跳过,避免重复)
        // MCP 通道是无类型保证的运行时数据:容忍 stationName 缺失,回退"路线 N"(与重构前行为一致)
        const routes = (latest.params as {
          routes?: Array<Omit<RouteRenderItem, 'stationName'> & { stationName?: string }>;
        }).routes;
        if (routeLayer && Array.isArray(routes) && routes.length) {
          const items: RouteRenderItem[] = routes.map((r, i) => ({ ...r, stationName: r.stationName ?? `路线 ${i + 1}` }));
          const { summary } = renderRoutes(routeLayer, items);
          setPlanned(summary);
          // 不再 flyToBounds 路线范围:派遣网络远大于案域,自动拉远会把警情区域
          // 缩成一点(用户反馈"内容更新时视角被拉走且看不清警情")——画线不动画
        }
      }
    });
    return () => {
      unsub();
    };
  }, [routeLayer, defaultCenter, defaultZoom, setPlanned, onFlyToLayer, onAnalyzeResponse]);
}
