'use client';
// 态势总览 2D 地图:高德矢量底图(Leaflet,坐标系 GCJ02)+ 消防站图标(znya 真实)+ 水源点(zoom>=13)+ sceneLog 联动。
// 坐标策略:站/水入库为 WGS84,显示层用 wgs84ToGcj02 转 GCJ02 与高德底图对齐(数据层不动)。
// 高德裸瓦片免 key;tileerror 连续失败(>=5)降级为坐标网格占位 + 点位文字列表。
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

// 高德矢量瓦片(GCJ02,自带中文地名/道路注记,单层;免 key,subdomains 1-4)
const TILE_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';

// 九江市中心(九江市消防救援支队 ~115.96, 29.67;WGS84,初始化时转 GCJ02)
const DEFAULT_CENTER_WGS84: [number, number] = [29.67, 115.96];
const DEFAULT_ZOOM = 11;
// tileerror 连续失败阈值 → 触发占位降级
const TILE_ERR_THRESHOLD = 5;

export default function RealGisMap() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const stationsRef = useRef<Station[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [water, setWater] = useState<WaterSource[]>([]);
  const waterRef = useRef<WaterSource[]>([]);
  const waterLayerRef = useRef<L.LayerGroup | null>(null);
  const waterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [tilesFailed, setTilesFailed] = useState(false);
  const tileErrRef = useRef(0);

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
    const tl = L.tileLayer(TILE_URL, { subdomains: ['1', '2', '3', '4'], maxZoom: 18 }).addTo(map);
    tl.getContainer()?.classList.add('gis-dark-filter'); // 深色滤镜见 globals.css
    // 瓦片连续失败 → 降级(高德不可达时)
    tl.on('tileerror', () => {
      tileErrRef.current += 1;
      if (tileErrRef.current >= TILE_ERR_THRESHOLD) setTilesFailed(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

  const handleStationClick = useCallback((s: Station) => {
    addSceneAction({
      action: 'flyTo',
      target: s.name,
      params: { lng: s.lng, lat: s.lat },
      source: '面板',
    });
  }, []);

  // 消防站点位 → divIcon 图标(菱形"消"徽标,按站类型着色);WGS84→GCJ02 与高德底图对齐
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
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
        .addTo(map)
        .bindPopup(`<b>${s.name}</b><br/>${s.type} · 在位 ${s.personnel} 人<br/>${s.address}<br/>${s.lng.toFixed(5)}, ${s.lat.toFixed(5)}(WGS84)`)
        .on('click', () => handleStationClick(s));
      markersRef.current.set(s.id, marker);
    }
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
    };
  }, [stations, handleStationClick]);

  // 水源层:zoom>=13 显示(远景只显消防站,避免密集);zoomend 重渲染;WGS84→GCJ02
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    waterLayerRef.current = layer;

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
      layer.remove();
      waterLayerRef.current = null;
      waterMarkersRef.current.clear();
    };
  }, [water]);

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
          const m = markersRef.current.get(hit.id);
          if (m) m.openPopup();
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
      {tilesFailed && (
        <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded border border-line bg-bg-panel/90 px-3 py-1.5 text-[12px] text-amber-300">
          底图瓦片加载失败(高德不可达)——显示占位底图
        </div>
      )}
      {loadState === 'error' && (
        <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded border border-line bg-bg-panel/90 px-3 py-1.5 text-[12px] text-red-300">
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
