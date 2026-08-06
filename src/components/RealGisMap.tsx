'use client';
// 态势总览 2D 地图:高德底图(Leaflet,矢量/卫星可切换,GCJ02)+ 消防站 + 水源(zoom>=13)+ 市/区县边界 + 重点单位/建筑 + 重点区域 + sceneLog 联动。
// 坐标策略:站/水入库为 WGS84,显示层 wgs84ToGcj02 转 GCJ02;边界 GeoJSON / 重点单位 / 重点建筑 / 重点区域坐标均为 GCJ02,直接使用。
// 图层控制:底图切换 + 各图层显隐 + 划定区域(MapLayerControl);tileerror 连续失败降级。
// 区域标注:leaflet-draw 画多边形 → createRegion 存 znya → 重新加载 L.polygon 高亮。
// SSR 注意:Leaflet 是浏览器库,本组件须客户端运行——地图初始化在 effect 中守卫
// (rootRef/mapRef),并由 App/CommandView 用 next/dynamic({ ssr:false })动态导入。
import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import type { Station, WaterSource } from '@/mock/types';
import { fetchStations } from '@/api/force';
import { fetchWaterSources } from '@/api/water';
import { fetchKeyUnits } from '@/api/key-units';
import { fetchKeyBuildings } from '@/api/key-buildings';
import { fetchRegions, createRegion } from '@/api/regions';
import { stationIconSvg, waterIconSvg, keyUnitIconSvg, keyBuildingIconSvg, shouldShowWater } from '@/lib/map-icons';
import { wgs84ToGcj02 } from '@/lib/geo-convert';
import type { KeyUnit } from '@/lib/key-unit-mapper';
import type { KeyBuilding } from '@/lib/key-building-mapper';
import type { Region } from '@/lib/region-mapper';
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
// 边界交互(区县 hover 高亮/点击适窗)只在"能俯瞰九江全境"的低缩放级别生效
const BOUNDARY_INTERACT_MAX_ZOOM = 12;

/** 重点单位 popup:基础信息 + 微型站统计 + 已建模标记。 */
function popupForKeyUnit(u: KeyUnit): string {
  const micro = u.extra;
  const microLines = [
    micro.has_micro_station ? `微型站 ${micro.has_micro_station}` : '',
    micro.duty_24h ? `24h执勤 ${micro.duty_24h}` : '',
    micro.total_people ? `总人数 ${micro.total_people}` : '',
    micro.has_equipment ? `器材 ${micro.has_equipment}` : '',
    micro.has_control_room ? `控制室 ${micro.has_control_room}` : '',
  ].filter(Boolean);
  const built = u.status === 'completed' ? '<br/><span style="color:#fbbf24">★ 已 3D 建模</span>' : '';
  return (
    `<b>${u.name}</b><br/>${u.unitType} · ${u.district ?? ''}` +
    `<br/>负责人 ${u.contactName ?? '-'}${u.contactPhone ? ` · ${u.contactPhone}` : ''}` +
    (microLines.length ? `<br/>${microLines.join(' · ')}` : '') +
    `${built}<br/>${u.lng.toFixed(5)}, ${u.lat.toFixed(5)}(GCJ02)`
  );
}

/** 重点建筑 popup:类型/用途 + 所属单位 + 已建模标记。 */
function popupForKeyBuilding(b: KeyBuilding, unitName?: string): string {
  const built = b.status === 'completed' ? '<br/><span style="color:#fbbf24">★ 已 3D 建模</span>' : '';
  return (
    `<b>${b.name}</b><br/>重点建筑${b.buildingType ? ` · ${b.buildingType}` : ''}` +
    `${b.buildingUsage ? `<br/>${b.buildingUsage}` : ''}` +
    `${unitName ? `<br/>所属单位: ${unitName}` : ''}` +
    `${built}<br/>${b.lng.toFixed(5)}, ${b.lat.toFixed(5)}`
  );
}

