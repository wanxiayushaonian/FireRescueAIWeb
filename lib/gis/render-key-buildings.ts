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
import type { RadialTarget } from './render-stations';

export interface RenderKeyBuildingsOpts {
  map: L.Map; // 聚合气泡点击 flyTo 用(渲染器内部不改 map 其他状态)
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
      .bindPopup(popupForKeyBuilding(b, unitName))
      .on('contextmenu', (e) => { L.DomEvent.stopPropagation(e.originalEvent as Event); opts.onRadial({ kind: 'building', id: b.id, name: b.name, lng: b.lng, lat: b.lat }, [b.lat, b.lng]); });
    markers.set(b.id, marker);
    layer.addLayer(marker);
  };

  if (zoom >= MARKER_CLUSTER_MAX_ZOOM) {
    buildings.forEach(renderBuilding);
    return markers;
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
      .on('click', () => opts.map.flyTo([c.lat, c.lng], opts.map.getZoom() + 1))
      .addTo(layer);
  }
  return markers;
}
