// 地图图标:纯 SVG html 工厂 + zoom 判定(不依赖 leaflet;由 RealGisMap 用 L.divIcon 包装)。
// 深色背景:亮色填充 + 深色描边,保证可见。

export const TYPE_COLORS: Record<string, string> = {
  特勤消防站: '#f97316',
  普通消防站: '#22d3ee',
  专职消防站: '#3b82f6',
  微型消防站: '#34d399',
  水上消防站: '#a78bfa',
  // 平台导入的真实类型
  支队: '#eab308',
  救援大队: '#f97316',
  救援站: '#22d3ee',
  政府专职站: '#3b82f6',
  企业专职站: '#6366f1',
  单位专职站: '#60a5fa',
  其他专职站: '#94a3b8',
  志愿消防站: '#34d399',
};

export const WATER_COLORS: Record<string, string> = {
  市政消火栓: '#38bdf8',
  消防水池: '#34d399',
  天然水源: '#22d3ee',
};

const DEFAULT_STATION_COLOR = '#22d3ee';
const DEFAULT_WATER_COLOR = '#60a5fa';
const WATER_ZOOM_THRESHOLD = 13;
// zoom>=15 视口内点位数量有界(市区约百级),可逐点渲染;13-14 走聚合气泡
export const WATER_POINTS_ZOOM = 15;

/** zoom>=13 时显示水源图层(聚合气泡或点位;远景只显消防站,避免密集)。 */
export function shouldShowWater(zoom: number): boolean {
  return zoom >= WATER_ZOOM_THRESHOLD;
}

/** zoom>=15 时逐点渲染水源;13-14 渲染聚合气泡。 */
export function shouldShowWaterPoints(zoom: number): boolean {
  return zoom >= WATER_POINTS_ZOOM;
}

/** 聚合气泡网格边长(度):约 64px 屏幕宽度对应的经度跨度。 */
export function waterClusterCell(zoom: number): number {
  return (360 / Math.pow(2, zoom)) * (64 / 256);
}

// zoom<14 重点单位/重点建筑合并为聚合气泡;>=14 逐点渲染
export const MARKER_CLUSTER_MAX_ZOOM = 14;

/** 聚合气泡尺寸档位(像素):按数量分三档。 */
function clusterSize(count: number): number {
  return count >= 100 ? 52 : count >= 20 ? 44 : 36;
}

/**
 * 通用聚合气泡(科技感):三层同心圆 + 计数徽章。
 * - 最外扩散光晕(透明描边圈) → 中层半透明填充 → 内层实心计数盘
 * - SVG 内不依赖 CSS 变量,颜色参数化,供不同图层主题色复用
 */
export function clusterBubbleSvg(count: number, color: string): { html: string; size: number } {
  const size = clusterSize(count);
  const c = size / 2;
  const html = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- 外层扩散光晕 -->
  <circle cx="${c}" cy="${c}" r="${c - 1}" fill="none" stroke="${color}" stroke-width="1" opacity="0.25"/>
  <circle cx="${c}" cy="${c}" r="${c - 5}" fill="${color}" opacity="0.1"/>
  <!-- 中层填充环 -->
  <circle cx="${c}" cy="${c}" r="${c - 7}" fill="${color}" opacity="0.18" stroke="${color}" stroke-width="1.2" stroke-opacity="0.6"/>
  <!-- 内层计数盘 -->
  <circle cx="${c}" cy="${c}" r="${c - 11}" fill="${color}" fill-opacity="0.9" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
  <text x="${c}" y="${c + (count >= 100 ? 5 : 4)}" font-size="${count >= 100 ? 15 : 14}" text-anchor="middle" fill="#0b1220" font-weight="800" font-family="sans-serif">${count}</text>
</svg>`;
  return { html, size };
}

/** 消防站图标:菱形徽标 + "消"字,24px,锚点底部中心。 */
export function stationIconSvg(type: string, status?: string): string {
  const color = status && status !== 'normal' ? '#6b7280' : TYPE_COLORS[type] ?? DEFAULT_STATION_COLOR;
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

/** 水源聚合气泡(与 clusterBubbleSvg 同构,固定水蓝色主题)。 */
export function waterClusterSvg(count: number): { html: string; size: number } {
  const size = clusterSize(count);
  const c = size / 2;
  const color = '#38bdf8';
  const html = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- 外层扩散光晕 -->
  <circle cx="${c}" cy="${c}" r="${c - 1}" fill="none" stroke="${color}" stroke-width="1" opacity="0.25"/>
  <circle cx="${c}" cy="${c}" r="${c - 5}" fill="${color}" opacity="0.1"/>
  <!-- 中层填充环 -->
  <circle cx="${c}" cy="${c}" r="${c - 7}" fill="${color}" opacity="0.18" stroke="${color}" stroke-width="1.2" stroke-opacity="0.6"/>
  <!-- 内层计数盘 -->
  <circle cx="${c}" cy="${c}" r="${c - 11}" fill="${color}" fill-opacity="0.9" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
  <text x="${c}" y="${c + (count >= 100 ? 5 : 4)}" font-size="${count >= 100 ? 15 : 14}" text-anchor="middle" fill="#0b1220" font-weight="800" font-family="sans-serif">${count}</text>
</svg>`;
  return { html, size };
}

/** 重点单位图标:圆角方块徽标 + "重"字,24px;completed(已 3D 建模)金色,联动单位紫色。 */
const KEY_UNIT_COLORS: Record<string, string> = {
  重点单位: '#fb7185',
  联动单位: '#a78bfa',
};
export function keyUnitIconSvg(unitType: string, status: string): string {
  const color = status === 'completed' ? '#fbbf24' : KEY_UNIT_COLORS[unitType] ?? '#fb7185';
  return `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="20" height="20" rx="4" fill="${color}" stroke="#0b1220" stroke-width="1.5"/>
  <text x="12" y="16" font-size="11" text-anchor="middle" fill="#0b1220" font-weight="700" font-family="sans-serif">重</text>
</svg>`;
}

/** 重点建筑图标:圆角方块 + "建"字,22px;completed(已 3D 建模)金色。 */
export function keyBuildingIconSvg(status: string): string {
  const color = status === 'completed' ? '#fbbf24' : '#60a5fa';
  return `<svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <rect x="2" y="2" width="20" height="20" rx="3" fill="${color}" stroke="#0b1220" stroke-width="1.5"/>
  <text x="12" y="16" font-size="11" text-anchor="middle" fill="#0b1220" font-weight="700" font-family="sans-serif">建</text>
</svg>`;
}

/** 派遣目标端点图标:红色定位针 + 白色靶心,32px;派遣/路线期间重点对象图层被隐藏,
 *  目标建筑/单位作为路线终点用此独立 marker 保留显示,与青色路线区分。 */
export function dispatchTargetIconSvg(): string {
  return `<svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 1.5C7.3 1.5 3.5 5.3 3.5 10c0 5.8 8.5 12.5 8.5 12.5s8.5-6.7 8.5-12.5c0-4.7-3.8-8.5-8.5-8.5z" fill="#f43f5e" stroke="#0b1220" stroke-width="1.5"/>
  <circle cx="12" cy="10" r="3.4" fill="none" stroke="#fff" stroke-width="1.6"/>
  <circle cx="12" cy="10" r="0.9" fill="#fff"/>
</svg>`;
}
