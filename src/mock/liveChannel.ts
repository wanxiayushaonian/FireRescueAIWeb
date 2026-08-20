// 实时通道抽象（command.md §6）
// 单一 mock 时钟（setInterval 1s tick），驱动三个发布者：
//   1) 警情状态机（接警→出动→到场→控制→熄灭，按 mock 时钟自动推进）
//   2) 灾情变量采样器（温度/烟气/被困/火势，5-10s 采样周期）
//   3) 推荐规则引擎（状态流转 + 变量越阈触发，同类 30s 节流）
// UI 面板经 subscribe(handler) 订阅，与 sceneLog.ts 的 pub-sub 同构。
//
// 生产环境替换为 110 联动 / 物联网回传 WebSocket 通道：
//   connect('websocket') 为预留真实接入位，原型固定使用 connect('mock')。
import {
  INITIAL_INCIDENTS, makeNewIncident, nextRecommendationId, nowTime,
  statusRecommendation, thresholdRecommendation,
} from './incidents';
import type { DisasterVars, Incident, IncidentStatus, Recommendation, RecommendType } from './incidents';

export type LiveSource = 'mock' | 'websocket';

export interface VarHistory {
  temperature: number[];
  smoke: number[];
  trapped: number[];
  fireLevel: number[];
}

export interface LiveVars extends DisasterVars {
  history: VarHistory; // 最近 6 个采样点（趋势条）
}

export type LiveEvent =
  | { kind: 'status'; incident: Incident; from: IncidentStatus; to: IncidentStatus }
  | { kind: 'vars'; incidentId: string; vars: LiveVars }
  | { kind: 'recommendation'; rec: Recommendation }
  | { kind: 'rescue'; incidentId: string; trapped: number };

export interface LiveSnapshot {
  incidents: Incident[];
  vars: Record<string, LiveVars>;
  recommendations: Recommendation[];
  tick: number;
}

type Listener = (snap: LiveSnapshot, events: LiveEvent[]) => void;

/** 状态机停留时长（tick = 1s）：接警 20s → 出动 40s → 到场 60s → 控制 40s */
const STATUS_DWELL: Record<Exclude<IncidentStatus, '熄灭'>, number> = {
  接警: 20, 出动: 40, 到场: 60, 控制: 40,
};
const NEXT_STATUS: Record<IncidentStatus, IncidentStatus | null> = {
  接警: '出动', 出动: '到场', 到场: '控制', 控制: '熄灭', 熄灭: null,
};
/** 火势等级随状态收敛：接警Ⅲ → 出动Ⅳ → 到场Ⅲ → 控制Ⅱ → 熄灭Ⅰ */
const STATUS_FIRE_LEVEL: Record<IncidentStatus, 1 | 2 | 3 | 4 | 5> = {
  接警: 3, 出动: 4, 到场: 3, 控制: 2, 熄灭: 1,
};
const HISTORY_LEN = 6;
const THROTTLE_TICKS = 30; // 同类越阈推荐 30s 内不重复

interface Runtime {
  incident: Incident;
  enteredTick: number;
  nextSampleTick: number;
  lastThresholdAt: Partial<Record<RecommendType, number>>;
  pendingRecs: Array<{ dueTick: number; rec: Recommendation }>;
}

let source: LiveSource | null = null;
let refCount = 0;
let timer: number | null = null;
let tick = 0;
const runtimes: Runtime[] = [];
const varsMap = new Map<string, LiveVars>();
let recommendations: Recommendation[] = [];
const listeners = new Set<Listener>();

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function randInt(lo: number, hi: number) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function initialVars(incident: Incident): LiveVars {
  const base: DisasterVars = {
    incidentId: incident.id,
    temperature: 320,
    smoke: 68,
    trapped: 3,
    fireLevel: STATUS_FIRE_LEVEL[incident.status],
    sampledAt: nowTime(),
  };
  return {
    ...base,
    history: {
      temperature: [base.temperature],
      smoke: [base.smoke],
      trapped: [base.trapped],
      fireLevel: [base.fireLevel],
    },
  };
}

function seed() {
  runtimes.length = 0;
  varsMap.clear();
  recommendations = [];
  INITIAL_INCIDENTS.forEach((incident, i) => {
    runtimes.push({
      incident: { ...incident, statusHistory: [...incident.statusHistory] },
      enteredTick: tick,
      nextSampleTick: tick + 2 + i * 2,
      lastThresholdAt: {},
      pendingRecs: [],
    });
    varsMap.set(incident.id, initialVars(incident));
  });
}

function pushHistory(v: LiveVars): LiveVars {
  const h: VarHistory = {
    temperature: [...v.history.temperature, v.temperature].slice(-HISTORY_LEN),
    smoke: [...v.history.smoke, v.smoke].slice(-HISTORY_LEN),
    trapped: [...v.history.trapped, v.trapped].slice(-HISTORY_LEN),
    fireLevel: [...v.history.fireLevel, v.fireLevel].slice(-HISTORY_LEN),
  };
  return { ...v, history: h };
}

