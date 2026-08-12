import { useCallback, useEffect, useState } from 'react';
import type { ObservationalRecipe, StructuralRecipe } from './types';
import type { RecipeStore } from './store';

/** 订阅 store,Recipe 变化时重渲染返回最新值 */
export function useRecipe(store: RecipeStore) {
  const [recipe, setRecipe] = useState(store.getCurrent());
  useEffect(() => store.subscribe((next) => setRecipe(next)), [store]);
  return recipe;
}

/** 仅订阅结构层 */
export function useStructural(store: RecipeStore): StructuralRecipe {
  return useRecipe(store).structural;
}

/** 拿 dispatch 函数(setStructural/patchStructural/patchObservational/setObservational/applyPreset) */
export function useRecipeDispatch(store: RecipeStore) {
  return {
    setStructural: useCallback((full: StructuralRecipe) => store.setStructural(full), [store]),
    patchStructural: useCallback((patch: Partial<StructuralRecipe>) => store.patchStructural(patch), [store]),
    patchObservational: useCallback((patch: Partial<ObservationalRecipe>) => store.patchObservational(patch), [store]),
    setObservational: useCallback((full: ObservationalRecipe) => store.setObservational(full), [store]),
    applyPreset: useCallback((recipe: Parameters<RecipeStore['applyPreset']>[0]) => store.applyPreset(recipe), [store]),
  };
}
