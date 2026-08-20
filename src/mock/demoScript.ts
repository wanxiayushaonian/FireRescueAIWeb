// 全局演示剧本运行器（一键串联汇报演示）
// 与 liveChannel.ts / sceneLog.ts 同构的 pub-sub：
//   UI（TopBar）经 subscribeScript(fn) 订阅 ScriptState 渲染进度；
//   模块切换不直接调 App，统一派发 window 事件 'demo:switch-module'，
//   由主代理在 App.tsx 监听并 setModule（事件契约见下方 ModuleKey）。
// 剧本节奏常量集中在 PACE，注释「汇报演示节奏」可调。
import type { ModuleKey } from '@/components/SideNav';
import { connect, getSource, injectIncident } from './liveChannel';
import {
  beginEvaluate, beginGenerate, finishEvaluate, finishGenerate, getDrillState, injectEmergency,
} from './drillStore';
import { buildDrillPlan, evaluatePlan, pickEmergency, renderEmergency } from './drill';
import { addSceneAction } from './sceneLog';
import { showToast } from '@/components/Toast';

export interface ScriptState {
  running: boolean;
  stepIndex: number;   // 当前步骤序号（1-based，0 = 未开始/已停止）
  stepLabel: string;
  totalSteps: number;
}

/** 汇报演示节奏（单位 ms，可整体缩放） */
const PACE = {
  incidentPhase: 8000,  // 步骤1：接警阶段推进等待
  recommendPhase: 8000, // 步骤2：灾情研判推荐等待
  planGenerate: 1500,   // 步骤3：生成中停留（generating → done）
  planShow: 5000,       // 步骤3：预案输出展示
  emergencyShow: 5000,  // 步骤4：特情注入响应展示
  evaluateRun: 1500,    // 步骤5：评估中停留
  evaluateShow: 4000,   // 步骤5：评估结果展示
  objectsShow: 5000,    // 步骤6：对象总览展示
};

/** 演示情景参数（金茂大厦 5F 电气火灾） */
const SCENARIO = { buildingId: 'jm', buildingName: '金茂大厦', floor: '5F', material: '电气', trapped: 2 };

let state: ScriptState = { running: false, stepIndex: 0, stepLabel: '', totalSteps: 7 };
const listeners = new Set<(s: ScriptState) => void>();

let timerIds: number[] = [];

function emit() {
  listeners.forEach((fn) => fn(state));
}

function setState(patch: Partial<ScriptState>) {
  state = { ...state, ...patch };
  emit();
}

function switchModule(module: ModuleKey) {
  window.dispatchEvent(new CustomEvent('demo:switch-module', { detail: { module } }));
}

/** 可取消 sleep：timeout id 统一登记，stopScript 全部清理 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const id = window.setTimeout(() => {
      timerIds = timerIds.filter((t) => t !== id);
      resolve();
    }, ms);
    timerIds.push(id);
  });
}

export function startScript(): void {
  if (state.running) return;
  timerIds.forEach((id) => window.clearTimeout(id));
  timerIds = [];
  setState({ running: true, stepIndex: 0, stepLabel: '演示开始' });
  void run();
}

export function stopScript(): void {
  timerIds.forEach((id) => window.clearTimeout(id));
  timerIds = [];
  setState({ running: false, stepIndex: 0, stepLabel: '已停止' });
  showToast('演示剧本已停止');
}

export function subscribeScript(fn: (s: ScriptState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => { listeners.delete(fn); };
}

export function getScriptState(): ScriptState {
  return state;
}

async function run(): Promise<void> {
  const ok = () => state.running;
  const setStep = (stepIndex: number, stepLabel: string) => setState({ stepIndex, stepLabel });

  // 1) 开场：实战指挥 · 注入新警情
  setStep(1, '接警 · 实战指挥');
  switchModule('command');
  if (getSource() == null) connect('mock');
  injectIncident();
  await sleep(PACE.incidentPhase);
  if (!ok()) return;

  // 2) 灾情研判 · 实时推荐（同模块，状态机继续推进）
  setStep(2, '灾情研判 · 实时推荐');
  await sleep(PACE.recommendPhase);
  if (!ok()) return;

  // 3) 预案生成 · 情景推演
  setStep(3, '预案生成 · 情景推演');
  switchModule('drill');
  beginGenerate(SCENARIO);
  await sleep(PACE.planGenerate);
  if (!ok()) return;
  finishGenerate(buildDrillPlan(SCENARIO));
  await sleep(PACE.planShow);
  if (!ok()) return;

  // 4) 对抗推演 · 特情注入
  setStep(4, '对抗推演 · 特情注入');
  const used = getDrillState().emergencies.map((e) => e.id);
  injectEmergency(renderEmergency(pickEmergency(used), SCENARIO));
  await sleep(PACE.emergencyShow);
  if (!ok()) return;

  // 5) 战后评估 · 归档入库
  setStep(5, '战后评估 · 归档入库');
  beginEvaluate();
  await sleep(PACE.evaluateRun);
  if (!ok()) return;
  const cur = getDrillState();
  finishEvaluate(evaluatePlan(cur.emergencies.length, cur.evaluatedCount));
  await sleep(PACE.evaluateShow);
  if (!ok()) return;

  // 6) 对象总览 · 建筑档案
  setStep(6, '对象总览 · 建筑档案');
  switchModule('objects');
  await sleep(PACE.objectsShow);
  if (!ok()) return;

  // 7) 态势总览 · 演示结束
  setStep(7, '态势总览 · 演示结束');
  switchModule('overview');
  addSceneAction({ action: 'resetView', target: '演示剧本完成', source: '智能体' });
  showToast('演示剧本完成');
  setState({ running: false });
}
