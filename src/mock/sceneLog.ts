// 场景动作日志 store：所有业务面板与智能体通过 addSceneAction 写入，
// ScenePlaceholder / 日志浮层通过 subscribeSceneLog 订阅。
export type SceneActionName =
  | 'flyTo' | 'highlight' | 'batchHighlight' | 'switchFloor'
  | 'showRoute' | 'hideRoute' | 'addMarker' | 'removeMarker' | 'resetView'
  // 实战指挥 · 战术推演层（TacticalOverlay）：drawZone 蔓延圈层绘制 /
  // drawRoute 进攻路线绘制 / clearTactical 推演图层清除（换警情或熄灭时）
  | 'drawZone' | 'drawRoute' | 'clearTactical'
  // 预案库联动：改进措施确认落地 → 关联预案版本 +1（planLibrary.confirmImprovement）
  | 'updatePlan'
  // 点位治理:重点单位/建筑坐标修正(仅记录,无执行器)
  | 'updateCoord'
  // 点位增删改:水源/重点单位/重点建筑(仅记录,无执行器)
  | 'editEntity';

export interface SceneAction {
  ts: string;
  action: SceneActionName;
  target: string;
  params?: Record<string, unknown>;
  source: '面板' | '智能体' | '预案引擎';
}

export interface SceneState {
  view: string;      // 当前视角
  floor: string;     // 楼层
  center: string;    // 中心坐标
  focusTarget?: string;
}

const MAX_ENTRIES = 50;

let entries: SceneAction[] = [];
let sceneState: SceneState = {
  view: '园区俯瞰',
  floor: '全部楼层',
  center: '115.96498, 29.66734',
};

type Listener = (entries: SceneAction[], latest: SceneAction | null, state: SceneState) => void;
const listeners = new Set<Listener>();

function now(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function applyActionToState(a: SceneAction) {
  if (a.action === 'switchFloor' && a.params?.floor) {
    sceneState = { ...sceneState, floor: String(a.params.floor) };
  }
  if ((a.action === 'flyTo' || a.action === 'addMarker') && a.params?.lng != null) {
    sceneState = {
      ...sceneState,
      center: `${a.params.lng}, ${a.params.lat}`,
      view: '目标定位',
      focusTarget: a.target,
    };
  }
  if (a.action === 'resetView') {
    sceneState = { view: '园区俯瞰', floor: '全部楼层', center: '115.96498, 29.66734' };
  }
}

export function addSceneAction(
  action: Omit<SceneAction, 'ts'> & { ts?: string },
): SceneAction {
  const entry: SceneAction = { ts: action.ts ?? now(), ...action };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  applyActionToState(entry);
  listeners.forEach((fn) => fn(entries, entry, sceneState));
  return entry;
}

export function clearSceneLog() {
  entries = [];
  listeners.forEach((fn) => fn(entries, null, sceneState));
}

export function subscribeSceneLog(fn: Listener): () => void {
  listeners.add(fn);
  fn(entries, null, sceneState);
  return () => listeners.delete(fn);
}

export function getSceneState(): SceneState {
  return sceneState;
}

export function getSceneLog(): SceneAction[] {
  return entries;
}
