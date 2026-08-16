// 楼层聚焦纯函数:档案 key_floors 的楼层段("1F"/"2-5F"/"B1F") → 场景树 Story 节点 out_instance_id。
// 供 BuildingProfilePanel 楼层卡片点击 → RecipeStore.patchStructural({visibleStories, yExtend})。
// 楼层号语义:地上层为正("3F"/"F3"/"3" → 3),地下层为负("B2F"/"B2" → -2)。

import type { SceneTreeNode } from './device-tree';

/** 防呆上限:楼层段展开的层数封顶(数据脏时防一次点卡生成超大数组)。 */
const MAX_FLOOR_SPAN = 200;

/** 解析单个楼层名 → 楼层号(地下层为负)。无法解析返回 null。 */
export function parseFloorToken(token: string): number | null {
  const t = token.trim().toUpperCase();
  // 形态:B2F / BF2 / 3F / F3 / 3 / B2(B=地下,F 可省可前可后)
  const m = /^(B)?F?(\d+)F?$/.exec(t);
  if (!m) return null;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return null;
  return m[1] ? -n : n;
}

/**
 * 解析楼层段 → 升序楼层号列表。
 * 支持:"1F"、"2-5F"、"10-25F"、"B2-B1F"、逗号/顿号/斜杠混合列表("16F/30F");无法解析返回 null。
 */
export function parseFloorSpec(spec: string): number[] | null {
  const items = spec
    .split(/[,，、;；/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  const out: number[] = [];
  for (const item of items) {
    const parts = item.split(/\s*[-–—~～至]\s*/);
    if (parts.length === 1) {
      const n = parseFloorToken(parts[0]);
      if (n === null) return null;
      out.push(n);
    } else if (parts.length === 2) {
      const a = parseFloorToken(parts[0]);
      const b = parseFloorToken(parts[1]);
      if (a === null || b === null) return null;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      if (hi - lo + 1 > MAX_FLOOR_SPAN) return null;
      for (let i = lo; i <= hi; i += 1) out.push(i);
    } else {
      return null;
    }
  }
  return [...new Set(out)].sort((x, y) => x - y);
}

/**
 * 在场景树中按楼层段匹配 Story 节点,返回 out_instance_id 列表(供 Recipe visibleStories / setViewMode ids)。
 * 只认 type==='Story' 且楼层名可解析的节点;匹配不到返回空数组(调用方据此提示,不做猜测)。
 */
export function storyIdsForFloorSpec(tree: SceneTreeNode, spec: string): string[] {
  const floors = parseFloorSpec(spec);
  if (!floors) return [];
  const wanted = new Set(floors);
  const ids: string[] = [];
  const walk = (n: SceneTreeNode): void => {
    if (n.type === 'Story') {
      const f = parseFloorToken(n.name);
      if (f !== null && wanted.has(f)) {
        const outId = String(n.out_instance_id ?? n.id ?? '');
        if (outId) ids.push(outId);
      }
    }
    for (const c of n.children ?? []) walk(c);
  };
  walk(tree);
  return ids;
}
