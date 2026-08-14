/**
 * 场景树工具：拍平 / 过滤 / 楼层映射。
 * 供消防面板、告警中心、全局设备搜索等复用，避免各处重复递归逻辑。
 */

import { FIRE_TYPE_IDENTIFIERS, FIRE_TYPE_LABELS } from './fire-types';

export type SceneTreeNode = {
  id: string;
  name: string;
  type: string;
  children: SceneTreeNode[];
  twins_instance_id?: string;
  out_instance_id?: string;
  parent_out_instance_id?: string;
};

export type FlatDevice = {
  id: string;
  instanceId: string;
  name: string;
  type: string;
  typeName: string;
  storyName?: string;
  spaceName?: string;
};

/** 与 app/api/ustudio/overview 一致：这些 type 视为容器结构，不算设备。 */
const CONTAINER_PATTERN =
  /building|story|floor|space|wall|door|window|column|pillar|corridor|楼栋|楼层|空间|墙|门|窗|柱|走廊/i;

const STORY_PATTERN = /story|floor|楼层|层$/i;

function isStoryName(name: string): boolean {
  return STORY_PATTERN.test(name);
}

function storyNameFromPath(path: string[]): string | undefined {
  return path.find((name) => isStoryName(name));
}

function makeDevice(node: SceneTreeNode, path: string[]): FlatDevice {
  const storyName = storyNameFromPath(path);
  const spaceName = path.length >= 2 ? path[path.length - 2] : undefined;
  return {
    id: node.id || String(node.out_instance_id || node.twins_instance_id || ''),
    instanceId: String(node.twins_instance_id || node.id || node.out_instance_id || ''),
    name: node.name || node.type,
    type: node.type,
    typeName: FIRE_TYPE_LABELS[node.type] || node.type,
    storyName,
    spaceName,
  };
}

function collect(node: SceneTreeNode, path: string[], out: FlatDevice[], filter: (node: SceneTreeNode) => boolean): void {
  const currentPath = node.name ? [...path, node.name] : path;
  const children = node.children ?? [];

  if (children.length === 0) {
    if (filter(node)) out.push(makeDevice(node, currentPath));
    return;
  }
  for (const child of children) collect(child, currentPath, out, filter);
}

/** 消防设备（按 lib/fire-types 的类型标识过滤）。 */
export function flattenFireDevices(node: SceneTreeNode): FlatDevice[] {
  const out: FlatDevice[] = [];
  collect(node, [], out, (n) => FIRE_TYPE_IDENTIFIERS.has(n.type));
  return out;
}

/** 全部设备：叶子节点中排除容器结构（楼栋/楼层/空间/墙/门/窗/柱…）。 */
export function flattenAllDevices(node: SceneTreeNode): FlatDevice[] {
  const out: FlatDevice[] = [];
  collect(node, [], out, (n) => n.type !== '' && !CONTAINER_PATTERN.test(n.type));
  return out;
}

/** 主体结构白名单:这些 type 保留(不藏)。主体 = 园区/楼栋/楼层/墙/楼梯(含楼板烘焙几何)。 */
const STRUCTURE_KEEP_PATTERN = /site|building|story|floor|wall|stair|楼梯|楼栋|楼层/i;

/**
 * 收集所有"非主体结构"节点的 out_instance_id —— 全局视角全面隐藏减压用。
 * 藏掉 Space/Door/设备/管道/电缆/灯具/家具/装饰… 所有非结构节点(几千~上万小几何),
 * 只留墙/楼板/楼梯/楼栋 → draw call 大降、流畅。参考 code-ms6qsavu "类别隐藏全选"。
 * (参考项目场景墙不在语义树天然留;本场景 Wall 在树里,靠白名单显式保留。)
 */
export function collectNonStructuralOutIds(node: SceneTreeNode): string[] {
  const ids: string[] = [];
  const walk = (n: SceneTreeNode): void => {
    const t = n.type;
    if (t && !STRUCTURE_KEEP_PATTERN.test(t)) {
      const outId = String(n.out_instance_id ?? n.id ?? '');
      if (outId) ids.push(outId);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return ids;
}

/** 按 type 集合收集节点的 out_instance_id(供按类别批量 hide/show)。 */
export function collectByTypes(node: SceneTreeNode, types: string[]): string[] {
  if (types.length === 0) return [];
  const set = new Set(types);
  const ids: string[] = [];
  const walk = (n: SceneTreeNode): void => {
    if (n.type && set.has(n.type)) {
      const outId = String(n.out_instance_id ?? n.id ?? '');
      if (outId) ids.push(outId);
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(node);
  return ids;
}

/** 楼层节点 id → 名称 映射（顶栏「当前楼层」显示用）。 */
export function buildStoryNameMap(node: SceneTreeNode): Record<string, string> {
  const map: Record<string, string> = {};
  const walk = (n: SceneTreeNode): void => {
    if (isStoryName(n.name) && n.id) map[n.id] = n.name;
    for (const child of n.children ?? []) walk(child);
  };
  walk(node);
  return map;
}
