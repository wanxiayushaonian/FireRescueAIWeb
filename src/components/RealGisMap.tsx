'use client';
// 态势总览 2D 地图:高德底图(Leaflet,矢量/卫星可切换,GCJ02)+ 消防站(类型显隐由执勤力量面板经 map-layer-store 控制)+ 水源(三级:zoom<13 不加载 / 13-14 网格聚合气泡 / >=15 水滴图标逐点;区划显隐由水源面板控制)+ 市/区县边界 + 重点单位/建筑(zoom<14 客户端网格聚合气泡,警情单位始终逐点)+ 重点区域 + sceneLog 联动。
// 坐标策略:自 znya c8d4e5f6a7b8 迁移起全库坐标统一 GCJ02(高德),前端不再做基准转换,库内坐标直接使用。
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
import { fetchWaterSourcesInBbox, fetchNearbyWaterSources, fetchWaterSourcesPage, fetchWaterClusters, createWaterSource, updateWaterSource, deleteWaterSource, type WaterCluster } from '@/api/water';
import { fetchKeyUnits, updateKeyUnitCoords, geocodeMissingKeyUnits, createKeyUnit, updateKeyUnit, deleteKeyUnit } from '@/api/key-units';
import { fetchIncidents } from '@/api/incidents';
import type { Incident } from '@/lib/incident-mapper';
import { fetchKeyBuildings, updateKeyBuildingCoords, fetchKeyBuildingDetail, createKeyBuilding, updateKeyBuilding, deleteKeyBuilding } from '@/api/key-buildings';
import { fetchDrivingRoute } from '@/api/route';
import { fetchGeocode, type GeoCandidate } from '@/api/geocode';
import { fetchRegions, createRegion } from '@/api/regions';
import { stationIconSvg, waterIconSvg, waterClusterSvg, clusterBubbleSvg, keyBuildingIconSvg, shouldShowWater, shouldShowWaterPoints, waterClusterCell, MARKER_CLUSTER_MAX_ZOOM } from '@/lib/map-icons';
import { HIGH_RISK_PATTERN, keyUnitMarkerHtml, incidentMarkerHtml } from '@/lib/gis/marker-html';
import { gridCluster } from '@/lib/grid-cluster';
import { renderRoutes, type RouteRenderItem } from '@/lib/gis/route-render';
import { popupForKeyUnit, popupForKeyBuilding, popupForStation, popupForWater, popupForIncident, popupIncidentSuffix } from '@/lib/gis/popup-html';
import { buildActionItems, filterActionItems, filterUnits, buildAddressDefs } from '@/lib/gis/palette-items';
import { useMapLayerPrefs } from '@/lib/map-layer-store';
import { haversineKm } from '@/lib/geo-query';
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
import EntityFormPanel from './gis/EntityFormPanel';
import { emptyEntityForm, buildWaterPayload, buildUnitPayload, buildBuildingPayload, type EntityFormValues, type EntityKind } from '@/lib/entity-form';
import { showToast } from '@/components/Toast';
import { Route, MapPin, Info, Trash2, Building2, Navigation, Users, Droplets, Rocket, Pencil, Plus } from 'lucide-react';

// 高德矢量瓦片(GCJ02,自带中文地名/道路注记;免 key,subdomains 1-4)
const VECTOR_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
// 高德卫星影像(GCJ02;免 key)
const SAT_URL = 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';
// 本地市/区县边界 GeoJSON(DataV,GCJ02,离线)
const BOUNDARY_URL = '/geo/jiujiang-boundary.json';

