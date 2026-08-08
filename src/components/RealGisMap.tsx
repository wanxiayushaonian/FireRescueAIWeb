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
import type { Station } from '@/mock/types';
import { fetchGeocode } from '@/api/geocode';
import type { Incident } from '@/lib/incident-mapper';
import { fetchRegions, createRegion } from '@/api/regions';
import { stationIconSvg, waterIconSvg, waterClusterSvg, clusterBubbleSvg, keyBuildingIconSvg, shouldShowWater, shouldShowWaterPoints, waterClusterCell, MARKER_CLUSTER_MAX_ZOOM } from '@/lib/map-icons';
import { HIGH_RISK_PATTERN, keyUnitMarkerHtml, incidentMarkerHtml } from '@/lib/gis/marker-html';
import { gridCluster } from '@/lib/grid-cluster';
import { popupForKeyUnit, popupForKeyBuilding, popupForStation, popupForWater, popupForIncident, popupIncidentSuffix } from '@/lib/gis/popup-html';
import { buildActionItems, filterActionItems, filterUnits, buildAddressDefs } from '@/lib/gis/palette-items';
import { useMapLayerPrefs } from '@/lib/map-layer-store';
import type { KeyUnit } from '@/lib/key-unit-mapper';
import type { KeyBuilding } from '@/lib/key-building-mapper';
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
import { useGisData } from './gis/hooks/use-gis-data';
import { useLayerVisibility } from './gis/hooks/use-layer-visibility';
import { useDeployRoutes } from './gis/hooks/use-deploy-routes';
import { useCoordFix } from './gis/hooks/use-coord-fix';
import { useEntityForm } from './gis/hooks/use-entity-form';
import { useSceneBridge } from './gis/hooks/use-scene-bridge';
import { type EntityKind } from '@/lib/entity-form';
import { Route, MapPin, Info, Trash2, Building2, Navigation, Users, Droplets, Rocket, Pencil } from 'lucide-react';

// 本地市/区县边界 GeoJSON(DataV,GCJ02,离线)
const BOUNDARY_URL = '/geo/jiujiang-boundary.json';

// 九江市中心(九江市消防救援支队附近,GCJ02);use-leaflet-map 内保留同名副本用于地图初始化,两处须保持一致
const DEFAULT_CENTER: [number, number] = [29.66734, 115.96498];
// 边界交互(区县 hover 高亮/点击适窗)只在"能俯瞰九江全境"的低缩放级别生效
const BOUNDARY_INTERACT_MAX_ZOOM = 12;

export default function RealGisMap() {
  const rootRef = useRef<HTMLDivElement>(null);
  const boundaryGeoRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const incidentMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const keyUnitMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const buildingMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const waterMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const drawRef = useRef<L.Draw.Polygon | null>(null);

  // 图层偏好(队站类型/水源区划显隐)来自共享 store,由执勤力量/水源面板维护
  const layerPrefs = useMapLayerPrefs();
  const [showStations, setShowStations] = useState(true);
  const [showWater, setShowWater] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showKeyUnits, setShowKeyUnits] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRegions, setShowRegions] = useState(true);
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
  const { mapRef, layers, mapInited, zoom, baseMap, setBaseMap, tilesFailed } = useLeafletMap(rootRef, onDrawCreated);

  // 数据加载(站/资源/水源视口/重点单位/警情/重点建筑/重点区域,见 gis/hooks/use-gis-data)
  const {
    stations, stationsRef,
    resources,
    water, waterRef,
    waterClusters,
    keyUnits, setKeyUnits,
    incidents,
    buildings, setBuildings,
    regions, setRegions,
    loadState,
    bumpWater,
  } = useGisData({ mapRef, mapInited, hiddenWaterDistricts: layerPrefs.hiddenWaterDistricts });
  setRegionsRef.current = setRegions;

  // 图层显隐(boundary/stations/water/incidents/keyUnits/buildings/regions,见 gis/hooks/use-layer-visibility)
  useLayerVisibility(mapRef, layers, mapInited, {
    boundary: showBoundary,
    stations: showStations,
    water: showWater,
    incidents: showIncidents,
    keyUnits: showKeyUnits,
    buildings: showBuildings,
    regions: showRegions,
  });

  // 派遣面板 + 多站路线规划(见 gis/hooks/use-deploy-routes)
  const {
    deploy, openDeploy, closeDeploy,
    planned, setPlanned,
    planning, planRoutes, clearRoutes, highlightNearbyWater,
  } = useDeployRoutes({
    mapRef,
    routeLayer: layers.route,
    highlightLayer: layers.highlight,
    stationsRef,
    setRadial,
  });

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
    const layer = layers.stations;
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
    const layer = layers.water;
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
    const layer = layers.keyUnits;
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
    const layer = layers.incidents;
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
    const layer = layers.buildings;
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
    const layer = layers.regions;
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
    setPlanned,
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
          onClose={closeDeploy}
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
