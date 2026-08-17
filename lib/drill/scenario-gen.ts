// 演练灾情参数生成(纯函数):手动设定之外的两条生成路径。
//  - 随机生成:各参数在建筑合理范围内确定性伪随机(可注入 seed,测试可复现)
//  - 按建筑生成:用 znya 档案(keyFloors 重点部位/功能)针对性推导着火楼层与物质
import type { DisasterScenario, BuildingStructure } from './disaster-state';
import type { RealBuildingProfile } from '@/lib/building-mapper';

/** 燃烧物质选项(针对高层综合体) */
export const MATERIAL_OPTIONS = ['电气', '燃气', '油类', '普通固体', '危化品'] as const;

/** 功能关键词 → 燃烧物质(按建筑重点部位推导) */
const FUNC_TO_MATERIAL: Array<[RegExp, string]> = [
  [/厨房|餐饮|燃气/i, '燃气'],
  [/油|储油|柴油|发电机/i, '油类'],
  [/危化|化学|仓库|储存/i, '危化品'],
  [/配电|变电|电气|机房/i, '电气'],
];

export function hazardToMaterial(source: string | undefined): string {
  if (!source) return '普通固体';
  for (const [re, mat] of FUNC_TO_MATERIAL) {
    if (re.test(source)) return mat;
  }
  return '普通固体';
}

/** 确定性伪随机(LCG;同 seed 同序列,测试可复现) */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 随机灾情(seed 缺省取当前时间,便于复现可显式传) */
export function generateRandomScenario(base: DisasterScenario, seed?: number): DisasterScenario {
  const rnd = lcg(seed ?? Date.now());
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const range = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));
  return {
    firePoint: base.firePoint,
    material: pick(MATERIAL_OPTIONS),
    trappedCount: range(1, 12),
    windDirection: range(0, 359),
    windSpeed: range(1, 8),
    buildingStructure: base.buildingStructure,
    initialFireLevel: range(1, 3),
  };
}

/**
 * 按建筑档案针对性生成:从 keyFloors(重点部位)随机选着火部位,
 * 物质由部位功能推导;被困人数按功能粗略估计。档案不可用返回 null。
 */
export function generateBuildingScenario(
  base: DisasterScenario,
  profile: RealBuildingProfile | null | undefined,
  seed?: number,
): DisasterScenario | null {
  if (!profile || profile.keyFloors.length === 0) return null;
  const rnd = lcg(seed ?? Date.now());
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  const range = (lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));

  const part = pick(profile.keyFloors);
  const material = hazardToMaterial(`${part.func} ${part.hazardSource ?? ''}`);
  return {
    firePoint: base.firePoint,
    material,
    trappedCount: range(1, Math.max(2, material === '危化品' ? 6 : 10)),
    windDirection: range(0, 359),
    windSpeed: range(1, 8),
    buildingStructure: base.buildingStructure,
    initialFireLevel: range(1, 3),
    // 着火部位信息(展示/briefing 用)
    fireFloor: part.floor,
    fireLocation: part.name || part.floor,
  };
}

/** 生成简报:把自定义灾情参数组织成启动提示词(替代剧本写死 briefing 的开头) */
export function buildScenarioBriefing(scenario: DisasterScenario, floorLabel?: string): string {
  const floor = floorLabel ?? scenario.fireLocation ?? '着火层';
  return (
    `演练开始:21号楼 ${floor} 发生${scenario.material}火灾,初始火势 ${scenario.initialFireLevel ?? 1} 级,` +
    `被困约 ${scenario.trappedCount} 人,风向 ${scenario.windDirection}°,风速 ${scenario.windSpeed} m/s。` +
    '请评估态势、部署力量、下达战术决策(出水压制/排烟/搜救/泡沫)。'
  );
}
