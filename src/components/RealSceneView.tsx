'use client';

import { useEffect, useRef } from 'react';
import { subscribeSceneActions, type SceneExecutorRuntime } from '@/lib/scene-action-executor';
import { SceneInfoCard, SceneLogPanel } from '@/components/SceneOverlays';
import DemoTag from '@/components/DemoTag';
import { useScene } from '@/components/SceneProvider';

/**
 * 真实 3D 场景区。使用全局 SceneProvider 提供的 runtime。
 * 场景在模块切换时不会重新加载，只有 sceneId 变化时才重新初始化。
 * 包含 3D 场景容器和 UI 覆盖层。
 */
export function RealSceneView() {
  const { runtime, view, error, containerRef, tree, initialView, recipeStore } = useScene();
  const treeRef = useRef(tree);
  const initialViewRef = useRef(initialView);
  treeRef.current = tree;
  initialViewRef.current = initialView;

  // 订阅场景动作（flyTo、highlight 等）
  useEffect(() => {
    if (!runtime || view !== 'ready') return;

    const executor: SceneExecutorRuntime = {
      flyToObject: (id) => {
        void runtime.flyToObject(id);
      },
      highlightObject: (id, c) => {
        runtime.highlightObject(id, c);
      },
      clearObjectHighlight: (id) => {
        runtime.clearObjectHighlight(id);
      },
      switchFloor: (storyIds) => {
        const t = treeRef.current;
        if (!t) {
          console.warn('[real-scene] switchFloor: 场景树未就绪,跳过');
          return;
        }
        void runtime.setViewMode({ mode: 'story' }, t, storyIds);
      },
      resetCamera: () => {
        const vp = initialViewRef.current;
        if (vp) {
          void runtime.setCameraViewpoint(vp, true);
        } else {
          console.warn('[real-scene] resetCamera: 初始视角未存,跳过');
        }
      },
    };

    const unsub = subscribeSceneActions(executor, recipeStore ?? undefined);
    return () => {
      unsub();
    };
  }, [runtime, view, recipeStore]);

  return (
    <div className="scene-grid relative h-full w-full overflow-hidden bg-bg-grid">
      {/* 3D 场景容器 */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* 加载状态 */}
      {view === 'loading' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-text-2">
          场景加载中…
        </div>
      )}

      {/* 未选择场景 */}
      {view === 'no-scene' && (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="rounded-xl border border-dashed border-line-glow bg-bg-panel/40 px-8 py-6 backdrop-blur-sm">
            <div className="mb-1 text-base font-bold text-text-1">未选择场景</div>
            <div className="text-sm text-text-2">从顶栏场景下拉切换</div>
            <DemoTag className="mt-3" />
          </div>
        </div>
      )}

      {/* 错误状态 */}
      {view === 'error' && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red">
          {error}
        </div>
      )}

      {/* UI 覆盖层 */}
      <SceneInfoCard />
      <SceneLogPanel />
    </div>
  );
}

export default RealSceneView;
