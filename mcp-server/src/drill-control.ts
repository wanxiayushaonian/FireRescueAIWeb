// 推演控制(云端 MCP → 浏览器对抗舱链路,2026-08-24 接线)。
//
// 架构:
//   - 推演引擎 source of truth 在浏览器:对抗舱(src/drill/confrontation/,
//     confront-driver + confront-store,真实秒制)是唯一在用的演练引擎;
//     旧 tick 引擎(lib/drill TimelineEngine/AgentRunner 等)已删除。
//   - 云端链路:agent tool_call → 本模块 → publishCommand → /scene-events SSE
//     → web 端 scene-command-bus(lib/scene-command-bus/transport.ts)
//     → drill_inject_event/drill_report_decision handler
//     → confront-store.appendInject/appendAdjust(驱动对抗舱 UI)
//   - 执行回执:web handler 执行后经 /api/scene-events/ack 回报,
//     agent 可用 get_scene_command_status 查询执行结果(ok/error)。
//   - 前置条件:浏览器端对抗舱处于 running(未开启时 handler 抛错 → ack error)。
//
// 本模块职责:校验入参(tools.ts)+ 记日志(观测)+ 经 sink 转发场景命令。
// query_scene_state 经同一命令通道请求浏览器快照,再等待 ack/result;
// 浏览器离线/超时时明确降级为本进程转发计数,不伪造实时态势。

import type { SceneCommand } from './types.js';
import { waitForCommandStatus } from './command-status.js';

/** 透传到 /scene-events 的命令 tool 名(web 端 scene-command-bus 按此名路由 handler)。 */
const SCENE_TOOL_INJECT = 'drill_inject_event';
const SCENE_TOOL_DECISION = 'drill_report_decision';
const SCENE_TOOL_QUERY = 'drill_query_state';

type LoggedEntry = {
  drillId: string;
  kind: 'event' | 'decision';
  payload: unknown;
  ts: number;
};

// 单进程内存表(观测 + 测试断言):记录已转发的 inject/decision 条数。
const drillLog = new Map<string, LoggedEntry[]>();

function appendLog(drillId: string, kind: LoggedEntry['kind'], payload: unknown): LoggedEntry {
  const entry: LoggedEntry = { drillId, kind, payload, ts: Date.now() };
  const list = drillLog.get(drillId) ?? [];
  list.push(entry);
  drillLog.set(drillId, list);
  return entry;
}

/** 测试用:取某演练已记录条目。生产不应依赖。 */
export function __getDrillLogForTest(drillId: string): LoggedEntry[] {
  return [...(drillLog.get(drillId) ?? [])];
}

/** 测试用:清空所有日志。 */
export function __resetDrillLogForTest(): void {
  drillLog.clear();
}

/** 演练态势查询结果:在线时 snapshot 来自浏览器对抗舱真相源。 */
export interface DrillLinkState {
  wired: true;
  drillId: string;
  online: boolean;
  message: string;
  queryCommandId?: string;
  snapshot?: unknown;
  /** 本进程已转发的 inject_event 条数(观测用,不代表真实态势)。 */
  loggedEvents: number;
  /** 本进程已转发的 report_decision 条数(观测用)。 */
  loggedDecisions: number;
  lastEntryTs: number | null;
}

export interface InjectAck {
  accepted: true;
  wired: true;
  drillId: string;
  entryTs: number;
  note: string;
}

export interface DecisionAck {
  accepted: true;
  wired: true;
  drillId: string;
  entryTs: number;
  note: string;
}

/**
 * 查询演练态势:下发 drill_query_state 至在线浏览器,等待 handler 将
 * confront-store 快照经 ack/result 回传。无 sink 或超时时降级返回转发日志,
 * online=false 明确表示该结果不是实时态势。
 */
export async function querySceneState(
  drillId: string,
  sceneCommandSink?: (cmd: SceneCommand) => void,
  timeoutMs = 2000,
): Promise<DrillLinkState> {
  const entries = drillLog.get(drillId) ?? [];
  const events = entries.filter((e) => e.kind === 'event').length;
  const decisions = entries.filter((e) => e.kind === 'decision').length;
  const lastTs = entries.length > 0 ? entries[entries.length - 1].ts : null;
  const fallback = (message: string, queryCommandId?: string): DrillLinkState => ({
    wired: true,
    drillId,
    online: false,
    message,
    ...(queryCommandId ? { queryCommandId } : {}),
    loggedEvents: events,
    loggedDecisions: decisions,
    lastEntryTs: lastTs,
  });

  if (!sceneCommandSink) {
    return fallback('未提供场景命令通道;返回的仅是 MCP 本进程转发计数,不是浏览器实时态势。');
  }

  const cmd: SceneCommand = {
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    tool: SCENE_TOOL_QUERY,
    args: { drill_id: drillId },
    ts: Date.now(),
  };
  sceneCommandSink(cmd);
  const status = await waitForCommandStatus(cmd.id, timeoutMs);
  if (!status) {
    return fallback('浏览器未在超时内返回演练快照;可能离线、命令流断开或页面未加载。', cmd.id);
  }
  if (status.status === 'error') {
    return fallback(status.message || '浏览器执行演练快照查询失败。', cmd.id);
  }
  return {
    wired: true,
    drillId,
    online: true,
    message: '快照来自在线浏览器对抗舱当前状态。',
    queryCommandId: cmd.id,
    snapshot: status.result,
    loggedEvents: events,
    loggedDecisions: decisions,
    lastEntryTs: lastTs,
  };
}

/**
 * 注入对抗事件:记日志 + 经 /scene-events 转发到浏览器对抗舱
 * (confront-store.appendInject,驱动对抗 UI)。
 *
 * @param sceneCommandSink 场景命令发送器(测试注入;生产由 tools.ts 注入 publishCommand)。
 */
export function injectEvent(
  drillId: string,
  event: unknown,
  sceneCommandSink?: (cmd: SceneCommand) => void,
): InjectAck {
  const entry = appendLog(drillId, 'event', event);
  if (sceneCommandSink) {
    sceneCommandSink({
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: SCENE_TOOL_INJECT,
      args: { drill_id: drillId, event },
      ts: entry.ts,
    });
  }
  return {
    accepted: true,
    wired: true,
    drillId,
    entryTs: entry.ts,
    note: '事件已经 /scene-events 转发至浏览器对抗舱;执行结果用 get_scene_command_status 查 ack(对抗舱未开启时 handler 报错)。',
  };
}

/**
 * 上报 agent 决策:记日志 + 经 /scene-events 转发到浏览器对抗舱
 * (confront-store.appendAdjust,作为动态调整进入对抗时间线)。
 */
export function reportDecision(
  drillId: string,
  decision: unknown,
  sceneCommandSink?: (cmd: SceneCommand) => void,
): DecisionAck {
  const entry = appendLog(drillId, 'decision', decision);
  if (sceneCommandSink) {
    sceneCommandSink({
      id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      tool: SCENE_TOOL_DECISION,
      args: { drill_id: drillId, decision },
      ts: entry.ts,
    });
  }
  return {
    accepted: true,
    wired: true,
    drillId,
    entryTs: entry.ts,
    note: '决策已经 /scene-events 转发至浏览器对抗舱;执行结果用 get_scene_command_status 查 ack(对抗舱未开启时 handler 报错)。',
  };
}
