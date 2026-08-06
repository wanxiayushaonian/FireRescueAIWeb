// 地图图标:纯 SVG html 工厂 + zoom 判定(不依赖 leaflet;由 RealGisMap 用 L.divIcon 包装)。
// 深色背景:亮色填充 + 深色描边,保证可见。

export const TYPE_COLORS: Record<string, string> = {
  特勤消防站: '#f97316',
  普通消防站: '#22d3ee',
  专职消防站: '#3b82f6',
  微型消防站: '#34d399',
  水上消防站: '#a78bfa',
};

export const WATER_COLORS: Record<string, string> = {
  市政消火栓: '#38bdf8',
  消防水池: '#34d399',
  天然水源: '#22d3ee',
};

const DEFAULT_STATION_COLOR = '#22d3ee';
const DEFAULT_WATER_COLOR = '#60a5fa';
const WATER_ZOOM_THRESHOLD = 13;

/** zoom>=13 时显示水源点(远景只显消防站,避免密集)。 */
export function shouldShowWater(zoom: number): boolean {
  return zoom >= WATER_ZOOM_THRESHOLD;
}

/** 消防站图标:菱形徽标 + "消"字,24px,锚点底部中心。 */
export function stationIconSvg(type: string): string {
  const color = TYPE_COLORS[type] ?? DEFAULT_STATION_COLOR;
  return `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 1 L22 11 L12 23 L2 11 Z" fill="${color}" stroke="#0b1220" stroke-width="1.5"/>
  <text x="12" y="16" font-size="11" text-anchor="middle" fill="#0b1220" font-weight="700" font-family="sans-serif">消</text>
</svg>`;
}

/** 水源图标:水滴形,18px,锚点底部中心。 */
export function waterIconSvg(waterType: string): string {
  const color = WATER_COLORS[waterType] ?? DEFAULT_WATER_COLOR;
  return `<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2 C12 2 4 12 4 16 a8 8 0 0 0 16 0 C20 12 12 2 12 2 Z" fill="${color}" stroke="#0b1220" stroke-width="1.2"/>
</svg>`;
}
