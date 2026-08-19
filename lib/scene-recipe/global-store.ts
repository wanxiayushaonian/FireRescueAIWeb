import type { RecipeStore } from './store';

/**
 * RecipeStore 的进程级兜底引用。
 *
 * 背景:「场景就绪」的 ustudio:scene 事件在 SceneProvider 的 async init 内同步派发,
 * 早于 React 对 setRecipeStore 的 commit —— 命令总线(SceneCommandBridge)在该毫秒级
 * 窗口内注册的 focus_floors 拿不到注入的 store,曾回退直调 sdk.setViewMode,其内部
 * resetAll 会恢复一切被 hide 的对象且 Recipe 不同步(显隐污染)。
 *
 * SceneProvider 在 store 创建后挂载、清理时置 null;命令总线/动作执行器在注入的
 * store 缺席时读它,仍找不到则明确拒绝 —— 绝不回退直调 setViewMode。
 */
let globalStore: RecipeStore | null = null;

export function setGlobalRecipeStore(store: RecipeStore | null): void {
  globalStore = store;
}

export function getGlobalRecipeStore(): RecipeStore | null {
  return globalStore;
}
