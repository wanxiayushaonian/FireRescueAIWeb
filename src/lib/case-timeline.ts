// 实战指挥·案卷时间线:按警情 id 累积处置动作(status 演进/派遣/到场/救援进展)。
// 极简 subscribe 模式 store(与 confront-store 同款):CommandView 在事件源
// (liveChannel 事件/派遣结果/车辆到场)处转录 recordCaseEvent,时间轴面板订阅渲染。
// 数据为会话级(刷新丢失,演示口径),不持久化。

export type CaseEventKind = 'status' | 'dispatch' | 'arrival' | 'rescue' | 'manual';

export interface CaseTimelineEntry {
  readonly ts: string; // HH:MM:SS
  readonly kind: CaseEventKind;
  readonly label: string;
  readonly detail?: string;
}

const byIncident = new Map<string, CaseTimelineEntry[]>();
const listeners = new Set<() => void>();

function nowClock(): string {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function recordCaseEvent(incidentId: string, kind: CaseEventKind, label: string, detail?: string): void {
  const list = byIncident.get(incidentId) ?? [];
  list.push({ ts: nowClock(), kind, label, detail });
  byIncident.set(incidentId, list);
  for (const fn of listeners) fn();
}

export function getCaseTimeline(incidentId: string): readonly CaseTimelineEntry[] {
  return byIncident.get(incidentId) ?? [];
}

export function subscribeCaseTimeline(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 仅测试用:清空全部案卷记录。 */
export function __resetCaseTimelineForTest(): void {
  byIncident.clear();
  for (const fn of listeners) fn();
}
