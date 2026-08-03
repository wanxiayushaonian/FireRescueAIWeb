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
