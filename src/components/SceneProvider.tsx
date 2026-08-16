'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { SoonspaceRuntime, type CameraViewpoint } from '@/lib/soonspace-runtime';
import type { SceneTreeNode } from '@/lib/ustudio';
import type { LayerApplyParams } from 'ustudio-sdk';
import { RecipeStore } from '@/lib/scene-recipe/store';
import { applyRecipe } from '@/lib/scene-recipe/engine';
import { detectDesync, type SdkLayerState } from '@/lib/scene-recipe/desync';
import type { RecipeRuntime } from '@/lib/scene-recipe/types';

type View = 'loading' | 'ready' | 'error' | 'no-scene';

interface SceneContextValue {
  runtime: SoonspaceRuntime | null;
  view: View;
  error: string | null;
  sceneId: string;
  tree: SceneTreeNode | null;
  initialView: CameraViewpoint | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** 加载进度(initScene onProgress;view==='loading' 期间有值) */
  progress: { stage: string; message: string; percent?: number } | null;
  /** 切换场景（仅当 sceneId 真正变化时才重新加载） */
  setSceneId: (id: string) => void;
  /** 启用场景加载（首次进入 3D 模块时调用，之后保持 true） */
  setEnabled: (v: boolean) => void;
  /** 是否已启用 */
  enabled: boolean;
  /** 保存指定视角为自定义全局视角（持久化，加载场景/回全局时使用） */
  setCustomInitialView: (vp: CameraViewpoint) => void;
  /** 清除自定义全局视角，恢复引擎默认 */
  resetCustomInitialView: () => void;
  /** 场景显隐/聚焦单一真相源(runtime ready 后可用) */
  recipeStore: RecipeStore | null;
}

const SceneContext = createContext<SceneContextValue | null>(null);

/** localStorage key：用户自定义全局视角 */
const CUSTOM_VIEW_KEY = 'firerescue:custom-global-view';

export function useScene(): SceneContextValue {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error('useScene must be used within SceneProvider');
  return ctx;
}

interface SceneProviderProps {
  initialSceneId?: string;
  children: ReactNode;
}

/**
 * 全局 3D 场景 Provider。
 * 管理 SoonspaceRuntime 生命周期，确保场景在模块切换时不重新加载。
 * 仅当 sceneId 真正变化时才重新初始化场景。
 */
