// 地图视角会话级记忆:总览/实战指挥各挂一份 RealGisMap,模块切换重挂时视角经此
// store 跨模块保持(不再一律弹回九江全景)。地图 moveend 时写入,新地图初始化时读取。
// resetView / 「九江全景」按钮等主动复位会自然覆盖本记忆。会话级,刷新丢失。

let saved: { center: [number, number]; zoom: number } | null = null;

export function saveMapView(center: [number, number], zoom: number): void {
  saved = { center: [center[0], center[1]], zoom };
}

/** 取最近一次保存的视角(无则 null,调用方回退默认视角)。返回副本,防外部改写。 */
export function takeMapView(): { center: [number, number]; zoom: number } | null {
  return saved ? { center: [...saved.center], zoom: saved.zoom } : null;
}
