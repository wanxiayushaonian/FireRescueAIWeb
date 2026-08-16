'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useScene } from '@/components/SceneProvider';
import { buildPickIndex, resolvePickAcross } from '@/lib/scene-pick';
import { buildOutIdToStoryIndex } from '@/lib/scene-buildings';

/**
 * 单/多层视角下,hover 到设备/门/楼梯 → 光标旁轻提示(名称 + 类型 + 楼层)。
 * 与 SceneFloorHoverLabel 互补(那是整体视角的楼层浮标),两者通过 runtime 的
 * 多订阅 hover 通道并存;DOM ref 直改样式/文案,高频 hover 不触发 React re-render。
 * 拖拽相机时 runtime 分发 null → 自动隐藏。
 */
export default function SceneDeviceHoverTip() {
  const { runtime, tree, view, recipeStore } = useScene();
  const tipRef = useRef<HTMLDivElement | null>(null);
  const lastKeyRef = useRef<string>('');
  const [isWhole, setIsWhole] = useState(true);

  const pickIndex = useMemo(() => buildPickIndex(tree), [tree]);
  const storyIndex = useMemo(() => buildOutIdToStoryIndex(tree), [tree]);
  // 桥仅用于楼层归属(与信息卡同策略):设备解析只用直接 id
  const bridge = useMemo(
    () => (runtime ? runtime.buildIdBridge(new Set(storyIndex.keys())) : new Map<string, string>()),
    [runtime, storyIndex],
  );
  const indexRef = useRef(pickIndex);
  const storyIndexRef = useRef(storyIndex);
  const bridgeRef = useRef(bridge);
  useEffect(() => {
    indexRef.current = pickIndex;
    storyIndexRef.current = storyIndex;
    bridgeRef.current = bridge;
  }, [pickIndex, storyIndex, bridge]);

  // 观察整体态(recipeStore 初始为 null 视为整体):仅单/多层视角启用设备提示
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

  // hover 提示:非整体视角 + 引擎就绪
  useEffect(() => {
    if (!runtime || view !== 'ready' || isWhole) return;
    const unsub = runtime.setHoverPickHandler((info) => {
      const el = tipRef.current;
      if (!el) return;
      if (!info) {
        el.style.display = 'none';
        lastKeyRef.current = '';
        return;
      }
      const node = resolvePickAcross(info.hitChains ?? [info.sids], indexRef.current);
      if (!node) {
        el.style.display = 'none';
        lastKeyRef.current = '';
        return;
      }
      // 楼层归属(与信息卡同序:直接命中 → 经内部 id 桥)
      let story = '';
      for (const sid of info.sids) {
        const found =
          storyIndexRef.current.get(sid)
          ?? storyIndexRef.current.get(bridgeRef.current.get(sid) ?? '');
        if (found) {
          story = found.storyLabel;
          break;
        }
      }
      el.style.display = 'block';
      const x = Math.min(info.clientX + 14, Math.max(8, window.innerWidth - 200));
      el.style.transform = `translate(${x}px, ${info.clientY + 14}px)`;
      // 目标变了才改文案(同一对象上移动只改定位)
      const key = `${node.outId}|${story}`;
      if (key !== lastKeyRef.current) {
        lastKeyRef.current = key;
        const nameEl = el.querySelector<HTMLElement>('[data-name]');
        const metaEl = el.querySelector<HTMLElement>('[data-meta]');
        if (nameEl) nameEl.textContent = node.name || node.typeLabel;
        if (metaEl) metaEl.textContent = story ? `${node.typeLabel} · ${story}` : node.typeLabel;
      }
    });
    return () => {
      unsub();
      const el = tipRef.current;
      if (el) el.style.display = 'none';
      lastKeyRef.current = '';
    };
  }, [runtime, view, isWhole]);

  return (
    <div
      ref={tipRef}
      style={{ display: 'none', transform: 'translate(-9999px,-9999px)' }}
      className="pointer-events-none fixed left-0 top-0 z-40 max-w-[186px] select-none rounded-md border border-line bg-bg-panel/90 px-2.5 py-1.5 shadow-lg shadow-black/30 backdrop-blur-[6px]"
    >
      <div data-name className="truncate text-[12px] font-medium leading-tight text-text-1" />
      <div data-meta className="mt-0.5 truncate text-[10px] leading-tight text-cyan" />
    </div>
  );
}
