// lib/gis/render-response.ts
// 灾情响应图层渲染:每站染色环(ETA 颜色)+ 灾情点分层驾车响应圈(核心/增援/外围)。
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

/** 分层响应圈层级定义:mult = targetMin 的倍数,与 etaColor 的绿/黄/红三档对齐。
 * 外→内绘制(红→黄→绿),内层覆盖外层中心,形成 核心区/增援区/外围区 的分层环带。 */
const TIER_DEFS: { mult: number; level: EtaLevel; label: string }[] = [
  { mult: 3, level: 'red', label: '外围区' }, // >2×target
  { mult: 2, level: 'yellow', label: '增援区' }, // target~2×target
  { mult: 1, level: 'green', label: '核心区' }, // ≤target
];

/** 渲染灾情点分层驾车响应圈:核心(≤targetMin)/增援(≤2×)/外围(≤3×)三圈同心,
 * 配色与 ETA 染色环一致(绿/黄/红),核心圈实线强调,外圈虚线为估算边界。 */
export function renderTieredResponseCircles(layer: L.LayerGroup, center: { lat: number; lng: number }, targetMin = 5): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
  for (const tier of TIER_DEFS) {
    const minutes = targetMin * tier.mult;
    const radiusKm = estimateRadiusKm(minutes);
    const color = ETA_COLOR_HEX[tier.level];
    const isCore = tier.level === 'green';
    L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color,
      weight: isCore ? 2 : 1.5,
      opacity: 0.75,
      fillColor: color,
      fillOpacity: isCore ? 0.12 : 0.07,
      dashArray: isCore ? undefined : '6 6',
    })
      .bindTooltip(`${tier.label} · ≤${minutes}分钟到场(~${radiusKm.toFixed(1)}km)`, {
        direction: 'top',
        className: 'gis-tip',
      })
      .addTo(layer);
  }
}

/** 清除响应图层(染色环 + 参考圈)。 */
export function clearResponseLayer(layer: L.LayerGroup | null): void {
  layer?.clearLayers();
}
