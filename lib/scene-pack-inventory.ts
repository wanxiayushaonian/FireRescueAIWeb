// 场景包数据解析(纯函数):树 → 内容清单,供「场景包内容」面板/调试/文档输出复用。
// 输出:类型统计(区分 Site 级/楼内)、楼层×类型矩阵、Space 语义分类、
// 出入口(SceneInOut)与 Site 级对象清单(车辆/屋顶设备等)。
import type { SceneTreeNode } from './ustudio';
import { parseFloorToken } from './floor-focus';
import { HIDABLE_TYPE_LABELS } from './scene-categories';

export interface PackTypeStat {
  type: string;
  label: string;
  count: number;
  /** Site 直属数量(室外/屋顶/全场级,不归属楼层) */
  siteLevel: number;
}

export interface PackStoryStat {
  name: string;
  /** 楼层号(地下为负;未定义楼层为 null) */
  floor: number | null;
  total: number;
  byType: Array<{ type: string; count: number }>;
}

export interface SiteLevelItem {
  type: string;
  label: string;
  name: string;
  outId: string;
}

export interface ScenePackInventory {
  totalNodes: number;
  /** 按 count 降序 */
  types: PackTypeStat[];
  /** 按层序(地下→地上→未定义) */
  stories: PackStoryStat[];
  /** Space 命名分类(房间/弱电井/电梯井/合用前室…),按 count 降序 */
  spaceTaxonomy: Array<{ name: string; count: number }>;
  /** 场景出入口(SceneInOut;进攻路线"大门"的官方锚点,优于门质心启发式) */
  entrances: Array<{ name: string; twinsId: string; outId: string }>;
  /** Site 直属对象(出入口/车辆/屋顶设备/室外消火栓等) */
  siteLevel: SiteLevelItem[];
}

interface WalkAcc {
  total: number;
  byType: Map<string, { count: number; siteLevel: number }>;
  stories: Map<string, { floor: number | null; total: number; byType: Map<string, number> }>;
  spaceNames: Map<string, number>;
  entrances: Array<{ name: string; twinsId: string; outId: string }>;
  siteLevel: SiteLevelItem[];
}

function labelOf(type: string): string {
  return HIDABLE_TYPE_LABELS[type] ?? type;
}

function nodeOutId(n: SceneTreeNode): string {
  return String(n.out_instance_id ?? n.id ?? n.twins_instance_id ?? '');
}

function nodeLabel(n: SceneTreeNode): string {
  return String(n.twins_instance_name ?? n.name ?? n.type ?? '');
}

/** 解析场景树 → 内容清单。层级约定:Site → Building → Story(B1F..40F/未定义楼层) → Space/Door/Wall/设备;
 * Site 直属 = 室外/屋顶/全场级对象(出入口/车辆/室外消火栓/屋顶风机等,不归属楼层)。 */
export function analyzeScenePack(tree: SceneTreeNode | null | undefined): ScenePackInventory {
  const acc: WalkAcc = {
    total: 0,
    byType: new Map(),
    stories: new Map(),
    spaceNames: new Map(),
    entrances: [],
    siteLevel: [],
  };
  if (!tree) {
    return { totalNodes: 0, types: [], stories: [], spaceTaxonomy: [], entrances: [], siteLevel: [] };
  }

  const walk = (n: SceneTreeNode, story: string | null, siteChild: boolean): void => {
    acc.total += 1;
    const type = String(n.type ?? '');
    const name = nodeLabel(n);
    const outId = nodeOutId(n);
    let t = acc.byType.get(type);
    if (!t) {
      t = { count: 0, siteLevel: 0 };
      acc.byType.set(type, t);
    }
    t.count += 1;
    if (siteChild) t.siteLevel += 1;

    if (type === 'Story') {
      story = name;
      if (!acc.stories.has(name)) {
        acc.stories.set(name, { floor: parseFloorToken(name), total: 0, byType: new Map() });
      }
    }
    if (story) {
      const s = acc.stories.get(story)!;
      s.total += 1;
      s.byType.set(type, (s.byType.get(type) ?? 0) + 1);
    } else if (siteChild && type !== 'Site') {
      acc.siteLevel.push({ type, label: labelOf(type), name, outId });
    }
    if (type === 'Space') {
      acc.spaceNames.set(name, (acc.spaceNames.get(name) ?? 0) + 1);
    }
    if (type === 'SceneInOut') {
      acc.entrances.push({ name, twinsId: String(n.twins_instance_id ?? ''), outId });
    }
    // 根(Site)的直属子节点是 Site 级;再往下(楼层/设备子树)不是
    for (const c of n.children ?? []) walk(c, story, false);
  };
  // 根节点自身按 Site 处理,其直属子节点标记 Site 级
  acc.total += 1;
  acc.byType.set(String(tree.type ?? 'Site'), { count: 1, siteLevel: 0 });
  for (const c of tree.children ?? []) walk(c, null, true);

  const rank = (f: number | null): number => (f === null ? 10000 : f);
  return {
    totalNodes: acc.total,
    types: [...acc.byType.entries()]
      .map(([type, t]) => ({ type, label: labelOf(type), count: t.count, siteLevel: t.siteLevel }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    stories: [...acc.stories.entries()]
      .map(([name, s]) => ({
        name,
        floor: s.floor,
        total: s.total,
        byType: [...s.byType.entries()]
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => rank(a.floor) - rank(b.floor)),
    spaceTaxonomy: [...acc.spaceNames.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    entrances: acc.entrances,
    siteLevel: acc.siteLevel,
  };
}
