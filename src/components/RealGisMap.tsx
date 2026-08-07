'use client';
// 态势总览 2D 地图:高德底图(Leaflet,矢量/卫星可切换,GCJ02)+ 消防站 + 水源(zoom>=13)+ 市/区县边界 + 重点单位/建筑 + 重点区域 + sceneLog 联动。
// 坐标策略:站/水入库为 WGS84,显示层 wgs84ToGcj02 转 GCJ02;边界 GeoJSON / 重点单位 / 重点建筑 / 重点区域坐标均为 GCJ02,直接使用。
// 图层控制:底图切换 + 各图层显隐 + 划定区域(MapLayerControl);tileerror 连续失败降级。
// 区域标注:leaflet-draw 画多边形 → createRegion 存 znya → 重新加载 L.polygon 高亮。
// SSR 注意:Leaflet 是浏览器库,本组件须客户端运行——地图初始化在 effect 中守卫
// (rootRef/mapRef),并由 App/CommandView 用 next/dynamic({ ssr:false })动态导入。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import type { Station, WaterSource, ResourceItem } from '@/mock/types';
import { fetchStations, fetchResources } from '@/api/force';
import { fetchWaterSources } from '@/api/water';
import { fetchKeyUnits, updateKeyUnitCoords, geocodeMissingKeyUnits } from '@/api/key-units';
import { fetchIncidents } from '@/api/incidents';
import type { Incident } from '@/lib/incident-mapper';
import { fetchKeyBuildings, updateKeyBuildingCoords } from '@/api/key-buildings';
import { fetchDrivingRoute } from '@/api/route';
import { fetchGeocode, type GeoCandidate } from '@/api/geocode';
import { fetchRegions, createRegion } from '@/api/regions';
import { stationIconSvg, waterIconSvg, keyUnitIconSvg, keyBuildingIconSvg, shouldShowWater } from '@/lib/map-icons';
import { wgs84ToGcj02 } from '@/lib/geo-convert';
import { haversineKm, filterByRadius } from '@/lib/geo-query';
import type { KeyUnit } from '@/lib/key-unit-mapper';
import type { KeyBuilding } from '@/lib/key-building-mapper';
import type { Region } from '@/lib/region-mapper';
import { addSceneAction, subscribeSceneLog } from '@/mock/sceneLog';
import MapLayerControl from './MapLayerControl';
import CommandPalette, { type PaletteItem } from './gis/CommandPalette';
import CoordinateFixPanel, { type CoordFixTarget } from './gis/CoordinateFixPanel';
import ForceManagePanel, { type ForcePanelStation } from './gis/ForceManagePanel';
import RadialMenu, { type RadialAction } from './gis/RadialMenu';
import DeployPanel, { type DeployStation, type PlannedRoute } from './gis/DeployPanel';
import { Route, MapPin, Info, Satellite, Map as MapIcon, Trash2, Building2, PenLine, Navigation, Users, Droplets, Rocket } from 'lucide-react';

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
  const incidentMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const keyUnitMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const buildingMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const waterLayerRef = useRef<L.LayerGroup | null>(null);
  const highlightLayerRef = useRef<L.LayerGroup | null>(null);
  const waterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const keyUnitsLayerRef = useRef<L.LayerGroup | null>(null);
  const incidentsLayerRef = useRef<L.LayerGroup | null>(null);
  const buildingsLayerRef = useRef<L.LayerGroup | null>(null);
  const regionsLayerRef = useRef<L.LayerGroup | null>(null);
  const drawRef = useRef<L.Draw.Polygon | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const tempLayerRef = useRef<L.LayerGroup | null>(null);
  const stationsRef = useRef<Station[]>([]);
  const waterRef = useRef<WaterSource[]>([]);
  const tileErrRef = useRef(0);

  const [stations, setStations] = useState<Station[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [water, setWater] = useState<WaterSource[]>([]);
  const [keyUnits, setKeyUnits] = useState<KeyUnit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [buildings, setBuildings] = useState<KeyBuilding[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [mapInited, setMapInited] = useState(false);
  const [baseMap, setBaseMap] = useState<'vector' | 'satellite'>('vector');
  const [showStations, setShowStations] = useState(true);
  const [showWater, setShowWater] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showKeyUnits, setShowKeyUnits] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [deploy, setDeploy] = useState<{
    target: { name: string; lng: number; lat: number };
    stations: DeployStation[];
    anchor: { x: number; y: number; maxX: number };
  } | null>(null);
  const [planned, setPlanned] = useState<PlannedRoute[]>([]);
  const [planning, setPlanning] = useState(false);
  // 坐标修正(点位治理)
  const [coordFix, setCoordFix] = useState<CoordFixTarget | null>(null);
  const [draftCoord, setDraftCoord] = useState<{ lng: number; lat: number } | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [geoCandidates, setGeoCandidates] = useState<GeoCandidate[]>([]);
  const [geoQuerying, setGeoQuerying] = useState(false);
  const [coordSaving, setCoordSaving] = useState(false);
  const [coordError, setCoordError] = useState<string | null>(null);
  const [queryMarker, setQueryMarker] = useState<{ lng: number; lat: number; address: string } | null>(null);
  const [batching, setBatching] = useState(false);
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const [radial, setRadial] = useState<{ target: CoordFixTarget; x: number; y: number } | null>(null);
  const [forcePanel, setForcePanel] = useState<{ station: ForcePanelStation; lng: number; lat: number; x: number; y: number; maxX: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteItems, setPaletteItems] = useState<PaletteItem[]>([]);
  const [paletteLoading, setPaletteLoading] = useState(false);

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
    // 禁用地图默认浏览器右键菜单(marker 用 contextmenu 唤出环形菜单)
    map.getContainer().addEventListener('contextmenu', (e) => e.preventDefault());
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    boundaryLayerRef.current = L.layerGroup().addTo(map);
    stationsLayerRef.current = L.layerGroup().addTo(map);
    waterLayerRef.current = L.layerGroup().addTo(map);
    highlightLayerRef.current = L.layerGroup().addTo(map);
    keyUnitsLayerRef.current = L.layerGroup().addTo(map);
    incidentsLayerRef.current = L.layerGroup().addTo(map);
    buildingsLayerRef.current = L.layerGroup().addTo(map);
    regionsLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    tempLayerRef.current = L.layerGroup().addTo(map);
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

  // 加载执勤明细(用于聚合各站真实人员数,popup 动态显示)
  useEffect(() => {
    let alive = true;
    fetchResources()
      .then((rs) => {
        if (alive) setResources(rs);
      })
      .catch(() => {});
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

  // 加载警情/事件
  useEffect(() => {
    let alive = true;
    fetchIncidents()
      .then((is) => {
        if (alive) setIncidents(is);
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

  // 各消防站真实人员数(从 fire_force_items 聚合,popup 动态显示)
  const personnelCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resources) if (r.category === '人员') m.set(r.stationId, (m.get(r.stationId) ?? 0) + 1);
    return m;
  }, [resources]);

  const handleStationClick = useCallback((s: Station) => {
    addSceneAction({
      action: 'flyTo',
      target: s.name,
      params: { lng: s.lng, lat: s.lat },
      source: '面板',
    });
  }, []);

  // 派遣路线色板(多站各色)
  const ROUTE_COLORS = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#f87171', '#60a5fa'];

  // 周边水源高亮:500m 内水源画青色圈 + 适窗(独立可调,警情圆环"周边水源"复用)
  const highlightNearbyWater = useCallback((t: { lng: number; lat: number }) => {
    const map = mapRef.current;
    const highlight = highlightLayerRef.current;
    if (!map || !highlight) return;
    highlight.clearLayers();
    const nearby = filterByRadius(waterRef.current, { lng: t.lng, lat: t.lat }, 500, (w) => {
      const g = wgs84ToGcj02(w.lng, w.lat);
      return { lng: g.lng, lat: g.lat };
    });
    const bounds = L.latLngBounds([L.latLng(t.lat, t.lng)]);
    nearby.forEach((w) => {
      const g = wgs84ToGcj02(w.lng, w.lat);
      L.circleMarker([g.lat, g.lng], { radius: 10, color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.3, weight: 2 })
        .bindTooltip(`${w.name} · ${w.type}`, { direction: 'top' })
        .addTo(highlight);
      bounds.extend(L.latLng(g.lat, g.lng));
    });
    if (nearby.length) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17 });
  }, []);

  // 打开派遣面板:站点 WGS84→GCJ02 统一坐标系后按到目标直线距离排序 + 算锚点 + 周边水源
  const openDeploy = useCallback(
    (t: { name: string; lng: number; lat: number }) => {
      const map = mapRef.current;
      if (!map) return;
      const sorted = stationsRef.current
        .map((s) => {
          const g = wgs84ToGcj02(s.lng, s.lat);
          return { ...s, distKm: haversineKm(g.lng, g.lat, t.lng, t.lat) };
        })
        .sort((a, b) => a.distKm - b.distKm);
      const p = map.latLngToContainerPoint(L.latLng(t.lat, t.lng));
      setDeploy({ target: { name: t.name, lng: t.lng, lat: t.lat }, stations: sorted, anchor: { x: p.x, y: p.y, maxX: map.getSize().x } });
      setPlanned([]);
      setRadial(null);
      highlightNearbyWater(t);
    },
    [highlightNearbyWater],
  );

  // 多站到场路线规划:每站 driving(GCJ02)+ 各色 polyline + 贴线 tooltip + 适窗;写 showRoute scene action(MCP 通道)
  const planRoutes = useCallback(
    async (stationIds: string[]) => {
      const map = mapRef.current;
      const routeLayer = routeLayerRef.current;
      if (!map || !routeLayer || !deploy) return;
      setPlanning(true);
      routeLayer.clearLayers();
      setPlanned([]);
      const allLatLngs: [number, number][] = [];
      const results: PlannedRoute[] = [];
      await Promise.all(
        stationIds.map(async (id, idx) => {
          const s = stationsRef.current.find((x) => x.id === id);
          if (!s) return;
          const from = wgs84ToGcj02(s.lng, s.lat);
          try {
            const route = await fetchDrivingRoute(from, { lng: deploy.target.lng, lat: deploy.target.lat });
            const color = ROUTE_COLORS[idx % ROUTE_COLORS.length];
            const distKm = (route.distance / 1000).toFixed(1);
            const etaMin = Math.round(route.duration / 60);
            const tipHtml = `<div style="background:rgba(10,20,32,.94);border:1px solid ${color}66;border-radius:5px;padding:2px 6px;color:#e6edf3;font-size:11px;white-space:nowrap;box-shadow:0 0 8px ${color}44"><span style="color:${color};font-weight:700">${s.name}</span> <span style="color:#9db4c8">${distKm}km · ${etaMin}分 · ${route.trafficLights}灯</span></div>`;
            L.polyline(route.polyline, { color, weight: 4, dashArray: '10 8', opacity: 0.9, className: 'route-flow' }).addTo(routeLayer);
            // 信息标签锚定路线分段点(按 idx 错开,避免多条叠在中点)
            const seg = Math.min(Math.floor(route.polyline.length * (0.3 + idx * 0.18)), route.polyline.length - 1);
            L.marker(route.polyline[seg], {
              icon: L.divIcon({ html: tipHtml, className: 'route-tip-icon', iconSize: undefined, iconAnchor: [0, 0] }),
              interactive: false,
              keyboard: false,
            }).addTo(routeLayer);
            route.polyline.forEach((pt) => allLatLngs.push(pt));
            results.push({ stationId: id, stationName: s.name, distance: route.distance, duration: route.duration, trafficLights: route.trafficLights });
          } catch {
            // 单站失败跳过
          }
        }),
      );
      results.sort((a, b) => stationIds.indexOf(a.stationId) - stationIds.indexOf(b.stationId));
      setPlanned(results);
      setPlanning(false);
      if (allLatLngs.length) map.flyToBounds(L.latLngBounds(allLatLngs), { padding: [60, 60] });
      addSceneAction({
        action: 'showRoute',
        target: `派遣路线:${deploy.target.name}(${results.length} 站)`,
        params: { routes: results },
        source: '面板',
      });
    },
    [deploy],
  );

  const clearRoutes = useCallback(() => {
    routeLayerRef.current?.clearLayers();
    highlightLayerRef.current?.clearLayers();
    setPlanned([]);
  }, []);

  // ---- 点位治理:坐标修正 ----
  const openCoordFix = useCallback((t: CoordFixTarget) => {
    setCoordFix(t);
    setDraftCoord(null);
    setGeoCandidates([]);
    setCoordError(null);
    setPickMode(false);
  }, []);

  const closeCoordFix = useCallback(() => {
    setCoordFix(null);
    setDraftCoord(null);
    setGeoCandidates([]);
    setCoordError(null);
    setPickMode(false);
  }, []);

  const queryAddress = useCallback(async (address: string) => {
    setGeoQuerying(true);
    setCoordError(null);
    try {
      setGeoCandidates(await fetchGeocode(address));
    } catch {
      setGeoCandidates([]);
      setCoordError('地址查询失败');
    } finally {
      setGeoQuerying(false);
    }
  }, []);

  const saveCoord = useCallback(async () => {
    if (!coordFix || !draftCoord) return;
    setCoordSaving(true);
    setCoordError(null);
    try {
      if (coordFix.kind === 'unit') {
        await updateKeyUnitCoords(coordFix.id, draftCoord.lng, draftCoord.lat);
        setKeyUnits(await fetchKeyUnits());
      } else {
        await updateKeyBuildingCoords(coordFix.id, draftCoord.lng, draftCoord.lat);
        setBuildings(await fetchKeyBuildings());
      }
      addSceneAction({
        action: 'updateCoord',
        target: `坐标修正 · ${coordFix.name} → ${draftCoord.lng.toFixed(5)},${draftCoord.lat.toFixed(5)}`,
        params: { id: coordFix.id, lng: draftCoord.lng, lat: draftCoord.lat },
        source: '面板',
      });
      setCoordFix(null);
      setDraftCoord(null);
      setGeoCandidates([]);
    } catch {
      setCoordError('保存失败(网络或权限)');
    } finally {
      setCoordSaving(false);
    }
  }, [coordFix, draftCoord]);

  const batchGeocode = useCallback(async () => {
    setBatching(true);
    setBatchMsg(null);
    try {
      const n = await geocodeMissingKeyUnits();
      setKeyUnits(await fetchKeyUnits());
      setBatchMsg(`已补全 ${n} 个单位坐标`);
    } catch {
      setBatchMsg('批量补全失败');
    } finally {
      setBatching(false);
    }
  }, []);

  // ---- 圆环菜单(点击 marker 弹出动作环,给操作增加摩擦)----
  const closeRadial = useCallback(() => setRadial(null), []);

  const openRadial = useCallback((target: CoordFixTarget, latlng: [number, number]) => {
    const map = mapRef.current;
    if (!map) return;
    map.closePopup(); // 阻止 marker click 自动弹出的 popup,圆环为唯一入口
    const p = map.latLngToContainerPoint(L.latLng(latlng[0], latlng[1]));
    setRadial({ target, x: p.x, y: p.y });
  }, []);

  const radialActions = useCallback(
    (t: CoordFixTarget): RadialAction[] => {
      // 消防站:定位 / 详情(人员·车辆·装备入口待管理面板 C)
      if (t.kind === 'station') {
        return [
          {
            key: 'locate',
            icon: Navigation,
            label: '定位',
            color: '#22d3ee',
            onClick: () => {
              const map = mapRef.current;
              if (map) map.flyTo([t.lat, t.lng], Math.max(map.getZoom(), 14));
              setRadial(null);
            },
          },
          {
            key: 'detail',
            icon: Info,
            label: '详情',
            color: '#a78bfa',
            onClick: () => {
              markersRef.current.get(t.id)?.openPopup();
              setRadial(null);
            },
          },
          {
            key: 'force',
            icon: Users,
            label: '力量明细',
            color: '#34d399',
            onClick: () => {
              // 锚定到消防站图标上方:实时算 marker 像素坐标
              const map = mapRef.current;
              if (map) {
                const p = map.latLngToContainerPoint(L.latLng(t.lat, t.lng));
                setForcePanel({
                  station: { id: t.id, name: t.name, type: t.type ?? '' },
                  lng: t.lng,
                  lat: t.lat,
                  x: p.x,
                  y: p.y,
                  maxX: map.getSize().x,
                });
              }
              setRadial(null);
            },
          },
        ];
      }
      // 重点单位 / 建筑:路线 / 修正 / 详情
      if (t.kind === 'incident') {
        return [
          {
            key: 'deploy',
            icon: Rocket,
            label: '派遣',
            color: '#22d3ee',
            onClick: () => {
              openDeploy({ name: t.name, lng: t.lng, lat: t.lat });
              setRadial(null);
            },
          },
          {
            key: 'water',
            icon: Droplets,
            label: '周边水源',
            color: '#34d399',
            onClick: () => {
              highlightNearbyWater({ lng: t.lng, lat: t.lat });
              setRadial(null);
            },
          },
          {
            key: 'detail',
            icon: Info,
            label: '详情',
            color: '#a78bfa',
            onClick: () => {
              incidentMarkersRef.current.get(t.id)?.openPopup();
              setRadial(null);
            },
          },
        ];
      }
      return [
        {
          key: 'route',
          icon: Route,
          label: '路线',
          color: '#22d3ee',
          onClick: () => {
            openDeploy(t);
            setRadial(null);
          },
        },
        {
          key: 'fix',
          icon: MapPin,
          label: '修正',
          color: '#fbbf24',
          onClick: () => {
            openCoordFix(t);
            setRadial(null);
          },
        },
        {
          key: 'detail',
          icon: Info,
          label: '详情',
          color: '#a78bfa',
          onClick: () => {
            const ref = t.kind === 'unit' ? keyUnitMarkersRef.current : buildingMarkersRef.current;
            ref.get(t.id)?.openPopup();
            setRadial(null);
          },
        },
      ];
    },
    [openDeploy, openCoordFix, highlightNearbyWater],
  );

  // 地图移动/缩放时关闭圆环(像素坐标已失效)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !radial) return;
    const close = () => setRadial(null);
    map.on('move zoom', close);
    return () => {
      map.off('move zoom', close);
    };
  }, [radial]);

  // 力量明细面板:地图移动/缩放时跟随消防站 marker 重算锚点(面板不飞开)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !forcePanel) return;
    const update = () => {
      const p = map.latLngToContainerPoint(L.latLng(forcePanel.lat, forcePanel.lng));
      setForcePanel((prev) => (prev ? { ...prev, x: p.x, y: p.y, maxX: map.getSize().x } : prev));
    };
    map.on('move zoom', update);
    return () => {
      map.off('move zoom', update);
    };
  }, [forcePanel?.station?.id]);

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
  }, [deploy?.target.lng, deploy?.target.lat]);

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

  // Ctrl/Cmd+K 唤出/收起命令面板
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 命令面板:输入 → 合并 动作命令(本地过滤)+ 单位跳转(本地过滤)+ 地址候选(高德异步)
  useEffect(() => {
    if (!paletteOpen) return;
    const q = paletteQuery.trim();
    const close = () => setPaletteOpen(false);
    // 动作命令
    const actions: PaletteItem[] = [
      {
        id: 'toggle-base',
        title: baseMap === 'vector' ? '切换卫星底图' : '切换矢量底图',
        icon: baseMap === 'vector' ? Satellite : MapIcon,
        group: '动作',
        run: () => {
          setBaseMap(baseMap === 'vector' ? 'satellite' : 'vector');
          close();
        },
      },
      {
        id: 'batch-geocode',
        title: '批量补全坐标',
        subtitle: '给坐标缺失的重点单位地理编码',
        icon: MapPin,
        group: '动作',
        run: () => {
          batchGeocode();
          close();
        },
      },
    ];
    if (planned.length) {
      actions.push({
        id: 'clear-route',
        title: '清空到场路线',
        icon: Trash2,
        group: '动作',
        run: () => {
          clearRoutes();
          close();
        },
      });
    }
    actions.push({
      id: 'toggle-draw',
      title: drawMode ? '取消划定区域' : '划定区域',
      icon: PenLine,
      group: '动作',
      run: () => {
        drawMode ? cancelDraw() : startDraw();
        close();
      },
    });
    const filteredActions = q ? actions.filter((a) => a.title.includes(q) || a.id.includes(q)) : actions;

    // 单位跳转(本地过滤)
    const unitItems: PaletteItem[] = q
      ? keyUnits
          .filter((u) => u.name.includes(q) || (u.unitType ?? '').includes(q))
          .slice(0, 6)
          .map((u) => ({
            id: `unit-${u.id}`,
            title: u.name,
            subtitle: `${u.unitType}${u.district ? ` · ${u.district}` : ''}`,
            icon: Building2,
            group: '单位',
            run: () => {
              const map = mapRef.current;
              if (map) map.flyTo([u.lat, u.lng], Math.max(map.getZoom(), 16));
              close();
            },
          }))
      : [];

    setPaletteItems([...filteredActions, ...unitItems]);

    // 地址查询(高德异步,≥2 字触发;结果到达后追加)
    if (q.length >= 2) {
      let alive = true;
      setPaletteLoading(true);
      fetchGeocode(q)
        .then((cs) => {
          if (!alive) return;
          const addrItems: PaletteItem[] = cs.slice(0, 6).map((c) => ({
            id: `addr-${c.lng}-${c.lat}`,
            title: c.address,
            subtitle: `${c.lng.toFixed(5)}, ${c.lat.toFixed(5)} · ${c.level}`,
            icon: MapPin,
            group: '地址',
            run: () => {
              setQueryMarker({ lng: c.lng, lat: c.lat, address: c.address });
              const map = mapRef.current;
              if (map) map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 16));
              close();
            },
          }));
          setPaletteItems([...filteredActions, ...unitItems, ...addrItems]);
        })
        .catch(() => {})
        .finally(() => {
          if (alive) setPaletteLoading(false);
        });
      return () => {
        alive = false;
      };
    }
    setPaletteLoading(false);
  }, [paletteOpen, paletteQuery, baseMap, planned, keyUnits, clearRoutes, batchGeocode, drawMode, startDraw, cancelDraw]);

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
          html: stationIconSvg(s.type, s.status),
          className: 'map-icon-station',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
          popupAnchor: [0, -24],
        }),
      })
        .bindPopup(`<b>${s.name}</b><br/>${s.type} · 在位 ${personnelCounts.get(s.id) ?? 0} 人<br/>${s.address}<br/>${s.lng.toFixed(5)}, ${s.lat.toFixed(5)}(WGS84)`)
        .on('click', () => handleStationClick(s))
        .on('contextmenu', () => openRadial({ kind: 'station', id: s.id, name: s.name, type: s.type, lng: g.lng, lat: g.lat }, [g.lat, g.lng]));
      layer.addLayer(marker);
      markersRef.current.set(s.id, marker);
    }
  }, [stations, handleStationClick, mapInited, openRadial, personnelCounts]);

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
    keyUnitMarkersRef.current.clear();
    // 该单位是否有活跃警情(关联 key_unit_id 且 status != 结束)
    const incidentByUnit = new Map<string, Incident>();
    for (const i of incidents) if (i.keyUnitId && i.status !== '结束') incidentByUnit.set(i.keyUnitId, i);
    for (const u of keyUnits) {
      const inc = incidentByUnit.get(u.id);
      const isHighRisk = !inc && /高层|化工|危化|超高层|大空间|地下/.test(u.unitType);
      const iconHtml = inc
        ? `<div class="unit-incident-wrap">${keyUnitIconSvg(u.unitType, u.status)}<span class="unit-incident-ring" data-level="${inc.level}"></span><span class="unit-incident-level">${inc.level}</span></div>`
        : isHighRisk
          ? `<div class="unit-risk-wrap">${keyUnitIconSvg(u.unitType, u.status)}<span class="unit-risk-badge" title="高风险">!</span></div>`
          : keyUnitIconSvg(u.unitType, u.status);
      const popupHtml =
        popupForKeyUnit(u) +
        (inc
          ? `<br/><span style="color:#ef4444">⚠ 警情:${inc.incidentType} · ${inc.level} 级 · ${inc.status}${inc.description ? `(${inc.description})` : ''}</span>`
          : '');
      const marker = L.marker([u.lat, u.lng], {
        icon: L.divIcon({
          html: iconHtml,
          className: 'map-icon-key-unit',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
          popupAnchor: [0, -24],
        }),
      })
        .bindPopup(popupHtml)
        .on('click', (e) => {
          if (incidentByUnit.get(u.id)) {
            openDeploy({ name: u.name, lng: u.lng, lat: u.lat });
            e.target.closePopup(); // 有警情:只弹派遣面板,关闭自动 popup 避免与面板重合(单位详情走右键圆环)
          }
        })
        .on('contextmenu', () => openRadial({ kind: 'unit', id: u.id, name: u.name, lng: u.lng, lat: u.lat }, [u.lat, u.lng]));
      keyUnitMarkersRef.current.set(u.id, marker);
      layer.addLayer(marker);
    }
  }, [keyUnits, mapInited, openRadial, incidents, openDeploy]);

  // 警情/事件(红色脉冲点位 + level 数字;GCJ02 直显)
  useEffect(() => {
    const layer = incidentsLayerRef.current;
    if (!layer || !mapInited) return;
    layer.clearLayers();
    incidentMarkersRef.current.clear();
    for (const i of incidents) {
      if (i.keyUnitId) continue; // 关联单位的警情由单位 marker 警情态显示,不独立渲染
      const marker = L.marker([i.lat, i.lng], {
        icon: L.divIcon({
          html: `<div class="incident-marker" data-level="${i.level}">${i.level}</div>`,
          className: 'map-icon-incident',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14],
        }),
      })
        .bindPopup(
          `<b>⚠ ${i.address}</b><br/>${i.incidentType} · ${i.level} 级 · ${i.status}` +
            `${i.description ? `<br/>${i.description}` : ''}<br/>${i.lng.toFixed(5)}, ${i.lat.toFixed(5)}`,
        )
        .on('click', () => openDeploy({ name: i.address, lng: i.lng, lat: i.lat }))
        .on('contextmenu', () => openRadial({ kind: 'incident', id: i.id, name: i.address, lng: i.lng, lat: i.lat }, [i.lat, i.lng]));
      incidentMarkersRef.current.set(i.id, marker);
      layer.addLayer(marker);
    }
  }, [incidents, mapInited, openDeploy, openRadial]);

  // 重点建筑
  useEffect(() => {
    const layer = buildingsLayerRef.current;
    if (!layer || !mapInited) return;
    layer.clearLayers();
    buildingMarkersRef.current.clear();
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
        .on('contextmenu', () => openRadial({ kind: 'building', id: b.id, name: b.name, lng: b.lng, lat: b.lat }, [b.lat, b.lng]));
      buildingMarkersRef.current.set(b.id, marker);
      layer.addLayer(marker);
    }
  }, [buildings, keyUnits, mapInited, openRadial]);

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
          if (!map) return;
          // 手动区域:点击放大到区域中心,固定 zoom 级别(每次一致,不随点击叠加无限放大)
          const center = poly.getBounds().getCenter();
          map.flyTo(center, 16);
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

  // 警情显隐
  useEffect(() => {
    const map = mapRef.current;
    const layer = incidentsLayerRef.current;
    if (!map || !layer || !mapInited) return;
    if (showIncidents) layer.addTo(map);
    else map.removeLayer(layer);
  }, [showIncidents, mapInited]);

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
      if (latest.action === 'showRoute' && latest.source !== '面板') {
        // MCP/agent 通道:外部写 showRoute(含 routes[])→ 渲染多 polyline(面板自己写的跳过,避免重复)
        const routeLayer = routeLayerRef.current;
        const routes = (latest.params as {
          routes?: Array<{ polyline?: [number, number][]; stationName?: string; distance?: number; duration?: number; trafficLights?: number }>;
        }).routes;
        if (routeLayer && Array.isArray(routes) && routes.length) {
          routeLayer.clearLayers();
          const colors = ['#22d3ee', '#34d399', '#a78bfa', '#fbbf24', '#f87171', '#60a5fa'];
          const allLatLngs: [number, number][] = [];
          const summary: PlannedRoute[] = [];
          routes.forEach((r, idx) => {
            if (!r.polyline?.length) return;
            const color = colors[idx % colors.length];
            const distKm = r.distance ? (r.distance / 1000).toFixed(1) : '?';
            const etaMin = r.duration ? Math.round(r.duration / 60) : '?';
            const tipHtml = `<div style="background:rgba(10,20,32,.94);border:1px solid ${color}66;border-radius:5px;padding:2px 6px;color:#e6edf3;font-size:11px;white-space:nowrap;box-shadow:0 0 8px ${color}44"><span style="color:${color};font-weight:700">${r.stationName ?? `路线 ${idx + 1}`}</span> <span style="color:#9db4c8">${distKm}km · ${etaMin}分 · ${r.trafficLights ?? 0}灯</span></div>`;
            L.polyline(r.polyline, { color, weight: 4, dashArray: '10 8', opacity: 0.9, className: 'route-flow' }).addTo(routeLayer);
            const seg = Math.min(Math.floor(r.polyline.length * (0.3 + idx * 0.18)), r.polyline.length - 1);
            L.marker(r.polyline[seg], {
              icon: L.divIcon({ html: tipHtml, className: 'route-tip-icon', iconSize: undefined, iconAnchor: [0, 0] }),
              interactive: false,
              keyboard: false,
            }).addTo(routeLayer);
            r.polyline.forEach((pt) => allLatLngs.push(pt));
            summary.push({ stationId: `ext-${idx}`, stationName: r.stationName ?? `路线 ${idx + 1}`, distance: r.distance ?? 0, duration: r.duration ?? 0, trafficLights: r.trafficLights ?? 0 });
          });
          setPlanned(summary);
          if (allLatLngs.length) map.flyToBounds(L.latLngBounds(allLatLngs), { padding: [60, 60] });
        }
      }
    });
    return () => {
      unsub();
    };
  }, []);

  // 地图拾取模式:点击地图 → 回填 draft 坐标(GCJ02,高德瓦片原生坐标系)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited || !pickMode || !coordFix) return;
    const onClick = (e: any) => {
      setDraftCoord({ lng: e.latlng.lng, lat: e.latlng.lat });
      setPickMode(false);
    };
    map.on('click', onClick);
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('click', onClick);
      map.getContainer().style.cursor = '';
    };
  }, [pickMode, coordFix, mapInited]);

  // 临时标记层:修正 draft(琥珀)+ 点位查询结果(青)
  useEffect(() => {
    const layer = tempLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (draftCoord && coordFix) {
      L.circleMarker([draftCoord.lat, draftCoord.lng], {
        radius: 7, color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 0.85, weight: 2,
      })
        .bindTooltip('新坐标(待保存)', { direction: 'top' })
        .addTo(layer);
    }
    if (queryMarker) {
      L.circleMarker([queryMarker.lat, queryMarker.lng], {
        radius: 7, color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.85, weight: 2,
      })
        .bindTooltip(queryMarker.address, { direction: 'top' })
        .addTo(layer);
    }
  }, [draftCoord, coordFix, queryMarker]);

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
        showIncidents={showIncidents}
        onToggleIncidents={() => setShowIncidents((v) => !v)}
        showBuildings={showBuildings}
        onToggleBuildings={() => setShowBuildings((v) => !v)}
        showRegions={showRegions}
        onToggleRegions={() => setShowRegions((v) => !v)}
      />
      <CommandPalette
        open={paletteOpen}
        query={paletteQuery}
        items={paletteItems}
        loading={paletteLoading}
        onQueryChange={setPaletteQuery}
        onClose={() => setPaletteOpen(false)}
      />
      {forcePanel && (
        <ForceManagePanel
          station={forcePanel.station}
          anchor={forcePanel}
          onClose={() => setForcePanel(null)}
        />
      )}
      {coordFix && (
        <CoordinateFixPanel
          target={coordFix}
          draft={draftCoord}
          pickMode={pickMode}
          candidates={geoCandidates}
          querying={geoQuerying}
          saving={coordSaving}
          error={coordError}
          onQuery={queryAddress}
          onStartPick={() => setPickMode(true)}
          onDraft={(lng, lat) => setDraftCoord({ lng, lat })}
          onClearDraft={() => setDraftCoord(null)}
          onSave={saveCoord}
          onClose={closeCoordFix}
        />
      )}
      {radial && (
        <RadialMenu
          x={radial.x}
          y={radial.y}
          actions={radialActions(radial.target)}
          onClose={closeRadial}
        />
      )}
      {deploy && (
        <DeployPanel
          targetName={deploy.target.name}
          stations={deploy.stations}
          planned={planned}
          planning={planning}
          anchor={deploy.anchor}
          onPlan={(ids) => planRoutes(ids)}
          onClear={clearRoutes}
          onClose={() => {
            setDeploy(null);
            clearRoutes();
          }}
        />
      )}
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
