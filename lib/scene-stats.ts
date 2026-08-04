import { FIRE_TYPE_IDENTIFIERS } from './fire-types';

export type SceneNodeLike = {
  type?: string;
  children?: unknown[];
};

export type SceneStats = { story: number; device: number; fire: number };

const STORY_PATTERN = /story|floor|楼层|层$/i;
const CONTAINER_PATTERN =
  /building|story|floor|space|wall|door|window|column|pillar|corridor|楼栋|楼层|空间|墙|门|窗|柱|走廊/i;

/** 递归深度上限:防异常/恶意超深树导致栈溢出。正常建筑场景树深度远小于此。 */
const MAX_DEPTH = 50;

function countNode(node: SceneNodeLike, depth: number): SceneStats {
  const type = String(node.type ?? '');
  const children = Array.isArray(node.children) ? (node.children as SceneNodeLike[]) : [];
  const isStory = STORY_PATTERN.test(type);
  const stats: SceneStats = { story: isStory ? 1 : 0, device: 0, fire: 0 };

  if (children.length === 0) {
    if (FIRE_TYPE_IDENTIFIERS.has(type)) stats.fire = 1;
    else if (type !== '' && !CONTAINER_PATTERN.test(type)) stats.device = 1;
    return stats;
  }

  // 截断:到达深度上限后放弃更深层统计,换取不栈溢出。
  if (depth >= MAX_DEPTH) return stats;

  for (const child of children) {
    const c = countNode(child, depth + 1);
    stats.story += c.story;
    stats.device += c.device;
    stats.fire += c.fire;
  }
  return stats;
}

/**
 * 统计场景树的楼层 / 普通设备 / 消防设备节点数。
 * 服务端 overview 统计与 mcp-server 拍平过滤共用同一套类型判定。
 */
export function countSceneNodes(node: SceneNodeLike): SceneStats {
  return countNode(node, 0);
}
