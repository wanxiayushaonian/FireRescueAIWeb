'use client';
// 态势总览 2D 地图编排者:状态声明 + hook 组装 + JSX 接线(圆环菜单/命令面板/面板群)。
// 结构:地图底座/底图/瓦片降级在 gis/hooks/use-leaflet-map;数据加载在 use-gis-data,图层显隐在 use-layer-visibility;
// 派遣/坐标修正/实体表单面板状态在 use-deploy-routes/use-coord-fix/use-entity-form;sceneLog 联动在 use-scene-bridge;
// popup/marker 图标/命令面板条目/各图层渲染函数体是纯函数,统一下沉 lib/gis/(node 可测)。
// 图层:高德底图(Leaflet,矢量/卫星可切换,GCJ02)+ 消防站(类型显隐经 map-layer-store)+ 水源(zoom 三级:
// <13 不加载 / 13-14 网格聚合气泡 / >=15 逐点)+ 市/区县边界 + 重点单位/建筑(zoom<14 客户端网格聚合)+ 重点区域。
// 坐标策略:全库坐标统一 GCJ02(高德),前端不做基准转换,库内坐标直接使用。
// 区域标注:leaflet-draw 画多边形 → createRegion 存 znya → 重新加载 L.polygon 高亮。
// SSR 注意:Leaflet 是浏览器库,本组件须客户端运行——地图初始化在 effect 中守卫
// (rootRef/mapRef),并由 App/CommandView 用 next/dynamic({ ssr:false })动态导入。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { fetchGeocode } from '@/api/geocode';
import { fetchRegions, createRegion } from '@/api/regions';
import { fetchBuildingAnalysis } from '@/api/dispatch';
import { MARKER_CLUSTER_MAX_ZOOM, shouldShowWater, shouldShowWaterPoints, dispatchTargetIconSvg } from '@/lib/map-icons';
import { decidePointRender } from '@/lib/gis/point-render';
import { renderStations, type RenderStation } from '@/lib/gis/render-stations';
import { renderWater } from '@/lib/gis/render-water';
import { renderKeyUnits } from '@/lib/gis/render-key-units';
import { renderIncidents } from '@/lib/gis/render-incidents';
import { renderKeyBuildings } from '@/lib/gis/render-key-buildings';
import { renderRegions } from '@/lib/gis/render-regions';
import { routeColor } from '@/lib/gis/route-render';
import { buildDistrictIndex, hitDistrict, type DistrictIndex } from '@/lib/gis/district-hit';
import { useDistrictStats } from '@/lib/district-stats-store';
import { buildActionItems, filterActionItems, filterUnits, buildAddressDefs } from '@/lib/gis/palette-items';
import { useMapLayerPrefs } from '@/lib/map-layer-store';
import type { Region } from '@/lib/region-mapper';
import { addSceneAction } from '@/mock/sceneLog';
import MapLayerControl from './MapLayerControl';
import CommandPalette, { type PaletteItem } from './gis/CommandPalette';
import CoordinateFixPanel, { type CoordFixTarget } from './gis/CoordinateFixPanel';
import ForceManagePanel, { type ForcePanelStation } from './gis/ForceManagePanel';
import RadialMenu, { type RadialAction } from './gis/RadialMenu';
import DeployPanel from './gis/DeployPanel';
import EntityFormPanel from './gis/EntityFormPanel';
import { useLeafletMap, DEFAULT_ZOOM } from './gis/hooks/use-leaflet-map';
import { DEFAULT_CENTER } from '@/lib/gis/map-constants';
import { useGisData } from './gis/hooks/use-gis-data';
import { useLayerVisibility } from './gis/hooks/use-layer-visibility';
import { useDeployRoutes } from './gis/hooks/use-deploy-routes';
import { useCoordFix } from './gis/hooks/use-coord-fix';
import { useEntityForm } from './gis/hooks/use-entity-form';
import { useSceneBridge } from './gis/hooks/use-scene-bridge';
import { useIncidentResponse } from './gis/hooks/use-incident-response';
import { formatEta, etaColor } from '@/lib/gis/eta-render';
import { type EntityKind } from '@/lib/entity-form';
import { Route, MapPin, Info, Trash2, Building2, Navigation, Users, Droplets, Rocket, Pencil, Siren, Boxes, X } from 'lucide-react';

// 本地市/区县边界 GeoJSON(DataV,GCJ02,离线)
const BOUNDARY_URL = '/geo/jiujiang-boundary.json';

// 边界交互(区县 hover 高亮/点击适窗)只在"能俯瞰九江全境"的低缩放级别生效
const BOUNDARY_INTERACT_MAX_ZOOM = 12;

