// lib/gis/render-key-buildings.ts
// 重点建筑图层渲染器:从 RealGisMap 重点建筑 effect 逐字搬出(与重点单位同套机制)。
// zoom<14 网格聚合气泡('#60a5fa');>=14 逐点;popup 显示所属单位名(keyUnitId → keyUnits 查找)。
// 与 lib/gis/route-render 同策略:import type + 函数内 require('leaflet')(vitest node 环境约束)。
import type L from 'leaflet';
import type { KeyUnit } from '../key-unit-mapper';
import type { KeyBuilding } from '../key-building-mapper';
import { popupForKeyBuilding } from './popup-html';
import { keyBuildingIconSvg, clusterBubbleSvg, waterClusterCell, MARKER_CLUSTER_MAX_ZOOM } from '../map-icons';
import { gridCluster } from '../grid-cluster';
import { POINT_CAP, cullToBounds, decidePointRender, type ViewportBounds } from './point-render';
import type { RadialTarget } from './radial-target';

export interface RenderKeyBuildingsOpts {
  map: L.Map; // 聚合气泡点击 flyTo 用(渲染器内部不改 map 其他状态)
  bounds: ViewportBounds; // 视口范围(调用方已 pad 外扩),zoom>=14 逐点分支做裁剪
  prevMarkers: Map<string, L.Marker>; // 上一帧注册表,用于 popup openId 恢复
  cap?: number; // 视口内点位上限,超限回落聚合气泡(默认 POINT_CAP)
  onRadial: (target: RadialTarget, latlng: [number, number]) => void;
}

/** 渲染重点建筑图层(先 clearLayers),返回 id → marker 注册表(聚合气泡不入表;调用方接管 buildingMarkersRef)。 */
export function renderKeyBuildings(
  layer: L.LayerGroup,
  buildings: KeyBuilding[],
  keyUnits: KeyUnit[],
  zoom: number,
  opts: RenderKeyBuildingsOpts,
): Map<string, L.Marker> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  // popup 保活:重建前(clearLayers 会经 layerremove 关闭 popup,故须在清空前捕获)记下打开中的 popup id,重建后恢复(同 render-water 模式)
  const openId = [...opts.prevMarkers.entries()].find(([, m]) => m.isPopupOpen())?.[0];
  layer.clearLayers();
  const markers = new Map<string, L.Marker>();

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
      .bindPopup(popupForKeyBuilding(b, unitName), { className: 'gis-popup' })
      .on('contextmenu', (e) => { L.DomEvent.stopPropagation(e.originalEvent as Event); opts.onRadial({ kind: 'building', id: b.id, name: b.name, lng: b.lng, lat: b.lat, sceneId: b.sceneId }, [b.lat, b.lng]); });
    marker.on('popupopen', () => marker.getElement()?.classList.add('gis-marker-active'));
    marker.on('popupclose', () => marker.getElement()?.classList.remove('gis-marker-active'));
    markers.set(b.id, marker);
    layer.addLayer(marker);
  };

  // 聚合气泡渲染:zoom<14 全量聚合 / zoom>=14 超限回落共用(气泡 html/尺寸/tooltip/点击 flyTo 原样)
  const renderClusterBubbles = (items: KeyBuilding[], z: number) => {
    for (const c of gridCluster(items, (b) => b.lng, (b) => b.lat, waterClusterCell(z))) {
      const { html, size } = clusterBubbleSvg(c.count, '#60a5fa');
      L.marker([c.lat, c.lng], {
        icon: L.divIcon({
          html,
          className: 'map-icon-building-cluster',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        }),
      })
        .bindTooltip(`${c.count} 个重点建筑,放大地图查看`, { direction: 'top', className: 'gis-tip' })
        .on('click', () => opts.map.flyTo([c.lat, c.lng], opts.map.getZoom() + 1))
        .addTo(layer);
    }
  };

  if (zoom >= MARKER_CLUSTER_MAX_ZOOM) {
    // 视口裁剪:只渲染视野内点位;超限回落聚合气泡(建筑无警情规则,回落时全部进气泡)
    const visible = cullToBounds(buildings, (b) => b.lng, (b) => b.lat, opts.bounds);
    if (decidePointRender(visible.length, opts.cap ?? POINT_CAP) === 'points') {
      visible.forEach(renderBuilding);
    } else {
      renderClusterBubbles(visible, zoom);
    }
    if (openId) markers.get(openId)?.openPopup();
    return markers;
  }
  renderClusterBubbles(buildings, zoom);
  return markers;
}
