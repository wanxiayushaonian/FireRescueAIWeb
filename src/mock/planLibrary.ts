// 预案库共享 store：演练评估归档 / 对抗评估归档 / 改进措施回流统一入库，
// PlanLibraryPanel 订阅展示。仿 sceneLog / drillStore 的 pub-sub 风格。
import type { FetchState } from './types';
import { addSceneAction } from './sceneLog';

export type LibraryKind = '演练预案' | '对抗评估' | '改进措施';
export type LibraryStatus = '已归档' | '需修订' | '待落地' | '已落地';

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  title: string;
  buildingName?: string;
  score?: number;
  archivedAt: string;
  status: LibraryStatus;
  summary: string[];
  sourceDetail?: string;
  /** 预案版本号（默认 v1；仅「改进措施落地」触发 +1，归档不递增） */
  version?: number;
  /** 改进措施关联的同建筑演练预案 id（入库时自动关联最新一份） */
  linkedPlanId?: string;
  /** 后端正式预案库 emergency_plans 建档 id（演练预案评估归档成功后回写） */
  backendPlanId?: string;
}

let seq = 0;

let items: LibraryItem[] = [
  {
    id: 'lib-seed-1',
    kind: '演练预案',
    title: '金茂大厦高层火灾处置预案（演练版）',
    buildingName: '金茂大厦',
    score: 91,
    archivedAt: '昨日 16:42:10',
    status: '已归档',
    version: 1,
    summary: [
      '力量编成满足首调需求，增援梯队衔接合理',
      '疏散路线与进攻路线无交叉冲突',
      '安全管控措施覆盖内攻轮换与结构监测要点',
    ],
    sourceDetail: '来源：演练对抗 · 预案评估（评估分 91/100） · 演示数据',
  },
  {
    id: 'lib-seed-2',
    kind: '对抗评估',
    title: '环球金融中心 对抗演练评估记录',
    buildingName: '环球金融中心',
    score: 78,
    archivedAt: '昨日 11:05:33',
    status: '需修订',
    summary: [
      '供水干线备份方案未及时启用',
      '存在未响应特情，调整链路出现断点',
      '请修订预案后重新组织对抗演练',
    ],
    sourceDetail: '来源：演练对抗 · 对抗评估（评估分 78/100） · 演示数据',
  },
];

type Listener = (items: LibraryItem[]) => void;
const listeners = new Set<Listener>();

function now(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 入库：归档评估 / 回流改进措施（自动补 id 与时间戳；改进措施自动关联同建筑最新演练预案） */
export function addLibraryItem(item: Omit<LibraryItem, 'id' | 'archivedAt'> & { archivedAt?: string }): LibraryItem {
  seq += 1;
  const entry: LibraryItem = { archivedAt: now(), ...item, id: `lib-${Date.now().toString(36)}-${seq}` };
  if (entry.kind === '演练预案') {
    // 归档保持 v1（或沿用传入版本），不递增；只有改进措施落地才 +1
    entry.version = entry.version ?? 1;
  }
  if (entry.kind === '改进措施' && !entry.linkedPlanId) {
    // items 新条目在前，第一个匹配即同建筑最新「演练预案」。
    // 优先按 buildingName 精确匹配；未传 buildingName 时（如实战指挥战后回流）
    // 回退为在标题/来源说明中匹配已知预案的建筑名（如「→ 金茂大厦预案 · 力量编成节」）。
    const plan =
      (entry.buildingName &&
        items.find((it) => it.kind === '演练预案' && it.buildingName === entry.buildingName)) ||
      items.find(
        (it) =>
          it.kind === '演练预案' &&
          it.buildingName &&
          `${entry.title}${entry.sourceDetail ?? ''}`.includes(it.buildingName),
      );
    if (plan) {
      entry.linkedPlanId = plan.id;
      entry.buildingName = entry.buildingName ?? plan.buildingName;
    }
  }
  items = [entry, ...items];
  listeners.forEach((fn) => fn(items));
  return entry;
}

/**
 * 确认改进措施落地：status「待落地」→「已落地」，
 * 同时将关联预案 version +1 并写场景动作日志（source 预案引擎），通知订阅者。
 */
export function confirmImprovement(id: string): LibraryItem | undefined {
  const target = items.find((it) => it.id === id);
  if (!target || target.kind !== '改进措施' || target.status !== '待落地') return undefined;
  let newVersion: number | undefined;
  items = items.map((it) => {
    if (it.id === id) return { ...it, status: '已落地' as LibraryStatus };
    if (target.linkedPlanId && it.id === target.linkedPlanId) {
      newVersion = (it.version ?? 1) + 1;
      return { ...it, version: newVersion };
    }
    return it;
  });
  if (newVersion !== undefined) {
    const plan = items.find((it) => it.id === target.linkedPlanId);
    addSceneAction({
      action: 'updatePlan',
      target: `${plan?.title ?? '关联预案'} 预案版本升至 v${newVersion}`,
      params: { planId: target.linkedPlanId, version: newVersion },
      source: '预案引擎',
    });
  }
  listeners.forEach((fn) => fn(items));
  return items.find((it) => it.id === id);
}

export function subscribeLibrary(fn: Listener): () => void {
  listeners.add(fn);
  fn(items);
  return () => listeners.delete(fn);
}

/** 局部更新已入库条目（如后端建档成功后回写 backendPlanId），通知订阅者。 */
export function patchLibraryItem(id: string, patch: Partial<LibraryItem>): void {
  items = items.map((it) => (it.id === id ? { ...it, ...patch } : it));
  listeners.forEach((fn) => fn(items));
}

export function getLibrary(): LibraryItem[] {
  return items;
}

const wait = (min = 300, max = 800) =>
  new Promise<void>((r) => window.setTimeout(r, min + Math.random() * (max - min)));

/** 拉取预案库列表（Promise + 300-800ms 模拟延迟，state 支持 loading/empty/error/ok 演示） */
export async function fetchLibrary(state: FetchState = 'ok'): Promise<LibraryItem[]> {
  if (state === 'loading') return new Promise(() => undefined);
  await wait();
  if (state === 'error') throw new Error('预案库服务连接失败（模拟）');
  if (state === 'empty') return [];
  return items;
}
