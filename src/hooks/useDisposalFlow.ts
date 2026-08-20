'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type * as L from 'leaflet';
import { FlowDirector, type FlowClock, type FlowHandlers } from '@/lib/command-flow/flow-director';
import { ViewDirector, type MapAdapter } from '@/lib/command-flow/view-director';
import { VehicleConvoy, type ConvoyClock } from '@/lib/command-flow/vehicle-convoy';
import { buildScript, type ScriptContext } from '@/lib/command-flow/script';
import type { FlowStage } from '@/lib/command-flow/types';
import { addSceneAction } from '@/mock/sceneLog';
import { injectIncident, forceStatus, pushScriptRec, setScripted } from '@/mock/liveChannel';
import { statusRecommendation } from '@/mock/incidents';
import { fetchAiDispatch } from '@/api/dispatch';
import { showToast } from '@/components/Toast';
import { recordCaseEvent } from '@/lib/case-timeline';
import { compressDuration } from '@/lib/gis/vehicle-anim';
import { setDisposalDemoActive } from '@/lib/disposal-demo-gate';
import type { RouteRenderItem } from '@/lib/gis/route-render';

export interface DemoIncident {
  id: string; address: string; type: string; status: string; lng: number; lat: number;
}

export interface DisposalFlowApi {
  startDemo(): Promise<void>;
  stopDemo(): void;
  demoActive: boolean;
  stage: FlowStage | null;
  following: boolean;
}

export interface UseDisposalFlowOptions {
  gisMap: L.Map | null;
  onDemoIncident: (inc: DemoIncident) => void;
  onPanelChange: (id: 'vars' | 'recommend', open: boolean) => void;
}

