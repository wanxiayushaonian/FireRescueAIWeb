// lib/gis/render-stations.ts
// 消防站图层渲染器:从 RealGisMap 消防站 effect 逐字搬出(marker 参数/事件绑定行为保真)。
// 与 lib/gis/route-render 同策略:lib 不顶层 import leaflet 运行时(其模块顶层依赖 window,node 单测会炸),
// 类型用 import type,运行时由渲染函数内延迟 require(该函数只在浏览器被调用,单测不触达)。
import type L from 'leaflet';
import { stationIconSvg } from '../map-icons';
import { popupForStation } from './popup-html';
import type { RadialTarget } from './radial-target';

/** 消防站结构类型(lib 不得 import src/mock/types;字段为渲染所需子集)。 */
export interface RenderStation {
  id: string;
  name: string;
  type: string;
  address: string;
  lng: number;
  lat: number;
  status?: string;
}

export interface RenderStationsOpts {
  visibleTypes: string[]; // 类型显隐(执勤力量面板经 map-layer-store 控制)
  personnelCounts: Map<string, number>; // 各站真实人员数(popup 动态显示)
  onStationClick: (s: RenderStation) => void;
  onRadial: (target: RadialTarget, latlng: [number, number]) => void;
}

/** 渲染消防站 marker(先 clearLayers),返回 id → marker 注册表(调用方接管 markersRef)。 */
export function renderStations(
  layer: L.LayerGroup,
  stations: RenderStation[],
  opts: RenderStationsOpts,
): Map<string, L.Marker> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  layer.clearLayers();
  const markers = new Map<string, L.Marker>();
  for (const s of stations) {
    if (!opts.visibleTypes.includes(s.type)) continue;
    const marker = L.marker([s.lat, s.lng], {
      icon: L.divIcon({
        html: stationIconSvg(s.type, s.status),
        className: 'map-icon-station',
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -24],
      }),
    })
      .bindPopup(popupForStation(s, opts.personnelCounts.get(s.id) ?? 0), { className: 'gis-popup' })
      .on('click', () => opts.onStationClick(s))
      .on('contextmenu', (e) => { L.DomEvent.stopPropagation(e.originalEvent as Event); opts.onRadial({ kind: 'station', id: s.id, name: s.name, type: s.type, lng: s.lng, lat: s.lat }, [s.lat, s.lng]); });
    layer.addLayer(marker);
    markers.set(s.id, marker);
  }
  return markers;
}
