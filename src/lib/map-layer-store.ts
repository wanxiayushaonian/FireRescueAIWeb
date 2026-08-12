// 地图图层偏好共享 store:面板(执勤力量/水源)与 RealGisMap 之间共享
// "哪些队站类型/水源区划显示在地图上"。无第三方依赖,useSyncExternalStore 直连。
import { useSyncExternalStore } from 'react';

export interface MapLayerPrefs {
  /** 显示在地图上的队站类型(默认只开国家队:支队/救援大队/救援站)。 */
  visibleStationTypes: string[];
  /** 地图上隐藏的水源区划码(默认空 = 全部显示)。 */
  hiddenWaterDistricts: string[];
  /** 地图上隐藏的重点单位类型(默认空 = 全部显示)。 */
  hiddenKeyUnitTypes: string[];
}

export const DEFAULT_VISIBLE_STATION_TYPES = ['支队', '救援大队', '救援站'];

let prefs: MapLayerPrefs = {
  visibleStationTypes: DEFAULT_VISIBLE_STATION_TYPES,
  hiddenWaterDistricts: [],
  hiddenKeyUnitTypes: [],
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function getMapLayerPrefs(): MapLayerPrefs {
  return prefs;
}

export function subscribeMapLayerPrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toggleStationTypeVisible(name: string): void {
  const cur = prefs.visibleStationTypes;
  prefs = {
    ...prefs,
    visibleStationTypes: cur.includes(name) ? cur.filter((t) => t !== name) : [...cur, name],
  };
  emit();
}

export function toggleWaterDistrictHidden(code: string): void {
  const cur = prefs.hiddenWaterDistricts;
  prefs = {
    ...prefs,
    hiddenWaterDistricts: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code],
  };
  emit();
}

export function toggleKeyUnitTypeHidden(type: string): void {
  const cur = prefs.hiddenKeyUnitTypes;
  prefs = {
    ...prefs,
    hiddenKeyUnitTypes: cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type],
  };
  emit();
}

/** React 绑定:任一写操作触发订阅组件重渲染。 */
export function useMapLayerPrefs(): MapLayerPrefs {
  return useSyncExternalStore(subscribeMapLayerPrefs, getMapLayerPrefs, getMapLayerPrefs);
}
