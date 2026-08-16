'use client';

/**
 * 3D 对象点击信息卡:点设备/门/楼梯/空间 → 光标处浮卡(名称/类型/所在楼层 + 飞向/高亮/聚焦楼层)。
 * 复用 hover 拾取通道(rAF 节流 BVH raycast,父链 sids 最近优先),点击时取最近一次
 * hover 命中做解析 —— 光标下的对象即被点对象,无需独立的 click raycast。
 * 点击拖拽(转镜头)不触发:pointerdown/up 位移 < 6px 才视为点选。
 * 读 three 拾取结果但不改引擎状态(AGENTS.md 灰色区许可);动作全部走 SDK/runtime。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Eye, Layers, X } from 'lucide-react';
import { useScene } from '@/components/SceneProvider';
import { buildPickIndex, resolvePickAcross, type PickNodeInfo } from '@/lib/scene-pick';
import { buildOutIdToStoryIndex, type StoryLookupEntry } from '@/lib/scene-buildings';

interface CardState {
  node: PickNodeInfo;
  story?: StoryLookupEntry;
  x: number;
  y: number;
}

export default function SceneObjectInfoCard() {
  const { runtime, tree, view, recipeStore } = useScene();
  const [card, setCard] = useState<CardState | null>(null);
  const pickIndex = useMemo(() => buildPickIndex(tree), [tree]);
  const storyIndex = useMemo(() => buildOutIdToStoryIndex(tree), [tree]);
  // 桥仅用于楼层归属(子树树 id → 楼层);设备解析只用直接 id,避免合并网格误报
  const bridge = useMemo(
    () => (runtime ? runtime.buildIdBridge(new Set(storyIndex.keys())) : new Map<string, string>()),
    [runtime, storyIndex],
  );
  const indexRef = useRef(pickIndex);
  const storyIndexRef = useRef(storyIndex);
  const bridgeRef = useRef(bridge);
  const lastPickRef = useRef<{ sids: string[]; hitChains?: string[][]; clientX: number; clientY: number } | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  indexRef.current = pickIndex;
  bridgeRef.current = bridge;
  storyIndexRef.current = storyIndex;

  // 订阅 hover 拾取缓存最新命中(点击解析用;rAF 节流,无 React state 抖动)
  useEffect(() => {
    if (!runtime || view !== 'ready') return;
    lastPickRef.current = null;
    return runtime.setHoverPickHandler((info) => {
      lastPickRef.current = info
        ? { sids: info.sids, hitChains: info.hitChains, clientX: info.clientX, clientY: info.clientY }
        : null;
    });
  }, [runtime, view]);

  // 点击(非拖拽)→ 解析拾取 → 弹卡/收卡
  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      downRef.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent): void => {
      const down = downRef.current;
      downRef.current = null;
      if (!down || e.button !== 0) return;
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 6) return;
      // 卡片自身的点击不重新拾取
      if ((e.target as HTMLElement | null)?.closest?.('[data-scene-info-card]')) return;
      const pick = lastPickRef.current;
      if (!pick) {
        setCard(null);
        return;
      }
      // 多命中链按距离解析:首链(墙/楼板等结构)无可展示节点时,继续找后链里被遮挡的设备
      const chains = pick.hitChains ?? [pick.sids];
      const node = resolvePickAcross(chains, indexRef.current);
      if (!node) {
        setCard(null); // 全部链均为结构骨架 → 收卡(hover 浮标已在提示楼层)
        return;
      }
      let story: StoryLookupEntry | undefined;
      for (const sid of pick.sids) {
        const found =
          storyIndexRef.current.get(sid)
          ?? storyIndexRef.current.get(bridgeRef.current.get(sid) ?? '');
        if (found) {
          story = found;
          break;
        }
      }
      setCard({ node, story, x: pick.clientX, y: pick.clientY });
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setCard(null);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!runtime || view !== 'ready' || !card) return null;

  const flyTo = (): void => {
    void runtime?.flyToObject(card.node.outId).catch(() => {});
  };
  const highlight = (): void => {
    runtime?.highlightObject(card.node.outId, '#22d3ee');
  };
  const focusFloor = (): void => {
    if (!card.story) return;
    // 单层聚焦:显设备看细节(与楼层卡片点击同策略)
    recipeStore?.patchStructural({
      visibleStories: [card.story.storyOutId],
      yExtend: false,
      hideDevices: false,
    });
  };

  // 卡片定位:光标右下,越界回拉
  const W = 260;
  const H = 170;
  const x = Math.min(card.x + 14, Math.max(8, window.innerWidth - W - 8));
  const y = Math.min(card.y + 14, Math.max(8, window.innerHeight - H - 8));

  return (
    <div
      data-scene-info-card
      style={{ left: x, top: y, width: W }}
      className="pointer-events-auto fixed z-50 rounded-lg border border-line bg-bg-panel/92 p-3 shadow-xl shadow-black/40 backdrop-blur-[8px]"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-tight text-text-1">{card.node.name}</div>
          <div className="mt-0.5 text-[11px] text-cyan">{card.node.typeLabel}</div>
        </div>
        <button
          onClick={() => setCard(null)}
          className="rounded p-0.5 text-text-3 transition hover:bg-white/10 hover:text-text-1"
          title="关闭"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {card.story && (
        <div className="mt-1.5 text-[11px] leading-relaxed text-text-3">
          {card.story.buildingLabel} · {card.story.storyLabel}
        </div>
      )}
      {card.node.twinsId && (
        <div className="mt-1 truncate font-mono text-[10px] text-text-3/70">{card.node.twinsId}</div>
      )}
      <div className="mt-2 flex gap-1.5 border-t border-line/60 pt-2">
        <button
          onClick={flyTo}
          className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-text-2 transition hover:border-line-glow hover:text-cyan"
        >
          <Crosshair className="h-3 w-3" />
          飞向
        </button>
        <button
          onClick={highlight}
          className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-text-2 transition hover:border-line-glow hover:text-cyan"
        >
          <Eye className="h-3 w-3" />
          高亮
        </button>
        {card.story && (
          <button
            onClick={focusFloor}
            className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-text-2 transition hover:border-line-glow hover:text-cyan"
          >
            <Layers className="h-3 w-3" />
            聚焦所在楼层
          </button>
        )}
      </div>
    </div>
  );
}
