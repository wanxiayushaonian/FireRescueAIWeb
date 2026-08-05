'use client';

import { useEffect, useRef, useState } from 'react';
import { SoonspaceRuntime, type CameraViewpoint } from '@/lib/soonspace-runtime';
import { subscribeSceneActions, type SceneExecutorRuntime } from '@/lib/scene-action-executor';
import { SceneInfoCard, SceneLogPanel } from '@/components/SceneOverlays';
import DemoTag from '@/components/DemoTag';
import type { SceneTreeNode } from '@/lib/ustudio';

type View = 'loading' | 'ready' | 'error' | 'no-scene';

/**
 * 真实 3D 场景区。sceneId 由父组件(App)传入——来自 TopBar 场景下拉选择
 * (场景列表经 bootstrap 获取 + localStorage 最近使用)。
 *
 * - bootstrap → SoonspaceRuntime.init → 真实 3D(SDK init 自动建平台 WS)
 * - 订阅 sceneLog(scene-action-executor)→ 真实 SDK 联动
 * - sceneId 变化 → effect 重跑 → 自动 dispose 旧 runtime + 重新 init(切换场景)
 *
 * 不再依赖 NEXT_PUBLIC_SCENE_ID(写死 .env 不合理);场景选择交前端。
 */
export function RealSceneView(props: { sceneId: string }) {
  const { sceneId } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SoonspaceRuntime | null>(null);
  const initialViewRef = useRef<CameraViewpoint | null>(null);
  const treeRef = useRef<SceneTreeNode | null>(null);
  const [view, setView] = useState<View>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sceneId) {
      setView('no-scene');
      return;
    }
    let disposed = false;
    let unsub: (() => void) | undefined;
    setView('loading');
    setError(null);

    void (async () => {
      try {
        const res = await fetch(`/api/ustudio/bootstrap?sceneId=${encodeURIComponent(sceneId)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('bootstrap 失败:' + res.status);
        const data = (await res.json()) as { empty?: boolean; message?: string };
        if (disposed) return;
        if (data?.empty) {
          setError(data.message || '场景不存在');
          setView('error');
          return;
        }

        const runtime = new SoonspaceRuntime();
        runtimeRef.current = runtime;
        await runtime.init(containerRef.current!, sceneId);
        if (disposed) {
          await runtime.dispose();
          return;
        }

        try {
          initialViewRef.current = runtime.getCameraViewpoint();
        } catch {
          /* 某些引擎不支持,resetCamera 将走 warn 分支 */
        }
        try {
          const tRes = await fetch(`/api/ustudio/tree?sceneId=${encodeURIComponent(sceneId)}`, { cache: 'no-store' });
          if (tRes.ok) treeRef.current = (await tRes.json()) as SceneTreeNode;
        } catch {
          /* switchFloor 无 tree 时跳过 */
        }

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
            const tree = treeRef.current;
            if (!tree) {
              console.warn('[real-scene] switchFloor: 场景树未就绪,跳过');
              return;
            }
            void runtime.setViewMode({ mode: 'story' }, tree, storyIds);
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
        unsub = subscribeSceneActions(executor);
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
      unsub?.();
      void runtimeRef.current?.dispose();
      runtimeRef.current = null;
      containerRef.current?.replaceChildren();
    };
  }, [sceneId]);

  return (
    <div className="scene-grid relative h-full w-full overflow-hidden bg-bg-grid">
      <div ref={containerRef} className="absolute inset-0" />
      {view === 'loading' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-text-2">
          场景加载中…
        </div>
      )}
      {view === 'no-scene' && (
        <div className="absolute inset-0 grid place-items-center text-center">
          <div className="rounded-xl border border-dashed border-line-glow bg-bg-panel/40 px-8 py-6 backdrop-blur-sm">
            <div className="mb-1 text-base font-bold text-text-1">未选择场景</div>
            <div className="text-sm text-text-2">从顶栏场景下拉切换</div>
            <DemoTag className="mt-3" />
          </div>
        </div>
      )}
      {view === 'error' && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red">
          {error}
        </div>
      )}
      <SceneInfoCard />
      <SceneLogPanel />
    </div>
  );
}

export default RealSceneView;
