type SceneTreeNode = { id: string; name: string; type: string; children?: SceneTreeNode[] };

const cache = new Map<string, { at: number; tree: SceneTreeNode }>();
const TTL_MS = 60_000;

/**
 * 前端按 sceneId 拉场景树并短缓存,供 setViewMode 等需要 treeData 的 API 使用。
 * 与 MCP 端 getSceneTree 不同的缓存实例(浏览器侧,按用户视角的 sceneId)。
 */
export async function getSceneTreeForView(sceneId: string): Promise<SceneTreeNode> {
  const hit = cache.get(sceneId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tree;
  const res = await fetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(sceneId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`加载场景树失败: ${res.status}`);
  const tree = (await res.json()) as SceneTreeNode;
  cache.set(sceneId, { at: Date.now(), tree });
  return tree;
}

/** 仅测试用:清空场景树缓存。 */
export function __resetSceneTreeCacheForTest(): void {
  cache.clear();
}
