// 位置指代分词器(纯函数):把智能体文本里的可定位指代切成片段。
// 三类锚点:
//   floor 楼层段 —— "5F"/"B1F"/"3-4F"/"13层"(spec 归一为 focus_floors 语汇)
//   type  设施类型 —— 静态消防设施中文标签(与 scene://type 链接同一套联动)
//   gis   地名实体 —— 客户端地名簿(重点建筑/重点单位/队站,见 lib/gazetteer.ts)
// 重叠时取更长跨度;同长按 gis > type > floor。渲染端见 src/components/RichLocationText.tsx。

export type LocationAnchor =
  | { kind: 'floor'; spec: string }
  | { kind: 'type'; label: string }
  | { kind: 'gis'; name: string; lng: number; lat: number };

export interface TextSegment {
  readonly text: string;
  readonly anchor?: LocationAnchor;
}

export interface LinkifyVocab {
  readonly gisEntities?: ReadonlyMap<string, { name: string; lng: number; lat: number }>;
}

interface Candidate {
  readonly start: number;
  readonly end: number;
  readonly prio: number;
  readonly anchor: LocationAnchor;
}

const PRIORITY = { floor: 1, type: 2, gis: 3 } as const;

const FLOOR_RE = new RegExp(
  '(?<![0-9A-Za-z.])(\\d{1,2}[-–—]\\d{1,2}[Ff]|B?\\d{1,2}[Ff]|\\d{1,2}\\s*层)(?![0-9A-Za-z])',
  'g',
);

/** 匹配原文 → 楼层 spec(focus_floors 语汇);"13层"/"13 层" → "13F"。 */
function floorSpec(raw: string): string {
  const cn = raw.match(/^(\d{1,2})\s*层$/);
  if (cn) return `${cn[1]}F`;
  return raw.toUpperCase().replace(/[-–—]/, '-');
}

// 场景消防设施中文标签(来自 lib/fire-types / lib/scene-categories 的静态词表,
// 剔除 门/楼梯/墙体 等结构与载具词;长词优先匹配由调用方排序保证)。
export const LOCATION_TYPE_LABELS: ReadonlySet<string> = new Set([
  '室内消火栓', '室外消火栓', '水泵接合器', '喷淋嘴', '闭式喷淋头', '感烟探测器', '感烟报警器',
  '手动报警按钮', '正压送风机', '排烟风机', '应急照明', '疏散标志', '灭火器箱', '手提灭火器',
  '消防电梯', '防烟楼梯间', '避难层',
]);

function collectFloors(text: string, out: Candidate[]): void {
  FLOOR_RE.lastIndex = 0;
  for (let m = FLOOR_RE.exec(text); m; m = FLOOR_RE.exec(text)) {
    const raw = m[0];
    const anchor: LocationAnchor = { kind: 'floor', spec: floorSpec(raw) };
    out.push({ start: m.index, end: m.index + raw.length, prio: PRIORITY.floor, anchor });
  }
}

function collectSubstrings(
  text: string,
  terms: readonly string[],
  prio: number,
  make: (term: string) => LocationAnchor | null,
  out: Candidate[],
): void {
  const lower = text.toLowerCase();
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    const needle = term.toLowerCase();
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(needle, from);
      if (idx < 0) break;
      const anchor = make(term);
      if (anchor) out.push({ start: idx, end: idx + term.length, prio, anchor });
      from = idx + term.length;
    }
  }
}

/**
 * 重叠消解:从左到右贪心——起点相同时先取更长者;发生重叠时仅当新候选跨度更长
 * (同长优先级更高)才替换上一个。O(n log n),覆盖本场景全部实际重叠形态。
 */
function resolveOverlaps(cands: Candidate[]): Candidate[] {
  const sorted = cands.slice().sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    const lenDiff = (b.end - b.start) - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    return b.prio - a.prio;
  });
  const picked: Candidate[] = [];
  for (const c of sorted) {
    const last = picked[picked.length - 1];
    if (!last || c.start >= last.end) {
      picked.push(c);
      continue;
    }
    const cLen = c.end - c.start;
    const lastLen = last.end - last.start;
    if (cLen > lastLen && (picked.length < 2 || c.start >= picked[picked.length - 2].end)) {
      picked[picked.length - 1] = c;
    }
  }
  return picked.sort((a, b) => a.start - b.start);
}

/** 把文本切成分段(anchor 缺省即普通文本)。纯函数、无副作用、可幂等重入。 */
export function linkifyText(text: string, vocab: LinkifyVocab = {}): TextSegment[] {
  const cands: Candidate[] = [];
  collectFloors(text, cands);
  collectSubstrings(text, [...LOCATION_TYPE_LABELS].sort((a, b) => b.length - a.length), PRIORITY.type, (label) => ({ kind: 'type', label }), cands);
  if (vocab.gisEntities?.size) {
    const names = [...new Set([...vocab.gisEntities.values()].map((e) => e.name))].sort((a, b) => b.length - a.length);
    collectSubstrings(text, names, PRIORITY.gis, (name) => {
      const key = name.toLowerCase().replace(/[\s·・()（）]/g, '');
      const e = vocab.gisEntities!.get(key);
      return e ? { kind: 'gis', name, lng: e.lng, lat: e.lat } : null;
    }, cands);
  }
  const picked = resolveOverlaps(cands);
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const c of picked) {
    if (c.start < cursor) continue;
    if (c.start > cursor) segments.push({ text: text.slice(cursor, c.start) });
    segments.push({ text: text.slice(c.start, c.end), anchor: c.anchor });
    cursor = c.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
