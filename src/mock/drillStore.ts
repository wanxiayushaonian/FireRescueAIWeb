// 演练对抗共享 store：情景参数设置面板（写）与预案输出展示面板（读）通过此 store 通信。
// 两面板互不直接引用，App 只需分别挂载即可。
import type { DrillPlan } from './types';
import type { EmergencyEvent, EvaluationResult, ScenarioParams } from './drill';

export type PlanPhase = 'idle' | 'generating' | 'done';

export interface DrillState {
  /** 最近一次确认的情景参数（null = 未生成过） */
  scenario: ScenarioParams | null;
  phase: PlanPhase;
  plan: DrillPlan | null;
  /** 已注入的突发特情（追加到「处置要点」组末尾） */
  emergencies: EmergencyEvent[];
  evaluating: boolean;
  evaluation: EvaluationResult | null;
  /** 评估次数（影响 mock 评估规则） */
  evaluatedCount: number;
  /** 每次重新生成 +1，供输出面板重置流式进度 */
  generation: number;
}

let state: DrillState = {
  scenario: null,
  phase: 'idle',
  plan: null,
  emergencies: [],
  evaluating: false,
  evaluation: null,
  evaluatedCount: 0,
  generation: 0,
};

type Listener = (s: DrillState) => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function getDrillState(): DrillState {
  return state;
}

export function subscribeDrill(fn: Listener): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

/** 开始生成：清空上一轮特情/评估，进入 generating */
export function beginGenerate(scenario: ScenarioParams) {
  state = {
    ...state,
    scenario,
    phase: 'generating',
    plan: null,
    emergencies: [],
    evaluating: false,
    evaluation: null,
    generation: state.generation + 1,
  };
  emit();
}

/** 生成完成：写入预案内容（输出面板负责分组流式展示） */
export function finishGenerate(plan: DrillPlan) {
  state = { ...state, phase: 'done', plan };
  emit();
}

export function injectEmergency(e: EmergencyEvent) {
  state = { ...state, emergencies: [...state.emergencies, e], evaluation: null };
  emit();
}

export function beginEvaluate() {
  state = { ...state, evaluating: true, evaluation: null };
  emit();
}

export function finishEvaluate(r: EvaluationResult) {
  state = { ...state, evaluating: false, evaluation: r, evaluatedCount: state.evaluatedCount + 1 };
  emit();
  // 预案评估归档闭环：合格（archived）即入预案库可查
  if (r.archived) {
    addLibraryItem({
      kind: '演练预案',
      title: `${state.scenario?.buildingName ?? '未指定建筑'}火灾处置预案（演练版）`,
      buildingName: state.scenario?.buildingName,
      score: r.score,
      status: '已归档',
      summary: r.opinions,
      sourceDetail: `来源：演练对抗 · 预案评估（评估分 ${r.score}/100，${state.scenario?.floor ?? ''} 情景） · 演示数据`,
    });
  }
}

// ============================================================
// 对抗模式（confrontation）扩展 —— 追加契约，不改动上方既有导出
// ============================================================
import { BUILDINGS, FIRE_MATERIALS } from './drill';
import type { FetchState } from './types';
import { addSceneAction } from './sceneLog';
import { addLibraryItem } from './planLibrary';

export interface ConfrontationEvent {
  id: string;
  /** 特情序号（inject/adjust 成对共享） */
  seq: number;
  kind: 'inject' | 'adjust' | 'manual' | 'evaluate';
  /** 特情正文（kind=inject） */
  emergency: string;
  /** 动态调整条目（kind=adjust） */
  adjustments?: string[];
  /** 是否采纳(true) / 人工改派(false) */
  adopted?: boolean;
  /** 响应用时秒数（评估用；undefined = 未响应） */
  respondedWithinSec?: number;
  /** 相对开局秒数（时间轴 T+ 显示） */
  tSec: number;
}

export interface ConfrontationReview {
  score: number;
  conclusion: string;
  comments: string[];
  outcomes: Array<'timely' | 'delayed' | 'ignored'>;
  archived: boolean;
}

