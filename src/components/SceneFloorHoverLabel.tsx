'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useScene } from '@/components/SceneProvider';
import { showToast } from '@/components/Toast';
import { buildOutIdToStoryIndex, type StoryLookupEntry } from '@/lib/scene-buildings';
import { presets } from '@/lib/scene-recipe/presets';
import { loadSceneDisplayPrefs } from '@/lib/scene-display-prefs';

/**
 * 整体建筑视角下,鼠标 hover 到任意位置 → 浮层显示"所在楼层 + 楼栋"。
 * 纯标签,不改模型渲染;切到单层/多层自动关闭 hover raycast,零额外开销。
 *
 * - 仅当 view==='ready' 且 structural.visibleStories 为空(整体视角)时开启 hover;
 * - runtime 在 mouseMove 上自管 rAF 节流的 BVH 拾取,沿父链取 out_instance_id
 *   (不走 modelHover 信号:它只对 stype==="Model" 触发,CPS 墙/Space 不触发);
 * - 命中 id → 反向索引反查所属楼层;
 * - 直改 DOM ref 样式/文案,不走 React state,避免高频 hover 触发 re-render。
 */
export default function SceneFloorHoverLabel() {
  const { runtime, tree, view, recipeStore, sceneId } = useScene();
  const labelRef = useRef<HTMLDivElement | null>(null);
  const lastStoryRef = useRef<string>('');
  const lastEntryRef = useRef<StoryLookupEntry | null>(null); // 双击直达用:最近一次 hover 命中的楼层
  const [isWhole, setIsWhole] = useState(true);
  const isWholeRef = useRef(true);

  // 反向索引随场景树重建;存入 ref 供 hover 回调读取(回调不随索引变化重订阅)。
  // 桥:合并网格祖先的 CPS 内部 id → 子树树 id → 楼层(见 runtime.buildIdBridge)。
  const index = useMemo(() => buildOutIdToStoryIndex(tree), [tree]);
  const bridge = useMemo(
    () => (runtime ? runtime.buildIdBridge(new Set(index.keys())) : new Map<string, string>()),
    [runtime, index],
  );
  const indexRef = useRef(index);
  const bridgeRef = useRef(bridge);
  useEffect(() => {
    indexRef.current = index;
    bridgeRef.current = bridge;
  }, [index, bridge]);

  // 观察整体态。recipeStore 初始为 null,用内联订阅避开条件 hook。
  useEffect(() => {
    if (!recipeStore) {
      setIsWhole(true);
      isWholeRef.current = true;
      return;
    }
    const sync = (): void => {
      const vs = recipeStore.getCurrent().structural.visibleStories;
      const whole = !vs || vs.length === 0;
      setIsWhole(whole);
      isWholeRef.current = whole;
    };
    sync();
    return recipeStore.subscribe(sync);
  }, [recipeStore]);

  // 快捷键 F:飞向最近 hover 命中的楼层(输入框聚焦时跳过;不占用 WASD 相机键)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'f' && e.key !== 'F') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      const entry = lastEntryRef.current;
      if (entry && runtime) void runtime.flyToObject(entry.storyOutId).catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [runtime]);

  // 双击直达/退出:整体视角双击 → 聚焦最近 hover 命中的楼层;单/多层视角双击 → 恢复全楼
  useEffect(() => {
    const onDblClick = (): void => {
      if (!recipeStore) return;
      if (isWholeRef.current) {
        const entry = lastEntryRef.current;
        if (!entry) return;
        recipeStore.patchStructural({
          visibleStories: [entry.storyOutId],
          yExtend: false,
          hideDevices: false,
        });
        void runtime?.flyToObject(entry.storyOutId).catch(() => {});
        showToast(`已聚焦 ${entry.storyLabel ?? '该层'},双击可恢复全楼`);
      } else {
        recipeStore.setStructural({
          ...presets.objectsOverview.structural,
          categoryVisibility: loadSceneDisplayPrefs(sceneId) ?? {},
        });
        showToast('已恢复全楼视图');
      }
    };
    window.addEventListener('dblclick', onDblClick);
    return () => {
      window.removeEventListener('dblclick', onDblClick);
    };
  }, [recipeStore, runtime, sceneId]);

  // hover 启用:仅整体视角 + 引擎就绪。
  useEffect(() => {
    if (!runtime || view !== 'ready' || !isWhole) return;
    const unsub = runtime.setHoverPickHandler((info) => {
      const el = labelRef.current;
      if (!el) return;
      if (!info) {
        el.style.display = 'none';
        lastStoryRef.current = '';
        lastEntryRef.current = null;
        return;
      }
      // sids 最近优先(构件→墙→楼层→楼栋);取索引里第一个命中的 → 楼层
      let entry: StoryLookupEntry | undefined;
      // 候选 id(祖先 sid/userData.id)按序:直接命中 → 经内部 id 桥转树 id 再命中
      for (const sid of info.sids) {
        const e =
          indexRef.current.get(sid)
          ?? indexRef.current.get(bridgeRef.current.get(sid) ?? '');
        if (e) {
          entry = e;
          break;
        }
      }
      if (!entry) {
        el.style.display = 'none';
        lastEntryRef.current = null;
        return;
      }
      lastEntryRef.current = entry;
      el.style.display = 'block';
      el.style.transform = `translate(${info.clientX + 14}px, ${info.clientY + 14}px)`;
      // 楼层变化才更新文案(同一层内移动只改定位)
      if (entry.storyOutId !== lastStoryRef.current) {
        lastStoryRef.current = entry.storyOutId;
        const storyEl = el.querySelector<HTMLElement>('[data-story]');
        const buildingEl = el.querySelector<HTMLElement>('[data-building]');
        if (storyEl) storyEl.textContent = entry.storyLabel || '当前楼层';
        if (buildingEl) buildingEl.textContent = entry.buildingLabel;
      }
    });
    return () => {
      unsub();
      const el = labelRef.current;
      if (el) el.style.display = 'none';
      lastStoryRef.current = '';
    };
  }, [runtime, view, isWhole]);

  // 内联渲染 + position:fixed(视口定位,不被 overflow:hidden 裁剪),避免 portal 带 SSR hydration 不一致。
  return (
    <div
      ref={labelRef}
      style={{ display: 'none', transform: 'translate(-9999px,-9999px)' }}
      className="pointer-events-none fixed left-0 top-0 z-50 select-none rounded-lg border border-line bg-bg-panel/85 px-3 py-2 shadow-lg shadow-black/30 backdrop-blur-[8px]"
    >
      <div data-story className="text-[13px] font-semibold leading-tight text-text-1">
        楼层
      </div>
      <div data-building className="mt-0.5 text-[10px] leading-tight text-text-3">
        楼栋
      </div>
    </div>
  );
}
