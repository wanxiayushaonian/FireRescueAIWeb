'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useScene } from '@/components/SceneProvider';
import { buildOutIdToStoryIndex, type StoryLookupEntry } from '@/lib/scene-buildings';

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
  const { runtime, tree, view, recipeStore } = useScene();
  const labelRef = useRef<HTMLDivElement | null>(null);
  const indexRef = useRef<Map<string, StoryLookupEntry>>(new Map());
  const lastStoryRef = useRef<string>('');
  const diagRef = useRef(0); // 临时诊断计数(确认后删除)
  const [isWhole, setIsWhole] = useState(true);

  // 反向索引随场景树重建;存入 ref 供 hover 回调读取(回调不随索引变化重订阅)
  const index = useMemo(() => buildOutIdToStoryIndex(tree), [tree]);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // 观察整体态。recipeStore 初始为 null,用内联订阅避开条件 hook。
  useEffect(() => {
    if (!recipeStore) {
      setIsWhole(true);
      return;
    }
    const sync = (): void => {
      const vs = recipeStore.getCurrent().structural.visibleStories;
      setIsWhole(!vs || vs.length === 0);
    };
    sync();
    return recipeStore.subscribe(sync);
  }, [recipeStore]);

  // hover 启用:仅整体视角 + 引擎就绪。
  useEffect(() => {
    if (!runtime || view !== 'ready' || !isWhole) return;
    console.info('[SceneFloorHover] effect active', {
      hasRuntime: !!runtime,
      view,
      isWhole,
      indexSize: indexRef.current.size,
      sampleKeys: Array.from(indexRef.current.keys()).slice(0, 3),
    });
    const unsub = runtime.setHoverPickHandler((info) => {
      const el = labelRef.current;
      if (!el) return;
      if (!info) {
        el.style.display = 'none';
        lastStoryRef.current = '';
        return;
      }
      // sids 最近优先(构件→墙→楼层→楼栋);取索引里第一个命中的 → 楼层
      let entry: StoryLookupEntry | undefined;
      let matchedSid = '';
      for (const sid of info.sids) {
        const e = indexRef.current.get(sid);
        if (e) {
          entry = e;
          matchedSid = sid;
          break;
        }
      }
      // 临时诊断:记录 sid 序列里哪个命中索引(确认后删除)
      if (diagRef.current < 12) {
        diagRef.current++;
        console.info(
          `[SceneFloorHover] lookup [${info.sids.join(', ')}] → ${matchedSid ? `${matchedSid}=${entry!.buildingLabel}/${entry!.storyLabel}` : 'ALL MISS'}`,
        );
      }
      if (!entry) {
        el.style.display = 'none';
        return;
      }
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
