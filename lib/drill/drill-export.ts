/**
 * drill-export.ts — 演练事件导出(2026-08-19)。
 *
 * 用途:导出整场演练的事件流与合理性指标,供赛后检验演练质量——
 * 剧本是否跑得太久、对抗特情是否注入过密(变成捣蛋而非考验)、
 * 结局是否被推往最坏方向。
 * 纯逻辑无 React/DOM 依赖,vitest 直接单测。
 */
import type { TreeNode } from './drill-recorder';
import type { DisasterStatus } from './disaster-state';
import { eventTypeMeta } from './event-flow';

// ============================================================
// 合理性指标
// ============================================================

export interface DrillExportStats {
  /** 演练总时长(tick,取事件最大 ts)。 */
  readonly totalTicks: number;
  readonly eventCount: number;
  /** 特情(对抗注入)次数与间隔序列。 */
  readonly specialCount: number;
  readonly specialIntervals: readonly number[];
  readonly avgSpecialInterval: number | null;
  readonly minSpecialInterval: number | null;
  /** 决策次数(agent + 预案)。 */
  readonly decisionCount: number;
  /** 结局:最终火势/被困/救出/建筑损伤%。 */
  readonly finalFireLevel: number;
  readonly finalTrapped: number;
  readonly finalRescued: number;
  readonly buildingDamagePct: number;
}

/** 从事件树 + 最终态势计算合理性指标。 */
export function computeDrillStats(
  nodes: readonly TreeNode[],
  status: DisasterStatus | null,
): DrillExportStats {
  const specials = nodes.filter((n) => n.type === 'special').map((n) => n.ts);
  const intervals: number[] = [];
  for (let i = 1; i < specials.length; i += 1) intervals.push(specials[i] - specials[i - 1]);
  const avg = intervals.length > 0 ? intervals.reduce((a, b) => a + b, 0) / intervals.length : null;
  return {
    totalTicks: nodes.reduce((m, n) => Math.max(m, n.ts), 0),
    eventCount: nodes.length,
    specialCount: specials.length,
    specialIntervals: intervals,
    avgSpecialInterval: avg !== null ? Math.round(avg * 10) / 10 : null,
    minSpecialInterval: intervals.length > 0 ? Math.min(...intervals) : null,
    decisionCount: nodes.filter((n) => n.type === 'decision').length,
    finalFireLevel: status?.fireLevel ?? 0,
    finalTrapped: status?.trappedCount ?? 0,
    finalRescued: status?.rescuedCount ?? 0,
    buildingDamagePct: Math.round((status?.buildingDamage ?? 0) * 1000) / 10,
  };
}

/** 指标评判提示(导出报告内嵌,供检验人快速定位问题)。 */
export function statWarnings(stats: DrillExportStats): string[] {
  const warnings: string[] = [];
  if (stats.specialCount >= 2 && stats.minSpecialInterval !== null && stats.minSpecialInterval < 4) {
    warnings.push(`特情最小间隔 ${stats.minSpecialInterval} tick(<4)——注入过密,指挥官无应对窗口,易显"捣蛋"。`);
  }
  if (stats.specialCount > 0 && stats.finalFireLevel >= 3) {
    warnings.push(`结局火势仍 ${stats.finalFireLevel} 级——特情叠加可能把演练推向不可控,检查压制战术是否生效。`);
  }
  if (stats.finalTrapped > 0) {
    warnings.push(`结局仍有 ${stats.finalTrapped} 人被困未救出——检查 rescue 战术与搜救节奏。`);
  }
  if (stats.eventCount > 0 && stats.decisionCount === 0) {
    warnings.push('全程无决策节点——指挥官 agent 未上报决策,检查触发链路。');
  }
  return warnings;
}

// ============================================================
// 导出体
// ============================================================

export interface DrillExportInput {
  readonly scenarioName: string;
  readonly drillId: string;
  readonly nodes: readonly TreeNode[];
  readonly status: DisasterStatus | null;
  readonly exportedAt?: string;
}

/** JSON 导出(全保真:指标 + 评判 + 全事件)。 */
export function buildDrillJson(input: DrillExportInput): string {
  const stats = computeDrillStats(input.nodes, input.status);
  return JSON.stringify(
    {
      scenario: input.scenarioName,
      drillId: input.drillId,
      exportedAt: input.exportedAt ?? new Date().toISOString(),
      stats,
      warnings: statWarnings(stats),
      events: input.nodes.map((n) => ({
        ts: n.ts,
        type: n.type,
        label: n.label,
        detail: n.detail,
        agent: n.agentName,
        parentId: n.parentId,
        location: n.meta?.location,
      })),
    },
    null,
    2,
  );
}

/** Markdown 导出(人读:概要 + 指标 + 评判 + 事件时间线)。 */
export function buildDrillMarkdown(input: DrillExportInput): string {
  const stats = computeDrillStats(input.nodes, input.status);
  const warnings = statWarnings(stats);
  const lines: string[] = [
    `# 演练评估导出:${input.scenarioName}`,
    '',
    `- 演练 id:${input.drillId}`,
    `- 导出时间:${input.exportedAt ?? new Date().toISOString()}`,
    `- 总时长:T+${stats.totalTicks} tick · 事件 ${stats.eventCount} 条`,
    '',
    '## 合理性指标',
    '',
    `| 指标 | 值 |`,
    `|---|---|`,
    `| 对抗特情 | ${stats.specialCount} 次 |`,
    `| 特情间隔(平均/最小) | ${stats.avgSpecialInterval ?? '-'} / ${stats.minSpecialInterval ?? '-'} tick |`,
    `| 决策 | ${stats.decisionCount} 次 |`,
    `| 结局火势 | ${stats.finalFireLevel} 级 |`,
    `| 被困(结局) | ${stats.finalTrapped} 人(已救出 ${stats.finalRescued}) |`,
    `| 建筑损伤 | ${stats.buildingDamagePct}% |`,
    '',
  ];
  if (warnings.length > 0) {
    lines.push('## 检验提示', '');
    for (const w of warnings) lines.push(`- ⚠ ${w}`);
    lines.push('');
  } else {
    lines.push('## 检验提示', '', '- 未发现明显异常(时长/特情密度/结局均在合理区间)。', '');
  }
  lines.push('## 事件时间线', '', '| T+ | 类型 | 事件 | 发起 | 位置 |', '|---|---|---|---|---|');
  for (const n of [...input.nodes].sort((a, b) => a.ts - b.ts)) {
    const detail = (n.detail ?? n.label).replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(
      `| ${n.ts} | ${eventTypeMeta(n.type).label} | ${detail} | ${n.agentName ?? '-'} | ${typeof n.meta?.location === 'string' ? n.meta.location : '-'} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