/** 浏览器 rAF 时钟(FlowDirector/VehicleConvoy 共用)。 */
const rafClock: FlowClock & ConvoyClock = {
  now: () => performance.now(),
  raf: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

/** 车辆图标(途中/到场)HTML,与 CommandView 现有样式一致。 */
function vehicleIconHtml(station: string, arrived: boolean): string {
  const color = arrived ? '#34d39988' : '#22d3ee66';
  const text = arrived ? '#d5f5e3' : '#e2f3f8';
  const label = arrived ? `✓ ${station} 到场` : `🚒 ${station} 途中`;
  return `<div style="display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:999px;background:rgba(10,26,38,.85);border:1px solid ${color};font-size:10px;color:${text};white-space:nowrap;transform:translate(-50%,-50%)">${label}</div>`;
}

export function useDisposalFlow(opts: UseDisposalFlowOptions): DisposalFlowApi {
  const { gisMap, onDemoIncident, onPanelChange } = opts;
  const [demoActive, setDemoActive] = useState(false);
  const [stage, setStage] = useState<FlowStage | null>(null);
  const [following, setFollowing] = useState(false);

  const directorRef = useRef<FlowDirector | null>(null);
  const viewRef = useRef<ViewDirector | null>(null);
  const convoyRef = useRef<VehicleConvoy | null>(null);
  const markersRef = useRef<Array<{ remove: () => void; setLatLng: (ll: [number, number]) => void; setIcon: (i: unknown) => void }>>([]);
  const incidentIdRef = useRef<string | null>(null);

  const stopDemo = useCallback(() => {
    directorRef.current?.cancel();
    directorRef.current = null;
    convoyRef.current?.cancel();
    convoyRef.current = null;
    for (const m of markersRef.current) m.remove();
    markersRef.current = [];
    viewRef.current?.stopFollow();
    viewRef.current = null;
    if (incidentIdRef.current) setScripted(null);
    incidentIdRef.current = null;
    setDisposalDemoActive(false);
    setDemoActive(false);
    setStage(null);
    setFollowing(false);
  }, []);

  useEffect(() => () => { stopDemo(); }, [stopDemo]);

  const startDemo = useCallback(async () => {
    if (!gisMap) return; // 地图未就绪:按钮应禁用
    stopDemo();

    // 1) 接入新警情 + 轻量选中(不触发 CommandView 的派遣,避免双车动画)
    const inc = injectIncident();
    incidentIdRef.current = inc.id;
    setScripted(inc.id);
    onDemoIncident({ id: inc.id, address: inc.address, type: inc.type, status: inc.status, lng: inc.lng, lat: inc.lat });
    onPanelChange('vars', true);
    setDisposalDemoActive(true);
    setDemoActive(true);
    showToast(`110 联动接入新警情 ${inc.id} · 演示数据`);

    // 2) AI 派遣(失败降级:仅视角演示)
    let routes: RouteRenderItem[] = [];
    try {
      const res = await fetchAiDispatch({ name: inc.address, lng: inc.lng, lat: inc.lat });
      routes = res.routes;
    } catch {
      showToast('路线获取失败,仅视角演示 · 演示数据');
    }

    // Stale fetch guard: stopDemo may have cleared incidentIdRef while await completed
    if (incidentIdRef.current !== inc.id) return;

    // 3) 地图适配器 + 视角仲裁
    const adapter: MapAdapter = {
      focusIncident: (s) => {
        const ringM = s.ringM ?? 1500;
        const dLat = ringM / 111320;
        const dLng = ringM / (111320 * Math.cos((s.lat * Math.PI) / 180));
        gisMap.fitBounds(
          [
            [s.lat - dLat, s.lng - dLng],
            [s.lat + dLat, s.lng + dLng],
          ],
          { paddingTopLeft: s.paddingTL, paddingBottomRight: s.paddingBR, maxZoom: s.maxZoom ?? 15, animate: true },
        );
        window.dispatchEvent(new CustomEvent('gis:set-layer', { detail: { layer: 'water', on: true } }));
        window.dispatchEvent(new CustomEvent('gis:set-layer', { detail: { layer: 'stations', on: true } }));
      },
      fitRoutes: (s) => {
        if (!s.points.length) return;
        const leaflet = require('leaflet') as typeof import('leaflet');
        gisMap.fitBounds(leaflet.latLngBounds(s.points), { paddingTopLeft: [480, 60], paddingBottomRight: [440, 60], maxZoom: 14 });
      },
      panTo: (ll) => { gisMap.panTo(ll, { animate: false }); },
      resetView: () => {
        // 复位复用现有 resetView 场景动作(RealGisMap 消费 → 九江市全景),与 CommandView 熄灭复位同路径
        addSceneAction({ action: 'resetView', target: '警情处置完毕,视角复位', source: '面板' });
      },
    };
    const view = new ViewDirector({ adapter, onFollowChange: setFollowing });
    viewRef.current = view;

    // 4) 剧本 + 编排器
    const statusRecs: ScriptContext['statusRecs'] = {
      到场: statusRecommendation('到场', inc) ?? undefined,
      控制: statusRecommendation('控制', inc) ?? undefined,
    };
    const script = buildScript({
      incidentId: inc.id, address: inc.address, lng: inc.lng, lat: inc.lat, routes, statusRecs,
    });

    const handlers: FlowHandlers = {
      toast: (msg) => showToast(msg),
      timeline: (k, label, detail) => recordCaseEvent(inc.id, k, label, detail),
      view: (spec) => view.requestFocus(spec),
      setStatus: (to) => { forceStatus(inc.id, to); },
      pushRec: (type, content, basis) => pushScriptRec({ incidentId: inc.id, type, content, basis }),
      panel: (id, open) => onPanelChange(id, open),
      convoy: (action) => {
        if (action === 'start') {
          if (!routes.length) return;
          const maxEtaSec = Math.max(...routes.map((r) => r.duration ?? 0), 1);
          const convoyMs = compressDuration(maxEtaSec); // 与剧本 arriveAll 时刻对齐(1min真实=6s演示,夹20-50s)
          const vehicles = routes.map((r) => ({
            stationName: r.stationName ?? '站点',
            polyline: r.polyline as [number, number][],
            durationMs: Math.max(2500, (convoyMs * (r.duration ?? maxEtaSec)) / maxEtaSec),
          }));
          const leaflet = require('leaflet') as typeof import('leaflet');
          const markers = routes.map((r) => {
            const marker = leaflet.marker(r.polyline[0] as [number, number], {
              zIndexOffset: 900,
              bubblingMouseEvents: false,
              icon: leaflet.divIcon({ className: '', html: vehicleIconHtml(r.stationName ?? '站点', false), iconSize: [0, 0] }),
            }).addTo(gisMap);
            // 点击车辆 → 视角跟随(getLatLng() 为 LatLng 对象,取 lat/lng 组成 [lat,lng])
            marker.on('click', () => {
              view.startFollow({
                latLng: () => {
                  const ll = marker.getLatLng();
                  return [ll.lat, ll.lng];
                },
              });
            });
            return marker as { remove: () => void; setLatLng: (ll: [number, number]) => void; setIcon: (i: unknown) => void };
          });
          markersRef.current = markers;
          const convoy = new VehicleConvoy(vehicles, rafClock, {
            onProgress: (vs) => {
              vs.forEach((v, i) => markers[i]?.setLatLng(v.latLng ?? [0, 0]));
              view.updateFollow(); // 跟随态下每帧 panTo 车辆
            },
            onArrive: (v, i) => markers[i]?.setIcon(leaflet.divIcon({ className: '', html: vehicleIconHtml(v.stationName, true), iconSize: [0, 0] })),
            onDone: () => { view.stopFollow(); convoyRef.current = null; },
          });
          convoyRef.current = convoy;
          convoy.start();
        } else {
          // arriveAll:剧本兜底标记(正常由 convoy onDone 处理)
          recordCaseEvent(inc.id, 'arrival', `${routes.length} 站车组到场`);
        }
      },
      stage: (s) => setStage(s),
    };

    const director = new FlowDirector(rafClock, handlers);
    directorRef.current = director;
    director.run(script);
  }, [gisMap, onDemoIncident, onPanelChange, stopDemo]);

  // 地图交互:用户操作优先 + 空白点击退出跟随 + Esc
  useEffect(() => {
    const map = gisMap;
    if (!map) return;
    const onInteract = () => viewRef.current?.notifyUserInteract();
    const onClick = () => viewRef.current?.stopFollow();
    map.on('dragstart', onInteract);
    map.on('zoomstart', onInteract);
    map.on('click', onClick);
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') viewRef.current?.stopFollow(); };
    window.addEventListener('keydown', onEsc);
    return () => {
      map.off('dragstart', onInteract);
      map.off('zoomstart', onInteract);
      map.off('click', onClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [gisMap]);

  return { startDemo, stopDemo, demoActive, stage, following };
}
