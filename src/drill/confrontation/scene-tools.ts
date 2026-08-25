/**
 * 对抗舱场景命令 handler —— 云端 MCP 推演工具（inject_event/report_decision）
 * 在浏览器端的执行端点（2026-08-24 接线，链路见 mcp-server/src/drill-control.ts）。
 *
 * 链路：agent tool_call → mcp-server → /scene-events SSE → scene-command-bus
 *       → 本模块 handler → confront-store.appendInject/appendAdjust（驱动对抗舱 UI）。
 *
 * 前置条件：对抗舱处于 running；未开启时 handler 抛错 → transport 回 error ack，
 * agent 可经 get_scene_command_status 获知执行失败。
 *
 * 注册由 SceneCommandBridge 挂载时完成（registerSceneTool 为幂等覆盖）。
 */
import { registerSceneTool } from '@/lib/scene-command-bus/registry';
import type { AddSceneActionFn } from '@/lib/scene-command-bus/handlers';
import {
  appendAdjust,
  appendInject,
  getConfrontationState,
  isDuplicateEvent,
} from './confront-store';
import type { DecisionEvidence } from './confront-store';
import { evaluateSpecialQuality } from './special-event-quality';

export interface ConfrontSceneToolOptions {
  /** 当前浏览器对抗局 ID;用于拒绝其他会话串入。 */
  readonly drillId?: string;
}

/** 距对抗开局的秒数（confront-store 的 tSec 语义；未开局归 0）。 */
function elapsedSec(): number {
  const { startedAt } = getConfrontationState();
  return startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
}

/** 对抗舱未在运行时拒绝执行（dispatch 捕获 → error ack 通知 agent）。 */
function assertRunning(): void {
  const s = getConfrontationState();
  if (!s.active || s.status !== 'running') {
    throw new Error('对抗舱未在运行（需要 status=running）：inject/decision 未执行');
  }
}

function narrowObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * 注册对抗舱查询/推演工具。
 * @param addSceneAction 可选：写场景动作日志（与对抗舱 driver 的联动日志一致）。
 */
