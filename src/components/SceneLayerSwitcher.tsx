'use client';

/**
 * 楼层开关(3D 场景左上浮层)— 替代旧 FloorDisplayPanel 的交互。
 * 整体 / 单层 / 多层 三快捷 + 楼层多选 chip;经 RecipeStore 驱动层级策略。
 * categoryVisibility(模态框的按类别覆盖)不在本组件管,跨层级保留。
 */
import { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Boxes, Layers, Columns3, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useScene } from './SceneProvider';
import { extractBuildings } from '@/lib/scene-buildings';
import { levelFromStoryCount, deriveLayerPolicy, type LayerLevel } from '@/lib/scene-recipe/level-policy';

const LEVEL_BUTTONS: { lvl: LayerLevel; icon: LucideIcon; label: string }[] = [
  { lvl: 'whole', icon: Layers, label: '整体' },
  { lvl: 'single', icon: Boxes, label: '单层' },
  { lvl: 'multi', icon: Columns3, label: '多层' },
];

export default function SceneLayerSwitcher() {
  const { tree, recipeStore, runtime, view, initialView } = useScene();
  const buildings = useMemo(() => extractBuildings(tree), [tree]);
  const allStories = useMemo(() => buildings.flatMap((b) => b.stories), [buildings]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const dirtyRef = useRef(false);

  if (buildings.length === 0 || allStories.length === 0) return null;

  const level: LayerLevel = levelFromStoryCount(selected.size);

  const apply = (nextKeys: Set<string>): void => {
    if (!dirtyRef.current || !recipeStore || view !== 'ready') return;
    const outIds = allStories.filter((s) => nextKeys.has(s.key)).map((s) => s.outId).filter(Boolean);
    recipeStore.patchStructural({
      visibleStories: nextKeys.size === 0 ? null : outIds,
      visibleBuildings: null,
      ...deriveLayerPolicy(levelFromStoryCount(nextKeys.size)),
    });
  };

  const pickLevel = (lvl: LayerLevel): void => {
    dirtyRef.current = true;
    let next = new Set<string>();
    if (lvl === 'single' && allStories[0]) {
      next = new Set([allStories[0].key]);
    } else if (lvl === 'multi' && allStories.length >= 2) {
      // 多层默认选首层 + 第 6 层(示意,用户可再调)
      next = new Set([allStories[0].key, allStories[Math.min(allStories.length - 1, 5)].key]);
    }
    setSelected(next);
    setExpanded(lvl !== 'whole');
    apply(next);
    if (runtime) {
      if (lvl === 'whole' && initialView) {
        void runtime.setCameraViewpoint(initialView, true).catch(() => {});
      } else {
        const target = allStories.find((s) => next.has(s.key));
        if (target) void runtime.flyToObject(target.outId).catch(() => {});
      }
    }
  };

  const toggleStory = (key: string): void => {
    dirtyRef.current = true;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
    apply(next);
    if (runtime) {
      const target = allStories.find((s) => s.key === key);
      if (target && next.has(key)) void runtime.flyToObject(target.outId).catch(() => {});
    }
  };

  return (
    <div className="pointer-events-auto absolute left-4 top-16 z-20 w-[224px]">
      <div className="rounded-lg border border-line bg-bg-panel/85 p-2 shadow-lg shadow-black/30 backdrop-blur-[8px]">
        {/* 整体/单层/多层 快捷 */}
        <div className="flex gap-1 rounded-md border border-line bg-bg-panel p-0.5">
          {LEVEL_BUTTONS.map(({ lvl, icon: Icon, label }) => (
            <button
              key={lvl}
              onClick={() => pickLevel(lvl)}
              className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] transition ${
                level === lvl ? 'bg-cyan/20 text-cyan' : 'text-text-3 hover:text-text-1'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {/* 楼层指示 + 展开按钮 */}
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-text-3">
          <span className="font-mono">
            {selected.size === 0 ? `全部 ${allStories.length} 层` : `${selected.size}/${allStories.length} 层`}
          </span>
          {level !== 'whole' && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-0.5 text-text-3 transition hover:text-text-1"
            >
              {expanded ? '收起' : '选层'}
              <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? '' : '-rotate-90'}`} />
            </button>
          )}
        </div>

        {/* 楼层多选 chip */}
        <AnimatePresence initial={false}>
          {expanded && level !== 'whole' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-1.5 flex max-h-[180px] flex-wrap gap-1 overflow-y-auto border-t border-line/40 pt-1.5 [scrollbar-width:thin]">
                {allStories.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => toggleStory(s.key)}
                    className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
                      selected.has(s.key)
                        ? 'border-cyan bg-cyan/10 text-cyan'
                        : 'border-line bg-bg-panel text-text-3 hover:border-line-glow hover:text-text-1'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
