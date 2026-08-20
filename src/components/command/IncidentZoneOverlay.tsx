'use client';

// 实战指挥·案域圈层:选中警情后以案点为心画三级作战域(Leaflet 地理圆,自动跟随投影)。
// 500m 警戒(红)/1.5km 作战(橙,水源·站点·波及单位)/3km 支援(青虚线,增援站点)。
// 与 TacticalOverlay 的 SVG 像素圈分工:那是灾情蔓延推演,这是案域范围标定。
import { useEffect } from 'react';
import type * as L from 'leaflet';

const RINGS: Array<{ radiusM: number; color: string; dashArray?: string; label: string; desc: string }> = [
  { radiusM: 500, color: '#ef4444', label: '警戒区', desc: '500m' },
  { radiusM: 1500, color: '#f97316', label: '作战区', desc: '1.5km · 水源/站点/波及单位' },
  { radiusM: 3000, color: '#22d3ee', dashArray: '8 6', label: '支援区', desc: '3km · 增援站点' },
];

export default function IncidentZoneOverlay({ map, incident }: {
  map: L.Map | null;
  incident: { lng: number; lat: number } | null;
}) {
  useEffect(() => {
    if (!map || !incident || !Number.isFinite(incident.lng) || !Number.isFinite(incident.lat)) return;
    const leaflet = require('leaflet') as typeof import('leaflet');
    const center: [number, number] = [incident.lat, incident.lng];
    const circles = RINGS.map((r) =>
      leaflet
        .circle(center, {
          radius: r.radiusM,
          color: r.color,
          weight: 1.5,
          opacity: 0.8,
          dashArray: r.dashArray,
          fill: true,
          fillColor: r.color,
          fillOpacity: r.radiusM === 500 ? 0.06 : 0.02,
          interactive: false,
        })
        .addTo(map),
    );
    return () => {
      for (const c of circles) c.remove();
    };
  }, [map, incident?.lng, incident?.lat]);

  if (!incident) return null;
  return (
    // 图例(纯展示,不拦截地图交互);右下角避开 Leaflet 自带 attribution
    <div className="pointer-events-none absolute bottom-3 right-3 z-[400] rounded-md border border-line bg-bg-panel/85 px-2.5 py-1.5 backdrop-blur-[6px]">
      <div className="mb-1 text-[10px] font-semibold tracking-widest text-text-3">案域</div>
      {RINGS.map((r) => (
        <div key={r.label} className="flex items-center gap-1.5 text-[10px] text-text-2">
          <span
            className="inline-block h-2 w-2 rounded-full border"
            style={{ borderColor: r.color, background: `${r.color}22` }}
          />
          {r.label} <span className="text-text-3">{r.desc}</span>
        </div>
      ))}
    </div>
  );
}
