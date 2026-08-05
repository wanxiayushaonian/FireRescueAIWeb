'use client';
// 态势总览 2D 地图:天地图底图(Leaflet)+ 消防站点位(znya 真实)+ sceneLog 联动。
// 无 key 时降级:不加载瓦片,显示坐标网格占位 + 点位标注 + 提示。
// SSR 注意:Leaflet 是浏览器库,本组件须客户端运行——地图初始化在 effect 中守卫
// (rootRef/mapRef),并由 App/CommandView 用 next/dynamic({ ssr:false }) 动态导入。
import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Station } from '@/mock/types';
import { fetchStations } from '@/api/force';
import { addSceneAction, subscribeSceneLog } from '@/mock/sceneLog';

const TIANDITU_KEY = process.env.NEXT_PUBLIC_TIANDITU_KEY || '';
// 天地图 vec_w(EPSG:3857 Web Mercator,与 Leaflet 默认 CRS 一致;勿用 vec_c 经纬度切片,会与 CRS 不匹配致瓦片错位空白)
const TILE_URL = `https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_KEY}`;
// 中文矢量注记(cva_w):地名/POI/道路名文字,叠加在底图上(天地图底图 vec_w 只有线划,文字在单独注记图层)
const ANNO_URL = `https://t{s}.tianditu.gov.cn/cva_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=cva&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${TIANDITU_KEY}`;

const TYPE_COLORS: Record<string, string> = {
  特勤消防站: '#f97316',
  普通消防站: '#22d3ee',
  专职消防站: '#3b82f6',
  微型消防站: '#34d399',
  水上消防站: '#a78bfa',
};
// 九江市中心(九江市消防救援支队 ~115.96, 29.67);真实数据已替换为九江 82 站
const DEFAULT_CENTER: [number, number] = [29.67, 115.96];
const DEFAULT_ZOOM = 11;

export default function RealGisMap() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker | L.CircleMarker>>(new Map());
  const stationsRef = useRef<Station[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
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

  const handleStationClick = useCallback((s: Station) => {
    addSceneAction({
      action: 'flyTo',
      target: s.name,
      params: { lng: s.lng, lat: s.lat },
      source: '面板',
    });
  }, []);

  // 点位 → 地图标记(仅在有 key 且有底图时添加;无 key 降级只显示点位文字列表)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !TIANDITU_KEY) return;
    for (const s of stations) {
      const color = TYPE_COLORS[s.type] ?? '#22d3ee';
      const marker = L.circleMarker([s.lat, s.lng], {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.35,
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

  // sceneLog 联动:flyTo/addMarker → 地图定位;resetView → 复位园区俯瞰视角(removeMarker 仅移除选中,视角不变)
  // 只订阅一次,stations 经 ref 读取最新值,避免重复订阅卸载。
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
        }
      }
      if (latest.action === 'resetView') {
        // 恢复园区俯瞰视角:复位地图视角(removeMarker 语义是移除选中标注,地图视角不变,无需处理)
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
      {/* 无 key 降级:坐标网格占位 + 点位文字列表 */}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
