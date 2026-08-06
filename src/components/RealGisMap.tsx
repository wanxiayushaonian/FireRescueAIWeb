'use client';
// 态势总览 2D 地图:高德底图(Leaflet,矢量/卫星可切换,GCJ02)+ 消防站图标 + 水源点(zoom>=13)+ 市/区县边界 + sceneLog 联动。
// 坐标策略:站/水入库为 WGS84,显示层用 wgs84ToGcj02 转 GCJ02(数据层不动);边界 GeoJSON 为 DataV(GCJ02,天然对齐)。
// 图层控制:底图切换(矢量/卫星)+ 消防站/水源/边界显隐(MapLayerControl);tileerror 连续失败降级。
// SSR 注意:Leaflet 是浏览器库,本组件须客户端运行——地图初始化在 effect 中守卫
// (rootRef/mapRef),并由 App/CommandView 用 next/dynamic({ ssr:false })动态导入。
import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Station, WaterSource } from '@/mock/types';
import { fetchStations } from '@/api/force';
import { fetchWaterSources } from '@/api/water';
import { stationIconSvg, waterIconSvg, shouldShowWater } from '@/lib/map-icons';
import { wgs84ToGcj02 } from '@/lib/geo-convert';
import { addSceneAction, subscribeSceneLog } from '@/mock/sceneLog';
import MapLayerControl from './MapLayerControl';

// 高德矢量瓦片(GCJ02,自带中文地名/道路注记;免 key,subdomains 1-4)
const VECTOR_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
// 高德卫星影像(GCJ02;免 key)
const SAT_URL = 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';
// 本地市/区县边界 GeoJSON(DataV,GCJ02,离线)
const BOUNDARY_URL = '/geo/jiujiang-boundary.json';

// 九江市中心(九江市消防救援支队 ~115.96, 29.67;WGS84,初始化时转 GCJ02)
const DEFAULT_CENTER_WGS84: [number, number] = [29.67, 115.96];
const DEFAULT_ZOOM = 11;
// tileerror 连续失败阈值 → 触发占位降级
const TILE_ERR_THRESHOLD = 5;