export interface ConfrontationState {
  /** 对抗模式开关（二级视图显隐） */
  active: boolean;
  status: 'idle' | 'running' | 'finished';
  /** 灾情抽取中（开局骨架） */
  seedLoading: boolean;
  /** 灾情生成失败/空态文案（null = 正常） */
  seedError: string | null;
  /** 对抗智能体注入前 3s「正在研判…」 */
  thinking: boolean;
  seedScenario: {
    building: string;
    floor: string;
    material: string;
    trapped: number;
    seed: string;
  } | null;
  events: ConfrontationEvent[];
  review: ConfrontationReview | null;
  evaluating: boolean;
  /** 每次开局/重新随机 +1 */
  generation: number;
  /** 开局计时起点（ms epoch） */
  startedAt: number;
  /** 本局计划注入特情总数（3-5） */
  plannedTotal: number;
  /** 上一局结果（一级面板空态小字展示） */
  lastRound: { score: number; archived: boolean } | null;
}

let conf: ConfrontationState = {
  active: false,
  status: 'idle',
  seedLoading: false,
  seedError: null,
  thinking: false,
  seedScenario: null,
  events: [],
  review: null,
  evaluating: false,
  generation: 0,
  startedAt: 0,
  plannedTotal: 0,
  lastRound: null,
};

type ConfListener = (s: ConfrontationState) => void;
const confListeners = new Set<ConfListener>();

function confEmit() {
  confListeners.forEach((fn) => fn(conf));
}

export function getConfrontationState(): ConfrontationState {
  return conf;
}

export function subscribeConfrontation(fn: ConfListener): () => void {
  confListeners.add(fn);
  fn(conf);
  return () => confListeners.delete(fn);
}

// ---- 定时器统一登记，保证可清理 ----
let confTimers: number[] = [];
function later(ms: number, fn: () => void) {
  const id = window.setTimeout(() => {
    confTimers = confTimers.filter((t) => t !== id);
    fn();
  }, ms);
  confTimers.push(id);
}
function clearConfTimers() {
  confTimers.forEach((id) => window.clearTimeout(id));
  confTimers = [];
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));

function elapsedSec(): number {
  return conf.startedAt ? Math.max(0, Math.round((Date.now() - conf.startedAt) / 1000)) : 0;
}

/** 对抗专用特情池（drill.md 池 + 对抗扩展条目），支持 {building}/{floor} 模板 */
const CONFRONT_POOL: Array<{ id: string; text: string; location: string; adjustments: string[] }> = [
  {
    id: 'c1',
    text: '{floor} 东侧防火门故障无法关闭，烟气蔓延加速',
    location: '{building} {floor} 东侧防火门',
    adjustments: ['内攻一组改道防烟楼梯间 B', '排烟机由 {floor} 西窗调至东窗', '增援二梯队提前出动'],
  },
  {
    id: 'c2',
    text: '消防电梯迫降故障，改用防烟楼梯间 B',
    location: '{building} 消防电梯',
    adjustments: ['进攻路线改为首层东门 → 防烟楼梯间 B → {floor}', '通知攻坚组携轻型装备徒步登楼'],
  },
  {
    id: 'c3',
    text: '现场风向突变，浓烟倒灌进攻通道',
    location: '{building} {floor} 进攻通道',
    adjustments: ['进攻通道调整至背风面入口', '正压送风机前移至上风方向', '内攻组缩短轮换周期至 10 分钟'],
  },
  {
    id: 'c4',
    text: '2 名被困人员位置转移至 6F 窗边',
    location: '{building} 6F 窗边',
    adjustments: ['举高喷射车转场至 6F 窗一侧实施救人', '内攻二组优先搜索 6F 区域'],
  },
  {
    id: 'c5',
    text: '市政供水管网压力骤降，首层供水干线流量不足',
    location: '{building} 首层供水干线',
    adjustments: ['启用附近消防水池远程供水编队', '干线由双干线改为三干线并联供水', '通知自来水公司加压'],
  },
  {
    id: 'c6',
    text: '举高喷射车就位位置被违停车辆占用',
    location: '{building} 东侧登高操作面',
    adjustments: ['协调交警拖移违停车辆', '举高车临时调整至北侧备用操作面'],
  },
  {
    id: 'c7',
    text: '6F 发现疑似危化品存储，需调整射流形式',
    location: '{building} 6F 存储间',
    adjustments: ['直流水枪改为喷雾射流稀释掩护', '划定重危区，内攻人员佩戴空气呼吸器', '联系单位技术人员核实物质种类'],
  },
  {
    id: 'c8',
    text: '现场通信受干扰，内攻组失联 90 秒',
    location: '{building} {floor} 内攻区域',
    adjustments: ['启用备用频道并增设中继', '安全员按失联预案在入口集结接应', '暂停纵深推进，原地待命待联'],
  },
  {
    id: 'c9',
    text: '建筑结构出现异响，安全员建议局部撤离',
    location: '{building} {floor} 结构梁区域',
    adjustments: ['{floor} 内攻人员局部撤离至楼梯间', '安全员架设激光位移监测仪', '外部高喷加强冷却承重构件'],
  },
];

