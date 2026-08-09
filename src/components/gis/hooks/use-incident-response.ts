'use client';
// 灾情响应分析 hook:选中灾情建筑 → 筛 5km 可见站 → 批量 driving 取 ETA
// → 染色环 + 估算参考圈 + 最近站一条路线。从 RealGisMap 编排,纯逻辑在 lib/gis。
import { useCallback, useEffect, useState } from 'react';
import L from 'leaflet';
import type { Station } from '@/mock/types';
import { fetchDrivingRoute } from '@/api/route';
import { selectWithinKm, rankByEta, type EtaItem } from '@/lib/gis/response-query';
import { haversineKm } from '@/lib/geo-query';
import {
  renderResponseEta,
  renderReferenceCircle,
  clearResponseLayer,
} from '@/lib/gis/render-response';
import { renderRoutes, type RouteRenderItem } from '@/lib/gis/route-render';

export interface ResponseTarget {
  name: string;
  lng: number;
  lat: number;
}

export interface ResponseState {
  target: ResponseTarget;
  items: EtaItem[];
  nearestId: string | null;
  targetMin: number;
  loading: boolean;
  error?: string;
  anchor: { x: number; y: number; maxX: number };
}

const RESPONSE_RADIUS_KM = 5;
// 只派遣常规主力(支队/救援大队/救援站);排除专职站/微型/志愿等辅助力量
const RESPONSE_STATION_TYPES = ['支队', '救援大队', '救援站'];
const DRIVING_QPS = 3; // 高德免费 key QPS 上限(超 → CUQPS_HAS_EXCEEDED_THE_LIMIT),保守取 3
const NEAREST_LIMIT = 8; // 5km 内取直线距离最近 N 站 driving(远的到场慢不关键 + 控 QPS)

/** 限速串行执行(qps 控速,避免高德 CUQPS_HAS_EXCEEDED_THE_LIMIT),保留入参顺序。 */
async function throttledMap<T, R>(items: T[], qps: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const interval = 1000 / qps;
  const ret: R[] = new Array(items.length);
  let last = 0;
  for (let i = 0; i < items.length; i++) {
    const wait = Math.max(0, last + interval - Date.now());
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    ret[i] = await fn(items[i]);
  }
  return ret;
}

export function useIncidentResponse(deps: {
  mapRef: React.MutableRefObject<L.Map | null>;
  responseLayer: L.LayerGroup | null;
  routeLayer: L.LayerGroup | null;
  stationsRef: React.MutableRefObject<Station[]>;
  stationsVisible: boolean;
}): {
  responseState: ResponseState | null;
  analyze: (target: ResponseTarget, targetMin?: number) => Promise<void>;
  clearResponse: () => void;
} {
  const { mapRef, responseLayer, routeLayer, stationsRef, stationsVisible } = deps;
  const [state, setState] = useState<ResponseState | null>(null);

  const analyze = useCallback(
    async (target: ResponseTarget, targetMin = 5) => {
      const map = mapRef.current;
      if (!map || !responseLayer) return;
      // 面板锚定灾情点(屏幕坐标,与 DeployPanel/ForceManagePanel 一致)
      const p = map.latLngToContainerPoint(L.latLng(target.lat, target.lng));
      const anchor = { x: p.x, y: p.y, maxX: map.getSize().x };

      // 前置:stations 小眼睛关闭或无站 → 空态
      if (!stationsVisible || stationsRef.current.length === 0) {
        clearResponseLayer(responseLayer);
        setState({
          target,
          items: [],
          nearestId: null,
          targetMin,
          loading: false,
          anchor,
          error: '5km 内无可见消防站(检查消防站图层小眼睛)',
        });
        return;
      }

      setState({ target, items: [], nearestId: null, targetMin, loading: true, anchor });
      clearResponseLayer(responseLayer);
      routeLayer?.clearLayers();
      renderReferenceCircle(responseLayer, { lat: target.lat, lng: target.lng }, targetMin);

      // 只派遣常规主力(支队/救援大队/救援站),排除专职站/微型等辅助力量
      const eligible = stationsRef.current.filter((s) =>
        RESPONSE_STATION_TYPES.includes(s.type as string),
      );
      const within = selectWithinKm(
        eligible.map((s) => ({ id: s.id, name: s.name, lng: s.lng, lat: s.lat })),
        { lng: target.lng, lat: target.lat },
        RESPONSE_RADIUS_KM,
      );
      if (within.length === 0) {
        setState({
          target,
          items: [],
          nearestId: null,
          targetMin,
          loading: false,
          anchor,
          error: `5km 内无常规主力消防站(支队/救援大队/救援站)`,
        });
        return;
      }

      // 取直线距离最近 N 站 driving(远的到场慢不关键;大幅减少调用避免高德 QPS 超限)
      const nearest = within
        .map((s) => ({ s, d: haversineKm(s.lng, s.lat, target.lng, target.lat) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, NEAREST_LIMIT)
        .map((x) => x.s);

      // 限速 driving(高德 ~3 QPS,串行节流控速;单站失败重试 1 次(300ms 退避),仍失败跳过)
      const results = (
        await throttledMap(nearest, DRIVING_QPS, async (s) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const r = await fetchDrivingRoute(
                { lng: s.lng, lat: s.lat },
                { lng: target.lng, lat: target.lat },
              );
              return {
                id: s.id,
                name: s.name,
                lat: s.lat,
                lng: s.lng,
                etaSec: r.duration,
                distanceM: r.distance,
              } as EtaItem;
            } catch {
              if (attempt === 0) await new Promise((res) => setTimeout(res, 300));
            }
          }
          return null;
        })
      ).filter((x): x is EtaItem => x !== null);

      const ranked = rankByEta(results);
      renderResponseEta(responseLayer, ranked, targetMin);

      // 最近站一条路线(复用 route-render)
      if (ranked.length > 0 && routeLayer) {
        const nearest = ranked[0];
        const s = stationsRef.current.find((x) => x.id === nearest.id);
        if (s) {
          try {
            const r = await fetchDrivingRoute(
              { lng: s.lng, lat: s.lat },
              { lng: target.lng, lat: target.lat },
            );
            const item: RouteRenderItem = {
              stationId: s.id,
              stationName: s.name,
              polyline: r.polyline,
              distance: r.distance,
              duration: r.duration,
              trafficLights: r.trafficLights,
            };
            renderRoutes(routeLayer, [item]);
          } catch {
            /* 最近站路线失败不阻塞面板 */
          }
        }
      }

      setState({
        target,
        items: ranked,
        nearestId: ranked[0]?.id ?? null,
        targetMin,
        loading: false,
        anchor,
      });
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 15));
    },
    [mapRef, responseLayer, routeLayer, stationsRef, stationsVisible],
  );

  const clearResponse = useCallback(() => {
    clearResponseLayer(responseLayer);
    routeLayer?.clearLayers();
    setState(null);
  }, [responseLayer, routeLayer]);

  // 面板锚定灾情点:地图移动/缩放时重算屏幕坐标(与 DeployPanel 跟随逻辑一致)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !state) return;
    const update = () => {
      const pp = map.latLngToContainerPoint(L.latLng(state.target.lat, state.target.lng));
      setState((prev) => (prev ? { ...prev, anchor: { x: pp.x, y: pp.y, maxX: map.getSize().x } } : prev));
    };
    map.on('move zoom', update);
    return () => {
      map.off('move zoom', update);
    };
  }, [mapRef, state?.target.lng, state?.target.lat]);

  return { responseState: state, analyze, clearResponse };
}
