/**
 * 从场景树提取楼栋/楼层结构(纯逻辑,从 FloorDisplayPanel 提取供楼层开关复用)。
 * 无 building 节点时,所有 story 归入"全部楼层"分组。
 */
import type { SceneTreeNode } from './ustudio';

export type StoryOption = {
  key: string; // twins_instance_id(UI 状态唯一标识)
  outId: string; // out_instance_id(SDK 调用用)
  nodeId: string;
  label: string;
  node: SceneTreeNode;
};

export type BuildingOption = {
  key: string;
  outId: string;
  label: string;
  node: SceneTreeNode | null;
  stories: StoryOption[];
};

function nodeType(node: SceneTreeNode | null | undefined): string {
  return String(node?.twins_identifier ?? node?.type ?? '').toLowerCase();
}
function nodeOutId(node: SceneTreeNode | null | undefined): string {
  return String(node?.out_instance_id ?? node?.id ?? node?.twins_instance_id ?? '');
}
function nodeTwinId(node: SceneTreeNode | null | undefined): string {
  return String(node?.twins_instance_id ?? node?.id ?? node?.out_instance_id ?? '');
}
function nodeLabel(node: SceneTreeNode | null | undefined, fallback: string): string {
  return String(node?.twins_instance_name ?? node?.name ?? fallback);
}
function childrenOf(node: SceneTreeNode | null | undefined): SceneTreeNode[] {
  return Array.isArray(node?.children) ? node.children : [];
}
function walk(node: SceneTreeNode | null | undefined, visit: (n: SceneTreeNode) => void): void {
  if (!node) return;
  visit(node);
  childrenOf(node).forEach((c) => walk(c, visit));
}
function isBuilding(node: SceneTreeNode): boolean {
  const t = nodeType(node);
  return t === 'building' || t.endsWith('building') || t.includes('building');
}
function isStory(node: SceneTreeNode): boolean {
  const t = nodeType(node);
  return t === 'story' || t.endsWith('story') || t.includes('floor');
}
function sortStory(a: StoryOption, b: StoryOption): number {
  const na = Number(a.label.match(/-?\d+/)?.[0] ?? Number.NaN);
  const nb = Number(b.label.match(/-?\d+/)?.[0] ?? Number.NaN);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.label.localeCompare(b.label, 'zh-Hans-CN');
}

export function extractBuildings(tree: SceneTreeNode | null): BuildingOption[] {
  if (!tree) return [];
  const roots: SceneTreeNode[] = [tree];
  const buildings: SceneTreeNode[] = [];
  const allStories: SceneTreeNode[] = [];
  roots.forEach((root) => {
    walk(root, (node) => {
      if (isBuilding(node)) buildings.push(node);
      if (isStory(node)) allStories.push(node);
    });
  });
  const collectStories = (node: SceneTreeNode): SceneTreeNode[] => {
    const stories: SceneTreeNode[] = [];
    walk(node, (child) => {
      if (child !== node && isStory(child)) stories.push(child);
    });
    return stories;
  };
  if (buildings.length === 0) {
    const stories = allStories.map((story, index) => ({
      key: nodeTwinId(story) || `story-${index}`,
      outId: nodeOutId(story),
      nodeId: nodeTwinId(story),
      label: nodeLabel(story, `${index + 1}F`),
      node: story,
    }));
    stories.sort(sortStory);
    return [{ key: 'all-buildings', outId: '', label: '全部楼层', node: null, stories }];
  }
  return buildings.map((building, bi) => {
    const stories = collectStories(building).map((story, si) => ({
      key: nodeTwinId(story) || `${nodeOutId(building)}-${si}`,
      outId: nodeOutId(story),
      nodeId: nodeTwinId(story),
      label: nodeLabel(story, `${si + 1}F`),
      node: story,
    }));
    stories.sort(sortStory);
    return {
      key: nodeOutId(building) || nodeTwinId(building) || `building-${bi}`,
      outId: nodeOutId(building),
      label: nodeLabel(building, `楼栋 ${bi + 1}`),
      node: building,
      stories,
    };
  });
}

/**
 * 反向索引:任意 out_instance_id → 其所属楼层信息。
 * 用于 hover 拾取到墙/Space 等叶子对象时,反查它属于哪一层。
 * DFS 下钻时维护"当前 Story / 当前 Building"上下文;Story 节点自身也映射到自己。
 * 无 building 节点时 buildingLabel 统一为"全部楼层"。
 */
export type StoryLookupEntry = {
  storyOutId: string;
  storyLabel: string;
  buildingLabel: string;
};

export function buildOutIdToStoryIndex(tree: SceneTreeNode | null): Map<string, StoryLookupEntry> {
  const map = new Map<string, StoryLookupEntry>();
  if (!tree) return map;

  let hasBuilding = false;
  walk(tree, (n) => {
    if (isBuilding(n)) hasBuilding = true;
  });

  const visit = (
    node: SceneTreeNode,
    storyCtx: StoryLookupEntry | null,
    buildingLabel: string,
  ): void => {
    let nextStory = storyCtx;
    let nextBuildingLabel = buildingLabel;
    if (isBuilding(node)) {
      nextBuildingLabel = nodeLabel(node, buildingLabel);
    }
    if (isStory(node)) {
      nextStory = {
        storyOutId: nodeOutId(node),
        storyLabel: nodeLabel(node, '楼层'),
        buildingLabel: nextBuildingLabel,
      };
      const selfOut = nodeOutId(node);
      if (selfOut) map.set(selfOut, nextStory);
    } else if (storyCtx) {
      const outId = nodeOutId(node);
      if (outId) map.set(outId, storyCtx);
    }
    for (const child of childrenOf(node)) {
      visit(child, nextStory, nextBuildingLabel);
    }
  };

  visit(tree, null, hasBuilding ? '' : '全部楼层');
  return map;
}