export function SceneProvider({ initialSceneId = '', children }: SceneProviderProps) {
  const [sceneId, setSceneIdState] = useState(initialSceneId);
  const [enabled, setEnabled] = useState(false); // 延迟加载：首次进入 3D 模块时才启用
  const [runtime, setRuntime] = useState<SoonspaceRuntime | null>(null);
  const [view, setView] = useState<View>('no-scene'); // 初始 no-scene，enabled 后才 loading
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SceneContextValue['progress']>(null);
  const [tree, setTree] = useState<SceneTreeNode | null>(null);
  const [initialView, setInitialView] = useState<CameraViewpoint | null>(null);
  const [recipeStore, setRecipeStore] = useState<RecipeStore | null>(null);
  const recipeUnsubRef = useRef<(() => void) | null>(null);
  const sceneStateUnsubRef = useRef<(() => void) | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SoonspaceRuntime | null>(null);
  const treeRef = useRef<SceneTreeNode | null>(null);
  const initialViewRef = useRef<CameraViewpoint | null>(null);
  /** 引擎加载完毕的默认视角（用于重置自定义） */
  const originalDefaultViewRef = useRef<CameraViewpoint | null>(null);

  // 切换场景（仅当 sceneId 真正变化时才重新加载）
  const setSceneId = (id: string) => {
    if (id === sceneId) return; // 相同 sceneId 不重新加载
    setSceneIdState(id);
  };

  // 保存指定视角为自定义全局视角（持久化到 localStorage）
  const setCustomInitialView = (vp: CameraViewpoint) => {
    initialViewRef.current = vp;
    setInitialView(vp);
    try {
      localStorage.setItem(CUSTOM_VIEW_KEY, JSON.stringify(vp));
    } catch {
      /* localStorage 不可用 */
    }
  };

  // 清除自定义全局视角，恢复引擎默认
  const resetCustomInitialView = () => {
    try {
      localStorage.removeItem(CUSTOM_VIEW_KEY);
    } catch {
      /* ignore */
    }
    const def = originalDefaultViewRef.current;
    if (def) {
      initialViewRef.current = def;
      setInitialView(def);
      if (runtimeRef.current) void runtimeRef.current.setCameraViewpoint(def, true);
    }
  };

  // 场景加载/切换逻辑（仅当 enabled 为 true 时才加载）
  useEffect(() => {
    if (!enabled) return; // 未启用时不加载场景
    if (!sceneId) {
      setView('no-scene');
      return;
    }

    let disposed = false;
    setView('loading');
    setError(null);
    setProgress(null);

    void (async () => {
      try {
        // 检查场景是否存在
        const res = await fetch(`/api/ustudio/bootstrap?sceneId=${encodeURIComponent(sceneId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('bootstrap 失败:' + res.status);
        const data = (await res.json()) as { empty?: boolean; message?: string };
        if (disposed) return;
        if (data?.empty) {
          setError(data.message || '场景不存在');
          setView('error');
          return;
        }

        // 如果已有 runtime 且 sceneId 相同，复用（不应发生，因为 setSceneId 已过滤）
        if (runtimeRef.current) {
          await runtimeRef.current.dispose();
          runtimeRef.current = null;
        }

        // 创建新 runtime
        const rt = new SoonspaceRuntime();
        runtimeRef.current = rt;
        await rt.init(containerRef.current!, sceneId, (p) => {
          if (!disposed) setProgress(p);
        });
        if (disposed) {
          await rt.dispose();
          return;
        }

        // 保存初始视角：优先用户自定义（localStorage），否则引擎默认
        try {
          const defaultVp = rt.getCameraViewpoint();
          originalDefaultViewRef.current = defaultVp;
          let customVp: CameraViewpoint | null = null;
          try {
            const saved = typeof window !== 'undefined' ? localStorage.getItem(CUSTOM_VIEW_KEY) : null;
            if (saved) customVp = JSON.parse(saved) as CameraViewpoint;
          } catch {
            /* localStorage 不可用或 JSON 解析失败 */
          }
          const vp = customVp ?? defaultVp;
          initialViewRef.current = vp;
          setInitialView(vp);
        } catch {
          /* 某些引擎不支持 */
        }

        // 加载场景树
        try {
          const tRes = await fetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(sceneId)}`, { cache: 'no-store' });
          if (tRes.ok) {
            const t = (await tRes.json()) as SceneTreeNode;
            treeRef.current = t;
            setTree(t);
          }
        } catch {
          /* switchFloor 无 tree 时跳过 */
        }

        // 绑定 RecipeStore + engine(默认不套预设 → 零行为变化,仅通电管道)
        const store = new RecipeStore();
        const recipeRuntime: RecipeRuntime = {
          setViewMode: (p, t, s, b) => rt.setViewMode(p, t, s, b),
          setGisVisible: (v) => rt.setGisVisible(v),
          showLabels: (t, ids, s) => rt.showLabels(t, ids, s),
          hideLabels: () => rt.hideLabels(),
          setScene: (p) => {
            const sdk = rt.getSdk();
            if (!sdk) return Promise.reject(new Error('SDK 未就绪'));
            return sdk.setScene(p as LayerApplyParams);
          },
          flyToObject: (id) => rt.flyToObject(id),
          highlightObject: (id, c) => rt.highlightObject(id, c),
          setCameraViewpoint: (vp, tr) => rt.setCameraViewpoint(vp, tr),
          setVirtualRouteVisible: (id, v) => rt.setVirtualRouteVisible(id, v),
          setVirtualPolygonVisible: (id, v) => rt.setVirtualPolygonVisible(id, v),
          hideObjects: (ids) => rt.hideObjects(ids),
          showObjects: (ids) => rt.showObjects(ids),
        };
        recipeUnsubRef.current = store.subscribe((next, cs) => {
          const t = treeRef.current;
          if (!t) return;
          void applyRecipe(recipeRuntime, t, cs, next.structural).then((r) => {
            if (r.failed.length) store.desynced = true;
          });
        });

        // AGENTS.md 约定「以 SDK 场景状态为准」:订阅 SDK 图层状态,检测外部(平台 WS 脚本/其他入口)
        // 改动导致的 Recipe 与 SDK 脱节。只检测不回写(避免 subscribe→patch→apply→setViewMode→subscribe 循环),
        // 脱节时置 store.desynced 并告警,供 UI/调试识别。
        const sceneStateUnsub = (() => {
          const sdk = rt.getSdk();
          if (typeof sdk?.subscribeSceneState !== 'function') return null;
          try {
            return sdk.subscribeSceneState((state: unknown) => {
              const layer = (state as { layer?: SdkLayerState } | null)?.layer;
              const cur = store.getCurrent();
              const { desynced, fields } = detectDesync(layer, cur.structural);
              if (desynced && !store.desynced) {
                store.desynced = true;
                console.warn('[scene-recipe] SDK 场景状态与 Recipe 不一致(可能被外部修改),desynced=true', {
                  fields,
                  sdkLayer: layer,
                  recipe: cur.structural,
                });
              }
            });
          } catch (error) {
            console.warn('[scene-recipe] subscribeSceneState 订阅失败', error);
            return null;
          }
        })();
        sceneStateUnsubRef.current = sceneStateUnsub;

        setRecipeStore(store);

        setRuntime(rt);
        if (!disposed) setView('ready');
      } catch (e) {
        if (!disposed) {
          setError(e instanceof Error ? e.message : '场景加载失败');
          setView('error');
        }
      }
    })();

    return () => {
      disposed = true;
      recipeUnsubRef.current?.();
      recipeUnsubRef.current = null;
      sceneStateUnsubRef.current?.();
      sceneStateUnsubRef.current = null;
      setRecipeStore(null);
      // 注意：不在 cleanup 中 dispose runtime，因为我们要跨模块复用
      // 只有 sceneId 变化时才会 dispose 旧 runtime（在上面的 effect 中）
    };
  }, [sceneId, enabled]);

  // 组件卸载时 dispose runtime
  useEffect(() => {
    return () => {
      if (runtimeRef.current) {
        void runtimeRef.current.dispose();
        runtimeRef.current = null;
      }
    };
  }, []);

  const value: SceneContextValue = {
    runtime,
    view,
    error,
    sceneId,
    tree,
    initialView,
    containerRef,
    progress,
    setSceneId,
    setEnabled,
    enabled,
    setCustomInitialView,
    resetCustomInitialView,
    recipeStore,
  };

  return (
    <SceneContext.Provider value={value}>
      {children}
    </SceneContext.Provider>
  );
}