/** 灾情变量采样（每 5-10s 一次，随警情状态演化） */
function sampleVars(rt: Runtime): { vars: LiveVars; events: LiveEvent[] } {
  const prev = varsMap.get(rt.incident.id) ?? initialVars(rt.incident);
  const st = rt.incident.status;
  const events: LiveEvent[] = [];

  let temperature = prev.temperature;
  if (st === '控制' || st === '熄灭') {
    temperature -= randInt(8, 20); // 「控制」后每 10s −8~20℃ 下探
    if (st === '熄灭') temperature = Math.min(temperature, 60); // 「熄灭」稳定 ≤60℃
  } else {
    temperature += randInt(-6, 14); // 发展期缓慢爬升，可越 500℃ 阈值
  }
  temperature = clamp(Math.round(temperature), 40, 680);

  const smoke = clamp(Math.round(prev.smoke + randInt(-5, 5)), 5, 96);

  let trapped = prev.trapped;
  if ((st === '到场' || st === '控制') && trapped > 0 && Math.random() < 0.3) {
    trapped -= 1; // 救援进展事件
    events.push({ kind: 'rescue', incidentId: rt.incident.id, trapped });
  }

  const vars = pushHistory({
    ...prev,
    temperature,
    smoke,
    trapped,
    fireLevel: STATUS_FIRE_LEVEL[st],
    sampledAt: nowTime(),
  });
  varsMap.set(rt.incident.id, vars);
  events.push({ kind: 'vars', incidentId: rt.incident.id, vars });

  // 越阈 → 推荐规则引擎（节流：同类 30s 内不重复）
  const throttled = (t: RecommendType) =>
    rt.lastThresholdAt[t] != null && tick - (rt.lastThresholdAt[t] ?? 0) < THROTTLE_TICKS;
  const emitRec = (tpl: { type: RecommendType; content: string; basis: string } | null) => {
    if (!tpl || throttled(tpl.type) || rt.incident.status === '熄灭') return;
    rt.lastThresholdAt[tpl.type] = tick;
    const rec: Recommendation = {
      id: nextRecommendationId(), incidentId: rt.incident.id, ts: nowTime(), ...tpl,
    };
    recommendations = [rec, ...recommendations];
    events.push({ kind: 'recommendation', rec });
  };
  // 越阈推荐统一到场门控(变量照常采样显示):力量未到场时推"内攻轮换/排烟部署"
  // 属时空错位——用户反馈"车没到先收到场类决策"。trapped 原有门控一并收拢。
  const onScene = st === '到场' || st === '控制';
  if (onScene && temperature > 500) emitRec(thresholdRecommendation('temperature', vars));
  else if (onScene && smoke > 60) emitRec(thresholdRecommendation('smoke', vars));
  else if (onScene && trapped > 0) emitRec(thresholdRecommendation('trapped', vars));

  return { vars, events };
}

function doTick() {
  tick += 1;
  const events: LiveEvent[] = [];

  for (const rt of runtimes) {
    // 1) 状态机推进
    const next = NEXT_STATUS[rt.incident.status];
    if (next && tick - rt.enteredTick >= STATUS_DWELL[rt.incident.status as Exclude<IncidentStatus, '熄灭'>]) {
      const from = rt.incident.status;
      rt.incident = {
        ...rt.incident,
        status: next,
        statusHistory: [...rt.incident.statusHistory, { status: next, ts: nowTime() }],
      };
      rt.enteredTick = tick;
      events.push({ kind: 'status', incident: rt.incident, from, to: next });
      // 状态流转 1s 后推送对应类型推荐（熄灭 → 战后评估入口卡由面板呈现）
      const tpl = statusRecommendation(next, rt.incident);
      if (tpl) {
        rt.pendingRecs.push({
          dueTick: tick + 1,
          rec: { id: nextRecommendationId(), incidentId: rt.incident.id, ts: nowTime(), ...tpl },
        });
      }
    }
    // 2) 到期的状态流转推荐
    const due = rt.pendingRecs.filter((p) => p.dueTick <= tick);
    if (due.length) {
      rt.pendingRecs = rt.pendingRecs.filter((p) => p.dueTick > tick);
      for (const p of due) {
        recommendations = [p.rec, ...recommendations];
        events.push({ kind: 'recommendation', rec: p.rec });
      }
    }
    // 3) 灾情变量采样（熄灭后停止刷新）
    if (rt.incident.status !== '熄灭' && tick >= rt.nextSampleTick) {
      rt.nextSampleTick = tick + randInt(5, 10);
      events.push(...sampleVars(rt).events);
    }
  }

  notify(events);
}

function snapshot(): LiveSnapshot {
  const vars: Record<string, LiveVars> = {};
  varsMap.forEach((v, k) => { vars[k] = v; });
  return {
    incidents: runtimes.map((r) => r.incident),
    vars,
    recommendations,
    tick,
  };
}

function notify(events: LiveEvent[]) {
  const snap = snapshot();
  listeners.forEach((fn) => fn(snap, events));
}

/**
 * 建立实时通道。原型固定 'mock'；
 * 'websocket' 为生产环境预留：接入 110 联动 / 物联网回传后在此处替换为
 * WebSocket 消息驱动同一组发布者与事件协议，UI 无需改动。
 */
export function connect(src: LiveSource): void {
  source = src;
  refCount += 1;
  if (timer != null) return;
  if (runtimes.length === 0) seed();
  timer = window.setInterval(doTick, 1000);
}

export function disconnect(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && timer != null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function getSource(): LiveSource | null {
  return source;
}

export function subscribe(handler: Listener): () => void {
  listeners.add(handler);
  handler(snapshot(), []);
  return () => { listeners.delete(handler); };
}

/** 模拟新警情接入（110 联动 · 模拟通道） */
export function injectIncident(): Incident {
  const incident = makeNewIncident();
  runtimes.unshift({
    incident,
    enteredTick: tick,
    nextSampleTick: tick + randInt(3, 6),
    lastThresholdAt: {},
    pendingRecs: [],
  });
  varsMap.set(incident.id, initialVars(incident));
  notify([]);
  return incident;
}

/** 采纳 / 忽略推荐 */
export function setRecommendationStatus(id: string, field: 'adopted' | 'ignored'): void {
  recommendations = recommendations.map((r) => (r.id === id ? { ...r, [field]: true } : r));
  notify([]);
}

export function getSnapshot(): LiveSnapshot {
  return snapshot();
}