let confSeq = 0;
let usedPoolIds: string[] = [];

function fillTpl(t: string, s: NonNullable<ConfrontationState['seedScenario']>): string {
  return t.replaceAll('{building}', s.building).replaceAll('{floor}', s.floor);
}

/** 调度器：注入一条特情（inject），2.5s 后追加配套动态调整（adjust） */
function injectConfrontationEvent() {
  const s = conf.seedScenario;
  if (!s || conf.status !== 'running') return;
  const pool = CONFRONT_POOL.filter((p) => !usedPoolIds.includes(p.id));
  const src = pool.length > 0 ? pool : CONFRONT_POOL;
  const raw = src[Math.floor(Math.random() * src.length)];
  usedPoolIds.push(raw.id);
  confSeq += 1;
  const seq = confSeq;
  const injectEvt: ConfrontationEvent = {
    id: `ci-${conf.generation}-${seq}`,
    seq,
    kind: 'inject',
    emergency: fillTpl(raw.text, s),
    tSec: elapsedSec(),
  };
  conf = { ...conf, events: [...conf.events, injectEvt] };
  confEmit();
  addSceneAction({ action: 'highlight', target: `特情位置：${fillTpl(raw.location, s)}`, source: '智能体' });

  // 预案输出智能体响应骨架 2.5s 后给出动态调整
  later(2500, () => {
    if (conf.status !== 'running') return;
    const adjustEvt: ConfrontationEvent = {
      id: `ca-${conf.generation}-${seq}`,
      seq,
      kind: 'adjust',
      emergency: '',
      adjustments: raw.adjustments.slice(0, randInt(2, 3)).map((a) => fillTpl(a, s)),
      tSec: elapsedSec(),
    };
    conf = { ...conf, events: [...conf.events, adjustEvt] };
    confEmit();
  });

  // 未达计划总数则按 15-25s 节奏继续
  if (confSeq < conf.plannedTotal) {
    const gap = rand(15000, 25000);
    later(gap - 3000, () => {
      if (conf.status !== 'running') return;
      conf = { ...conf, thinking: true };
      confEmit();
    });
    later(gap, () => {
      conf = { ...conf, thinking: false };
      confEmit();
      injectConfrontationEvent();
    });
  }
}

/** 进入/重开对抗模式：抽取随机灾情并启动 mock 时间线调度器 */
export function beginConfrontation(flow: FetchState = 'ok') {
  clearConfTimers();
  confSeq = 0;
  usedPoolIds = [];
  conf = {
    ...conf,
    active: true,
    status: 'running',
    seedLoading: true,
    seedError: null,
    thinking: false,
    seedScenario: null,
    events: [],
    review: null,
    evaluating: false,
    generation: conf.generation + 1,
    startedAt: 0,
    plannedTotal: randInt(3, 5),
  };
  confEmit();

  if (flow === 'loading') return; // 停留骨架态，供「状态演示」
  later(1200, () => {
    if (!conf.active || conf.status !== 'running') return;
    if (flow === 'error') {
      conf = { ...conf, seedLoading: false, seedError: '灾情生成失败，请重试 · 演示数据' };
      confEmit();
      return;
    }
    if (flow === 'empty') {
      conf = { ...conf, seedLoading: false, seedError: '暂无可演练建筑 · 演示数据' };
      confEmit();
      return;
    }
    const b = BUILDINGS[Math.floor(Math.random() * BUILDINGS.length)];
    const above = b.floors.filter((f) => f.endsWith('F'));
    const floor = above[randInt(Math.min(2, above.length - 1), above.length - 1)] ?? '5F';
    const seedScenario = {
      building: b.name,
      floor,
      material: FIRE_MATERIALS[Math.floor(Math.random() * FIRE_MATERIALS.length)],
      trapped: randInt(1, 8),
      seed: `#${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')}`,
    };
    conf = { ...conf, seedLoading: false, seedScenario, startedAt: Date.now() };
    confEmit();
    // 同步场景动作（预案输出智能体身份）
    addSceneAction({ action: 'flyTo', target: b.name, params: { building: b.name }, source: '预案引擎' });
    addSceneAction({ action: 'switchFloor', target: `${b.name} ${floor}`, params: { floor }, source: '预案引擎' });
    addSceneAction({ action: 'addMarker', target: `着火点 @${floor}`, params: { building: b.name, floor }, source: '预案引擎' });
    // 灾情生成完成 5s 后对抗智能体开始按 15-25s 节奏注入
    const firstGap = 5000 + rand(15000, 25000);
    later(firstGap - 3000, () => {
      if (conf.status !== 'running') return;
      conf = { ...conf, thinking: true };
      confEmit();
    });
    later(firstGap, () => {
      conf = { ...conf, thinking: false };
      confEmit();
      injectConfrontationEvent();
    });
  });
}

