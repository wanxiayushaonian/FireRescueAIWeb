'use client';
// 派遣面板 hook:派遣目标/多站路线规划(renderRoutes 统一渲染)/路线清理/周边水源高亮 + 面板锚点跟随。
// 从 RealGisMap 抽取,行为不变。openDeploy 需联动关闭圆环菜单 → setRadial 由 deps 注入。
import { useCallback, useEffect, useState } from 'react';
import L from 'leaflet';
import type { Station } from '@/mock/types';
import { fetchNearbyWaterSources } from '@/api/water';
import { fetchDrivingRoute } from '@/api/route';
import { haversineKm } from '@/lib/geo-query';
import { renderRoutes, type RouteRenderItem } from '@/lib/gis/route-render';
import { addSceneAction } from '@/mock/sceneLog';
import type { CoordFixTarget } from '../CoordinateFixPanel';
import type { DeployStation, PlannedRoute } from '../DeployPanel';

// 只派遣常规主力(支队/救援大队/救援站);与灾情响应分析(use-incident-response)口径一致,
// 排除专职站/微型/志愿等辅助力量
const DEPLOY_STATION_TYPES = ['支队', '救援大队', '救援站'];

export interface DeployState {
  target: { name: string; lng: number; lat: number };
  stations: DeployStation[];
  anchor: { x: number; y: number; maxX: number };
  emptyHint?: string; // 小眼睛关闭/周边无常规主力站时的空态文案
}

type SetRadial = React.Dispatch<React.SetStateAction<{ target: CoordFixTarget; x: number; y: number } | null>>;

