// lib/gis/render-incidents.ts
// 警情图层渲染器:从 RealGisMap 警情 effect 逐字搬出(红色脉冲点位 + level 数字;GCJ02 直显)。
// 关联重点单位的警情(keyUnitId)由单位 marker 警情态显示,不独立渲染。
// 与 lib/gis/route-render 同策略:import type + 函数内 require('leaflet')(vitest node 环境约束)。
import type L from 'leaflet';
import type { Incident } from '../incident-mapper';
import { incidentMarkerHtml } from './marker-html';
import { popupForIncident } from './popup-html';
import type { RadialTarget } from './radial-target';

export interface RenderIncidentsOpts {
  onDeploy: (t: { name: string; lng: number; lat: number }) => void;
  onRadial: (target: RadialTarget, latlng: [number, number]) => void;
}

/** 渲染警情图层(先 clearLayers),返回 id → marker 注册表(调用方接管 incidentMarkersRef)。 */
export function renderIncidents(
  layer: L.LayerGroup,
  incidents: Incident[],
  opts: RenderIncidentsOpts,
): Map<string, L.Marker> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  layer.clearLayers();
  const markers = new Map<string, L.Marker>();
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
      .bindPopup(popupForIncident(i), { className: 'gis-popup' })
      .on('click', () => opts.onDeploy({ name: i.address, lng: i.lng, lat: i.lat }))
      .on('contextmenu', (e) => { L.DomEvent.stopPropagation(e.originalEvent as Event); opts.onRadial({ kind: 'incident', id: i.id, name: i.address, lng: i.lng, lat: i.lat }, [i.lat, i.lng]); });
    marker.on('popupopen', () => marker.getElement()?.classList.add('gis-marker-active'));
    marker.on('popupclose', () => marker.getElement()?.classList.remove('gis-marker-active'));
    markers.set(i.id, marker);
    layer.addLayer(marker);
  }
  return markers;
}
