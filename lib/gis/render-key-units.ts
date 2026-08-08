// lib/gis/render-key-units.ts
// 重点单位图层渲染器:从 RealGisMap 重点单位 effect 逐字搬出。
// zoom<14 网格聚合气泡(有警情的单位始终逐点,警情态不进气泡);>=14 逐点。
// 与 lib/gis/route-render 同策略:import type + 函数内 require('leaflet')(vitest node 环境约束)。
import type L from 'leaflet';
import type { KeyUnit } from '../key-unit-mapper';
import type { Incident } from '../incident-mapper';
import { HIGH_RISK_PATTERN, keyUnitMarkerHtml } from './marker-html';
import { popupForKeyUnit, popupIncidentSuffix } from './popup-html';
import { clusterBubbleSvg, waterClusterCell, MARKER_CLUSTER_MAX_ZOOM } from '../map-icons';
import { gridCluster } from '../grid-cluster';
import type { RadialTarget } from './render-stations';

export interface RenderKeyUnitsOpts {
  map: L.Map; // 聚合气泡点击 flyTo 用(渲染器内部不改 map 其他状态)
  onRadial: (target: RadialTarget, latlng: [number, number]) => void;
  onDeploy: (t: { name: string; lng: number; lat: number }) => void;
}

/** 渲染重点单位图层(先 clearLayers),返回 id → marker 注册表(聚合气泡不入表;调用方接管 keyUnitMarkersRef)。 */
export function renderKeyUnits(
  layer: L.LayerGroup,
  units: KeyUnit[],
  incidents: Incident[],
  zoom: number,
  opts: RenderKeyUnitsOpts,
): Map<string, L.Marker> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  layer.clearLayers();
  const markers = new Map<string, L.Marker>();
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
          opts.onDeploy({ name: u.name, lng: u.lng, lat: u.lat });
          e.target.closePopup(); // 有警情:只弹派遣面板,关闭自动 popup 避免与面板重合(单位详情走右键圆环)
        }
      })
      .on('contextmenu', (e) => { L.DomEvent.stopPropagation(e.originalEvent as Event); opts.onRadial({ kind: 'unit', id: u.id, name: u.name, lng: u.lng, lat: u.lat }, [u.lat, u.lng]); });
    markers.set(u.id, marker);
    layer.addLayer(marker);
  };

  if (zoom >= MARKER_CLUSTER_MAX_ZOOM) {
    units.forEach(renderUnit);
    return markers;
  }
  // 聚合模式:警情单位逐点(警情第一优先),其余按格聚合
  const withIncident = units.filter((u) => incidentByUnit.has(u.id));
  const rest = units.filter((u) => !incidentByUnit.has(u.id));
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
      .on('click', () => opts.map.flyTo([c.lat, c.lng], opts.map.getZoom() + 1))
      .addTo(layer);
  }
  return markers;
}