export default function RealGisMap() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const vectorLayerRef = useRef<L.TileLayer | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const boundaryGeoRef = useRef<L.GeoJSON | null>(null);
  const stationsLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const waterLayerRef = useRef<L.LayerGroup | null>(null);
  const waterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const keyUnitsLayerRef = useRef<L.LayerGroup | null>(null);
  const buildingsLayerRef = useRef<L.LayerGroup | null>(null);
  const regionsLayerRef = useRef<L.LayerGroup | null>(null);
  const drawRef = useRef<L.Draw.Polygon | null>(null);
  const stationsRef = useRef<Station[]>([]);
  const waterRef = useRef<WaterSource[]>([]);
  const tileErrRef = useRef(0);

  const [stations, setStations] = useState<Station[]>([]);
  const [water, setWater] = useState<WaterSource[]>([]);
  const [keyUnits, setKeyUnits] = useState<KeyUnit[]>([]);
  const [buildings, setBuildings] = useState<KeyBuilding[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [mapInited, setMapInited] = useState(false);
  const [baseMap, setBaseMap] = useState<'vector' | 'satellite'>('vector');
  const [showStations, setShowStations] = useState(true);
  const [showWater, setShowWater] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showKeyUnits, setShowKeyUnits] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);

  // 绘制完成 → 保存区域到 znya 并刷新
  const onDrawCreated = useCallback((e: any) => {
    const layer = e.layer as L.Polygon;
    drawRef.current = null;
    setDrawMode(false);
    const ring = layer.getLatLngs()[0] as L.LatLng[];
    if (!ring || ring.length < 3) return;
    const polygon = ring.map((ll) => [ll.lng, ll.lat]);
    const name = window.prompt('区域名称');
    if (!name) return;
    createRegion({ name, polygon })
      .then(() => fetchRegions().then(setRegions))
      .catch(() => {});
  }, []);

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
    boundaryLayerRef.current = L.layerGroup().addTo(map);
    stationsLayerRef.current = L.layerGroup().addTo(map);
    waterLayerRef.current = L.layerGroup().addTo(map);
    keyUnitsLayerRef.current = L.layerGroup().addTo(map);
    buildingsLayerRef.current = L.layerGroup().addTo(map);
    regionsLayerRef.current = L.layerGroup().addTo(map);
    map.on('draw:created', onDrawCreated);
    setMapInited(true);
    return () => {
      map.off('draw:created', onDrawCreated);
      map.remove();
      mapRef.current = null;
      setMapInited(false);
    };
  }, [onDrawCreated]);

  // 底图切换
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

  // 加载消防站
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

  // 加载水源
  useEffect(() => {
    let alive = true;
    fetchWaterSources()
      .then((ws) => {
        if (alive) {
          waterRef.current = ws;
          setWater(ws);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 加载重点单位
  useEffect(() => {
    let alive = true;
    fetchKeyUnits()
      .then((ks) => {
        if (alive) setKeyUnits(ks);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 加载重点建筑
  useEffect(() => {
    let alive = true;
    fetchKeyBuildings()
      .then((bs) => {
        if (alive) setBuildings(bs);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 加载重点区域
  useEffect(() => {
    let alive = true;
    fetchRegions()
      .then((rs) => {
        if (alive) setRegions(rs);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 市/区县行政边界
  useEffect(() => {
    const layer = boundaryLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map || !mapInited) return;
    let alive = true;

    const styleFor = (f: any) => {
      const isCity = f?.properties?.level === 'city';
      return {
        color: isCity ? 'rgba(34, 211, 238, 0.9)' : 'rgba(34, 211, 238, 0.45)',
        weight: isCity ? 2.5 : 1,
        fillColor: 'rgba(34, 211, 238, 0.05)',
        fillOpacity: 0.04,
        cursor: '',
      };
    };

    const onZoom = () => {
      const geo = boundaryGeoRef.current;
      if (!geo) return;
      const active = map.getZoom() <= BOUNDARY_INTERACT_MAX_ZOOM;
      geo.eachLayer((l: any) => {
        if (l.setStyle) l.setStyle({ cursor: active ? 'pointer' : 'default' });
      });
    };

    fetch(BOUNDARY_URL)
      .then((r) => r.json())
      .then((data: any) => {
        if (!alive) return;
        const geo = L.geoJSON(data, {
          style: styleFor,
          interactive: true,
          onEachFeature: (f: any, l: L.Layer) => {
            const { name, level } = f?.properties ?? {};
            if (name) {
              l.bindTooltip(String(name), { permanent: true, direction: 'center', className: 'boundary-label-tip' });
            }
            const path = l as L.Polygon;
            if (level === 'district') {
              path.on('mouseover', () => {
                if (map.getZoom() > BOUNDARY_INTERACT_MAX_ZOOM) return;
                path.setStyle({
                  color: 'rgba(34, 211, 238, 1)',
                  weight: 3,
                  fillColor: 'rgba(34, 211, 238, 0.18)',
                  fillOpacity: 0.18,
                });
              });
              path.on('mouseout', () => path.setStyle(styleFor(f)));
              path.on('click', () => {
                if (map.getZoom() > BOUNDARY_INTERACT_MAX_ZOOM) return;
                map.flyToBounds(path.getBounds(), { padding: [24, 24], maxZoom: 13 });
              });
            } else if (level === 'city') {
              path.on('click', () => {
                map.flyToBounds(path.getBounds(), { padding: [24, 24] });
              });
            }
          },
        }).addTo(layer);
        boundaryGeoRef.current = geo;
        onZoom();
      })
      .catch(() => {});

    map.on('zoomend', onZoom);
    return () => {
      alive = false;
      map.off('zoomend', onZoom);
      boundaryGeoRef.current = null;
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

  // 消防站
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

  // 水源
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

  // 重点单位
  useEffect(() => {
    const layer = keyUnitsLayerRef.current;
    if (!layer || !mapInited) return;
    layer.clearLayers();
    for (const u of keyUnits) {
      const marker = L.marker([u.lat, u.lng], {
        icon: L.divIcon({
          html: keyUnitIconSvg(u.unitType, u.status),
          className: 'map-icon-key-unit',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
          popupAnchor: [0, -24],
        }),
      })
        .bindPopup(popupForKeyUnit(u))
        .on('click', () => {
          const map = mapRef.current;
          if (map) map.flyTo([u.lat, u.lng], Math.max(map.getZoom(), 15));
          addSceneAction({ action: 'flyTo', target: u.name, params: { lng: u.lng, lat: u.lat }, source: '面板' });
        });
      layer.addLayer(marker);
    }
  }, [keyUnits, mapInited]);

  // 重点建筑
  useEffect(() => {
    const layer = buildingsLayerRef.current;
    if (!layer || !mapInited) return;
    layer.clearLayers();
    for (const b of buildings) {
      const unitName = b.keyUnitId ? keyUnits.find((u) => u.id === b.keyUnitId)?.name : undefined;
      const marker = L.marker([b.lat, b.lng], {
        icon: L.divIcon({
          html: keyBuildingIconSvg(b.status),
          className: 'map-icon-key-building',
          iconSize: [22, 22],
          iconAnchor: [11, 22],
          popupAnchor: [0, -22],
        }),
      })
        .bindPopup(popupForKeyBuilding(b, unitName))
        .on('click', () => {
          const map = mapRef.current;
          if (map) map.flyTo([b.lat, b.lng], Math.max(map.getZoom(), 15));
          addSceneAction({ action: 'flyTo', target: b.name, params: { lng: b.lng, lat: b.lat }, source: '面板' });
        });
      layer.addLayer(marker);
    }
  }, [buildings, keyUnits, mapInited]);

  // 重点区域图层:多边形高亮 + hover 名称;点击 flyToBounds 适窗
  useEffect(() => {
    const layer = regionsLayerRef.current;
    if (!layer || !mapInited) return;
    layer.clearLayers();
    for (const r of regions) {
      const poly = L.polygon(r.polygon as [number, number][], {
        color: r.color,
        weight: 2,
        fillColor: r.color,
        fillOpacity: 0.15,
      })
        .bindTooltip(`${r.name}${r.regionType ? ` · ${r.regionType}` : ''}`, {
          sticky: true,
          className: 'boundary-label-tip',
        })
        .on('mouseover', () =>
          poly.setStyle({ color: r.color, weight: 3, fillColor: r.color, fillOpacity: 0.35 }),
        )
        .on('mouseout', () =>
          poly.setStyle({ color: r.color, weight: 2, fillColor: r.color, fillOpacity: 0.15 }),
        )
        .on('click', () => {
          const map = mapRef.current;
          if (map) map.flyToBounds(poly.getBounds(), { padding: [24, 24], maxZoom: 14 });
        });
      layer.addLayer(poly);
    }
  }, [regions, mapInited]);

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

  // 重点单位显隐
  useEffect(() => {
    const map = mapRef.current;
    const layer = keyUnitsLayerRef.current;
    if (!map || !layer || !mapInited) return;
    if (showKeyUnits) layer.addTo(map);
    else map.removeLayer(layer);
  }, [showKeyUnits, mapInited]);

  // 重点建筑显隐
  useEffect(() => {
    const map = mapRef.current;
    const layer = buildingsLayerRef.current;
    if (!map || !layer || !mapInited) return;
    if (showBuildings) layer.addTo(map);
    else map.removeLayer(layer);
  }, [showBuildings, mapInited]);

  // 重点区域显隐
  useEffect(() => {
    const map = mapRef.current;
    const layer = regionsLayerRef.current;
    if (!map || !layer || !mapInited) return;
    if (showRegions) layer.addTo(map);
    else map.removeLayer(layer);
  }, [showRegions, mapInited]);

  // 划定区域:启用/取消 leaflet-draw 多边形绘制
  const startDraw = useCallback(() => {
    const map = mapRef.current;
    if (!map || drawMode) return;
    setDrawMode(true);
    const draw = new L.Draw.Polygon(map as any, {
      shapeOptions: { color: '#22d3ee', weight: 2, fillColor: '#22d3ee', fillOpacity: 0.15 },
    });
    drawRef.current = draw;
    draw.enable();
  }, [drawMode]);

  const cancelDraw = useCallback(() => {
    drawRef.current?.disable();
    drawRef.current = null;
    setDrawMode(false);
  }, []);

  // sceneLog 联动
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
        showKeyUnits={showKeyUnits}
        onToggleKeyUnits={() => setShowKeyUnits((v) => !v)}
        showBuildings={showBuildings}
        onToggleBuildings={() => setShowBuildings((v) => !v)}
        showRegions={showRegions}
        onToggleRegions={() => setShowRegions((v) => !v)}
        drawMode={drawMode}
        onStartDraw={startDraw}
        onCancelDraw={cancelDraw}
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
