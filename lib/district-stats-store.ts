// 区县统计快照共享 store:ResourceOverviewPanel 计算当前区县 6 项统计后写入,
// RealGisMap 顶部信息条订阅显示。与 map-layer-store 同模式(useSyncExternalStore 直连,无第三方依赖)。
import { useSyncExternalStore } from 'react';

export interface DistrictStatsSnapshot {
  /** 当前区县 adcode(null = 全市/无过滤) */
  districtCode: string | null;
  /** 当前区县名(无过滤时显示"九江市") */
  districtName: string;
  stations: number;
  personnel: number;
  vehicles: number;
  equipment: number;
  water: number;
  keyUnits: number;
}

const EMPTY: DistrictStatsSnapshot = {
  districtCode: null,
  districtName: '九江市',
  stations: 0,
  personnel: 0,
  vehicles: 0,
  equipment: 0,
  water: 0,
  keyUnits: 0,
};

let snapshot: DistrictStatsSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function setDistrictStats(next: DistrictStatsSnapshot): void {
  snapshot = next;
  emit();
}

export function getDistrictStats(): DistrictStatsSnapshot {
  return snapshot;
}

export function subscribeDistrictStats(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React 绑定:统计变化触发订阅组件重渲染。 */
export function useDistrictStats(): DistrictStatsSnapshot {
  return useSyncExternalStore(subscribeDistrictStats, getDistrictStats, getDistrictStats);
}
