/**
 * briefing.ts — 演练 agent 触发内容生成器(2026-08-18,指挥官周期触发落地)。
 *
 * 背景:commander/adversary 的态势上下文此前赌平台 forwarded_props 透传(未验证)。
 * 现统一改为**内容注入**:每次触发把最新态势快照拼进 content,agent 不依赖透传
 * 即可拿到 drill_id 与当前态势(对抗 agent 的 inject_event 必填 drill_id)。
 *
 * 触发时机(见 agent-runner.onTick):
 * - commander:每 commanderEveryNTicks tick 一次 + 特情注入即时反应(空闲才触发);
 * - adversary:每 adversaryEveryNTicks tick 一次(互斥跳过)。
 *
 * 纯逻辑:不依赖 React/DOM,可被 vitest 直接单测。
 */
import type { DisasterStatus } from './disaster-state';

/** 简报上下文(静态 id + 近期事件摘要)。 */
export interface BriefingContext {
  readonly drillId: string;
  readonly buildingId: string;
  readonly sceneId: string;
  /** 近期事件树 label(最新在后),拼入简报供 agent 了解刚发生了什么。 */
  readonly recentEvents?: readonly string[];
}

/** 火势等级 → 中文描述(对齐 drill-commander 提示词口径)。 */
const FIRE_LABEL = ['熄灭', '初起', '发展', '猛烈', '全面燃烧'] as const;

function fireLabel(level: number): string {
  return FIRE_LABEL[Math.max(0, Math.min(FIRE_LABEL.length - 1, level))];
}

/** 态势快照行(commander/adversary 共用,保证两个 agent 看到的世界一致)。 */
function statusLine(status: DisasterStatus): string {
  const enRoute = status.forces.filter((f) => f.status === 'en_route');
  const parts = [
    `火势=${status.fireLevel}级(${fireLabel(status.fireLevel)},蔓延方向${status.fireSpreadDirection}°)`,
    `到场力量=${status.availableForces.stations}站/${status.availableForces.vehicles}车/${status.availableForces.personnel}人`,
  ];
  if (enRoute.length > 0) {
    const eta = Math.min(...enRoute.map((f) => f.eta));
    parts.push(`途中=${enRoute.length}批(最快ETA ${eta} tick)`);
  }
  parts.push(`被困=${status.trappedCount}人(已救出${status.rescuedCount})`);
  parts.push(`建筑损伤=${Math.round(status.buildingDamage * 100)}%`);
  parts.push(`压制=${status.suppressionActive ? '生效' : '未生效'}`);
  parts.push(`救援=${status.rescueActive ? '进行中' : '未激活'}`);
  parts.push(`风=${status.windDirection}°/${status.windSpeed}m/s`);
  return parts.join(';');
}

/**
 * 指挥官周期简报:触发 commander 上报本轮决策(report_decision)。
 * cause=特情即时反应时 reason 注明诱因,事件树因果链可对应。
 */
export function buildCommanderBriefing(
  status: DisasterStatus,
  ctx: BriefingContext,
  reason?: string,
): string {
  const lines = [
    `[演练简报|T+${status.clock}${reason ? `|${reason}` : ''}] ` +
      `drill_id=${ctx.drillId}; building_id=${ctx.buildingId}; scene_id=${ctx.sceneId}`,
    `态势:${statusLine(status)}`,
  ];
  if (ctx.recentEvents && ctx.recentEvents.length > 0) {
    lines.push(`近期事件:${ctx.recentEvents.join(' / ')}`);
  }
  lines.push('请按当前态势上报本轮决策(report_decision;维持部署也要上报),需要 3D 联动时用 list_floors/focus_floors/fly_to。');
  return lines.join('\n');
}

/**
 * 对抗 agent 触发内容:固定指令"根据当前态势,注入一个特情" +
 * drill_id 与态势快照(此前 drill_id 只能赌 forwarded_props 透传)。
 */
export function buildAdversaryTrigger(status: DisasterStatus, ctx: BriefingContext): string {
  return [
    `[导调触发|T+${status.clock}] drill_id=${ctx.drillId}`,
    `态势快照:${statusLine(status)}`,
    '根据当前态势,注入一个特情(inject_event;drill_id 用上面的值,type 与 payload 按态势合理选择)。',
  ].join('\n');
}
