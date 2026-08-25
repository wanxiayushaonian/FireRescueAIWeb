/** znya 设施台账 ↔ uStudio 场景树类型数量对账纯函数。 */

export interface LedgerFacilityLike {
  readonly facilityType: string;
  readonly name?: string;
  readonly status?: string;
  readonly locationPath?: string;
}

export interface SceneFacilityCountsLike {
  readonly total?: number;
  readonly fireByTypeLabel?: Record<string, number>;
  readonly fireByFloor?: Record<string, number>;
  readonly floors?: string[];
}

const TYPE_RULES: Array<[RegExp, string]> = [
  [/室内消火栓|消火栓|IndoorFireHydrant/i, '室内消火栓'],
  [/水泵接合器|PumpAdapter/i, '水泵接合器'],
  [/水箱|水泵|Shuixiangshuibeng/i, '水箱水泵'],
  [/喷淋|喷头|Sprinkler/i, '喷淋嘴'],
  [/感烟|烟感|Smoke/i, '感烟探测器'],
  [/手动报警|ManualFireAlarm/i, '手动报警按钮'],
  [/正压送风|PositivePressure/i, '正压送风机'],
  [/排烟|SmokeExhaust/i, '排烟风机'],
  [/应急照明|EmergencyLighting/i, '应急照明'],
  [/疏散标志|安全出口|EvacuationSign/i, '疏散标志'],
  [/灭火器|Extinguisher/i, '灭火器箱'],
  [/消控室|控制台|Kongzhitai/i, '消控室控制台'],
];

export function normalizeFacilityType(raw: string): string {
  const value = raw.trim();
  for (const [rule, label] of TYPE_RULES) if (rule.test(value)) return label;
  return value || '未分类';
}

export function reconcileFacilityCounts(
  ledger: readonly LedgerFacilityLike[],
  scene: SceneFacilityCountsLike | null,
  opts: { ledgerTruncated?: boolean; sceneOnline?: boolean } = {},
) {
  const ledgerByType: Record<string, number> = {};
  const ledgerStatus: Record<string, number> = {};
  for (const item of ledger) {
    const label = normalizeFacilityType(`${item.facilityType} ${item.name ?? ''}`);
    ledgerByType[label] = (ledgerByType[label] ?? 0) + 1;
    const status = item.status?.trim() || '未知';
    ledgerStatus[status] = (ledgerStatus[status] ?? 0) + 1;
  }
  const sceneByType = scene?.fireByTypeLabel ?? {};
  const labels = [...new Set([...Object.keys(ledgerByType), ...Object.keys(sceneByType)])].sort();
  const differences = labels.map((type) => {
    const ledgerCount = ledgerByType[type] ?? 0;
    const sceneCount = sceneByType[type] ?? 0;
    return {
      type,
      ledgerCount,
      sceneCount,
      delta: sceneCount - ledgerCount,
      status: ledgerCount === sceneCount
        ? 'matched'
        : ledgerCount === 0
          ? 'scene_only'
          : sceneCount === 0
            ? 'ledger_only'
            : 'count_mismatch',
    };
  });
  const warnings: string[] = [];
  if (opts.ledgerTruncated) warnings.push('znya 台账超过当前查询上限，本次对账不完整');
  if (opts.sceneOnline === false || !scene) warnings.push('浏览器/3D 场景不在线，无法取得场景树设施统计');
  return {
    data: {
      ledger: { total: ledger.length, byType: ledgerByType, byStatus: ledgerStatus },
      scene: scene ? {
        total: scene.total ?? 0,
        byType: sceneByType,
        byFloor: scene.fireByFloor ?? {},
        floors: scene.floors ?? [],
      } : null,
      differences,
      summary: {
        matched: differences.filter((x) => x.status === 'matched').length,
        mismatched: differences.filter((x) => x.status !== 'matched').length,
      },
    },
    meta: {
      source: ['znya-postgresql.fire_facilities', 'ustudio-scene-tree'],
      updated_at: new Date().toISOString(),
      completeness: scene && !opts.ledgerTruncated ? 1 : scene || ledger.length > 0 ? 0.5 : 0,
      truncated: Boolean(opts.ledgerTruncated),
      warnings,
    },
  };
}
