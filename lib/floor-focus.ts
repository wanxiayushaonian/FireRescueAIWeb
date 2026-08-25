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
 * 从自由文本中抽取楼层段 → 规范化 spec(供 parseFloorSpec 使用);抽不到返回 null。
 * 用于对抗特情 location("5F影院放映厅"/"B1配电间")等 agent 自然语言输出——
 * parseFloorSpec 锚定整串必然 miss,先抽取再聚焦(2026-08-24 实测 5/5 miss 后补)。
 *
 * 规则:区间优先("8-10F"/"8F至10F"),再单层(数字+F,或 B+数字);
 * 纯数字不带 F 不认(避免误吞"21号楼""被困5人"等语境数字);上限 3 位楼层号。
 */
export function extractFloorSpecFromText(text: string): string | null {
  if (!text) return null;
  const floors: number[] = [];
  const pushToken = (raw: string): void => {
    const n = parseFloorToken(raw.replace(/\s/g, ''));
    if (n !== null && Math.abs(n) <= 999) floors.push(n);
  };
  // 区间:"8-10F" / "8F-10F" / "8F至10F"(右端必须带 F,左端可省)
  const rangeRe = /([Bb]?\d{1,3})\s*[FfＦ]?\s*[-–—~～至]\s*([Bb]?\d{1,3})\s*[FfＦ]/g;
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(text)) !== null) {
    const a = parseFloorToken(m[1]);
    const b = parseFloorToken(m[2]);
    if (a === null || b === null) continue;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    if (hi - lo + 1 > MAX_FLOOR_SPAN) continue;
    for (let i = lo; i <= hi; i += 1) floors.push(i);
  }
  const rest = text.replace(rangeRe, ' ');
  // 单层:数字+F("5F影院")或 B+数字、F 可省("B1配电间")
  const singleRe = /([Bb]\d{1,3}\s*[FfＦ]?|\d{1,3}\s*[FfＦ])/g;
  while ((m = singleRe.exec(rest)) !== null) pushToken(m[1]);
  if (floors.length === 0) return null;
  const uniq = [...new Set(floors)].sort((x, y) => x - y);
  return uniq.map((n) => (n < 0 ? `B${-n}` : `${n}F`)).join(',');
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
