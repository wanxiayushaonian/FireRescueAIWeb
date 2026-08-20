'use client';
// 地图底座 hook:Leaflet 初始化(11 类图层组 + draw:created 绑定 + 清理)、zoom 同步、
// 高德底图切换(矢量/卫星,GCJ02)+ tileerror 连续失败降级。从 RealGisMap 抽取,行为不变。
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { DEFAULT_CENTER } from '@/lib/gis/map-constants';
import { saveMapView, takeMapView } from '@/lib/gis/map-view-store';

// 高德矢量瓦片(GCJ02,自带中文地名/道路注记;免 key,subdomains 1-4)
const VECTOR_URL = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
// 高德卫星影像(GCJ02;免 key)
const SAT_URL = 'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}';
// tileerror 连续失败阈值 → 触发占位降级
const TILE_ERR_THRESHOLD = 5;
export const DEFAULT_ZOOM = 11;

export interface GisLayers {
  boundary: L.LayerGroup | null;
  stations: L.LayerGroup | null;
  water: L.LayerGroup | null;
  highlight: L.LayerGroup | null;
  keyUnits: L.LayerGroup | null;
  incidents: L.LayerGroup | null;
  buildings: L.LayerGroup | null;
  regions: L.LayerGroup | null;
  route: L.LayerGroup | null;
  incidentResponse: L.LayerGroup | null;
  temp: L.LayerGroup | null;
}

export function useLeafletMap(
  rootRef: React.RefObject<HTMLDivElement | null>,
  onDrawCreated: (e: any) => void,
): {
  mapRef: React.MutableRefObject<L.Map | null>;
  layers: GisLayers;
  mapInited: boolean;
  zoom: number;
  baseMap: 'vector' | 'satellite';
  setBaseMap: React.Dispatch<React.SetStateAction<'vector' | 'satellite'>>;
  tilesFailed: boolean;
  viewportTick: number;
} {
  const mapRef = useRef<L.Map | null>(null);
  // 单个 ref 持有全部图层组:初始化 effect 里填充字段,对象本身永不替换 → 返回引用稳定
  const layersRef = useRef<GisLayers>({
    boundary: null,
    stations: null,
    water: null,
    highlight: null,
    keyUnits: null,
    incidents: null,
    buildings: null,
    regions: null,
    route: null,
    incidentResponse: null,
    temp: null,
  });
  const vectorLayerRef = useRef<L.TileLayer | null>(null);
  const satLayerRef = useRef<L.TileLayer | null>(null);
  const tileErrRef = useRef(0);

  const [mapInited, setMapInited] = useState(false);
  // 当前整数 zoom(zoomend 同步):单位/建筑在 <14 时切聚合气泡
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [baseMap, setBaseMap] = useState<'vector' | 'satellite'>('satellite');
  const [tilesFailed, setTilesFailed] = useState(false);
  const [viewportTick, setViewportTick] = useState(0);

  // 初始化 Leaflet 地图(仅客户端;SSR 时 rootRef 为空直接跳过)
  useEffect(() => {
    if (!rootRef.current || mapRef.current) return;
    // 跨模块视角记忆:上次 moveend 保存的视角优先,无则回退九江全景(切模块不再一律重置)
    const saved = takeMapView();
    const map = L.map(rootRef.current, {
      center: saved?.center ?? DEFAULT_CENTER,
      zoom: saved?.zoom ?? DEFAULT_ZOOM,
      zoomControl: false,
    });
    mapRef.current = map;
    // 禁用地图默认浏览器右键菜单(marker 用 contextmenu 唤出环形菜单)
    map.getContainer().addEventListener('contextmenu', (e) => e.preventDefault());
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const layers = layersRef.current;
    layers.boundary = L.layerGroup().addTo(map);
    layers.stations = L.layerGroup().addTo(map);
    layers.water = L.layerGroup().addTo(map);
    layers.highlight = L.layerGroup().addTo(map);
    layers.keyUnits = L.layerGroup().addTo(map);
    layers.incidents = L.layerGroup().addTo(map);
    layers.buildings = L.layerGroup().addTo(map);
    layers.regions = L.layerGroup().addTo(map);
    layers.route = L.layerGroup().addTo(map);
    layers.incidentResponse = L.layerGroup().addTo(map);
    layers.temp = L.layerGroup().addTo(map);
    map.on('draw:created', onDrawCreated);
    setMapInited(true);
    return () => {
      map.off('draw:created', onDrawCreated);
      map.remove();
      mapRef.current = null;
      setMapInited(false);
    };
  }, [onDrawCreated, rootRef]);

  // zoom 状态同步(单位/建筑聚合气泡模式切换用)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    const onZoom = () => setZoom(map.getZoom());
    map.on('zoomend', onZoom);
    // 初始化即同步:视角记忆恢复的缩放级别可能不是默认值,先同步再渲染聚合/逐点
    setZoom(map.getZoom());
    return () => {
      map.off('zoomend', onZoom);
    };
  }, [mapInited]);

  // 视口变化通知(moveend 300ms 防抖):单位/建筑渲染裁剪后需随平移重建
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapInited) return;
    let timer: number | undefined;
    const onMove = () => {
      // 视角记忆:settled 后(moveend)写入,供其他模块重挂时恢复
      saveMapView([map.getCenter().lat, map.getCenter().lng], map.getZoom());
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setViewportTick((t) => t + 1), 300);
    };
    map.on('moveend', onMove);
    return () => {
      window.clearTimeout(timer);
      map.off('moveend', onMove);
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

  return { mapRef, layers: layersRef.current, mapInited, zoom, baseMap, setBaseMap, tilesFailed, viewportTick };
}
