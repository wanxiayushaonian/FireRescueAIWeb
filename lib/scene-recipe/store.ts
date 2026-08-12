import { diffRecipe } from './diff';
import { defaultRecipe } from './types';
import type { Changeset, ObservationalRecipe, SceneRecipe, StructuralRecipe } from './types';

type Listener = (next: SceneRecipe, changeset: Changeset) => void;

/**
 * 场景显隐/聚焦的唯一真相源。框架无关(不持 runtime/tree)。
 * 三路驱动(用户/模块预设/agent)经 setStructural/patchStructural/
 * setObservational/patchObservational/applyPreset 投 patch;
 * 绑定层(SceneProvider)订阅后调 engine.applyRecipe。
 */
export class RecipeStore {
  private current: SceneRecipe = defaultRecipe();
  private listeners = new Set<Listener>();
  /** 场景状态是否可能与 SDK 不一致(apply 失败时由绑定层置 true) */
  public desynced = false;

  getCurrent(): SceneRecipe {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 整体替换结构层(模块预设进入态用) */
  setStructural(full: StructuralRecipe): void {
    this.dispatch({ ...this.current, structural: full });
  }

  /** 部分更新结构层(用户楼层选择用) */
  patchStructural(patch: Partial<StructuralRecipe>): void {
    this.dispatch({ ...this.current, structural: { ...this.current.structural, ...patch } });
  }

  setObservational(full: ObservationalRecipe): void {
    this.dispatch({ ...this.current, observational: full });
  }

  patchObservational(patch: Partial<ObservationalRecipe>): void {
    this.dispatch({ ...this.current, observational: { ...this.current.observational, ...patch } });
  }

  /** 复合:子流程预设(结构+观察整体,如六熟悉某步) */
  applyPreset(recipe: SceneRecipe): void {
    this.dispatch(recipe);
  }

  private dispatch(next: SceneRecipe): void {
    const cs = diffRecipe(this.current, next);
    // 幂等:零变更(两层都不 touched)→ 不通知、不发 SDK 调用
    if (!cs.structural.__touched && !cs.observational.__touched) return;
    this.current = next;
    for (const l of this.listeners) l(this.current, cs);
  }
}
