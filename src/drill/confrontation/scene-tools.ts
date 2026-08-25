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
} from './confront-store';

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
 * 注册对抗舱推演工具（drill_inject_event / drill_report_decision）。
 * @param addSceneAction 可选：写场景动作日志（与对抗舱 driver 的联动日志一致）。
 */
export function registerConfrontSceneTools(addSceneAction?: AddSceneActionFn): void {
  registerSceneTool('drill_inject_event', async (args) => {
    assertRunning();
    const event = narrowObject(args.event) ?? {};
    const description =
      String(event.description ?? '').trim() ||
      String(event.type ?? '').trim() ||
      '外部注入特情';
    const payload = narrowObject(event.payload);
    const location = String(payload?.location ?? event.location ?? '').trim() || undefined;
    appendInject({ emergency: description, location, tSec: elapsedSec() });
    // 场景动作日志留痕（中文 target 的 highlight 执行器空转,与 driver 行为一致,仅日志可见）
    addSceneAction?.({
      action: 'highlight',
      target: `特情位置(云端注入):${description}`,
      source: '智能体',
    });
  });

  registerSceneTool('drill_report_decision', async (args) => {
    assertRunning();
    const decision = narrowObject(args.decision) ?? {};
    const action = String(decision.action ?? '').trim() || '决策';
    const rationale = String(decision.rationale ?? '').trim();
    const line = rationale ? `${action}：${rationale}` : action;
    // seq 语义与 confront-driver 一致:当前已注入特情轮数(至少 1)
    const s = getConfrontationState();
    const seq = Math.max(1, s.events.filter((e) => e.kind === 'inject').length);
    appendAdjust({ seq, adjustments: [line], tSec: elapsedSec() });
  });
}
