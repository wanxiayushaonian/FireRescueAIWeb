// 推演控制 stub:对接 web 推演引擎(子项目6)的桥已在 6.2/6.3 完成前为占位。
//
// 当前行为(MVP stub):
//   - query_scene_state:返回 wired=false 占位态势(让 agent 知道推演未对接,不误导决策)
//   - inject_event:记日志 + 入内存事件表(供观测),不入 EventBus
//   - report_decision:记日志 + 入内存决策表,不触发事件树渲染
//
// TODO(子项目6.2/6.3):对接推演引擎后替换为真实实现:
//   - query_scene_state → 读 DisasterState(火势等级/到场力量/被困/建筑损伤)
//   - inject_event → 写 EventBus(触发下个 tick 的状态推进)
//   - report_decision → 写 DrillRecorder(事件树新增决策节点 + 触发 React Flow 渲染)
// 集成形态候选:① 推演引擎在浏览器,扩展 /scene-events SSE 双向通道;
//             ② 推演引擎在 mcp-server 进程内(web 经 SSE 订阅状态);
//             ③ 独立推演服务。设计文档(2026-08-09-drill-simulation-design.md §5.2)未定,
//             待 6.2 实现时确认。当前 stub 不锁定具体形态。

import type { SceneCommand } from './types.js';

/** stub 阶段透传到 /scene-events 的命令 tool 名(供 web 端识别并对接推演 UI,后续替换)。 */
const SCENE_TOOL_INJECT = 'drill_inject_event';
const SCENE_TOOL_DECISION = 'drill_report_decision';

type LoggedEntry = {
  drillId: string;
  kind: 'event' | 'decision';
  payload: unknown;
  ts: number;
};

// 单进程内存表(仅本 stub 阶段用于观测 + 测试断言)。
// TODO 6.2/6.3:对接后由推演引擎持久化,本表移除。
const drillLog = new Map<string, LoggedEntry[]>();

function appendLog(drillId: string, kind: LoggedEntry['kind'], payload: unknown): LoggedEntry {
  const entry: LoggedEntry = { drillId, kind, payload, ts: Date.now() };
  const list = drillLog.get(drillId) ?? [];
  list.push(entry);
  drillLog.set(drillId, list);
  return entry;
}

/** 测试用:取某演练已记录条目(stub 行为断言)。生产不应依赖。 */
export function __getDrillLogForTest(drillId: string): LoggedEntry[] {
  return [...(drillLog.get(drillId) ?? [])];
}

/** 测试用:清空所有 stub 日志。 */
export function __resetDrillLogForTest(): void {
  drillLog.clear();
}

/** 占位态势:推演引擎未对接时,返回此对象让 agent 知情(避免误导)。 */
export interface StubSceneState {
  wired: false;
  drillId: string;
  message: string;
  /** 已记录的 inject_event 条数(观测用,不代表真实态势)。 */
  loggedEvents: number;
  /** 已记录的 report_decision 条数(观测用)。 */
  loggedDecisions: number;
  lastEntryTs: number | null;
}

export interface InjectAck {
  accepted: true;
  wired: false;
  drillId: string;
  entryTs: number;
  note: string;
}

export interface DecisionAck {
  accepted: true;
  wired: false;
  drillId: string;
  entryTs: number;
  note: string;
}

/**
 * 查询当前推演态势(stub):推演引擎未对接,返回 wired=false 占位。
 * 调用方(agent)应优先依赖剧本 seed 与 inject_event 输入做决策,
 * 不应将本工具的返回当作实时态势。
 */
export function querySceneState(drillId: string): StubSceneState {
  const entries = drillLog.get(drillId) ?? [];
  const events = entries.filter((e) => e.kind === 'event').length;
  const decisions = entries.filter((e) => e.kind === 'decision').length;
  const lastTs = entries.length > 0 ? entries[entries.length - 1].ts : null;
  return {
    wired: false,
    drillId,
    message: '推演引擎(子项目6.2/6.3)未对接,无实时态势。当前为 stub。',
    loggedEvents: events,
    loggedDecisions: decisions,
    lastEntryTs: lastTs,
  };
}

/**
 * 注入对抗事件(stub):记日志 + 入内存表 + 发场景命令(占位通道)。
 * TODO 6.2:替换为写推演引擎 EventBus(触发下个 tick 的状态推进)。
 *
 * @param sceneCommandSink 可选的场景命令发送器(测试注入;生产由 tools.ts 注入 publishCommand)。
 *   stub 阶段经 /scene-events 透传给 web,让前端推演 UI 预演事件流(便于 6.2 前联调可视化)。
 */
export function injectEvent(
  drillId: string,
  event: unknown,
  sceneCommandSink?: (cmd: SceneCommand) => void,
): InjectAck {
  const entry = appendLog(drillId, 'event', event);
  console.warn(
    `[drill-control] inject_event stub | drill=${drillId} | event logged but NOT applied to engine (待 6.2 EventBus)`,
    { event },
  );
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
    wired: false,
    drillId,
    entryTs: entry.ts,
    note: '事件已记日志并经 /scene-events 占位转发;推演引擎(6.2)未对接,事件不驱动状态。',
  };
}

/**
 * 上报 agent 决策(stub):记日志 + 入内存表 + 发场景命令(占位通道)。
 * TODO 6.3:替换为写 DrillRecorder(事件树新增决策节点 + 触发 React Flow 渲染)。
 */
export function reportDecision(
  drillId: string,
  decision: unknown,
  sceneCommandSink?: (cmd: SceneCommand) => void,
): DecisionAck {
  const entry = appendLog(drillId, 'decision', decision);
  console.warn(
    `[drill-control] report_decision stub | drill=${drillId} | decision logged but NOT recorded to event tree (待 6.3 DrillRecorder)`,
    { decision },
  );
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
    wired: false,
    drillId,
    entryTs: entry.ts,
    note: '决策已记日志并经 /scene-events 占位转发;事件树(6.3)未对接,不入树不触发渲染。',
  };
}
