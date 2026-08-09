// lib/gis/render-response.ts
// 灾情响应图层渲染:每站染色环(ETA 颜色)+ 灾情点 5min 估算参考圈。
// 模式同 render-water:import type L + 函数内 require('leaflet')(vitest node 约束)。
import type L from 'leaflet';
import { etaColor, estimateRadiusKm, formatEta, type EtaLevel } from './eta-render';

export interface ResponseEtaItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  etaSec: number;
}

const ETA_COLOR_HEX: Record<EtaLevel, string> = {
  green: '#34d399',
  yellow: '#fbbf24',
  red: '#ef4444',
};

/** 渲染每站染色环(ETA 颜色 circleMarker + tooltip)。叠加在站 marker 上,不侵入 stations 图层。 */
export function renderResponseEta(layer: L.LayerGroup, items: ResponseEtaItem[], targetMin = 5): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  for (const it of items) {
    const hex = ETA_COLOR_HEX[etaColor(it.etaSec, targetMin)];
    L.circleMarker([it.lat, it.lng], {
      radius: 14,
      color: hex,
      weight: 2,
      fillColor: hex,
      fillOpacity: 0.18,
    })
      .bindTooltip(`${it.name} · 到场 ${formatEta(it.etaSec)}`, { direction: 'top', className: 'gis-tip' })
      .addTo(layer);
  }
}

/** 渲染灾情点 5min 驾车估算参考圈(虚线,标注估算)。 */
export function renderReferenceCircle(layer: L.LayerGroup, center: { lat: number; lng: number }, minutes = 5): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  const radiusKm = estimateRadiusKm(minutes);
  L.circle([center.lat, center.lng], {
    radius: radiusKm * 1000,
    color: '#22d3ee',
    weight: 1,
    opacity: 0.5,
    dashArray: '6 6',
    fill: false,
  })
    .bindTooltip(`${minutes}分钟驾车估算圈(~${radiusKm.toFixed(1)}km)`, {
      direction: 'top',
      className: 'gis-tip',
    })
    .addTo(layer);
}

/** 清除响应图层(染色环 + 参考圈)。 */
export function clearResponseLayer(layer: L.LayerGroup | null): void {
  layer?.clearLayers();
}
