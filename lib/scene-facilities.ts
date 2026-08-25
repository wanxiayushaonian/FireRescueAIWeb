// 场景包消防设施统计纯函数:从场景树(场景包数据,浏览器在线解析)统计建筑内部
// 消防设施数量——智能体查"内部设施数量"的数据源(数据库 key_floors 不含此粒度)。
// 数据来源:3D 场景包树(ustudio Digital Twin 树),与 SceneDeviceSearch/拾取索引同源。
import type { SceneTreeNode } from './ustudio';
import { buildDeviceSearchIndex } from './scene-pick';
import { FIRE_DEVICE_TYPES, HIDABLE_TYPE_LABELS } from './scene-categories';

export interface FacilityCounts {
  /** 全部非结构节点总数(含门/空间等,供对账) */
  total: number;
  /** 消防系统类设施数量(按类型英文名,仅 FIRE_DEVICE_TYPES 集合) */
  fireByType: Record<string, number>;
  /** 消防系统类设施数量(中文标签,agent 友好) */
  fireByTypeLabel: Record<string, number>;
  /** 消防设施按楼层分布(楼层标签 → 数量;无楼层归属的归 "—") */
  fireByFloor: Record<string, number>;
  /** 消防设施所在楼层(升序) */
  floors: string[];
}

export interface CountFilter {
  /** 楼层过滤:楼层标签子串(如 "5F"/"B1"),可选 */
  floor?: string;
  /** 类型过滤:类型名或中文标签子串(如 "IndoorFireHydrant"/"消火栓"),可选 */
  type?: string;
}

function parseFloorRank(label: string): number {
  // B1F/B1 → -1, 5F/5 → 5;不可解析归 0(排前面)
  const m = /^B(\d+)/i.exec(label.trim());
  if (m) return -Number(m[1]);
  const n = Number.parseInt(label, 10);
  return Number.isFinite(n) ? n : 0;
}

/** 统计场景树中的消防设施数量(可按楼层/类型过滤)。 */
export function countSceneFacilities(tree: SceneTreeNode | null, opts?: CountFilter): FacilityCounts {
  const empty: FacilityCounts = { total: 0, fireByType: {}, fireByTypeLabel: {}, fireByFloor: {}, floors: [] };
  if (!tree) return empty;
  const floorQ = opts?.floor?.trim().toLowerCase();
  const typeQ = opts?.type?.trim().toLowerCase();
  const items = buildDeviceSearchIndex(tree);
  const byType: Record<string, number> = {};
  const byTypeLabel: Record<string, number> = {};
  const byFloor: Record<string, number> = {};
  let fireTotal = 0;
  for (const it of items) {
    if (floorQ && !(it.storyLabel ?? '').toLowerCase().includes(floorQ)) continue;
    if (typeQ) {
      const inType = it.type.toLowerCase().includes(typeQ);
      const inLabel = (it.typeLabel ?? '').toLowerCase().includes(typeQ);
      if (!inType && !inLabel) continue;
    }
    if (!FIRE_DEVICE_TYPES.has(it.type)) continue; // 只统计消防系统类
    fireTotal += 1;
    byType[it.type] = (byType[it.type] ?? 0) + 1;
    const label = HIDABLE_TYPE_LABELS[it.type] ?? it.type;
    byTypeLabel[label] = (byTypeLabel[label] ?? 0) + 1;
    const floorKey = it.storyLabel?.trim() ? it.storyLabel : '—';
    byFloor[floorKey] = (byFloor[floorKey] ?? 0) + 1;
  }
  const floors = Object.keys(byFloor).sort((a, b) => parseFloorRank(a) - parseFloorRank(b));
  return {
    total: items.length,
    fireByType: byType,
    fireByTypeLabel: byTypeLabel,
    fireByFloor: byFloor,
    floors,
  };
}
