// 飞向目标脉冲标记:agent/面板 flyTo 后在目标点显示红色脉冲圆环 + 名称标签,
// 解决「飞过去但目标图层未开/无 marker,不知道飞向了什么」的 UX 问题。
// 不依赖任何图层数据——纯坐标即可绘制;per-map 管理(overview/command 两张地图
// 同时挂载时各自独立标记)。tailwind 类出现在本文件字符串中,JIT 可生成。
import L from 'leaflet';

const pulseByMap = new WeakMap<L.Map, L.Marker>();

function pulseIcon(label: string): L.DivIcon {
  const tag = label
    ? `<div class="mt-1.5 whitespace-nowrap rounded bg-bg-deep/85 px-1.5 py-0.5 text-[11px] leading-4 text-white shadow">${label}</div>`
    : '';
  return L.divIcon({
    className: 'flyto-pulse-anchor',
    html: `<div class="relative flex flex-col items-center">
      <span class="absolute top-0 h-3 w-3 rounded-full bg-red-500/80 animate-ping"></span>
      <span class="relative h-3 w-3 rounded-full border-2 border-white bg-red-500 shadow-md"></span>
      ${tag}
    </div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

/** 在目标点绘制脉冲标记(同地图旧标记先清;label 可空)。 */
export function drawFlyToPulse(map: L.Map, opts: { lat: number; lng: number; label?: string }): void {
  clearFlyToPulse(map);
  const marker = L.marker([opts.lat, opts.lng], {
    icon: pulseIcon(opts.label ?? ''),
    interactive: false,
    keyboard: false,
    zIndexOffset: 1000,
  }).addTo(map);
  pulseByMap.set(map, marker);
}

/** 清除该地图的飞向标记(resetView/换目标时调用;不存在则 no-op)。 */
export function clearFlyToPulse(map: L.Map): void {
  const prev = pulseByMap.get(map);
  if (prev) {
    prev.remove();
    pulseByMap.delete(map);
  }
}
