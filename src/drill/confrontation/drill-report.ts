// P2 演练复盘报告生成(纯函数,可单测)。对抗舱结束态 → Markdown/JSON。
// 含:P0 人工决策对比、P1a 证据标签、七维评分、改进措施。用于演示复盘与归档。
import type { ConfrontationState, DecisionEvidence } from './confront-store';

export interface DrillReport {
  readonly title: string;
  readonly markdown: string;
  readonly json: string;
}

const EVIDENCE_LABEL: Record<DecisionEvidence['kind'], string> = {
  plan: '正式预案',
  archive: '建筑档案',
  force: '真实力量',
  water: '消防水源',
  knowledge: '历史知识',
  warning: '数据告警',
};

function fmtT(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function evidenceText(evidence?: readonly DecisionEvidence[]): string {
  if (!evidence?.length) return '';
  return evidence
    .map((ev) => `[${EVIDENCE_LABEL[ev.kind] ?? ev.kind}] ${ev.label}${ev.detail ? `（${ev.detail}）` : ''}`)
    .join('；');
}

export function buildDrillReport(state: ConfrontationState, elapsedSec: number): DrillReport {
  const seed = state.seedScenario;
  const injects = state.events.filter((e) => e.kind === 'inject');
  const adjusts = state.events.filter((e) => e.kind === 'adjust');
  const manuals = state.events.filter((e) => e.kind === 'manual');
  const review = state.review;

  const lines: string[] = [];
  lines.push(`# ${seed?.building ?? '未指定建筑'} 对抗演练复盘报告`);
  lines.push('');
  lines.push(`- 灾情：${seed?.floor ?? '?'} ${seed?.material ?? '?'} 起火，被困 ${seed?.trapped ?? '?'} 人（seed ${seed?.seed ?? '?'}）`);
  lines.push(`- 时长：${fmtT(elapsedSec)}`);
  lines.push(`- 特情 ${injects.length} 条 / 动态调整 ${adjusts.length} 条 / 人工决策 ${manuals.length} 条`);
  lines.push(`- 最终态势：火势 ${state.situation.fireLevel} 级 / 被困 ${state.situation.trappedCount} 人 / 损伤 ${state.situation.damageLevel} 级${state.situation.wind ? ` / 风向 ${state.situation.wind}` : ''}`);
  lines.push('');

  if (state.deploy?.length) {
    lines.push('## 初始部署（预案输出智能体）');
    lines.push('');
    for (const line of state.deploy) lines.push(`- ${line}`);
    lines.push('');
  }

  if (injects.length) {
    lines.push('## 特情演化与决策');
    lines.push('');
    for (const inj of injects) {
      lines.push(`### 特情 #${inj.seq} · ${inj.specialType ?? '未知类型'} · ${fmtT(inj.tSec)}`);
      lines.push('');
      lines.push(inj.emergency);
      if (inj.location) lines.push(`\n- 位置：${inj.location}`);
      if (inj.delta) {
        const parts: string[] = [];
        if (inj.delta.fireLevelDelta) parts.push(`火势 ${inj.delta.fireLevelDelta >= 0 ? '+' : ''}${inj.delta.fireLevelDelta}`);
        if (inj.delta.trappedDelta) parts.push(`被困 ${inj.delta.trappedDelta >= 0 ? '+' : ''}${inj.delta.trappedDelta}`);
        if (inj.delta.damageDelta) parts.push(`损伤 ${inj.delta.damageDelta >= 0 ? '+' : ''}${inj.delta.damageDelta}`);
        if (inj.delta.wind) parts.push(`风向→${inj.delta.wind}`);
        if (parts.length) lines.push(`- 态势增量：${parts.join(' / ')}`);
      }
      const adjust = adjusts.find((a) => a.seq === inj.seq);
      if (adjust) {
        lines.push('');
        lines.push(`**Commander 建议**${adjust.adopted === true ? '（已采纳）' : adjust.adopted === false ? '（人工改派）' : adjust.respondedWithinSec === undefined ? '（未响应）' : ''}：`);
        for (const a of adjust.adjustments ?? []) lines.push(`  - ${a}`);
        const ev = evidenceText(adjust.evidence);
        if (ev) lines.push(`  - 证据：${ev}`);
        if (adjust.respondedWithinSec != null) lines.push(`  - 人员响应用时：${adjust.respondedWithinSec}s`);
      }
      const manual = manuals.find((m) => m.supersedes === adjust?.id);
      if (manual) {
        lines.push('');
        lines.push(`**人工决策**（后续轮次以此为基线）：`);
        for (const m of manual.adjustments ?? []) lines.push(`  - ${m}`);
        if (manual.note) lines.push(`  - 处置原因：${manual.note}`);
      }
      lines.push('');
    }
  }

  if (review) {
    lines.push('## 评估');
    lines.push('');
    lines.push(`- 总分：**${review.score}**（${review.source === 'agent' ? '评估智能体' : '规则降级'}）`);
    lines.push(`- 结论：${review.conclusion}`);
    for (const c of review.comments ?? []) lines.push(`- ${c}`);
    if (review.dimensions?.length) {
      lines.push('');
      lines.push('### 维度评分');
      for (const d of review.dimensions) lines.push(`- ${d.name}：${d.score}（${d.comment ?? ''}）`);
    }
    if (review.improvements?.length) {
      lines.push('');
      lines.push('### 改进措施（回流预案库）');
      for (const imp of review.improvements) lines.push(`- ${imp.content} → ${imp.target ?? '预案'}`);
    }
    lines.push('');
  }

  const markdown = lines.join('\n');
  const json = JSON.stringify(
    {
      title: `${seed?.building ?? ''} 对抗演练复盘`,
      building: seed?.building,
      floor: seed?.floor,
      material: seed?.material,
      trapped: seed?.trapped,
      seed: seed?.seed,
      elapsedSec,
      situation: state.situation,
      initialPlan: state.deploy,
      events: state.events.map((e) => ({
        seq: e.seq,
        kind: e.kind,
        type: e.specialType,
        emergency: e.emergency,
        location: e.location,
        delta: e.delta,
        adjustments: e.adjustments,
        evidence: e.evidence,
        adopted: e.adopted,
        respondedWithinSec: e.respondedWithinSec,
        note: e.note,
        supersedes: e.supersedes,
        tSec: e.tSec,
      })),
      review: review
        ? {
            score: review.score,
            conclusion: review.conclusion,
            comments: review.comments,
            dimensions: review.dimensions,
            improvements: review.improvements,
            source: review.source,
          }
        : null,
    },
    null,
    2,
  );

  return { title: `${seed?.building ?? '演练'}-${fmtT(elapsedSec).replace('+', '').replace(':', '-')}`, markdown, json };
}