// 九江市中心(九江市消防救援支队附近,GCJ02)
const DEFAULT_CENTER: [number, number] = [29.66734, 115.96498];
const DEFAULT_ZOOM = 11;
// tileerror 连续失败阈值 → 触发占位降级
const TILE_ERR_THRESHOLD = 5;
// 边界交互(区县 hover 高亮/点击适窗)只在"能俯瞰九江全境"的低缩放级别生效
const BOUNDARY_INTERACT_MAX_ZOOM = 12;

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
  const waterClustersRef = useRef<WaterCluster[]>([]);
  const tileErrRef = useRef(0);

  const [stations, setStations] = useState<Station[]>([]);
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [water, setWater] = useState<WaterSource[]>([]);
  const [waterClusters, setWaterClusters] = useState<WaterCluster[]>([]);
  // 图层偏好(队站类型/水源区划显隐)来自共享 store,由执勤力量/水源面板维护
  const layerPrefs = useMapLayerPrefs();
  const [keyUnits, setKeyUnits] = useState<KeyUnit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [buildings, setBuildings] = useState<KeyBuilding[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [mapInited, setMapInited] = useState(false);
  // 当前整数 zoom(zoomend 同步):单位/建筑在 <14 时切聚合气泡
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
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
  // 点位增删改表单(水源/重点单位/重点建筑)
  const [entityForm, setEntityForm] = useState<{ mode: 'create' | 'edit'; id?: string; values: EntityFormValues } | null>(null);
  const [entitySaving, setEntitySaving] = useState(false);
  const [entityError, setEntityError] = useState<string | null>(null);
  // 地图空白处右键 → 新增点位菜单
  const [createMenu, setCreateMenu] = useState<{ x: number; y: number; lng: number; lat: number } | null>(null);
  // 水源数据变更后 bump 触发 bbox/clusters 重取
  const [waterTick, setWaterTick] = useState(0);
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
    const map = L.map(rootRef.current, {
      center: DEFAULT_CENTER,
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

  // zoom 状态同步(单位/建筑聚合气泡模式切换用)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [mapInited]);

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

  // 加载水源:视口驱动(bbox),moveend 防抖 300ms;按 zoom 分三级——
  // <13 不加载;13-14 网格聚合气泡(clusters 端点,一次请求);>=15 bbox 明细点位。
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    let alive = true;
    let timer: number | undefined;
    let seq = 0;
    const load = () => {
      const zoom = map.getZoom();
      if (!shouldShowWater(zoom)) {
        waterRef.current = [];
        waterClustersRef.current = [];
        setWater([]);
        setWaterClusters([]);
        return;
      }
      const b = map.getBounds().pad(0.25); // 外扩,平移小距离不重复请求(地图与库同为 GCJ02,直接用)
      const bbox = {
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      };
      const mySeq = ++seq;
      if (shouldShowWaterPoints(zoom)) {
        fetchWaterSourcesInBbox(bbox)
          .then((ws) => {
            if (!alive || mySeq !== seq) return;
            // 数据集没变就跳过 setWater,避免触发重渲染把已打开的 popup 销毁
            const cur = waterRef.current;
            if (cur.length !== ws.length || !cur.every((c, i) => c.id === ws[i]?.id)) {
              waterRef.current = ws;
              setWater(ws);
            }
            if (waterClustersRef.current.length) {
              waterClustersRef.current = [];
              setWaterClusters([]);
            }
          })
          .catch(() => {});
      } else {
        fetchWaterClusters(bbox, waterClusterCell(zoom), layerPrefs.hiddenWaterDistricts)
          .then((cs) => {
            if (!alive || mySeq !== seq) return;
            const cur = waterClustersRef.current;
            if (
              cur.length !== cs.length ||
              !cur.every((c, i) => c.lng === cs[i]?.lng && c.lat === cs[i]?.lat && c.count === cs[i]?.count)
            ) {
              waterClustersRef.current = cs;
              setWaterClusters(cs);
            }
            if (waterRef.current.length) {
              waterRef.current = [];
              setWater([]);
            }
          })
          .catch(() => {});
      }
    };
    const debounced = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(load, 300);
    };
    load();
    map.on('moveend', debounced);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      map.off('moveend', debounced);
    };
  }, [mapInited, layerPrefs.hiddenWaterDistricts, waterTick]);

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

  // 周边水源高亮:500m 内水源画青色圈 + 适窗(独立可调,警情圆环"周边水源"复用)
  const highlightNearbyWater = useCallback((t: { lng: number; lat: number }) => {
    const map = mapRef.current;
    const highlight = highlightLayerRef.current;
    if (!map || !highlight) return;
    highlight.clearLayers();
    // 地图与库同为 GCJ02,直接调 nearby 半径查询
    fetchNearbyWaterSources({ lng: t.lng, lat: t.lat, radius: 500 })
      .then((nearby) => {
        const bounds = L.latLngBounds([L.latLng(t.lat, t.lng)]);
        nearby.forEach((w) => {
          L.circleMarker([w.lat, w.lng], { radius: 10, color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.3, weight: 2 })
            .bindTooltip(`${w.name} · ${w.type} · ${Math.round(w.distanceM)}m`, { direction: 'top' })
            .addTo(highlight);
          bounds.extend(L.latLng(w.lat, w.lng));
        });
        if (nearby.length) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 17 });
      })
      .catch(() => {});
  }, []);

  // 打开派遣面板:站点(已与地图同为 GCJ02)按到目标直线距离排序 + 算锚点 + 周边水源
  const openDeploy = useCallback(
    (t: { name: string; lng: number; lat: number }) => {
      const map = mapRef.current;
      if (!map) return;
      const sorted = stationsRef.current
        .map((s) => ({ ...s, distKm: haversineKm(s.lng, s.lat, t.lng, t.lat) }))
        .sort((a, b) => a.distKm - b.distKm);
      const p = map.latLngToContainerPoint(L.latLng(t.lat, t.lng));
      setDeploy({ target: { name: t.name, lng: t.lng, lat: t.lat }, stations: sorted, anchor: { x: p.x, y: p.y, maxX: map.getSize().x } });
      setPlanned([]);
      setRadial(null);
      highlightNearbyWater(t);
    },
    [highlightNearbyWater],
  );

  // 多站到场路线规划:每站 driving(GCJ02)→ renderRoutes 统一渲染(色板/tipHtml 在 lib/gis/route-render);写 showRoute scene action(MCP 通道)
  const planRoutes = useCallback(
    async (stationIds: string[]) => {
      const map = mapRef.current;
      const routeLayer = routeLayerRef.current;
      if (!map || !routeLayer || !deploy) return;
      setPlanning(true);
      setPlanned([]);
      // 并发拉各站 driving;失败站跳过;按 stationIds 顺序组装(原实现靠 sort 恢复顺序,等价)
      const items = (
        await Promise.all(
          stationIds.map(async (id) => {
            const s = stationsRef.current.find((x) => x.id === id);
            if (!s) return null;
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

  // ---- 点位增删改(水源/重点单位/重点建筑) ----
  const openEntityCreate = useCallback((kind: EntityKind, lng: number, lat: number) => {
    setEntityForm({ mode: 'create', values: { ...emptyEntityForm(kind), lng, lat } });
    setEntityError(null);
    setGeoCandidates([]);
    setCreateMenu(null);
    setRadial(null);
    setCoordFix(null);
  }, []);

  const openEntityEdit = useCallback(
    async (kind: EntityKind, id: string) => {
      setEntityError(null);
      setGeoCandidates([]);
      let values: EntityFormValues | null = null;
      if (kind === 'water') {
        const w = waterRef.current.find((x) => x.id === id);
        if (!w) return;
        values = {
          ...emptyEntityForm('water'),
          name: w.name, waterType: w.type, districtCode: w.districtCode, address: w.address,
          lng: w.lng, lat: w.lat,
        };
      } else if (kind === 'unit') {
        const u = keyUnits.find((x) => x.id === id);
        if (!u) return;
        values = {
          ...emptyEntityForm('unit'),
          name: u.name, unitType: u.unitType, district: u.district ?? '',
          contactName: u.contactName ?? '', contactPhone: u.contactPhone ?? '', address: u.address ?? '',
          lng: u.lng, lat: u.lat,
        };
      } else {
        // 建筑编辑需高度/面积/层数,列表响应没有,先拉详情预填
        try {
          const d = await fetchKeyBuildingDetail(id);
          if (d.longitude == null || d.latitude == null) return;
          values = {
            ...emptyEntityForm('building'),
            name: d.name, buildingType: d.building_type ?? '', buildingUsage: d.building_usage ?? '',
            buildingHeight: d.building_height != null ? String(d.building_height) : '',
            floorArea: d.floor_area != null ? String(d.floor_area) : '',
            groundFloors: d.ground_floors != null ? String(d.ground_floors) : '',
            undergroundFloors: d.underground_floors != null ? String(d.underground_floors) : '',
            keyUnitId: d.key_unit_id ?? '', address: d.address ?? '',
            lng: d.longitude, lat: d.latitude,
          };
        } catch {
          showToast('加载建筑详情失败');
          return;
        }
      }
      setEntityForm({ mode: 'edit', id, values });
      setRadial(null);
      setCoordFix(null);
    },
    [keyUnits],
  );

  const saveEntity = useCallback(async () => {
    if (!entityForm) return;
    setEntitySaving(true);
    setEntityError(null);
    const { mode, id, values } = entityForm;
    try {
      if (values.kind === 'water') {
        const body = buildWaterPayload(values, mode);
        if (mode === 'create') await createWaterSource(body);
        else await updateWaterSource(id!, body);
        setWaterTick((t) => t + 1); // 触发 bbox/clusters 重取
      } else if (values.kind === 'unit') {
        const body = buildUnitPayload(values);
        if (mode === 'create') await createKeyUnit(body);
        else await updateKeyUnit(id!, body);
        setKeyUnits(await fetchKeyUnits());
      } else {
        const body = buildBuildingPayload(values);
        if (mode === 'create') await createKeyBuilding(body);
        else await updateKeyBuilding(id!, body);
        setBuildings(await fetchKeyBuildings());
      }
      addSceneAction({
        action: 'editEntity',
        target: `${mode === 'create' ? '新增' : '编辑'} · ${values.name}`,
        params: { kind: values.kind, id, lng: values.lng, lat: values.lat },
        source: '面板',
      });
      showToast(mode === 'create' ? '已创建' : '已保存');
      setEntityForm(null);
    } catch (e) {
      setEntityError(e instanceof Error ? e.message : '保存失败(网络或权限)');
    } finally {
      setEntitySaving(false);
    }
  }, [entityForm]);

  // 删除:圆环"删除"直删(带确认);表单内删除按钮也走这里
  const deleteEntity = useCallback(
    async (kind: EntityKind, id: string, name: string) => {
      if (!window.confirm(`确认删除「${name}」?删除后不可恢复。`)) return;
      setEntitySaving(true);
      setEntityError(null);
      try {
        if (kind === 'water') {
          await deleteWaterSource(id);
          setWaterTick((t) => t + 1);
        } else if (kind === 'unit') {
          await deleteKeyUnit(id);
          setKeyUnits(await fetchKeyUnits());
        } else {
          await deleteKeyBuilding(id);
          setBuildings(await fetchKeyBuildings());
        }
        addSceneAction({ action: 'editEntity', target: `删除 · ${name}`, params: { kind, id }, source: '面板' });
        showToast('已删除');
        setEntityForm(null);
        setRadial(null);
      } catch {
        setEntityError('删除失败(网络或权限)');
        showToast('删除失败');
      } finally {
        setEntitySaving(false);
      }
    },
    [],
  );

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
      // 水源:编辑 / 删除(左键点击弹 popup 不变)
      if (t.kind === 'water') {
        return [
          {
            key: 'edit',
            icon: Pencil,
            label: '编辑',
            color: '#34d399',
            onClick: () => {
              openEntityEdit('water', t.id);
            },
          },
          {
            key: 'delete',
            icon: Trash2,
            label: '删除',
            color: '#f87171',
            onClick: () => {
              deleteEntity('water', t.id, t.name);
            },
          },
        ];
      }
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
          key: 'edit',
          icon: Pencil,
          label: '编辑',
          color: '#34d399',
          onClick: () => {
            openEntityEdit(t.kind as EntityKind, t.id);
          },
        },
        {
          key: 'delete',
          icon: Trash2,
          label: '删除',
          color: '#f87171',
          onClick: () => {
            deleteEntity(t.kind as EntityKind, t.id, t.name);
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
    [openDeploy, openCoordFix, highlightNearbyWater, openEntityEdit, deleteEntity],
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
    // 动作命令:def 由 lib 产出,组件用 id → run 映射表附加执行逻辑
    const actionRuns: Record<string, () => void> = {
      'toggle-base': () => {
        setBaseMap(baseMap === 'vector' ? 'satellite' : 'vector');
        close();
      },
      'batch-geocode': () => {
        batchGeocode();
        close();
      },
      'clear-route': () => {
        clearRoutes();
        close();
      },
      'toggle-draw': () => {
        drawMode ? cancelDraw() : startDraw();
        close();
      },
    };
    const actionDefs = buildActionItems({ baseMap, hasPlanned: planned.length > 0, drawMode });
    const filteredActions: PaletteItem[] = filterActionItems(actionDefs, q).map((d) => ({ ...d, run: actionRuns[d.id] }));

    // 单位跳转(本地过滤)
    const unitItems: PaletteItem[] = filterUnits(keyUnits, q).map((u) => ({
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
    }));

    setPaletteItems([...filteredActions, ...unitItems]);

    // 地址查询(高德异步,≥2 字触发;结果到达后追加)
    if (q.length >= 2) {
      let alive = true;
      setPaletteLoading(true);
      fetchGeocode(q)
        .then((cs) => {
          if (!alive) return;
          const addrItems: PaletteItem[] = buildAddressDefs(cs).map((d, i) => {
            const c = cs[i];
            return {
              ...d,
              icon: MapPin,
              run: () => {
                setQueryMarker({ lng: c.lng, lat: c.lat, address: c.address });
                const map = mapRef.current;
                if (map) map.flyTo([c.lat, c.lng], Math.max(map.getZoom(), 16));
                close();
              },
            };
          });
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
      if (!layerPrefs.visibleStationTypes.includes(s.type)) continue;
      const marker = L.marker([s.lat, s.lng], {
        icon: L.divIcon({
          html: stationIconSvg(s.type, s.status),
          className: 'map-icon-station',
          iconSize: [24, 24],
          iconAnchor: [12, 24],
          popupAnchor: [0, -24],
        }),
      })
        .bindPopup(popupForStation(s, personnelCounts.get(s.id) ?? 0))
        .on('click', () => handleStationClick(s))
        .on('contextmenu', (e) => { L.DomEvent.stopPropagation(e.originalEvent as Event); openRadial({ kind: 'station', id: s.id, name: s.name, type: s.type, lng: s.lng, lat: s.lat }, [s.lat, s.lng]); });
      layer.addLayer(marker);
      markersRef.current.set(s.id, marker);
    }
  }, [stations, handleStationClick, mapInited, openRadial, personnelCounts, layerPrefs.visibleStationTypes]);

  // 水源渲染:>=15 水滴图标逐点(带 popup,按区划开关过滤);13-14 聚合气泡(点击气泡放大进点位级)
  useEffect(() => {
    const layer = waterLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map || !mapInited) return;
    // 记录当前打开的 popup,重建后在新 marker 实例上恢复(clearLayers 会销毁 popup)
    const openId = [...waterMarkersRef.current.entries()].find(([, m]) => m.isPopupOpen())?.[0];
    layer.clearLayers();
    waterMarkersRef.current.clear();
    const zoom = map.getZoom();
    if (shouldShowWaterPoints(zoom)) {
      const hidden = layerPrefs.hiddenWaterDistricts;
      for (const w of water) {
        if (hidden.includes(w.districtCode)) continue;
        const m = L.marker([w.lat, w.lng], {
          icon: L.divIcon({
            html: waterIconSvg(w.type),
            className: 'map-icon-water',
            iconSize: [18, 18],
            iconAnchor: [9, 18],
            popupAnchor: [0, -18],
          }),
        })
          .bindPopup(popupForWater(w))
          .on('click', () =>
            addSceneAction({ action: 'flyTo', target: w.name, params: { lng: w.lng, lat: w.lat }, source: '面板' }),
          )
          .on('contextmenu', (e) => {
            L.DomEvent.stopPropagation(e.originalEvent as Event);
            openRadial({ kind: 'water', id: w.id, name: w.name, lng: w.lng, lat: w.lat }, [w.lat, w.lng]);
          });
        layer.addLayer(m);
        waterMarkersRef.current.set(w.id, m);
      }
      if (openId) waterMarkersRef.current.get(openId)?.openPopup();
    } else if (shouldShowWater(zoom)) {
      for (const c of waterClusters) {
        const { html, size } = waterClusterSvg(c.count);
        L.marker([c.lat, c.lng], {
          icon: L.divIcon({
            html,
            className: 'map-icon-water-cluster',
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
          }),
        })
          .bindTooltip(`${c.count} 个水源,放大地图查看`, { direction: 'top' })
          .on('click', () => map.flyTo([c.lat, c.lng], map.getZoom() + 1))
          .addTo(layer);
      }
    }
  }, [water, waterClusters, mapInited, layerPrefs.hiddenWaterDistricts, openRadial]);

  // 重点单位:zoom<14 网格聚合气泡(有警情的单位始终逐点,警情态不进气泡);>=14 逐点
  // unitClusterMode:>=14 恒定 'points'(缩放不再重建千级 marker);<14 每级重建气泡(格宽随 zoom 变)
  const unitClusterMode: string | number = zoom >= MARKER_CLUSTER_MAX_ZOOM ? 'points' : zoom;
  useEffect(() => {
    const layer = keyUnitsLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map || !mapInited) return;
    layer.clearLayers();
    keyUnitMarkersRef.current.clear();
    // 该单位是否有活跃警情(关联 key_unit_id 且 status != 结束)
    const incidentByUnit = new Map<string, Incident>();
    for (const i of incidents) if (i.keyUnitId && i.status !== '结束') incidentByUnit.set(i.keyUnitId, i);

    const renderUnit = (u: KeyUnit) => {
      const inc = incidentByUnit.get(u.id);
      const iconHtml = keyUnitMarkerHtml({
        unitType: u.unitType,
        status: u.status,
        incidentLevel: inc?.level ?? null,
        highRisk: !inc && HIGH_RISK_PATTERN.test(u.unitType),
      });
      const popupHtml = popupForKeyUnit(u) + (inc ? popupIncidentSuffix(inc) : '');
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
        .on('contextmenu', (e) => { L.DomEvent.stopPropagation(e.originalEvent as Event); openRadial({ kind: 'unit', id: u.id, name: u.name, lng: u.lng, lat: u.lat }, [u.lat, u.lng]); });
      keyUnitMarkersRef.current.set(u.id, marker);
      layer.addLayer(marker);
    };

    if (zoom >= MARKER_CLUSTER_MAX_ZOOM) {
      keyUnits.forEach(renderUnit);
      return;
    }
    // 聚合模式:警情单位逐点(警情第一优先),其余按格聚合
    const withIncident = keyUnits.filter((u) => incidentByUnit.has(u.id));
    const rest = keyUnits.filter((u) => !incidentByUnit.has(u.id));
    withIncident.forEach(renderUnit);
    for (const c of gridCluster(rest, (u) => u.lng, (u) => u.lat, waterClusterCell(zoom))) {
      const { html, size } = clusterBubbleSvg(c.count, '#fb7185');
      L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          html,
          className: 'map-icon-unit-cluster',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      })
        .bindTooltip(`${c.count} 个重点单位,放大地图查看`, { direction: 'top' })
        .on('click', () => map.flyTo([c.lat, c.lng], map.getZoom() + 1))
        .addTo(layer);
    }
  }, [keyUnits, mapInited, openRadial, incidents, openDeploy, unitClusterMode]);

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
          html: incidentMarkerHtml(i.level),
          className: 'map-icon-incident',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -14],
        }),
      })
        .bindPopup(popupForIncident(i))
        .on('click', () => openDeploy({ name: i.address, lng: i.lng, lat: i.lat }))
        .on('contextmenu', (e) => { L.DomEvent.stopPropagation(e.originalEvent as Event); openRadial({ kind: 'incident', id: i.id, name: i.address, lng: i.lng, lat: i.lat }, [i.lat, i.lng]); });
      incidentMarkersRef.current.set(i.id, marker);
      layer.addLayer(marker);
    }
  }, [incidents, mapInited, openDeploy, openRadial]);

  // 重点建筑:zoom<14 网格聚合气泡;>=14 逐点(与重点单位同套机制)
  useEffect(() => {
    const layer = buildingsLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map || !mapInited) return;
    layer.clearLayers();
    buildingMarkersRef.current.clear();

    const renderBuilding = (b: KeyBuilding) => {
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
        .on('contextmenu', (e) => { L.DomEvent.stopPropagation(e.originalEvent as Event); openRadial({ kind: 'building', id: b.id, name: b.name, lng: b.lng, lat: b.lat }, [b.lat, b.lng]); });
      buildingMarkersRef.current.set(b.id, marker);
      layer.addLayer(marker);
    };

    if (zoom >= MARKER_CLUSTER_MAX_ZOOM) {
      buildings.forEach(renderBuilding);
      return;
    }
    for (const c of gridCluster(buildings, (b) => b.lng, (b) => b.lat, waterClusterCell(zoom))) {
      const { html, size } = clusterBubbleSvg(c.count, '#60a5fa');
      L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          html,
          className: 'map-icon-building-cluster',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      })
        .bindTooltip(`${c.count} 个重点建筑,放大地图查看`, { direction: 'top' })
        .on('click', () => map.flyTo([c.lat, c.lng], map.getZoom() + 1))
        .addTo(layer);
    }
  }, [buildings, keyUnits, mapInited, openRadial, unitClusterMode]);

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
        const p = latest.params as { lng?: number; lat?: number; id?: string } | undefined;
        if (typeof p?.lng === 'number' && typeof p?.lat === 'number' && (p.lng || p.lat)) {
          // 首选:params 直接带坐标(面板联动),免搜索直达;zoom 拉到点位级保证水源逐点渲染
          map.flyTo([p.lat, p.lng], Math.max(map.getZoom(), 15));
          if (p.id) {
            // 点位数据在 moveend 防抖 + bbox 请求后才到位,重试几次等它渲染
            let tries = 0;
            const tryOpen = () => {
              tries += 1;
              const mk = markersRef.current.get(p.id!) ?? waterMarkersRef.current.get(p.id!);
              if (mk) mk.openPopup();
              else if (tries < 6) window.setTimeout(tryOpen, 400);
            };
            window.setTimeout(tryOpen, 400);
          }
        } else {
        const hit = stationsRef.current.find((s) => latest.target?.includes(s.name));
        if (hit) {
          map.flyTo([hit.lat, hit.lng], Math.max(map.getZoom(), 14));
          markersRef.current.get(hit.id)?.openPopup();
        } else {
          const w = waterRef.current.find((x) => latest.target?.includes(x.name));
          if (w) {
            // 必须飞到点位级(zoom>=15):中低 zoom 是聚合气泡,没有可弹 popup 的逐点 marker
            map.flyTo([w.lat, w.lng], Math.max(map.getZoom(), 15));
            // 点位数据在 moveend 防抖 + bbox 请求后才到位,重试几次等它渲染
            let tries = 0;
            const tryOpen = () => {
              tries += 1;
              const mk = waterMarkersRef.current.get(w.id);
              if (mk) mk.openPopup();
              else if (tries < 6) window.setTimeout(tryOpen, 400);
            };
            window.setTimeout(tryOpen, 400);
          } else if (latest.target) {
            // 视口内未命中(水源是视口加载):按名称关键词查后端兜底
            fetchWaterSourcesPage({ keyword: latest.target, pageSize: 5 })
              .then(({ items }) => {
                const hit = items.find((x) => latest.target?.includes(x.name)) ?? items[0];
                if (!hit || !hit.lng || !hit.lat) return;
                map.flyTo([hit.lat, hit.lng], Math.max(map.getZoom(), 15));
              })
              .catch(() => {});
          }
        }
        }
      }
      if (latest.action === 'resetView') {
        mapRef.current?.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
      if (latest.action === 'showRoute' && latest.source !== '面板') {
        // MCP/agent 通道:外部写 showRoute(含 routes[])→ 渲染多 polyline(面板自己写的跳过,避免重复)
        const routeLayer = routeLayerRef.current;
        // MCP 通道是无类型保证的运行时数据:容忍 stationName 缺失,回退"路线 N"(与重构前行为一致)
        const routes = (latest.params as {
          routes?: Array<Omit<RouteRenderItem, 'stationName'> & { stationName?: string }>;
        }).routes;
        if (routeLayer && Array.isArray(routes) && routes.length) {
          const items: RouteRenderItem[] = routes.map((r, i) => ({ ...r, stationName: r.stationName ?? `路线 ${i + 1}` }));
          const { bounds, summary } = renderRoutes(routeLayer, items);
          setPlanned(summary);
          if (bounds) map.flyToBounds(bounds, { padding: [60, 60] });
        }
      }
    });
    return () => {
      unsub();
    };
  }, []);

  // 地图空白处右键 → 新增点位菜单(marker 右键已 stopPropagation,不会到这)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    const onCtx = (e: any) => {
      const p = map.latLngToContainerPoint(e.latlng);
      setCreateMenu({ x: p.x, y: p.y, lng: e.latlng.lng, lat: e.latlng.lat });
      setRadial(null);
    };
    const close = () => setCreateMenu(null);
    map.on('contextmenu', onCtx);
    map.on('move zoom click', close);
    return () => {
      map.off('contextmenu', onCtx);
      map.off('move zoom click', close);
    };
  }, [mapInited]);

  // 地图拾取模式:点击地图 → 回填 draft 坐标(GCJ02,高德瓦片原生坐标系)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited || !pickMode || (!coordFix && !entityForm)) return;
    const onClick = (e: any) => {
      if (coordFix) setDraftCoord({ lng: e.latlng.lng, lat: e.latlng.lat });
      else if (entityForm) {
        setEntityForm((prev) =>
          prev ? { ...prev, values: { ...prev.values, lng: e.latlng.lng, lat: e.latlng.lat } } : prev,
        );
      }
      setPickMode(false);
    };
    map.on('click', onClick);
    map.getContainer().style.cursor = 'crosshair';
    return () => {
      map.off('click', onClick);
      map.getContainer().style.cursor = '';
    };
  }, [pickMode, coordFix, entityForm, mapInited]);

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
      {createMenu && (
        <RadialMenu
          x={createMenu.x}
          y={createMenu.y}
          onClose={() => setCreateMenu(null)}
          actions={[
            {
              key: 'add-water',
              icon: Droplets,
              label: '新增水源',
              color: '#38bdf8',
              onClick: () => openEntityCreate('water', createMenu.lng, createMenu.lat),
            },
            {
              key: 'add-unit',
              icon: Building2,
              label: '新增单位',
              color: '#fb7185',
              onClick: () => openEntityCreate('unit', createMenu.lng, createMenu.lat),
            },
            {
              key: 'add-building',
              icon: Building2,
              label: '新增建筑',
              color: '#60a5fa',
              onClick: () => openEntityCreate('building', createMenu.lng, createMenu.lat),
            },
          ]}
        />
      )}
      {entityForm && (
        <EntityFormPanel
          mode={entityForm.mode}
          values={entityForm.values}
          onChange={(values) => setEntityForm((prev) => (prev ? { ...prev, values } : prev))}
          keyUnits={keyUnits}
          candidates={geoCandidates}
          querying={geoQuerying}
          pickMode={pickMode}
          onQuery={queryAddress}
          onStartPick={() => setPickMode(true)}
          saving={entitySaving}
          error={entityError}
          onSave={saveEntity}
          onDelete={
            entityForm.mode === 'edit' && entityForm.id
              ? () => deleteEntity(entityForm.values.kind, entityForm.id!, entityForm.values.name)
              : undefined
          }
          onClose={() => {
            setEntityForm(null);
            setEntityError(null);
            setGeoCandidates([]);
            setPickMode(false);
          }}
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
