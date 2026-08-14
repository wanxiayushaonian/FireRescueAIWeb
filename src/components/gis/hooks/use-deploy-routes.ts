'use client';
// 派遣面板 hook:派遣目标/多站路线规划(renderRoutes 统一渲染)/路线清理/周边水源高亮 + 面板锚点跟随。
// 从 RealGisMap 抽取,行为不变。openDeploy 需联动关闭圆环菜单 → setRadial 由 deps 注入。
import { useCallback, useEffect, useState } from 'react';
import L from 'leaflet';
import type { Station } from '@/mock/types';
import { fetchNearbyWaterSources } from '@/api/water';
import { fetchDrivingRoute } from '@/api/route';
import { fetchAiDispatch } from '@/api/dispatch';
import { haversineKm } from '@/lib/geo-query';
import { renderRoutes, type RouteRenderItem } from '@/lib/gis/route-render';
import { addSceneAction } from '@/mock/sceneLog';
import type { CoordFixTarget } from '../CoordinateFixPanel';
import type { DeployStation, PlannedRoute } from '../DeployPanel';

// 只派遣常规主力(支队/救援大队/救援站);与灾情响应分析(use-incident-response)口径一致,
// 排除专职站/微型/志愿等辅助力量
const DEPLOY_STATION_TYPES = ['支队', '救援大队', '救援站'];