export default function RealGisMap() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const vectorLayerRef = useRef<L.TileLayer | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const stationsLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const waterLayerRef = useRef<L.LayerGroup | null>(null);
  const waterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const stationsRef = useRef<Station[]>([]);
  const waterRef = useRef<WaterSource[]>([]);
  const tileErrRef = useRef(0);

  const [stations, setStations] = useState<Station[]>([]);
  const [water, setWater] = useState<WaterSource[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [mapInited, setMapInited] = useState(false);
  const [baseMap, setBaseMap] = useState<'vector' | 'satellite'>('vector');
  const [showStations, setShowStations] = useState(true);
  const [showWater, setShowWater] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [tilesFailed, setTilesFailed] = useState(false);

  // 初始化 Leaflet 地图(仅客户端;SSR 时 rootRef 为空直接跳过)
  useEffect(() => {
    if (!rootRef.current || mapRef.current) return;
    const c = wgs84ToGcj02(DEFAULT_CENTER_WGS84[1], DEFAULT_CENTER_WGS84[0]);
    const map = L.map(rootRef.current, {
      center: [c.lat, c.lng],
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    // 层序:边界在下 → 消防站/水源在上(区县名 tooltip 在独立 pane 始终最上)
    boundaryLayerRef.current = L.layerGroup().addTo(map);
    stationsLayerRef.current = L.layerGroup().addTo(map);
    waterLayerRef.current = L.layerGroup().addTo(map);
    setMapInited(true);
    return () => {
      map.remove();
      mapRef.current = null;
      setMapInited(false);
    };
  }, []);

  // 底图切换:vector 加深色滤镜,satellite 不加;两者均监听 tileerror
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    const onTileError = () => {
      tileErrRef.current += 1;
      if (tileErrRef.current >= TILE_ERR_THRESHOLD) setTilesFailed(true);
    };
    if (baseMap === 'vector') {
      satLayerRef.current?.remove();
      if (!vectorLayerRef.current) {
        const tl = L.tileLayer(VECTOR_URL, { subdomains: ['1', '2', '3', '4'], maxZoom: 18 });
        tl.getContainer()?.classList.add('gis-dark-filter');
        tl.on('tileerror', onTileError);
        vectorLayerRef.current = tl;
      }
      vectorLayerRef.current.addTo(map);
    } else {
      vectorLayerRef.current?.remove();
      if (!satLayerRef.current) {
        const tl = L.tileLayer(SAT_URL, { subdomains: ['1', '2', '3', '4'], maxZoom: 18 });
        tl.on('tileerror', onTileError);
        satLayerRef.current = tl;
      }
      satLayerRef.current.addTo(map);
    }
  }, [baseMap, mapInited]);

  // 加载消防站真实点位
  useEffect(() => {
    let alive = true;
    fetchStations()
      .then((st) => {
        if (alive) {
          stationsRef.current = st;
          setStations(st);
          setLoadState('ok');
        }
      })
      .catch(() => {
        if (alive) setLoadState('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  // 加载水源真实点位(失败不阻断站显示)
  useEffect(() => {
    let alive = true;
    fetchWaterSources()
      .then((ws) => {
        if (alive) {
          waterRef.current = ws;
          setWater(ws);
        }
      })
      .catch(() => {
        /* 水源加载失败仅静默;地图仍显站 */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 市/区县行政边界:fetch 本地 GeoJSON → geoJSON 渲染;显隐受 showBoundary
  useEffect(() => {
    const layer = boundaryLayerRef.current;
    if (!layer || !mapInited) return;
    let alive = true;
    fetch(BOUNDARY_URL)
      .then((r) => r.json())
      .then((data: any) => {
        if (!alive) return;
        L.geoJSON(data, {
          style: (f: any) => {
            const isCity = f?.properties?.level === 'city';
            return {
              color: isCity ? 'rgba(34, 211, 238, 0.9)' : 'rgba(34, 211, 238, 0.45)',
              weight: isCity ? 2.5 : 1,
              fillColor: 'rgba(34, 211, 238, 0.05)',
              fillOpacity: 0.04,
              interactive: false,
            };
          },
          onEachFeature: (f: any, l: L.Layer) => {
            const name = f?.properties?.name;
            if (name) {
              l.bindTooltip(String(name), { permanent: true, direction: 'center', className: 'boundary-label-tip' });
            }
          },
        }).addTo(layer);
      })
      .catch(() => {
        /* 边界加载失败仅静默 */
      });
    return () => {
      alive = false;
    };
  }, [mapInited]);

  const handleStationClick = useCallback((s: Station) => {
    addSceneAction({
      action: 'flyTo',
      target: s.name,
      params: { lng: s.lng, lat: s.lat },
      source: '面板',
    });
  }, []);

  // 消防站点位 → divIcon 图标(菱形"消"徽标);WGS84→GCJ02;入 stationsLayer(显隐受 showStations)
  useEffect(() => {
    const layer = stationsLayerRef.current;
    if (!layer || !mapInited) return;
    layer.clearLayers();
    markersRef.current.clear();
    for (const s of stations) {
      const g = wgs84ToGcj02(s.lng, s.lat);
      const marker = L.marker([g.lat, g.lng], {
        icon: L.divIcon({
          html: stationIconSvg(s.type),
          className: 'map-icon-station',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
          popupAnchor: [0, -24],
        }),
      })
        .bindPopup(`<b>${s.name}</b><br/>${s.type} · 在位 ${s.personnel} 人<br/>${s.address}<br/>${s.lng.toFixed(5)}, ${s.lat.toFixed(5)}(WGS84)`)
        .on('click', () => handleStationClick(s));
      layer.addLayer(marker);
      markersRef.current.set(s.id, marker);
    }
  }, [stations, handleStationClick, mapInited]);

  // 水源层:zoom>=13 显示(远景只显消防站,避免密集);zoomend 重渲染;WGS84→GCJ02;入 waterLayer(显隐受 showWater)
  useEffect(() => {
    const layer = waterLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map || !mapInited) return;
    const render = () => {
      layer.clearLayers();
      waterMarkersRef.current.clear();
      if (!shouldShowWater(map.getZoom())) return;
      for (const w of water) {
        const g = wgs84ToGcj02(w.lng, w.lat);
        const m = L.marker([g.lat, g.lng], {
          icon: L.divIcon({
            html: waterIconSvg(w.type),
            className: 'map-icon-water',
            iconSize: [18, 18],
            iconAnchor: [9, 18],
            popupAnchor: [0, -18],
          }),
        })
          .bindPopup(`<b>${w.name}</b><br/>${w.type} · ${w.district}<br/>${w.address}<br/>${w.lng.toFixed(5)}, ${w.lat.toFixed(5)}(WGS84)`)
          .on('click', () =>
            addSceneAction({ action: 'flyTo', target: w.name, params: { lng: w.lng, lat: w.lat }, source: '面板' }),
          );
        layer.addLayer(m);
        waterMarkersRef.current.set(w.id, m);
      }
    };
    render();
    const onZoom = () => render();
    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [water, mapInited]);

  // 边界显隐
  useEffect(() => {
    const map = mapRef.current;
    const layer = boundaryLayerRef.current;
    if (!map || !layer || !mapInited) return;
    if (showBoundary) layer.addTo(map);
    else map.removeLayer(layer);
  }, [showBoundary, mapInited]);

  // 消防站显隐
  useEffect(() => {
    const map = mapRef.current;
    const layer = stationsLayerRef.current;
    if (!map || !layer || !mapInited) return;
    if (showStations) layer.addTo(map);
    else map.removeLayer(layer);
  }, [showStations, mapInited]);

  // 水源显隐
  useEffect(() => {
    const map = mapRef.current;
    const layer = waterLayerRef.current;
    if (!map || !layer || !mapInited) return;
    if (showWater) layer.addTo(map);
    else map.removeLayer(layer);
  }, [showWater, mapInited]);

  // sceneLog 联动:flyTo/addMarker → 地图定位(先查站,miss 再查水源;坐标 WGS84→GCJ02);resetView → 复位视角
  useEffect(() => {
    const unsub = subscribeSceneLog((_list, latest) => {
      const map = mapRef.current;
      if (!map || !latest) return;
      if (latest.action === 'flyTo' || latest.action === 'addMarker') {
        const hit = stationsRef.current.find((s) => latest.target?.includes(s.name));
        if (hit) {
          const g = wgs84ToGcj02(hit.lng, hit.lat);
          map.flyTo([g.lat, g.lng], Math.max(map.getZoom(), 14));
          markersRef.current.get(hit.id)?.openPopup();
        } else {
          const w = waterRef.current.find((x) => latest.target?.includes(x.name));
          if (w) {
            const g = wgs84ToGcj02(w.lng, w.lat);
            map.flyTo([g.lat, g.lng], Math.max(map.getZoom(), 13));
            // zoomend 后水源层重建,延迟开 popup
            window.setTimeout(() => waterMarkersRef.current.get(w.id)?.openPopup(), 350);
          }
        }
      }
      if (latest.action === 'resetView') {
        const g = wgs84ToGcj02(DEFAULT_CENTER_WGS84[1], DEFAULT_CENTER_WGS84[0]);
        mapRef.current?.setView([g.lat, g.lng], DEFAULT_ZOOM);
      }
    });
    return () => {
      unsub();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative isolate h-full w-full overflow-hidden bg-bg-grid">
      <MapLayerControl
        baseMap={baseMap}
        onBaseMapChange={setBaseMap}
        showStations={showStations}
        onToggleStations={() => setShowStations((v) => !v)}
        showWater={showWater}
        onToggleWater={() => setShowWater((v) => !v)}
        showBoundary={showBoundary}
        onToggleBoundary={() => setShowBoundary((v) => !v)}
      />
      {tilesFailed && (
        <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded border border-line bg-bg-panel/90 px-3 py-1.5 text-[12px] text-amber-300">
          底图瓦片加载失败(高德不可达)——显示占位底图
        </div>
      )}
      {loadState === 'error' && (
        <div className="absolute left-1/2 top-14 z-[500] -translate-x-1/2 rounded border border-line bg-bg-panel/90 px-3 py-1.5 text-[12px] text-red-300">
          消防站点位加载失败
        </div>
      )}
      {/* 瓦片失败降级:坐标网格占位 + 点位文字列表(站 + 水源) */}
      {tilesFailed && (
        <div className="pointer-events-none absolute inset-0 z-[400]">
          <div className="scene-grid-weak absolute inset-0" />
          <div className="absolute inset-x-0 bottom-3 flex justify-center">
            <div className="max-h-[200px] overflow-y-auto rounded-md border border-line bg-bg-panel/80 p-2 text-[11px] text-text-2">
              {stations.map((s) => (
                <div key={s.id} className="whitespace-nowrap">
                  {s.name} {s.lng.toFixed(4)}, {s.lat.toFixed(4)}
                </div>
              ))}
              {water.map((w) => (
                <div key={w.id} className="whitespace-nowrap text-text-3">
                  💧 {w.name} {w.lng.toFixed(4)}, {w.lat.toFixed(4)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
