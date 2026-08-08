'use client';
// 灾情响应分析 hook:选中灾情建筑 → 筛 5km 可见站 → 批量 driving 取 ETA
// → 染色环 + 估算参考圈 + 最近站一条路线。从 RealGisMap 编排,纯逻辑在 lib/gis。
import { useCallback, useState } from 'react';
import L from 'leaflet';
import type { Station } from '@/mock/types';
import { fetchDrivingRoute } from '@/api/route';
import { selectWithinKm, rankByEta, type EtaItem } from '@/lib/gis/response-query';
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
}

const RESPONSE_RADIUS_KM = 5;
const DRIVING_CONCURRENCY = 3; // 高德免费 key 并发上限(超限 → CUQPS_HAS_EXCEEDED_THE_LIMIT → 502)

/** 有限并发执行(避免高德 CUQPS),保留入参顺序。 */
async function poolMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      ret[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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

      // 前置:stations 小眼睛关闭或无站 → 空态
      if (!stationsVisible || stationsRef.current.length === 0) {
        clearResponseLayer(responseLayer);
        setState({
          target,
          items: [],
          nearestId: null,
          targetMin,
          loading: false,
          error: '5km 内无可见消防站(检查消防站图层小眼睛)',
        });
        return;
      }

      setState({ target, items: [], nearestId: null, targetMin, loading: true });
      clearResponseLayer(responseLayer);
      routeLayer?.clearLayers();
      renderReferenceCircle(responseLayer, { lat: target.lat, lng: target.lng }, targetMin);

      const within = selectWithinKm(
        stationsRef.current.map((s) => ({ id: s.id, name: s.name, lng: s.lng, lat: s.lat })),
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
          error: `5km 内无可见消防站`,
        });
        return;
      }

      // 有限并发 driving(高德免费 key 并发超限返回 CUQPS_HAS_EXCEEDED_THE_LIMIT → 502);
      // 单站失败重试 1 次(300ms 退避),仍失败跳过
      const results = (
        await poolMap(within, DRIVING_CONCURRENCY, async (s) => {
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

  return { responseState: state, analyze, clearResponse };
}