// 排除不参与实战出动的站点(机关/勤务/机动大队不承担常规到场任务)
const EXCLUDED_STATION_NAMES = ['九江支队', '机动一大队', '应急通信与车辆勤务站'];

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
  aiDispatch: () => Promise<void>;
  clearRoutes: () => void;
  highlightNearbyWater: (t: { lng: number; lat: number }) => void;
} {
  const { mapRef, routeLayer, highlightLayer, stationsRef, setRadial, stationsVisible } = deps;

  const [deploy, setDeploy] = useState<DeployState | null>(null);
  const [planned, setPlanned] = useState<PlannedRoute[]>([]);
  const [planning, setPlanning] = useState(false);

  // 周边水源高亮:目标点 500m 外部圈 + 圈内水源画青色点 + 适窗到水源逐点可见层级
  // (zoom>=15 水源才逐点渲染;低于此级别是聚合气泡,看不到具体水源点位)
  const highlightNearbyWater = useCallback(
    (t: { lng: number; lat: number }) => {
      const map = mapRef.current;
      const highlight = highlightLayer;
      if (!map || !highlight) return;
      highlight.clearLayers();
      // 目标点 500m 外部圈(虚线,表示周边水源覆盖范围)
      L.circle([t.lat, t.lng], {
        radius: 500,
        color: '#22d3ee',
        weight: 1.5,
        opacity: 0.6,
        dashArray: '4 6',
        fill: false,
      })
        .bindTooltip('周边水源范围 500m', { direction: 'top', className: 'gis-tip' })
        .addTo(highlight);
      // 地图与库同为 GCJ02,直接调 nearby 半径查询
      fetchNearbyWaterSources({ lng: t.lng, lat: t.lat, radius: 500 })
        .then((nearby) => {
          const bounds = L.latLngBounds([L.latLng(t.lat, t.lng)]);
          nearby.forEach((w) => {
            if (w.lat == null || w.lng == null) return; // 坐标缺失 → 跳过
            L.circleMarker([w.lat, w.lng], { radius: 10, color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.3, weight: 2 })
              .bindTooltip(`${w.name} · ${w.type} · ${Math.round(w.distanceM)}m`, { direction: 'top', className: 'gis-tip' })
              .addTo(highlight);
            bounds.extend(L.latLng(w.lat, w.lng));
          });
          if (nearby.length) {
            // 适配到包含全部水源点,且 zoom 至少到 15(水源逐点渲染层级)
            map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 17 });
            const targetZoom = Math.max(map.getBoundsZoom(bounds), 15);
            window.setTimeout(() => {
              if (map.getZoom() < 15) map.setZoom(targetZoom);
            }, 700);
          }
        })
        .catch(() => {});
    },
    [mapRef, highlightLayer],
  );

  // 打开派遣面板:消防站图层可见时,只列常规主力(支队/救援大队/救援站,与响应分析口径一致),
  // 按到目标直线距离排序 + 算锚点;小眼睛关闭或无常规主力 → 空态提示。
  // 不在此自动画周边水源高亮圈——派遣视图聚焦选站与路线,水源需用户从圆环菜单「周边水源」单独查看。
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
        // 只派遣常规主力(支队/救援大队/救援站),排除专职站/微型等辅助力量;
        // 再按名称排除机关/勤务/机动大队等不承担常规到场任务的站点
        const eligible = stationsRef.current.filter(
          (s): s is Station & { lng: number; lat: number } =>
            DEPLOY_STATION_TYPES.includes(s.type as string) &&
            !EXCLUDED_STATION_NAMES.includes(s.name) &&
            s.lng != null && s.lat != null, // 无坐标站不参与派遣(无法画路线/算距离)
        );
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
    },
    [mapRef, stationsRef, setRadial, stationsVisible],
  );

  // 多站到场路线规划:每站 driving(GCJ02)→ renderRoutes 统一渲染(色板/tipHtml 在 lib/gis/route-render);写 showRoute scene action(MCP 通道)
  const planRoutes = useCallback(
    async (stationIds: string[]) => {
      const map = mapRef.current;
      if (!map || !routeLayer || !deploy) return;
      setPlanning(true);
      setPlanned([]);
      // 进入路线规划后,视口会缩放到路线整体尺度,此时周边水源高亮圈(500m 外圈+点位)
      // 已脱离当前比例尺语境,清掉避免在路线视图上残留干扰
      highlightLayer?.clearLayers();
      // 并发拉各站 driving;失败站跳过;按 stationIds 顺序组装(原实现靠 sort 恢复顺序,等价)
      const items = (
        await Promise.all(
          stationIds.map(async (id) => {
            const s = stationsRef.current.find((x) => x.id === id);
            if (!s || s.lng == null || s.lat == null) return null; // 无坐标站跳过
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
    [mapRef, routeLayer, highlightLayer, stationsRef, deploy],
  );

  const clearRoutes = useCallback(() => {
    routeLayer?.clearLayers();
    highlightLayer?.clearLayers();
    setPlanned([]);
  }, [routeLayer, highlightLayer]);

  // AI 智能派遣:后端 plan_dispatch 自动推荐主力站 + 规划路线(复用 MCP 同源逻辑)。
  // 渲染链路与 planRoutes 一致(renderRoutes → setPlanned → flyToBounds → sceneLog),
  // 区别仅在路线来源:planRoutes 逐站调 driving,aiDispatch 由后端一次性返回。
  const aiDispatch = useCallback(async () => {
    const map = mapRef.current;
    if (!map || !routeLayer || !deploy) return;
    setPlanning(true);
    setPlanned([]);
    highlightLayer?.clearLayers();
    try {
      const { routes } = await fetchAiDispatch({
        name: deploy.target.name, lng: deploy.target.lng, lat: deploy.target.lat,
      });
      const { bounds, summary } = renderRoutes(routeLayer, routes);
      setPlanned(summary);
      if (bounds) map.flyToBounds(bounds, { padding: [60, 60] });
      addSceneAction({
        action: 'showRoute',
        target: `AI 派遣路线:${deploy.target.name}(${summary.length} 站)`,
        params: { routes: summary },
        source: '面板',
      });
    } catch {
      // 后端规划失败:不假装成功,planned 保持空;具体错误由调用方/日志体现
    } finally {
      setPlanning(false);
    }
  }, [mapRef, routeLayer, highlightLayer, deploy]);

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
    aiDispatch,
    clearRoutes,
    highlightNearbyWater,
  };
}
