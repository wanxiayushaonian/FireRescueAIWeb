'use client';
// 态势总览 2D 地图:天地图底图(Leaflet)+ 消防站图标(znya 真实)+ 水源点(zoom>=13)+ sceneLog 联动。
// 无 key 时降级:不加载瓦片,显示坐标网格占位 + 点位标注 + 提示。
// SSR 注意:Leaflet 是浏览器库,本组件须客户端运行——地图初始化在 effect 中守卫
// (rootRef/mapRef),并由 App/CommandView 用 next/dynamic({ ssr:false }) 动态导入。
import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Station, WaterSource } from '@/mock/types';
import { fetchStations } from '@/api/force';
import { fetchWaterSources } from '@/api/water';
import { stationIconSvg, waterIconSvg, shouldShowWater } from '@/lib/map-icons';
import { addSceneAction, subscribeSceneLog } from '@/mock/sceneLog';

const TIANDITU_KEY = process.env.NEXT_PUBLIC_TIANDITU_KEY || '';
// 天地图 vec_w(EPSG:3857 Web Mercator,与 Leaflet 默认 CRS 一致;勿用 vec_c 经纬度切片,会与 CRS 不匹配致瓦片错位空白)
const TILE_URL = `https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_KEY}`;
// 中文矢量注记(cva_w):地名/POI/道路名文字,叠加在底图上(天地图底图 vec_w 只有线划,文字在单独注记图层)
const ANNO_URL = `https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_KEY}`;

// 九江市中心(九江市消防救援支队 ~115.96, 29.67);真实数据已替换为九江 82 站
const DEFAULT_CENTER: [number, number] = [29.67, 115.96];
const DEFAULT_ZOOM = 11;

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

  // 初始化 Leaflet 地图(仅客户端;SSR 时 rootRef 为空直接跳过)
  useEffect(() => {
    if (!rootRef.current || mapRef.current) return;
    const map = L.map(rootRef.current, {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      zoomControl: false,
    });
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    if (TIANDITU_KEY) {
      L.tileLayer(TILE_URL, { subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'], maxZoom: 18 })
        .addTo(map)
        .getContainer()?.classList.add('gis-dark-filter'); // 深色滤镜见 globals.css
      // 注记图层(地名/POI/道路名),同样套深色滤镜与底图一致
      L.tileLayer(ANNO_URL, { subdomains: ['0', '1', '2', '3', '4', '5', '6', '7'], maxZoom: 18 })
        .addTo(map)
        .getContainer()?.classList.add('gis-dark-filter');
    }
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

  // 消防站点位 → divIcon 图标(菱形"消"徽标,按站类型着色)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !TIANDITU_KEY) return;
    for (const s of stations) {
      const marker = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          html: stationIconSvg(s.type),
          className: 'map-icon-station',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
          popupAnchor: [0, -24],
        }),
      })
        .addTo(map)
        .bindPopup(`<b>${s.name}</b><br/>${s.type} · 在位 ${s.personnel} 人<br/>${s.address}<br/>${s.lng}, ${s.lat}`)
        .on('click', () => handleStationClick(s));
      markersRef.current.set(s.id, marker);
    }
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
    };
  }, [stations, handleStationClick]);

  // 水源层:zoom>=13 显示(远景只显消防站,避免密集);zoomend 重渲染
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !TIANDITU_KEY) return;
    const layer = L.layerGroup().addTo(map);
    waterLayerRef.current = layer;

    const render = () => {
      layer.clearLayers();
      waterMarkersRef.current.clear();
      if (!shouldShowWater(map.getZoom())) return;
      for (const w of water) {
        const m = L.marker([w.lat, w.lng], {
          icon: L.divIcon({
            html: waterIconSvg(w.type),
            className: 'map-icon-water',
            iconSize: [18, 18],
            iconAnchor: [9, 18],
            popupAnchor: [0, -18],
          }),
        })
          .bindPopup(`<b>${w.name}</b><br/>${w.type} · ${w.district}<br/>${w.address}<br/>${w.lng}, ${w.lat}`)
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

  // sceneLog 联动:flyTo/addMarker → 地图定位(先查站,miss 再查水源);resetView → 复位视角
  useEffect(() => {
    const unsub = subscribeSceneLog((_list, latest) => {
      const map = mapRef.current;
      if (!map || !latest) return;
      if (latest.action === 'flyTo' || latest.action === 'addMarker') {
        const hit = stationsRef.current.find((s) => latest.target?.includes(s.name));
        if (hit) {
          map.flyTo([hit.lat, hit.lng], Math.max(map.getZoom(), 14));
          const m = markersRef.current.get(hit.id);
          if (m) m.openPopup();
        } else {
          const w = waterRef.current.find((x) => latest.target?.includes(x.name));
          if (w) {
            map.flyTo([w.lat, w.lng], Math.max(map.getZoom(), 13));
            // zoomend 后水源层重建,延迟开 popup
            window.setTimeout(() => waterMarkersRef.current.get(w.id)?.openPopup(), 350);
          }
        }
      }
      if (latest.action === 'resetView') {
        mapRef.current?.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
    });
    return () => {
      unsub();
    };
  }, []);

  return (
    <div ref={rootRef} className="relative isolate h-full w-full overflow-hidden bg-bg-grid">
      {!TIANDITU_KEY && (
        <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded border border-line bg-bg-panel/90 px-3 py-1.5 text-[12px] text-amber-300">
          天地图 key 未配置(env NEXT_PUBLIC_TIANDITU_KEY)——显示占位底图
        </div>
      )}
      {loadState === 'error' && (
        <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded border border-line bg-bg-panel/90 px-3 py-1.5 text-[12px] text-red-300">
          消防站点位加载失败
        </div>
      )}
      {/* 无 key 降级:坐标网格占位 + 点位文字列表(站 + 水源) */}
      {!TIANDITU_KEY && (
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
