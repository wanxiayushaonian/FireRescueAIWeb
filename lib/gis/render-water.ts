// lib/gis/render-water.ts
// 水源图层渲染器:从 RealGisMap 水源 effect 逐字搬出。三级:zoom<13 不渲染 / 13-14 聚合气泡(点击放大进点位级)/ >=15 水滴逐点。
// popup 恢复:重建前从 prevMarkers 找 isPopupOpen 的 id,重建后在新 marker 实例上 openPopup(clearLayers 会销毁 popup)。
// 与 lib/gis/route-render 同策略:import type + 函数内 require('leaflet')(vitest node 环境约束)。
import type L from 'leaflet';
import { waterIconSvg, waterClusterSvg, waterClusterCell, shouldShowWater, shouldShowWaterPoints, WATER_POINTS_ZOOM } from '../map-icons';
import { gridCluster } from '../grid-cluster';
import { POINT_CAP, decidePointRender } from './point-render';
import { popupForWater } from './popup-html';
import type { RadialTarget } from './radial-target';

/** 水源结构类型(lib 不得 import src/mock/types;字段为渲染所需子集)。 */
export interface RenderWaterSource {
  id: string;
  name: string;
  type: string;
  /** 坐标缺失为 null,渲染跳过 */
  lng: number | null;
  lat: number | null;
  address: string;
  district: string;
  districtCode: string;
}

/** 水源聚合气泡(结构类型,与 src/api/water 的 WaterCluster 同构;lib 不得 import src)。 */
export interface RenderWaterCluster {
  lng: number | null;
  lat: number | null;
  count: number;
}

export interface RenderWaterOpts {
  map: L.Map; // 聚合气泡点击 flyTo 用(渲染器内部不改 map 其他状态)
  zoom: number;
  hiddenDistricts: string[]; // 区划显隐(水源面板经 map-layer-store 控制)
  prevMarkers: Map<string, L.Marker>; // 上一帧注册表,用于 popup openId 恢复
  cap?: number; // 逐点上限(默认 POINT_CAP),超过则回落客户端聚合
  onWaterClick: (w: RenderWaterSource) => void;
  onRadial: (target: RadialTarget, latlng: [number, number]) => void;
}

/** 渲染水源图层(先 clearLayers),返回 id → marker 注册表(仅逐点模式有内容;调用方接管 waterMarkersRef)。 */
export function renderWater(
  layer: L.LayerGroup,
  water: RenderWaterSource[],
  clusters: RenderWaterCluster[],
  opts: RenderWaterOpts,
): Map<string, L.Marker> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  // 记录当前打开的 popup,重建后在新 marker 实例上恢复(clearLayers 会销毁 popup)
  const openId = [...opts.prevMarkers.entries()].find(([, m]) => m.isPopupOpen())?.[0];
  layer.clearLayers();
  const markers = new Map<string, L.Marker>();
  // 聚合气泡渲染:13-14 级服务端 clusters / >=15 超限回落客户端聚合共用(气泡 html/tooltip/点击 flyTo 原样)
  const renderClusterBubbles = (items: RenderWaterCluster[]) => {
    for (const c of items) {
      if (c.lng == null || c.lat == null) continue; // 坐标缺失 → 跳过
      const lng: number = c.lng; // 显式窄化(闭包传参场景 TS 不收窄)
      const lat: number = c.lat;
      const { html, size } = waterClusterSvg(c.count);
      L.marker([lat, lng], {
        icon: L.divIcon({
          html,
          className: 'map-icon-water-cluster',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      })
      .bindTooltip(`${c.count} 个水源,点击直达点位`, { direction: 'top', className: 'gis-tip' })
        .on('click', () => opts.map.flyTo([lat, lng], WATER_POINTS_ZOOM))
        .addTo(layer);
    }
  };
  if (shouldShowWaterPoints(opts.zoom)) {
    const visible = water.filter((w) => !opts.hiddenDistricts.includes(w.districtCode));
    if (decidePointRender(visible.length, opts.cap ?? POINT_CAP) === 'points') {
      for (const w of visible) {
        if (w.lng == null || w.lat == null) continue; // 坐标缺失 → 跳过
        const lng: number = w.lng; // 显式窄化(闭包传参场景 TS 不收窄)
        const lat: number = w.lat;
        const src: RenderWaterSource & { lng: number; lat: number } = { ...w, lng, lat };
        const m = L.marker([lat, lng], {
          icon: L.divIcon({
            html: waterIconSvg(w.type),
            className: 'map-icon-water',
            iconSize: [18, 18],
            iconAnchor: [9, 18],
            popupAnchor: [0, -18],
          }),
        })
          .bindPopup(popupForWater(src), { className: 'gis-popup' })
          .on('click', () => opts.onWaterClick(src))
          .on('contextmenu', (e) => {
            L.DomEvent.stopPropagation(e.originalEvent as Event);
            opts.onRadial({ kind: 'water', id: w.id, name: w.name, lng, lat }, [lat, lng]);
          });
        m.on('popupopen', () => m.getElement()?.classList.add('gis-marker-active'));
        m.on('popupclose', () => m.getElement()?.classList.remove('gis-marker-active'));
        layer.addLayer(m);
        markers.set(w.id, m);
      }
    } else {
      // 超限回落:客户端网格聚合(与 13-14 级同款气泡,点击放大复用)
      renderClusterBubbles(gridCluster(visible, (w) => w.lng, (w) => w.lat, waterClusterCell(opts.zoom)));
    }
    // 保活:回落时无逐点 marker,markers.get(openId) 为 undefined 自然 no-op
    if (openId) markers.get(openId)?.openPopup();
  } else if (shouldShowWater(opts.zoom)) {
    renderClusterBubbles(clusters);
  }
  return markers;
}
