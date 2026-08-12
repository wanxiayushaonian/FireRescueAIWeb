import type { Changeset, ObservationalRecipe, SceneRecipe, StructuralRecipe } from './types';

/** 数组集合相等(顺序无关);null/undefined 视为同(都=未指定) */
function setEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function diffStructural(prev: StructuralRecipe, next: StructuralRecipe): Changeset['structural'] {
  const partial: Partial<StructuralRecipe> = {};
  if (!setEqual(prev.visibleStories, next.visibleStories)) partial.visibleStories = next.visibleStories;
  if (!setEqual(prev.visibleBuildings, next.visibleBuildings)) partial.visibleBuildings = next.visibleBuildings;
  if (prev.mode !== next.mode) partial.mode = next.mode;
  if (prev.yExtend !== next.yExtend) partial.yExtend = next.yExtend;
  if (prev.gisVisible !== next.gisVisible) partial.gisVisible = next.gisVisible;
  if (prev.labels.visible !== next.labels.visible || !setEqual(prev.labels.ids, next.labels.ids)) {
    partial.labels = next.labels;
  }
  if (JSON.stringify(prev.reachable) !== JSON.stringify(next.reachable)) partial.reachable = next.reachable;
  if (JSON.stringify(prev.connectivity) !== JSON.stringify(next.connectivity)) partial.connectivity = next.connectivity;
  return { __touched: Object.keys(partial).length > 0, ...partial };
}

/** routes/polygons 按 id 对齐,仅 visible 变化的项进 changeset */
function diffVisibleList(
  prev: { id: string; visible: boolean }[],
  next: { id: string; visible: boolean }[],
): { id: string; visible: boolean }[] {
  const map: Record<string, boolean> = {};
  for (const r of prev) map[r.id] = r.visible;
  const changed: { id: string; visible: boolean }[] = [];
  for (const r of next) {
    if (!(r.id in map) || map[r.id] !== r.visible) changed.push(r);
  }
  return changed;
}

function diffObservational(prev: ObservationalRecipe, next: ObservationalRecipe): Changeset['observational'] {
  const partial: Partial<ObservationalRecipe> = {};
  if (JSON.stringify(prev.focus) !== JSON.stringify(next.focus)) partial.focus = next.focus;
  if (JSON.stringify(prev.viewpoint) !== JSON.stringify(next.viewpoint)) partial.viewpoint = next.viewpoint;
  const routesChanged = diffVisibleList(prev.routes, next.routes);
  const polygonsChanged = diffVisibleList(prev.polygons, next.polygons);
  let touched = partial.focus !== undefined || partial.viewpoint !== undefined;
  if (routesChanged.length > 0) { partial.routes = routesChanged; touched = true; }
  if (polygonsChanged.length > 0) { partial.polygons = polygonsChanged; touched = true; }
  return { __touched: touched, ...partial };
}

/**
 * 结构层、观察层独立 diff(正交)。
 * 任层无变更 → 该层 __touched:false,apply 时整层跳过。
 * 观察层 patch 永不触发结构层 changeset。
 */
export function diffRecipe(prev: SceneRecipe, next: SceneRecipe): Changeset {
  return {
    structural: diffStructural(prev.structural, next.structural),
    observational: diffObservational(prev.observational, next.observational),
  };
}
