// 3D 拾取与设备搜索纯逻辑:outId → 树节点索引、拾取父链解析、可搜索设备索引。
// 拾取 sids 语义(见 soonspace-runtime runHoverPick):raycast 命中对象沿父链的
// out_instance_id 序列,最近优先(构件→墙→楼层→楼栋)。
import type { SceneTreeNode } from './ustudio';
import { FIRE_TYPE_LABELS } from './fire-types';
import { HIDABLE_TYPE_LABELS } from './scene-categories';

export interface PickNodeInfo {
  outId: string;
  name: string;
  type: string;
  typeLabel: string;
  twinsId: string;
}

/** 结构骨架(Site/Building/Story/Floor/Wall)不弹信息卡、不进搜索(2.4 万墙是噪声)。 */
const STRUCTURAL_TYPE_PATTERN = /site|building|story|floor|wall/i;

function nodeType(n: SceneTreeNode): string {
  return String(n.twins_identifier ?? n.type ?? '').toLowerCase();
}

function nodeOutId(n: SceneTreeNode): string {
  return String(n.out_instance_id ?? n.id ?? n.twins_instance_id ?? '');
}

function nodeLabel(n: SceneTreeNode): string {
  return String(n.twins_instance_name ?? n.name ?? n.type ?? '');
}

function isStoryNode(n: SceneTreeNode): boolean {
  const t = nodeType(n);
  return t === 'story' || t.endsWith('story') || t.includes('floor');
}

function toPickInfo(n: SceneTreeNode): PickNodeInfo {
  const type = String(n.type ?? '');
  return {
    outId: nodeOutId(n),
    name: nodeLabel(n),
    type,
    // 标签双字典:演示包类型(scene-categories)优先,旧类型清单(fire-types)兜底,末级原文
    typeLabel: HIDABLE_TYPE_LABELS[type] ?? FIRE_TYPE_LABELS[type] ?? type,
    twinsId: String(n.twins_instance_id ?? ''),
  };
}

/** outId → 可交互节点(设备/门/楼梯/空间等非结构节点)索引,供点击信息卡解析。
 *  多别名注册(id/out_instance_id/twins):运行时对象经 sid/userData.id 携带任一字段值。 */
export function buildPickIndex(tree: SceneTreeNode | null): Map<string, PickNodeInfo> {
  const map = new Map<string, PickNodeInfo>();
  if (!tree) return map;
  const walk = (n: SceneTreeNode): void => {
    const t = n.type;
    if (t && !STRUCTURAL_TYPE_PATTERN.test(t)) {
      const info = toPickInfo(n);
      if (info.outId) {
        for (const k of [info.outId, String(n.id ?? ''), String(n.twins_instance_id ?? '')]) {
          if (k && !map.has(k)) map.set(k, info);
        }
      }
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(tree);
  return map;
}

/**
 * 从拾取 sid 父链解出第一个可展示节点(最近优先:先命中构件自身,再向上)。
 * 全部为结构骨架(点在墙/楼板上)→ null。
 */
export function resolvePick(sids: string[], index: Map<string, PickNodeInfo>): PickNodeInfo | null {
  for (const sid of sids) {
    const hit = index.get(sid);
    if (hit) return hit;
  }
  return null;
}

/**
 * 多命中父链解析:按距离顺序逐链找第一个可展示节点。
 * 墙/楼板挡在设备前时,首链全是结构、设备在后链 → 点击信息卡靠它取到被遮挡对象。
 */
export function resolvePickAcross(chains: string[][], index: Map<string, PickNodeInfo>): PickNodeInfo | null {
  for (const chain of chains) {
    const hit = resolvePick(chain, index);
    if (hit) return hit;
  }
  return null;
}

export interface DeviceSearchItem extends PickNodeInfo {
  storyLabel?: string;
  buildingLabel?: string;
}

/** 可搜索设备索引:非结构节点 + 所在楼层/楼栋标签(楼层用祖先 Story 名推断)。 */
export function buildDeviceSearchIndex(tree: SceneTreeNode | null): DeviceSearchItem[] {
  const items: DeviceSearchItem[] = [];
  if (!tree) return items;
  const walk = (n: SceneTreeNode, story: string | undefined, building: string | undefined): void => {
    const t = n.type;
    const label = nodeLabel(n);
    const nextStory = isStoryNode(n) ? label : story;
    const nextBuilding = nodeType(n).includes('building') ? label : building;
    if (t && !STRUCTURAL_TYPE_PATTERN.test(t)) {
      const info = toPickInfo(n);
      if (info.outId) items.push({ ...info, storyLabel: story, buildingLabel: building });
    }
    for (const c of n.children ?? []) walk(c, nextStory, nextBuilding);
  };
  walk(tree, undefined, undefined);
  return items;
}

/** 搜索过滤:名称/类型/楼层标签不区分大小写包含;按相关度(名称前缀 > 名称 > 类型 > 楼层)。 */
export function searchDevices(items: DeviceSearchItem[], query: string, limit = 50): DeviceSearchItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: Array<{ item: DeviceSearchItem; score: number }> = [];
  for (const it of items) {
    const name = it.name.toLowerCase();
    const type = it.typeLabel.toLowerCase();
    const story = it.storyLabel?.toLowerCase() ?? '';
    let score = -1;
    if (name.startsWith(q)) score = 0;
    else if (name.includes(q)) score = 1;
    else if (type.includes(q)) score = 2;
    else if (story.includes(q)) score = 3;
    if (score >= 0) scored.push({ item: it, score });
  }
  scored.sort((a, b) => a.score - b.score || a.item.name.localeCompare(b.item.name, 'zh-Hans-CN'));
  return scored.slice(0, limit).map((s) => s.item);
}
