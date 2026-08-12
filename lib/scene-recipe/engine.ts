import type { ApplyResult, Changeset, RecipeRuntime } from './types';
import type { SceneTreeNode } from '../ustudio';

// 项目暂无 lib/logger.ts;engine 用 console 后备(与现有 lib 多数模块一致)
const logger = console;

/** 单次 SDK 调用包装:失败记入 failed 不阻断其余(best-effort) */
async function safe(
  field: string,
  fn: () => unknown,
  applied: string[],
  failed: ApplyResult['failed'],
): Promise<void> {
  try {
    await fn();
    applied.push(field);
  } catch (error) {
    failed.push({ field, error });
    logger.warn(`[scene-recipe] apply ${field} failed`, error);
  }
}

// tree 解析(与 src/components/FloorDisplayPanel 同源逻辑;后续可抽取到共用 tree-utils)
function nodeType(n: unknown): string {
  const node = n as { twins_identifier?: string; type?: string } | null;
  return String(node?.twins_identifier ?? node?.type ?? '').toLowerCase();
}
function walk(node: SceneTreeNode | null, visit: (n: SceneTreeNode) => void): void {
  if (!node) return;
  visit(node);
  const kids = Array.isArray((node as { children?: unknown }).children) ? (node as { children: SceneTreeNode[] }).children : [];
  for (const c of kids) walk(c, visit);
}
function collectAllStoryIds(tree: SceneTreeNode): string[] {
  const ids: string[] = [];
  walk(tree, (n) => {
    const t = nodeType(n);
    if (t === 'story' || t.endsWith('story') || t.includes('floor')) {
      ids.push(String((n as { out_instance_id?: string; id?: string }).out_instance_id ?? (n as { id?: string }).id ?? ''));
    }
  });
  return ids.filter(Boolean);
}
function collectAllBuildingIds(tree: SceneTreeNode): string[] {
  const ids: string[] = [];
  walk(tree, (n) => {
    const t = nodeType(n);
    if (t === 'building' || t.endsWith('building') || t.includes('building')) {
      ids.push(String((n as { out_instance_id?: string; id?: string }).out_instance_id ?? (n as { id?: string }).id ?? ''));
    }
  });
  return ids.filter(Boolean);
}

/**
 * 把 changeset 按顺序应用到 runtime:结构层先(降渲染量)→ 观察层后(依赖结构层已应用)。
 * 幂等:只对 __touched 字段发调用。best-effort:单调用失败不阻断其余。
 */
export async function applyRecipe(
  runtime: RecipeRuntime,
  tree: SceneTreeNode,
  cs: Changeset,
): Promise<ApplyResult> {
  const applied: string[] = [];
  const failed: ApplyResult['failed'] = [];

  // 阶段1:结构层
  if (cs.structural.__touched) {
    const s = cs.structural;
    // setViewMode:楼层/楼栋/mode/yExtend 任一变更即应用。
    // storyIds:显式子集用子集;null/undefined(全集或仅切 mode)用 collectAllStoryIds(tree)。
    const storiesChanged = s.visibleStories !== undefined;
    const buildingsChanged = s.visibleBuildings !== undefined;
    const modeChanged = s.mode !== undefined;
    const yExtendChanged = s.yExtend !== undefined;
    if (storiesChanged || buildingsChanged || modeChanged || yExtendChanged) {
      const storyIds = s.visibleStories ?? collectAllStoryIds(tree);
      const buildingIds = s.visibleBuildings ?? collectAllBuildingIds(tree);
      const mode = s.mode ?? '3D';
      const params: { type: string; ids: string[] }[] = [{ type: mode, ids: storyIds }];
      if (s.yExtend ?? false) params.push({ type: 'YExtend', ids: storyIds });
      await safe('setViewMode', () => runtime.setViewMode(params, tree, storyIds, buildingIds), applied, failed);
    }
    if (s.gisVisible !== undefined) await safe('gisVisible', () => runtime.setGisVisible(s.gisVisible!), applied, failed);
    if (s.labels !== undefined) {
      if (s.labels.visible) await safe('labels', () => runtime.showLabels(tree, s.labels!.ids, undefined), applied, failed);
      else await safe('labels', () => runtime.hideLabels(), applied, failed);
    }
    if (s.reachable !== undefined) await safe('reachable', () => runtime.setScene({ reachable: true, nodeId: s.reachable!.nodeId }), applied, failed);
    else if (s.connectivity !== undefined) await safe('connectivity', () => runtime.setScene({ connectivity: true, spaceId: s.connectivity!.spaceId }), applied, failed);
  }

  // 阶段2:观察层(必须在结构层之后:flyToObject 要求目标在可见楼层内)
  if (cs.observational.__touched) {
    const o = cs.observational;
    if (o.focus !== undefined && o.focus) {
      await safe('focus', async () => {
        await runtime.flyToObject(o.focus!.objectId);
        runtime.highlightObject(o.focus!.objectId, o.focus!.highlightColor);
      }, applied, failed);
    } else if (o.viewpoint !== undefined && o.viewpoint) {
      await safe('viewpoint', () => runtime.setCameraViewpoint(o.viewpoint!, true), applied, failed);
    }
    if (o.routes) {
      for (const r of o.routes) await safe(`route:${r.id}`, () => runtime.setVirtualRouteVisible(r.id, r.visible), applied, failed);
    }
    if (o.polygons) {
      for (const p of o.polygons) await safe(`polygon:${p.id}`, () => runtime.setVirtualPolygonVisible(p.id, p.visible), applied, failed);
    }
  }

  return { applied, failed };
}