export default function RealGisMap({ onEnterScene, onMapReady, initialLayers }: { onEnterScene?: (sceneId: string, buildingId?: string) => void; onMapReady?: (map: L.Map) => void; /** 各模块初始图层显隐(未传 = 默认只开边界/消防站;实战指挥等按需覆盖,如警情默认开) */ initialLayers?: Partial<{ stations: boolean; water: boolean; boundary: boolean; keyUnits: boolean; incidents: boolean; buildings: boolean; regions: boolean }> }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const boundaryGeoRef = useRef<L.GeoJSON | null>(null);
  // 九江市整体边界 bounds(「九江全景」按钮 flyToBounds 用)
  const cityBoundsRef = useRef<L.LatLngBounds | null>(null);
  // 区县路径表(adcode → polygon),选中区县高亮用
  const districtPathsRef = useRef<Map<string, L.Polygon>>(new Map());
  // 区县命中索引(任意比例尺鼠标坐标反查用) + 上次命中 adcode(仅变化时派发事件)
  const districtIndexRef = useRef<DistrictIndex[]>([]);
  const lastHitDistrictRef = useRef<string | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const incidentMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const keyUnitMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const buildingMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const waterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const drawRef = useRef<L.Draw.Polygon | null>(null);

  // 图层偏好(队站类型/水源区划显隐)来自共享 store,由执勤力量/水源面板维护
  const layerPrefs = useMapLayerPrefs();
  // 默认只启用边界、消防站;重点单位与重点建筑合并为一个开关(见 toggleKeyUnitLayers)
  // 模块可用 initialLayers 覆盖初始值(实战指挥:警情默认开——核心业务对象)
  const [showStations, setShowStations] = useState(initialLayers?.stations ?? true);
  const [showWater, setShowWater] = useState(initialLayers?.water ?? false);
  const [showBoundary, setShowBoundary] = useState(initialLayers?.boundary ?? true);
  const [showKeyUnits, setShowKeyUnits] = useState(initialLayers?.keyUnits ?? false);
  const [showIncidents, setShowIncidents] = useState(initialLayers?.incidents ?? false);
  const [showBuildings, setShowBuildings] = useState(initialLayers?.buildings ?? false);
  const [showRegions, setShowRegions] = useState(initialLayers?.regions ?? false);
  const [showIncidentResponse, setShowIncidentResponse] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [queryMarker, setQueryMarker] = useState<{ lng: number; lat: number; address: string } | null>(null);
  const [radial, setRadial] = useState<{ target: CoordFixTarget; x: number; y: number } | null>(null);
  const [forcePanel, setForcePanel] = useState<{ station: ForcePanelStation; lng: number; lat: number; x: number; y: number; maxX: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [paletteItems, setPaletteItems] = useState<PaletteItem[]>([]);
  const [paletteLoading, setPaletteLoading] = useState(false);

  // setRegions 来自 useGisData(在其后调用),onDrawCreated 须先定义 → 经 ref 间接引用(useState setter 引用稳定)
  const setRegionsRef = useRef<(rs: Region[]) => void>(() => {});

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
      .then(() => fetchRegions().then((rs) => setRegionsRef.current(rs)))
      .catch(() => {});
  }, []);

  // 地图初始化/底图切换/tileerror 降级/zoom 同步(见 gis/hooks/use-leaflet-map)
  const { mapRef, layers, mapInited, zoom, baseMap, setBaseMap, tilesFailed, viewportTick } = useLeafletMap(rootRef, onDrawCreated);

  // 地图就绪回调(实战指挥等模块把 Leaflet 实例交给叠加层做容器坐标投影)
  useEffect(() => {
    if (!mapInited || !mapRef.current) return;
    onMapReady?.(mapRef.current);
  }, [mapInited, onMapReady, mapRef]);

  // 数据加载(站/资源/水源视口/重点单位/警情/重点建筑/重点区域,见 gis/hooks/use-gis-data)
  const {
    stations, stationsRef,
    resources,
    water, waterRef,
    waterClusters,
    waterLoading,
    keyUnits, setKeyUnits,
    incidents,
    buildings, setBuildings,
    regions, setRegions,
    loadState,
    bumpWater,
  } = useGisData({ mapRef, mapInited, hiddenWaterDistricts: layerPrefs.hiddenWaterDistricts });
  setRegionsRef.current = setRegions;

  // 水源密度:zoom>=15 且视口过滤后点数超 POINT_CAP 时回落聚合(见水源渲染 effect)
  const [waterDense, setWaterDense] = useState(false);

  // 水源加载/空态轻量指示:加载中 > 密集聚合 > 空态
  const waterEmpty =
    !waterDense && !waterLoading && shouldShowWater(zoom) && water.length === 0 && waterClusters.length === 0;

  // 重点单位(含重点建筑)合并开关:同时切换两个图层显隐
  const toggleKeyUnitLayers = useCallback(() => {
    setShowKeyUnits((v) => !v);
    setShowBuildings((v) => !v);
  }, []);

  // 图层显隐(boundary/stations/water/incidents/keyUnits/buildings/regions/incidentResponse,见 gis/hooks/use-layer-visibility)
  useLayerVisibility(mapRef, layers, mapInited, {
    boundary: showBoundary,
    stations: showStations,
    water: showWater,
    incidents: showIncidents,
    keyUnits: showKeyUnits,
    buildings: showBuildings,
    regions: showRegions,
    incidentResponse: showIncidentResponse,
  });

  // 派遣面板 + 多站路线规划(见 gis/hooks/use-deploy-routes)
  const {
    deploy, openDeploy, closeDeploy,
    planned, plannedMeta, setPlanned,
    planning, planRoutes, aiDispatch, clearRoutes, highlightNearbyWater,
  } = useDeployRoutes({
    mapRef,
    routeLayer: layers.route,
    highlightLayer: layers.highlight,
    stationsRef,
    setRadial,
    stationsVisible: showStations,
  });

  // 灾情响应分析(重点建筑圆环菜单「响应分析」入口,见 gis/hooks/use-incident-response)
  // 提前到图层隐藏/目标 marker 之前,使派遣与响应两套路线视图共享同一套「干净视图」逻辑
  const { responseState, analyze, clearResponse } = useIncidentResponse({
    mapRef,
    responseLayer: layers.incidentResponse,
    routeLayer: layers.route, // 复用现有 route 图层(最近站路线,与 use-deploy-routes 同款)
    stationsRef,
    stationsVisible: showStations,
  });

  // 响应分析图层无独立小眼睛开关(图层控制块里没有该项),默认 false → 永远不在地图上,
  // 导致分层响应圈/ETA 染色环画了也看不见。这里随 responseState 自动开关:激活即上地图,清除即移除。
  useEffect(() => {
    setShowIncidentResponse(!!responseState);
  }, [responseState]);

  // 派遣/响应分析任一激活时,临时隐藏重点对象图层(重点单位+重点建筑)与水源图层,
  // 路线视图只保留 站点→目标 端点和路线,避免其他重点对象、水源点位遮挡;
  // 二者都关闭后恢复用户原本的显隐设置(并发场景下只要还有一个激活就保持隐藏)
  const prevDispatchLayersRef = useRef<{ keyUnits: boolean; buildings: boolean; water: boolean } | null>(null);
  const layersSuppressed = !!deploy || planned.length > 0 || !!responseState;
  useEffect(() => {
    if (layersSuppressed) {
      if (!prevDispatchLayersRef.current) {
        prevDispatchLayersRef.current = { keyUnits: showKeyUnits, buildings: showBuildings, water: showWater };
      }
      setShowKeyUnits(false);
      setShowBuildings(false);
      setShowWater(false);
    } else if (prevDispatchLayersRef.current) {
      setShowKeyUnits(prevDispatchLayersRef.current.keyUnits);
      setShowBuildings(prevDispatchLayersRef.current.buildings);
      setShowWater(prevDispatchLayersRef.current.water);
      prevDispatchLayersRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layersSuppressed]);

  // 路线目标端点(派遣 + 响应分析共用):重点对象图层被临时隐藏后,目标建筑/单位作为路线终点
  // 需要单独保留显示。用独立 marker 直接挂到 map(不进任何会被显隐开关/路线渲染清空的图层组),
  // 这样它只随分析开关出现/消失,规划路线时不会被 renderRoutes 的 clearLayers 清掉。
  // 派遣优先,否则取响应分析目标;target 引用在地图平移重算 anchor 时不变(spread 保留),故仅在切换目标时重建。
  const analysisTarget = deploy?.target ?? responseState?.target ?? null;
  const targetMarkerRef = useRef<L.Marker | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const target = analysisTarget;
    if (!map || !target) {
      targetMarkerRef.current?.remove();
      targetMarkerRef.current = null;
      return;
    }
    targetMarkerRef.current = L.marker([target.lat, target.lng], {
      icon: L.divIcon({ html: dispatchTargetIconSvg(), className: 'dispatch-target-icon', iconSize: [32, 32], iconAnchor: [16, 32] }),
      zIndexOffset: 1000,
      keyboard: false,
    })
      .bindTooltip(`目标:${target.name}`, { direction: 'top', className: 'gis-tip' })
      .addTo(map);
    return () => {
      targetMarkerRef.current?.remove();
      targetMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisTarget]);

  // 坐标修正/点位治理(见 gis/hooks/use-coord-fix)
  const {
    coordFix, setCoordFix,
    draftCoord, setDraftCoord,
    pickMode, setPickMode,
    geoCandidates, setGeoCandidates,
    geoQuerying, coordSaving, coordError,
    openCoordFix, closeCoordFix, queryAddress, saveCoord, batchGeocode,
  } = useCoordFix({ setKeyUnits, setBuildings });

  // 点位增删改表单 + 右键创建菜单(见 gis/hooks/use-entity-form)
  const {
    entityForm, setEntityForm,
    entitySaving, entityError, setEntityError,
    createMenu, setCreateMenu,
    openEntityCreate, openEntityEdit, saveEntity, deleteEntity,
  } = useEntityForm({
    keyUnits, setKeyUnits, setBuildings,
    waterRef, bumpWater,
    mapRef, mapInited,
    setGeoCandidates, setPickMode, setCoordFix, setRadial,
  });

  // 市/区县行政边界
  useEffect(() => {
    const layer = layers.boundary;
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
        // 构建区县命中索引:大比例尺下区划不可交互,鼠标坐标反查仍能激活
        districtIndexRef.current = buildDistrictIndex(data);
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
              // 注册区县路径表(选中高亮用)
              const adcode = String(f?.properties?.adcode ?? '');
              if (adcode) districtPathsRef.current.set(adcode, path);
              // 悬停/点击区县 → 面板联动加载该区县数据（派发 gis:select-district）
              // 同时同步 lastHitDistrictRef,与 mousemove 反查共享去重
              const selectDistrict = () => {
                if (adcode) lastHitDistrictRef.current = adcode;
                window.dispatchEvent(new CustomEvent('gis:select-district', { detail: { districtCode: adcode || null } }));
              };
              path.on('mouseover', () => {
                if (map.getZoom() > BOUNDARY_INTERACT_MAX_ZOOM) return;
                path.setStyle({
                  color: 'rgba(34, 211, 238, 1)',
                  weight: 3,
                  fillColor: 'rgba(34, 211, 238, 0.18)',
                  fillOpacity: 0.18,
                });
                selectDistrict();
              });
              path.on('mouseout', () => path.setStyle(styleFor(f)));
              path.on('click', () => {
                if (map.getZoom() > BOUNDARY_INTERACT_MAX_ZOOM) return;
                map.flyToBounds(path.getBounds(), { padding: [24, 24], maxZoom: 13 });
                selectDistrict();
              });
            } else if (level === 'city') {
              // 保存九江整体边界(「九江全景」按钮 flyToBounds 用)
              cityBoundsRef.current = path.getBounds();
              // 点击市级外框 → 清除区县过滤（面板恢复全部数据）
              path.on('click', () => {
                map.flyToBounds(path.getBounds(), { padding: [24, 24] });
                window.dispatchEvent(new CustomEvent('gis:select-district', { detail: { districtCode: null } }));
              });
            }
          },
        }).addTo(layer);
        boundaryGeoRef.current = geo;
        onZoom();
      })
      .catch(() => {});

    map.on('zoomend', onZoom);

    // 任意比例尺鼠标坐标反查区县(大比例尺下区划不可交互,仍能激活面板联动):
    // 命中区县且与上次不同 → 派发 gis:select-district;移出全部区县 → 不派发(保留当前过滤,点市级外框/× 清除)
    let lastMouseTs = 0;
    const onMouseMove = (e: L.LeafletMouseEvent) => {
      // 节流 ~100ms,避免高频 mousemove 反复做射线判断
      const now = Date.now();
      if (now - lastMouseTs < 100) return;
      lastMouseTs = now;
      const hit = hitDistrict(e.latlng.lng, e.latlng.lat, districtIndexRef.current);
      const code = hit?.adcode ?? null;
      if (code && code !== lastHitDistrictRef.current) {
        lastHitDistrictRef.current = code;
        window.dispatchEvent(new CustomEvent('gis:select-district', { detail: { districtCode: code } }));
      }
    };
    map.on('mousemove', onMouseMove);

    // 选中区县高亮:监听 gis:select-district,高亮当前区县(描边加粗 + 填充加深),清除其他
    const HIGHLIGHT_STYLE = {
      color: 'rgba(34, 211, 238, 1)',
      weight: 3,
      fillColor: 'rgba(34, 211, 238, 0.22)',
      fillOpacity: 0.22,
    };
    const onSelectDistrict = (e: Event) => {
      const code = (e as CustomEvent<{ districtCode: string | null }>).detail?.districtCode ?? null;
      districtPathsRef.current.forEach((p, adcode) => {
        // L.geoJSON 创建的 layer 自带原始 feature(styleFor 恢复样式用)
        const f = (p as L.Path & { feature?: any }).feature;
        p.setStyle(code === adcode ? HIGHLIGHT_STYLE : styleFor(f));
      });
    };
    window.addEventListener('gis:select-district', onSelectDistrict);

    return () => {
      alive = false;
      map.off('zoomend', onZoom);
      map.off('mousemove', onMouseMove);
      window.removeEventListener('gis:select-district', onSelectDistrict);
      boundaryGeoRef.current = null;
      districtIndexRef.current = [];
      districtPathsRef.current.clear();
      lastHitDistrictRef.current = null;
    };
  }, [mapInited]);

  // 各消防站真实人员数(从 fire_force_items 聚合,popup 动态显示)
  const personnelCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of resources) if (r.category === '人员') m.set(r.stationId, (m.get(r.stationId) ?? 0) + 1);
    return m;
  }, [resources]);

  // 各消防站真实力量(人员/车辆/装备,从 fire_force_items 聚合);派遣面板选站汇总用,
  // 缺失时回退到 station 字段。与 personnelCounts 同源,后者只取人员供 popup。
  const stationForce = useMemo(() => {
    const m = new Map<string, { personnel: number; vehicles: number; equipment: number }>();
    for (const r of resources) {
      const entry = m.get(r.stationId) ?? { personnel: 0, vehicles: 0, equipment: 0 };
      if (r.category === '人员') entry.personnel++;
      else if (r.category === '车辆') entry.vehicles++;
      else if (r.category === '装备') entry.equipment++;
      m.set(r.stationId, entry);
    }
    return m;
  }, [resources]);

  const handleStationClick = useCallback((s: RenderStation) => {
    addSceneAction({
      action: 'flyTo',
      target: s.name,
      params: { lng: s.lng, lat: s.lat },
      source: '面板',
    });
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
      // 重点单位 / 建筑:路线 / 修正 / 详情(建筑额外:响应分析 + 进入3D)
      const actions: RadialAction[] = [
        ...(t.kind === 'building'
          ? [
              {
                key: 'response',
                icon: Siren,
                label: '响应分析',
                color: '#ef4444',
                onClick: () => {
                  closeDeploy();
                  analyze({ name: t.name, lng: t.lng, lat: t.lat });
                  setRadial(null);
                },
              },
            ]
          : []),
        {
          key: 'route',
          icon: Route,
          label: '路线',
          color: '#22d3ee',
          onClick: () => {
            clearResponse();
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
      // 重点建筑且有建模场景(scene_id):进入3D → 通知 App 切 RealSceneView(prop callback)
      if (t.kind === 'building' && t.sceneId && onEnterScene) {
        actions.push({
          key: 'enter3d',
          icon: Boxes,
          label: '进入3D',
          color: '#22d3ee',
          onClick: () => {
            onEnterScene(t.sceneId!, t.id);
            setRadial(null);
          },
        });
      }
      return actions;
    },
    [openDeploy, closeDeploy, clearResponse, openCoordFix, highlightNearbyWater, openEntityEdit, deleteEntity, analyze, onEnterScene],
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

    // 单位跳转(本地过滤):图层开关上「重点对象」= 单位+建筑一体,定位前两者一起开
    const unitItems: PaletteItem[] = filterUnits(keyUnits, q).map((u) => ({
      id: `unit-${u.id}`,
      title: u.name,
      subtitle: `${u.unitType}${u.district ? ` · ${u.district}` : ''}`,
      icon: Building2,
      group: '单位',
      run: () => {
        setShowKeyUnits(true);
        setShowBuildings(true);
        const map = mapRef.current;
        if (map) map.flyTo([u.lat, u.lng], Math.max(map.getZoom(), 16));
        close();
      },
    }));

    // 重点建筑跳转:同上,「重点对象」= 单位+建筑一体,两者一起开
    const buildingItems: PaletteItem[] = filterUnits(buildings, q).map((b) => ({
      id: `building-${b.id}`,
      title: b.name,
      subtitle: '重点建筑',
      icon: Building2,
      group: '建筑',
      run: () => {
        setShowKeyUnits(true);
        setShowBuildings(true);
        const map = mapRef.current;
        if (map) map.flyTo([b.lat, b.lng], Math.max(map.getZoom(), 16));
        close();
      },
    }));

    // 水源跳转:确保水源图层打开,且缩放到 ≥15(水源逐点渲染层级,否则只显聚合气泡)
    const waterItems: PaletteItem[] = filterUnits(water, q).map((w) => ({
      id: `water-${w.id}`,
      title: w.name,
      subtitle: `水源 · ${w.type}${w.district ? ` · ${w.district}` : ''}`,
      icon: Droplets,
      group: '水源',
      run: () => {
        setShowWater(true);
        const map = mapRef.current;
        if (map && w.lat != null && w.lng != null) map.flyTo([w.lat, w.lng], Math.max(map.getZoom(), 15));
        close();
      },
    }));

    setPaletteItems([...filteredActions, ...unitItems, ...buildingItems, ...waterItems]);

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
          setPaletteItems([...filteredActions, ...unitItems, ...buildingItems, ...waterItems, ...addrItems]);
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
  }, [paletteOpen, paletteQuery, baseMap, planned, keyUnits, buildings, water, clearRoutes, batchGeocode, drawMode, startDraw, cancelDraw]);

  // 消防站(渲染函数体在 lib/gis/render-stations)
  useEffect(() => {
    const layer = layers.stations;
    if (!layer || !mapInited) return;
    markersRef.current = renderStations(layer, stations, {
      visibleTypes: layerPrefs.visibleStationTypes,
      personnelCounts,
      onStationClick: handleStationClick,
      onRadial: openRadial,
    });
  }, [stations, handleStationClick, mapInited, openRadial, personnelCounts, layerPrefs.visibleStationTypes]);

  // 水源渲染:>=15 水滴图标逐点(带 popup,按区划开关过滤);13-14 聚合气泡(点击气泡放大进点位级)。渲染函数体在 lib/gis/render-water
  useEffect(() => {
    const layer = layers.water;
    const map = mapRef.current;
    if (!layer || !map || !mapInited) return;
    // 水源数据已是 bbox 视口,直接用区划过滤后计数判定密集度(不额外 pad)
    const dense =
      shouldShowWaterPoints(map.getZoom()) &&
      decidePointRender(water.filter((w) => !layerPrefs.hiddenWaterDistricts.includes(w.districtCode)).length) === 'cluster';
    setWaterDense(dense);
    waterMarkersRef.current = renderWater(layer, water, waterClusters, {
      map,
      zoom: map.getZoom(),
      hiddenDistricts: layerPrefs.hiddenWaterDistricts,
      prevMarkers: waterMarkersRef.current,
      onWaterClick: (w) =>
        addSceneAction({ action: 'flyTo', target: w.name, params: { lng: w.lng, lat: w.lat }, source: '面板' }),
      onRadial: openRadial,
    });
  }, [water, waterClusters, mapInited, layerPrefs.hiddenWaterDistricts, openRadial]);

  // 重点单位:zoom<14 网格聚合气泡(有警情的单位始终逐点,警情态不进气泡);>=14 视口裁剪逐点(超限回落聚合,popup 保活)。渲染函数体在 lib/gis/render-key-units
  // unitClusterMode:>=14 恒定 'points'(缩放不再重建千级 marker);<14 每级重建气泡(格宽随 zoom 变);viewportTick 驱动平移重建
  const unitClusterMode: string | number = zoom >= MARKER_CLUSTER_MAX_ZOOM ? 'points' : zoom;
  // 重点建筑 popup 打开时,异步取周边响应摘要(主力站/最近 ETA/水源),注入 popup 末尾。失败静默。
  const onBuildingPopupAnalyze = useCallback(
    async (b: { lng: number; lat: number }) => {
      try {
        return await fetchBuildingAnalysis(b.lng, b.lat);
      } catch {
        return null;
      }
    },
    [],
  );
  // 按面板小眼睛过滤重点单位类型
  const visibleKeyUnits = useMemo(() => {
    if (layerPrefs.hiddenKeyUnitTypes.length === 0) return keyUnits;
    return keyUnits.filter((u) => !layerPrefs.hiddenKeyUnitTypes.includes(u.unitType));
  }, [keyUnits, layerPrefs.hiddenKeyUnitTypes]);
  useEffect(() => {
    const layer = layers.keyUnits;
    const map = mapRef.current;
    if (!layer || !map || !mapInited) return;
    const b = map.getBounds().pad(0.1); // 外扩避免边缘点位闪进闪出
    const bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
    keyUnitMarkersRef.current = renderKeyUnits(layer, visibleKeyUnits, incidents, zoom, {
      map,
      bounds,
      prevMarkers: keyUnitMarkersRef.current,
      onRadial: openRadial,
      onDeploy: openDeploy,
    });
  }, [visibleKeyUnits, mapInited, openRadial, incidents, openDeploy, unitClusterMode, viewportTick]);

  // 警情/事件(红色脉冲点位 + level 数字;GCJ02 直显)。渲染函数体在 lib/gis/render-incidents
  useEffect(() => {
    const layer = layers.incidents;
    if (!layer || !mapInited) return;
    incidentMarkersRef.current = renderIncidents(layer, incidents, { onDeploy: openDeploy, onRadial: openRadial });
  }, [incidents, mapInited, openDeploy, openRadial]);

  // 重点建筑:zoom<14 网格聚合气泡;>=14 视口裁剪逐点(超限回落聚合,popup 保活,与重点单位同套机制)。渲染函数体在 lib/gis/render-key-buildings
  useEffect(() => {
    const layer = layers.buildings;
    const map = mapRef.current;
    if (!layer || !map || !mapInited) return;
    const b = map.getBounds().pad(0.1); // 外扩避免边缘点位闪进闪出
    const bounds = { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
    buildingMarkersRef.current = renderKeyBuildings(layer, buildings, keyUnits, zoom, {
      map,
      bounds,
      prevMarkers: buildingMarkersRef.current,
      onRadial: openRadial,
      onPopupAnalyze: onBuildingPopupAnalyze,
    });
  }, [buildings, keyUnits, mapInited, openRadial, onBuildingPopupAnalyze, unitClusterMode, viewportTick]);

  // 重点区域图层:多边形高亮 + hover 名称;点击 flyTo 区域中心 zoom 16。渲染函数体在 lib/gis/render-regions
  useEffect(() => {
    const layer = layers.regions;
    const map = mapRef.current;
    if (!layer || !map || !mapInited) return;
    renderRegions(layer, regions, { map });
  }, [regions, mapInited]);

  // agent gis_fly_to 携带 layer → 自动打开对应未开图层(只开不关;units 与面板合并开关一致,联动建筑)
  const handleFlyToLayer = useCallback((layer: string) => {
    if (layer === 'stations') setShowStations(true);
    else if (layer === 'water') setShowWater(true);
    else if (layer === 'units') { setShowKeyUnits(true); setShowBuildings(true); }
    else if (layer === 'buildings') setShowBuildings(true);
    else if (layer === 'incidents') setShowIncidents(true);
  }, []);

  // sceneLog 联动(flyTo/addMarker/resetView/showRoute,见 gis/hooks/use-scene-bridge)
  useSceneBridge({
    mapRef,
    routeLayer: layers.route,
    defaultCenter: DEFAULT_CENTER,
    defaultZoom: DEFAULT_ZOOM,
    stationsRef,
    waterRef,
    stationMarkers: markersRef,
    waterMarkers: waterMarkersRef,
    keyUnitMarkers: keyUnitMarkersRef,
    setPlanned,
    onFlyToLayer: handleFlyToLayer,
    onAnalyzeResponse: analyze,
  });

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
    const layer = layers.temp;
    if (!layer) return;
    layer.clearLayers();
    if (draftCoord && coordFix) {
      L.circleMarker([draftCoord.lat, draftCoord.lng], {
        radius: 7, color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 0.85, weight: 2,
      })
        .bindTooltip('新坐标(待保存)', { direction: 'top', className: 'gis-tip' })
        .addTo(layer);
    }
    if (queryMarker) {
      L.circleMarker([queryMarker.lat, queryMarker.lng], {
        radius: 7, color: '#22d3ee', fillColor: '#22d3ee', fillOpacity: 0.85, weight: 2,
      })
        .bindTooltip(queryMarker.address, { direction: 'top', className: 'gis-tip' })
        .addTo(layer);
    }
  }, [draftCoord, coordFix, queryMarker]);

  // 当前区县统计快照(由 ResourceOverviewPanel 写入共享 store):顶部信息条展示
  const districtStats = useDistrictStats();

  return (
    <div ref={rootRef} className="relative isolate h-full w-full overflow-hidden bg-bg-grid">
      {/* 图层控制条(顶部居中;各模块一致——2026-08-18 起实战指挥复用全量 chrome) */}
      <MapLayerControl
        baseMap={baseMap}
        onBaseMapChange={setBaseMap}
        showStations={showStations}
        onToggleStations={() => setShowStations((v) => !v)}
        showWater={showWater}
        onToggleWater={() => setShowWater((v) => !v)}
        showBoundary={showBoundary}
        onToggleBoundary={() => setShowBoundary((v) => !v)}
        showKeyUnits={showKeyUnits || showBuildings}
        onToggleKeyUnits={toggleKeyUnitLayers}
        showIncidents={showIncidents}
        onToggleIncidents={() => setShowIncidents((v) => !v)}
        showRegions={showRegions}
        onToggleRegions={() => setShowRegions((v) => !v)}
        onResetView={() => {
          // 返回整个九江市比例:flyToBounds 适配整体边界 + 清除区县过滤
          const map = mapRef.current;
          if (map && cityBoundsRef.current) {
            map.flyToBounds(cityBoundsRef.current, { padding: [24, 24] });
          } else {
            addSceneAction({ action: 'resetView', target: '返回九江市全景', source: '面板' });
          }
          window.dispatchEvent(new CustomEvent('gis:select-district', { detail: { districtCode: null } }));
        }}
      />
      {/* 当前区县信息条:区县名 + 6 项统计快照(随鼠标移动实时变化)。
          居中底部:避开左侧 dock 的资源总览面板(500px 宽),与顶部图层控制对称 */}
      <div className="absolute bottom-3 left-1/2 z-[450] flex -translate-x-1/2 items-center gap-3 rounded-lg border border-line bg-bg-panel/90 px-3 py-2 shadow-lg backdrop-blur">
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-cyan" />
          <span className="whitespace-nowrap text-[13px] font-bold text-cyan">{districtStats.districtName}</span>
        </div>
        <span className="h-4 w-px bg-line/60" />
        <div className="flex items-center gap-3 font-num text-[12px] text-text-2">
          <span>队站 <b className="text-text-1">{districtStats.stations.toLocaleString()}</b></span>
          <span>人员 <b className="text-text-1">{districtStats.personnel.toLocaleString()}</b></span>
          <span>车辆 <b className="text-text-1">{districtStats.vehicles.toLocaleString()}</b></span>
          <span>装备 <b className="text-text-1">{districtStats.equipment.toLocaleString()}</b></span>
          <span>水源 <b className="text-text-1">{districtStats.water.toLocaleString()}</b></span>
          <span>单位 <b className="text-text-1">{districtStats.keyUnits.toLocaleString()}</b></span>
        </div>
      </div>
      {/* 到场路线图例:planned 时显示,颜色↔站名↔距离/ETA 对应,最快路线高亮。
          顶部状态条:路线来源(AI 智能派遣/手动选站)+ 规划时间 + 总览(站数/最快 ETA) */}
      {planned.length > 0 && plannedMeta && (() => {
        const fastest = Math.min(...planned.map((x) => x.duration));
        const slowest = Math.max(...planned.map((x) => x.duration));
        const totalDistance = planned.reduce((sum, p) => sum + p.distance, 0);
        const totalTrafficLights = planned.reduce((sum, p) => sum + p.trafficLights, 0);
        const plannedTime = plannedMeta.plannedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        return (
          <div className="absolute left-1/2 top-[100px] z-[500] w-72 -translate-x-1/2 rounded-lg border border-cyan/40 bg-bg-panel/95 shadow-xl backdrop-blur">
            {/* 状态条:来源徽标 + 规划时间 + 关闭按钮 */}
            <div className="flex items-center gap-2 border-b border-cyan/20 px-3 py-1.5">
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                plannedMeta.source === 'ai'
                  ? 'bg-violet/20 text-violet'
                  : 'bg-blue/20 text-blue'
              }`}>
                {plannedMeta.source === 'ai' ? 'AI 派遣' : '手动选站'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-text-3">
                {plannedTime}
              </span>
              <button
                onClick={clearRoutes}
                className="shrink-0 rounded p-0.5 text-text-3 transition hover:bg-red/20 hover:text-red"
                title="清除路线"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* 总览信息 */}
            <div className="grid grid-cols-3 gap-1 border-b border-line/40 px-3 py-2 text-center">
              <div>
                <div className="text-[10px] text-text-3">到场时间</div>
                <div className="font-num text-[13px] font-bold text-cyan">
                  {Math.round(fastest / 60)}-{Math.round(slowest / 60)}分
                </div>
              </div>
              <div>
                <div className="text-[10px] text-text-3">总距离</div>
                <div className="font-num text-[13px] font-bold text-text-1">
                  {(totalDistance / 1000).toFixed(1)}km
                </div>
              </div>
              <div>
                <div className="text-[10px] text-text-3">红绿灯</div>
                <div className="font-num text-[13px] font-bold text-text-1">
                  {totalTrafficLights}个
                </div>
              </div>
            </div>
            {/* 路线列表 */}
            <div className="max-h-60 overflow-y-auto p-3 [scrollbar-width:thin]">
              <div className="mb-2 flex items-center gap-1.5">
                <Route className="h-4 w-4 text-cyan" />
                <span className="text-[13px] font-bold text-text-1">到场路线</span>
                <span className="ml-auto text-[11px] text-text-3">{planned.length} 站</span>
              </div>
              <div className="space-y-1">
                {planned.map((p, idx) => {
                  const color = routeColor(idx);
                  const isFastest = p.duration === fastest;
                  return (
                    <div key={p.stationId} className={`flex items-center gap-2 rounded px-1.5 py-1 text-[12px] ${isFastest ? 'bg-cyan/10 ring-1 ring-cyan/30' : ''}`}>
                      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 0 2px ${color}55` }} />
                      <span className="min-w-0 flex-1 truncate text-text-1">{p.stationName}</span>
                      <span className="shrink-0 font-mono text-[11px] text-text-3">{(p.distance / 1000).toFixed(1)}km</span>
                      <span className={`shrink-0 font-mono text-[11px] ${isFastest ? 'font-bold text-cyan' : 'text-text-2'}`}>{Math.round(p.duration / 60)}分</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
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
          key={forcePanel.station.id}
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
      {responseState && (
        <div
          className="absolute z-[500] w-64 rounded-lg border border-cyan/40 bg-bg-panel/95 p-3 shadow-xl backdrop-blur"
          style={{
            left: Math.min(Math.max(responseState.anchor.x, 180), Math.max(responseState.anchor.maxX - 180, 180)),
            top: Math.max(responseState.anchor.y - 56, 8),
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-text-1 text-sm font-semibold">响应分析 · {responseState.target.name}</span>
            <button onClick={clearResponse} className="text-text-3 hover:text-cyan">×</button>
          </div>
          {responseState.loading && <div className="text-text-2 text-xs">分析中…</div>}
          {responseState.error && <div className="text-red text-xs">{responseState.error}</div>}
          {!responseState.loading && !responseState.error && (
            <>
              <ul className="mt-2 space-y-1">
                {responseState.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{
                        background: { green: '#34d399', yellow: '#fbbf24', red: '#ef4444' }[
                          etaColor(it.etaSec, responseState.targetMin)
                        ],
                      }}
                    />
                    <span className="text-text-1 flex-1 truncate">{it.name}</span>
                    <span className="text-text-2">{formatEta(it.etaSec)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center gap-2 border-t border-line/50 pt-1.5 text-[10px] text-text-3">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: '#34d399' }} />
                ≤{responseState.targetMin}分
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: '#fbbf24' }} />
                ≤{responseState.targetMin * 2}分
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: '#ef4444' }} />
                更慢
              </div>
            </>
          )}
        </div>
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
          emptyHint={deploy.emptyHint}
          forceCounts={stationForce}
          onPlan={(ids) => planRoutes(ids)}
          onAiDispatch={aiDispatch}
          onClear={clearRoutes}
          onClose={closeDeploy}
        />
      )}
      {tilesFailed && (
        <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded border border-line bg-bg-panel/90 px-3 py-1.5 text-[12px] text-amber-300">
          底图瓦片加载失败(高德不可达)——显示占位底图
        </div>
      )}
      {showWater && (waterLoading || waterDense || waterEmpty) && (
        <div className="absolute bottom-3 right-14 z-[500] flex items-center rounded border border-line bg-bg-panel/90 px-2.5 py-1 text-[11px] text-text-2">
          {waterLoading ? (
            <>
              <span className="gis-loading-dot" />
              水源加载中…
            </>
          ) : waterDense ? (
            '点位密集,已聚合显示'
          ) : (
            '当前区域无水源数据'
          )}
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
                  {s.name} {s.lng == null ? '无坐标' : `${s.lng.toFixed(4)}, ${s.lat?.toFixed(4) ?? '?'}`}
                </div>
              ))}
              {water.map((w) => (
                <div key={w.id} className="whitespace-nowrap text-text-3">
                  💧 {w.name} {w.lng == null ? '无坐标' : `${w.lng.toFixed(4)}, ${w.lat?.toFixed(4) ?? '?'}`}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