export function registerConfrontSceneTools(
  addSceneAction?: AddSceneActionFn,
  options: ConfrontSceneToolOptions = {},
): void {
  const assertDrillId = (args: Record<string, unknown>): void => {
    if (!options.drillId) return;
    const incoming = String(args.drill_id ?? '').trim();
    if (incoming !== options.drillId) {
      throw new Error(`演练会话不匹配:期望 ${options.drillId}`);
    }
  };

  registerSceneTool('drill_query_state', async (args) => {
    assertDrillId(args);
    const s = getConfrontationState();
    const elapsed = s.startedAt ? Math.max(0, Math.round((Date.now() - s.startedAt) / 1000)) : 0;
    return {
      capturedAt: Date.now(),
      active: s.active,
      status: s.status,
      elapsedSec: elapsed,
      seed: s.seedScenario,
      situation: s.situation,
      thinking: s.thinking,
      plannedTotal: s.plannedTotal,
      deploy: s.deploy?.slice(0, 8).map((line) => line.slice(0, 160)) ?? null,
      // ack result 上限 4KB:只返回最近 6 条,并限制长文本/调整行数。
      events: s.events.slice(-6).map((event) => ({
        id: event.id,
        seq: event.seq,
        kind: event.kind,
        type: event.specialType,
        emergency: event.emergency.slice(0, 160),
        location: event.location?.slice(0, 80),
        delta: event.delta,
        adjustments: event.adjustments?.slice(0, 3).map((line) => line.slice(0, 120)),
        adopted: event.adopted,
        respondedWithinSec: event.respondedWithinSec,
        tSec: event.tSec,
      })),
      review: s.review ? {
        score: s.review.score,
        conclusion: s.review.conclusion.slice(0, 240),
        archived: s.review.archived,
        source: s.review.source,
      } : null,
    };
  });

  registerSceneTool('drill_inject_event', async (args) => {
    assertDrillId(args);
    assertRunning();
    const event = narrowObject(args.event) ?? {};
    const specialType = String(event.type ?? '').trim() || 'unknown';
    const description =
      String(event.description ?? '').trim() ||
      String(event.type ?? '').trim() ||
      '外部注入特情';
    const payload = narrowObject(event.payload);
    const location = String(payload?.location ?? event.location ?? '').trim() || undefined;
    const finite = (value: unknown): number | undefined => {
      const n = Number(value);
      return value != null && Number.isFinite(n) ? n : undefined;
    };
    const fireLevelDelta = finite(payload?.fireLevelDelta);
    const trappedDelta = finite(payload?.trappedDelta);
    const damageDelta = finite(payload?.damageDelta);
    const wind = String(payload?.wind ?? payload?.to ?? '').trim() || undefined;
    const hasDelta = fireLevelDelta != null || trappedDelta != null || damageDelta != null || wind != null;
    const delta = hasDelta ? { fireLevelDelta, trappedDelta, damageDelta, wind } : undefined;
    const candidate = { specialType, emergency: description, location, delta };
    // 幂等短路:同一 tool-call 可能已沿 adapter 通道(聊天流解析)入库;完全相同的特情
    // 直接返回 ok——若继续走质量门,第二份必被当"类型重复"拒绝,agent 会收到与事实不符的 error。
    if (isDuplicateEvent({ kind: 'inject', specialType, emergency: description, location })) return;
    const quality = evaluateSpecialQuality(candidate, getConfrontationState().events);
    if (!quality.accepted) throw new Error(`无效特情已拒绝:${quality.reason}`);
    appendInject({
      specialType: quality.canonicalType,
      emergency: description,
      location,
      delta,
      tSec: elapsedSec(),
    });
    // 场景动作日志留痕（中文 target 的 highlight 执行器空转,与 driver 行为一致,仅日志可见）
    addSceneAction?.({
      action: 'highlight',
      target: `特情位置(云端注入):${description}`,
      source: '智能体',
    });
  });

  registerSceneTool('drill_report_decision', async (args) => {
    assertDrillId(args);
    assertRunning();
    const decision = narrowObject(args.decision) ?? {};
    const action = String(decision.action ?? '').trim() || '决策';
    const rationale = String(decision.rationale ?? '').trim();
    const line = rationale ? `${action}：${rationale}` : action;
    // P1a:证据标签(decision.evidence 数组,容错解析;非法项丢弃)
    const rawEvidence = Array.isArray(decision.evidence) ? decision.evidence : [];
    const evidence = rawEvidence
      .map((ev): DecisionEvidence | null => {
        const o = narrowObject(ev);
        if (!o) return null;
        const kind = String(o.kind ?? '').trim() as DecisionEvidence['kind'];
        const label = String(o.label ?? '').trim();
        if (!['plan', 'archive', 'force', 'water', 'knowledge', 'warning'].includes(kind)) return null;
        if (!label) return null;
        return { kind, label, detail: o.detail != null ? String(o.detail) : undefined };
      })
      .filter((ev): ev is DecisionEvidence => ev !== null);
    // seq 语义与 confront-driver 一致:当前已注入特情轮数。
    // seq=0 = 开局初始部署上报(Planner,先于任何特情);特情轮次的调整从 1 起,
    // 与 inject 的 seq 对齐(卡片按 seq 配对;调整入库本身由 store 做双通道去重)。
    const s = getConfrontationState();
    const seq = s.events.filter((e) => e.kind === 'inject').length;
    // P1b:同轮次重复建议门控——先查幂等(双通道第二份同内容→ok),再查该轮次已有调整(拒绝)
    if (isDuplicateEvent({ kind: 'adjust', adjustments: [line] })) return;
    const existingSameRound = s.events.find((e) => e.kind === 'adjust' && e.seq === seq);
    if (existingSameRound) {
      throw new Error(`轮次 ${seq} 已有调整建议,拒绝重复上报`);
    }
    appendAdjust({ seq, adjustments: [line], evidence: evidence.length ? evidence : undefined, tSec: elapsedSec() });
  });
}
