import { subscribeSceneLog } from '../src/mock/sceneLog';
import type { SceneAction } from '../src/mock/sceneLog';
import type { RecipeStore } from './scene-recipe/store';
import { getGlobalRecipeStore } from './scene-recipe/global-store';

/**
 * sceneLog action → SoonspaceRuntime 真实 SDK 调用的映射层。
 *
 * 原型各面板/智能体经 addSceneAction 写 sceneLog(动作总线 + 日志);
 * RealSceneView 订阅 sceneLog,通过本模块把 action 映射到真实 SDK 执行。
 *
 * 边界:本步只执行 flyTo/highlight/switchFloor/resetView;showRoute/drawZone/
 * addMarker 等留架构第 4 步。target 形式:只执行"疑似 id"(非空、非纯中文),
 * 中文建筑名 target 记日志跳过(待建筑档案 id 对齐后,面板侧改写 id)。
 */

/** id 判定:非空、非纯中文(粗略区分场景对象 id 与建筑名)。待建筑档案 id 对齐后可收紧。 */
function looksLikeId(target: string): boolean {
  if (!target) return false;
  return !/[一-龥]/.test(target);
}

const HIGHLIGHT_COLOR = '#f87171';

/** 本步忽略的动作(留架构第 4 步:接 BFF routes/polygons + 前端绘制层)。 */
const IGNORED = new Set([
  'showRoute', 'hideRoute', 'drawZone', 'drawRoute', 'clearTactical',
  'addMarker', 'removeMarker', 'updatePlan',
]);

export type SceneExecutorRuntime = {
  flyToObject: (id: string) => unknown;
  highlightObject: (id: string, color?: string) => unknown;
  clearObjectHighlight: (id: string) => unknown;
  resetCamera: () => unknown;
};

export type MapResult = { executed: boolean; reason?: string };

export function mapSceneAction(action: SceneAction, runtime: SceneExecutorRuntime, store?: RecipeStore): MapResult {
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
    default:
      return { executed: false, reason: `未知 action:${name}` };
  }
}

/**
 * 订阅 sceneLog,每条最新 action 经 mapSceneAction 映射执行。
 * 跳过的动作(IGNORED / target 非 id / 未知)打 warn,便于排查。
 * @returns 退订函数。
 */
export function subscribeSceneActions(runtime: SceneExecutorRuntime, store?: RecipeStore): () => void {
  return subscribeSceneLog((_list, latest) => {
    if (!latest) return;
    const res = mapSceneAction(latest, runtime, store);
    if (!res.executed && res.reason) {
      console.warn('[real-scene] action skipped', latest.action, res.reason);
    }
  });
}