export function useDeployRoutes(deps: {
  mapRef: React.MutableRefObject<L.Map | null>;
  routeLayer: L.LayerGroup | null;
  highlightLayer: L.LayerGroup | null;
  stationsRef: React.MutableRefObject<Station[]>;
  setRadial: SetRadial; // openDeploy 联动关闭圆环菜单
  stationsVisible: boolean; // 消防站图层小眼睛:关闭 → 面板空态提示
}): {
  deploy: DeployState | null;
  openDeploy: (t: { name: string; lng: number; lat: number }) => void;
  closeDeploy: () => void;
  planned: PlannedRoute[];
  setPlanned: React.Dispatch<React.SetStateAction<PlannedRoute[]>>;
  planning: boolean;
  planRoutes: (stationIds: string[]) => Promise<void>;
  clearRoutes: () => void;
  highlightNearbyWater: (t: { lng: number; lat: number }) => void;
} {
  const { mapRef, routeLayer, highlightLayer, stationsRef, setRadial, stationsVisible } = deps;

  const [deploy, setDeploy] = useState<DeployState | null>(null);
  const [planned, setPlanned] = useState<PlannedRoute[]>([]);
  const [planning, setPlanning] = useState(false);

  // 周边水源高亮:500m 内水源画青色圈 + 适窗(独立可调,警情圆环"周边水源"复用)
  const highlightNearbyWater = useCallback(
    (t: { lng: number; lat: number }) => {
      const map = mapRef.current;
      const highlight = highlightLayer;
      if (!map || !highlight) return;
      highlight.clearLayers();
      // 地图与库同为 GCJ02,直接调 nearby 半径查询
      fetchNearbyWaterSources({ lng: t.lng, lat: t.lat, radius: 500 })
        .then((nearby) => {
          const bounds = L.latLngBounds([L.latLng(t.lat, t.lng)]);
          nearby.forEach((w) => {
            L.circleMarker([w.lat, w.lng], { radius: 10, color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.3, weight: 2 })
              .bindTooltip(`${w.name} · ${w.type} · ${Math.round(w.distanceM)}m`, { direction: 'top', className: 'gis-tip' })
              .addTo(highlight);
            bounds.extend(L.latLng(w.lat, w.lng));
          });
          if (nearby.length) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17 });
        })
        .catch(() => {});
    },
    [mapRef, highlightLayer],
  );

  // 打开派遣面板:消防站图层可见时,只列常规主力(支队/救援大队/救援站,与响应分析口径一致),
  // 按到目标直线距离排序 + 算锚点 + 周边水源高亮;小眼睛关闭或无常规主力 → 空态提示
  const openDeploy = useCallback(
    (t: { name: string; lng: number; lat: number }) => {
      const map = mapRef.current;
      if (!map) return;
      const p = map.latLngToContainerPoint(L.latLng(t.lat, t.lng));
      const anchor = { x: p.x, y: p.y, maxX: map.getSize().x };
      const base = { target: { name: t.name, lng: t.lng, lat: t.lat }, anchor };

      if (!stationsVisible) {
        // 小眼睛关闭 → 空态(与灾情响应分析一致)
        setDeploy({ ...base, stations: [], emptyHint: '请打开消防站图层小眼睛以选择派遣力量' });
      } else {
        // 只派遣常规主力(支队/救援大队/救援站),排除专职站/微型等辅助力量
        const eligible = stationsRef.current.filter((s) => DEPLOY_STATION_TYPES.includes(s.type as string));
        if (eligible.length === 0) {
          setDeploy({ ...base, stations: [], emptyHint: '周边无常规主力消防站(支队/救援大队/救援站)' });
        } else {
          const sorted = eligible
            .map((s) => ({ ...s, distKm: haversineKm(s.lng, s.lat, t.lng, t.lat) }))
            .sort((a, b) => a.distKm - b.distKm);
          setDeploy({ ...base, stations: sorted });
        }
      }
      setPlanned([]);
      setRadial(null);
      highlightNearbyWater(t);
    },
    [mapRef, stationsRef, setRadial, highlightNearbyWater, stationsVisible],
  );

  // 多站到场路线规划:每站 driving(GCJ02)→ renderRoutes 统一渲染(色板/tipHtml 在 lib/gis/route-render);写 showRoute scene action(MCP 通道)
  const planRoutes = useCallback(
    async (stationIds: string[]) => {
      const map = mapRef.current;
      if (!map || !routeLayer || !deploy) return;
      setPlanning(true);
      setPlanned([]);
      // 并发拉各站 driving;失败站跳过;按 stationIds 顺序组装(原实现靠 sort 恢复顺序,等价)
      const items = (
        await Promise.all(
          stationIds.map(async (id) => {
            const s = stationsRef.current.find((x) => x.id === id);
            if (!s) return null;
            try {
              const route = await fetchDrivingRoute({ lng: s.lng, lat: s.lat }, { lng: deploy.target.lng, lat: deploy.target.lat });
              return { stationId: id, stationName: s.name, polyline: route.polyline, distance: route.distance, duration: route.duration, trafficLights: route.trafficLights } as RouteRenderItem;
            } catch {
              return null; // 单站失败跳过
            }
          }),
        )
      ).filter((x): x is RouteRenderItem => x !== null);
      const { bounds, summary } = renderRoutes(routeLayer, items);
      setPlanned(summary);
      setPlanning(false);
      if (bounds) map.flyToBounds(bounds, { padding: [60, 60] });
      addSceneAction({
        action: 'showRoute',
        target: `派遣路线:${deploy.target.name}(${summary.length} 站)`,
        params: { routes: summary },
        source: '面板',
      });
    },
    [mapRef, routeLayer, stationsRef, deploy],
  );

  const clearRoutes = useCallback(() => {
    routeLayer?.clearLayers();
    highlightLayer?.clearLayers();
    setPlanned([]);
  }, [routeLayer, highlightLayer]);

  // 原 DeployPanel onClose 的 setDeploy(null)+clearRoutes
  const closeDeploy = useCallback(() => {
    setDeploy(null);
    clearRoutes();
  }, [clearRoutes]);

  // 派遣面板:地图移动/缩放时跟随目标重算锚点(不飞开)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !deploy) return;
    const update = () => {
      const p = map.latLngToContainerPoint(L.latLng(deploy.target.lat, deploy.target.lng));
      setDeploy((prev) => (prev ? { ...prev, anchor: { x: p.x, y: p.y, maxX: map.getSize().x } } : prev));
    };
    map.on('move zoom', update);
    return () => {
      map.off('move zoom', update);
    };
  }, [mapRef, deploy?.target.lng, deploy?.target.lat]);

  return {
    deploy,
    openDeploy,
    closeDeploy,
    planned,
    setPlanned,
    planning,
    planRoutes,
    clearRoutes,
    highlightNearbyWater,
  };
}
