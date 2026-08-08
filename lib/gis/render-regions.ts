// lib/gis/render-regions.ts
// 重点区域图层渲染器:从 RealGisMap 重点区域 effect 逐字搬出(多边形高亮 + hover 名称;点击 flyTo 适窗)。
// 与 lib/gis/route-render 同策略:import type + 函数内 require('leaflet')(vitest node 环境约束)。
import type L from 'leaflet';
import type { Region } from '../region-mapper';

export interface RenderRegionsOpts {
  map: L.Map; // 点击 flyTo 用(渲染器内部不改 map 其他状态)
}

/** 渲染重点区域多边形(先 clearLayers);无注册表(polygon 不进 markersRef)。 */
export function renderRegions(layer: L.LayerGroup, regions: Region[], opts: RenderRegionsOpts): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const L: typeof import('leaflet') = require('leaflet');
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
        // 手动区域:点击放大到区域中心,固定 zoom 级别(每次一致,不随点击叠加无限放大)
        const center = poly.getBounds().getCenter();
        opts.map.flyTo(center, 16);
      });
    layer.addLayer(poly);
  }
}
