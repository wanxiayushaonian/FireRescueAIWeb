import type { ConfrontationDelta, ConfrontationEvent } from './confront-store';

export interface SpecialCandidate {
  readonly specialType?: string;
  readonly emergency: string;
  readonly location?: string;
  readonly delta?: ConfrontationDelta;
}

export interface SpecialQualityResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly canonicalType: string;
  readonly reason?: string;
  readonly similarity?: number;
}

const TYPE_ALIASES: Array<[string, readonly string[]]> = [
  ['wind_shift', ['wind_shift', '风向', '大风', '烟气倒灌']],
  ['explosion', ['explosion', '爆炸', '轰燃', '爆燃']],
  ['secondary_trapped', ['secondary_trapped', '二次被困', '新增被困', '人员被困']],
  ['equipment_failure', ['equipment_failure', '装备故障', '供水中断', '水带爆裂', '云梯故障']],
  ['collapse', ['collapse', '坡塌', '坍塌', '结构失稳', '结构异响']],
  ['smoke_spread', ['smoke_spread', '烟气蔓延', '排烟失效', '能见度下降']],
  ['evacuation_blocked', ['evacuation_blocked', '疏散通道阻断', '楼梯间受阻', '出口封堵']],
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function canonicalFromText(text: string): string {
  const haystack = normalize(text);
  for (const [type, aliases] of TYPE_ALIASES) {
    if (aliases.some((alias) => haystack.includes(normalize(alias)))) return type;
  }
  return 'unknown';
}

/** 允许 Agent 返回中英文/自由 type，最终归一为稳定特情类型。 */
export function canonicalSpecialType(candidate: SpecialCandidate): string {
  const declared = canonicalFromText(candidate.specialType ?? '');
  if (declared !== 'unknown') return declared;
  const described = canonicalFromText(candidate.emergency);
  if (described !== 'unknown') return described;
  return normalize(candidate.specialType ?? '') || 'unknown';
}

function bigrams(value: string): Set<string> {
  const text = normalize(value);
  if (text.length < 2) return new Set(text ? [text] : []);
  const out = new Set<string>();
  for (let i = 0; i < text.length - 1; i += 1) out.add(text.slice(i, i + 2));
  return out;
}

/** 字符 bigram Jaccard：足以拦截“5F影院电气短路引发轰燃”这类轻微改写。 */
export function specialTextSimilarity(a: string, b: string): number {
  const aa = bigrams(a);
  const bb = bigrams(b);
  if (aa.size === 0 || bb.size === 0) return 0;
  let intersection = 0;
  for (const item of aa) if (bb.has(item)) intersection += 1;
  return intersection / (aa.size + bb.size - intersection);
}

export function evaluateSpecialQuality(
  candidate: SpecialCandidate,
  history: readonly ConfrontationEvent[],
): SpecialQualityResult {
  const previous = history.filter((event) => event.kind === 'inject');
  const declaredType = canonicalFromText(candidate.specialType ?? '');
  const describedType = canonicalFromText(candidate.emergency);
  if (declaredType !== 'unknown' && describedType !== 'unknown' && declaredType !== describedType) {
    return {
      accepted: false,
      duplicate: false,
      canonicalType: declaredType,
      reason: `特情类型与描述不一致:声明为 ${declaredType},描述更像 ${describedType}`,
    };
  }
  const canonicalType = canonicalSpecialType(candidate);
  const usedTypes = new Set(previous.map((event) => canonicalSpecialType({
    specialType: event.specialType,
    emergency: event.emergency,
    location: event.location,
  })));
  if (canonicalType !== 'unknown' && usedTypes.has(canonicalType)) {
    return { accepted: false, duplicate: true, canonicalType, reason: `特情类型 ${canonicalType} 本局已使用` };
  }

  for (const event of previous) {
    const similarity = specialTextSimilarity(candidate.emergency, event.emergency);
    if (similarity >= 0.5) {
      return {
        duplicate: true,
        accepted: false,
        canonicalType,
        similarity,
        reason: `与特情 #${event.seq} 描述高度相似(${similarity.toFixed(2)})`,
      };
    }
  }
  const delta = candidate.delta;
  const hasStateImpact = Boolean(
    delta?.wind
    || (delta?.fireLevelDelta != null && delta.fireLevelDelta !== 0)
    || (delta?.trappedDelta != null && delta.trappedDelta !== 0)
    || (delta?.damageDelta != null && delta.damageDelta !== 0),
  );
  if (!hasStateImpact) {
    return {
      accepted: false,
      duplicate: false,
      canonicalType,
      reason: '特情缺少有效态势增量(delta)，无法驱动后续推演',
    };
  }
  return { accepted: true, duplicate: false, canonicalType };
}