/** 指挥员响应某条动态调整：采纳(true) / 人工改派(false) */
export function respondAdjustment(eventId: string, adopted: boolean) {
  const evt = conf.events.find((e) => e.id === eventId);
  if (!evt || evt.kind !== 'adjust' || evt.adopted !== undefined) return;
  const respondedWithinSec = Math.max(1, elapsedSec() - evt.tSec);
  conf = {
    ...conf,
    events: conf.events.map((e) =>
      e.id === eventId ? { ...e, adopted, respondedWithinSec } : e,
    ),
  };
  confEmit();
  if (adopted) {
    addSceneAction({
      action: 'showRoute',
      target: `调整路线：${evt.adjustments?.[0] ?? '动态调整'}`,
      params: { kind: 'adjust', color: '#22d3ee' },
      source: '预案引擎',
    });
  }
}

/** 结束对抗并评估：1.5s 评估骨架后给出对抗评估结论 */
export function finishConfrontation() {
  if (conf.status !== 'running') return;
  clearConfTimers();
  conf = { ...conf, status: 'finished', thinking: false, evaluating: true, review: null };
  confEmit();
  later(1500, () => {
    const adjusts = conf.events.filter((e) => e.kind === 'adjust');
    const outcomes = adjusts.map((e): 'timely' | 'delayed' | 'ignored' => {
      if (e.respondedWithinSec === undefined) return 'ignored';
      return e.respondedWithinSec <= 15 ? 'timely' : 'delayed';
    });
    const ignored = outcomes.filter((o) => o === 'ignored').length;
    const delayed = outcomes.filter((o) => o === 'delayed').length;
    const score = Math.max(45, Math.min(98, 92 - ignored * 8 - delayed * 3));
    const pass = score >= 85;
    const review: ConfrontationReview = {
      score,
      conclusion: pass ? '预案韧性：良好' : '预案韧性：需修订',
      comments: pass
        ? [
            `特情响应平均用时 ${adjusts.length ? Math.round(adjusts.reduce((a, e) => a + (e.respondedWithinSec ?? 30), 0) / adjusts.length) : 8}s，调整链路完整`,
            `${conf.events.filter((e) => e.kind === 'adjust' && e.adopted === false).length || 2} 次人工改派决策合理`,
            '进攻/疏散路线动态调整后无交叉冲突',
          ]
        : [
            '供水干线备份方案未及时启用',
            '存在未响应特情，调整链路出现断点',
            '请修订预案后重新组织对抗演练',
          ],
      outcomes,
      archived: pass,
    };
    const evalEvt: ConfrontationEvent = {
      id: `ce-${conf.generation}`,
      seq: confSeq,
      kind: 'evaluate',
      emergency: `对抗评估完成：${review.conclusion}（${score} 分）`,
      tSec: elapsedSec(),
    };
    conf = {
      ...conf,
      evaluating: false,
      review,
      events: [...conf.events, evalEvt],
      lastRound: { score, archived: pass },
    };
    confEmit();
    // 对抗评估归档闭环：≥85 已归档，否则需修订，均入预案库可查
    addLibraryItem({
      kind: '对抗评估',
      title: `${conf.seedScenario?.building ?? '未指定建筑'} 对抗演练评估记录`,
      buildingName: conf.seedScenario?.building,
      score,
      status: pass ? '已归档' : '需修订',
      summary: review.comments,
      sourceDetail: `来源：演练对抗 · 对抗评估（${review.conclusion}，本局特情 ${confSeq} 条） · 演示数据`,
    });
  });
}

/** 退出对抗模式返回一级（保留本局记录与 lastRound；清理全部定时器） */
export function exitConfrontation() {
  clearConfTimers();
  conf = { ...conf, active: false, status: conf.status === 'running' ? 'idle' : conf.status, thinking: false, seedLoading: false };
  confEmit();
}

/** 从一级「上一局对抗」链接重新打开本局二级视图 */
export function reopenConfrontation() {
  conf = { ...conf, active: true };
  confEmit();
}
