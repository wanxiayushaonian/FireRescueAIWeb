'use client';

import { useEffect, useRef, useState } from 'react';
import { SoonspaceRuntime, type CameraViewpoint } from '@/lib/soonspace-runtime';
import { subscribeSceneActions, type SceneExecutorRuntime } from '@/lib/scene-action-executor';
import { SceneInfoCard, SceneLogPanel } from '@/components/SceneOverlays';
import DemoTag from '@/components/DemoTag';
import type { SceneTreeNode } from '@/lib/ustudio';

type View = 'loading' | 'ready' | 'error' | 'no-scene';

/**
 * 真实 3D 场景区(抽 SoonspaceSceneViewer 核心,去掉顶栏/门厅/插件/信息卡)。
 *
 * - bootstrap → SoonspaceRuntime.init → 真实 3D 渲染
 * - 订阅 sceneLog(scene-action-executor)→ 真实 SDK 联动(flyTo/highlight/switchFloor/resetView)
 * - SDK init 时自动建平台 WS(平台 invokeTwinsFunction 推送的可视化 SDK 自动执行)
 * - 浮层 SceneInfoCard/SceneLogPanel 沿用原型
 *
 * sceneId:NEXT_PUBLIC_SCENE_ID → URL ?sceneId= → 无则「未配置场景」(不进门厅)。
 */
function resolveSceneId(): string | null {
  if (typeof window === 'undefined') return null;
  const fromEnv = process.env.NEXT_PUBLIC_SCENE_ID?.trim();
  if (fromEnv) return fromEnv;
  return new URLSearchParams(window.location.search).get('sceneId')?.trim() || null;
}

export function RealSceneView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<SoonspaceRuntime | null>(null);
  const initialViewRef = useRef<CameraViewpoint | null>(null);
  const treeRef = useRef<SceneTreeNode | null>(null);
  const [view, setView] = useState<View>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsub: (() => void) | undefined;
    const sceneId = resolveSceneId();
    if (!sceneId) {
      setView('no-scene');
      return;
    }

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

        // 存初始视角(供 resetCamera 恢复)
        try {
          initialViewRef.current = runtime.getCameraViewpoint();
        } catch {
          /* 某些引擎不支持,resetCamera 将走 warn 分支 */
        }
        // 预取场景树(供 switchFloor 的 setViewMode)
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
  }, []);

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
            <div className="mb-1 text-base font-bold text-text-1">未配置场景</div>
            <div className="text-sm text-text-2">设 NEXT_PUBLIC_SCENE_ID 或 URL ?sceneId=</div>
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
