import { subscribeSceneLog } from '../src/mock/sceneLog';
import type { SceneAction } from '../src/mock/sceneLog';
import type { SceneTreeNode } from './ustudio';
import type { RecipeStore } from './scene-recipe/store';
import { getGlobalRecipeStore } from './scene-recipe/global-store';
import { drawPlanRoute, clearPlanRoutes, type PlanRouteKind } from './plan-route-draw';

/**
 * sceneLog action → SoonspaceRuntime 真实 SDK 调用的映射层。
 *
 * 原型各面板/智能体经 addSceneAction 写 sceneLog(动作总线 + 日志);
 * RealSceneView 订阅 sceneLog,通过本模块把 action 映射到真实 SDK 执行。
 *
 * 边界:本步执行 flyTo/highlight/switchFloor/resetView 与 showRoute/hideRoute
 * (预案路线折线,2026-09-04 接线,解析见 plan-route-draw);drawZone/addMarker
 * 等仍留后续。target 形式:flyTo/highlight 只执行"疑似 id"(非空、非纯中文),
 * 中文建筑名 target 记日志跳过(待建筑档案 id 对齐后,面板侧改写 id)。
 */

/** id 判定:非空、非纯中文(粗略区分场景对象 id 与建筑名)。待建筑档案 id 对齐后可收紧。 */
function looksLikeId(target: string): boolean {
  if (!target) return false;
  return !/[一-龥]/.test(target);
}

const HIGHLIGHT_COLOR = '#f87171';

/** 本步忽略的动作(留后续:接 BFF routes/polygons + 前端绘制层)。 */
const IGNORED = new Set([
  'drawZone', 'drawRoute', 'clearTactical',
  'addMarker', 'removeMarker', 'updatePlan',
]);

export type SceneExecutorRuntime = {
  flyToObject: (id: string) => unknown;
  highlightObject: (id: string, color?: string) => unknown;
  clearObjectHighlight: (id: string) => unknown;
  resetCamera: () => unknown;
  /** 预案路线:对象世界坐标 + 虚拟路线画/清(SoonspaceRuntime 同名方法)。 */
  getObjectWorldPosition: (id: string) => { x: number; y: number; z: number } | null;
  drawVirtualRoute: (detail: Record<string, unknown>, options?: Record<string, unknown>) => unknown;
  clearVirtualRoute: (routeId: string) => void;
};

export type MapResult = { executed: boolean; reason?: string };

export function mapSceneAction(
  action: SceneAction,
  runtime: SceneExecutorRuntime,
  store?: RecipeStore,
  tree?: SceneTreeNode | null,
): MapResult {
  const { action: name, target, params } = action;
  if (IGNORED.has(name)) return { executed: false, reason: `忽略:${name} 留架构第4步` };
  switch (name) {
    case 'flyTo':
    case 'highlight':
    case 'batchHighlight': {
      if (!looksLikeId(target)) {
        return { executed: false, reason: 'target 非 id(待建筑档案 id 对齐)' };
      }
      if (name === 'flyTo') {
        runtime.flyToObject(target);
      } else {
        runtime.highlightObject(target, HIGHLIGHT_COLOR);
      }
      return { executed: true };
    }
    case 'switchFloor': {
      const storyIds = Array.isArray((params as { storyIds?: unknown })?.storyIds)
        ? (params as { storyIds: string[] }).storyIds
        : [];
      // 经 Recipe 单一真相源(注入 store 优先,缺席时读全局引用);仍拿不到则明确拒绝 ——
      // 不直调 runtime.setViewMode:其内部 resetAll 会恢复一切被 hide 的对象且 Recipe
      // 不同步(显隐污染),详见 global-store.ts 注释。
      const s = store ?? getGlobalRecipeStore();
      if (!s) {
        return { executed: false, reason: 'RecipeStore 未就绪,switchFloor 已拒绝(避免绕过显隐真相源)' };
      }
      const isFocusSingle = storyIds.length === 1;
      s.patchStructural({
        visibleStories: storyIds,
        detailLevel: isFocusSingle ? 'full' : 'structure',
        hideDevices: !isFocusSingle,
      });
      return { executed: true };
    }
    case 'resetView': {
      runtime.resetCamera();
      return { executed: true };
    }
    case 'showRoute': {
      // 预案路线:params.steps 携带步骤文本数组(PlanOutputPanel 路线分组写入),
      // kind 定 attack/evacuate;旧格式无 steps 的日志动作仅记录不执行。
      const kind: PlanRouteKind = params?.kind === 'evacuate' ? 'evacuate' : 'attack';
      const rawSteps = Array.isArray((params as { steps?: unknown } | undefined)?.steps)
        ? (params as { steps: unknown[] }).steps
        : [];
      const steps = rawSteps.map((s) => String(s ?? '').trim()).filter(Boolean);
      if (steps.length === 0) {
        return { executed: false, reason: 'showRoute 无 steps 参数(仅日志)' };
      }
      const r = drawPlanRoute(kind, steps, tree ?? null, runtime);
      return r.drawn ? { executed: true } : { executed: false, reason: `路线未绘制:${r.reason ?? '未知'}` };
    }
    case 'hideRoute': {
      // kind 缺省=清除进攻+疏散两条(重新生成/复位语义)
      const p = params as { kind?: unknown } | undefined;
      const kind = p?.kind === 'attack' || p?.kind === 'evacuate' ? (p.kind as PlanRouteKind) : undefined;
      clearPlanRoutes(runtime, kind);
      return { executed: true };
    }
    default:
      return { executed: false, reason: `未知 action:${name}` };
  }
}

/**
 * 订阅 sceneLog,每条最新 action 经 mapSceneAction 映射执行。
 * 跳过的动作(IGNORED / target 非 id / 未知)打 warn,便于排查。
 * @param tree 场景实例树(showRoute 步骤文本 → 锚点解析用;未就绪时路线跳过)。
 * @returns 退订函数。
 */
export function subscribeSceneActions(
  runtime: SceneExecutorRuntime,
  store?: RecipeStore,
  tree?: SceneTreeNode | null,
): () => void {
  return subscribeSceneLog((_list, latest) => {
    if (!latest) return;
    const res = mapSceneAction(latest, runtime, store, tree);
    if (!res.executed && res.reason) {
      console.warn('[real-scene] action skipped', latest.action, res.reason);
    }
  });
}
