'use client';

/**
 * 3D 场景顶部工具栏(居中):层级切换 + 当前楼层徽章 + 楼层 chip 云 + 设备搜索 融合为一体。
 * 深度联动:选中集从 Recipe(visibleStories)派生 —— 双击直达/档案楼层卡片/信息卡聚焦等
 * 外部改动同步反映;徽章实时显示当前楼层(单层) / 已选层数(多层) / 全部层数(整体)。
 * 交互:单层模式点 chip = 互斥换层;多层自由增删(至少 1 层);搜索定位 = fly + 高亮。
 * 快捷键:1/2/3 切层级、↑↓ 换层(输入框聚焦时跳过;不占用 WASD 相机键)。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, Layers, Box, Columns3, Map as MapIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useScene } from '@/components/SceneProvider';
import { extractBuildings } from '@/lib/scene-buildings';
import { levelFromStoryCount, deriveLayerPolicy, type LayerLevel } from '@/lib/scene-recipe/level-policy';
import { buildDeviceSearchIndex, searchDevices, groupDevicesByStory, type DeviceSearchItem } from '@/lib/scene-pick';

const LEVEL_BUTTONS: { lvl: LayerLevel; icon: LucideIcon; label: string }[] = [
  { lvl: 'whole', icon: Layers, label: '整体' },
  { lvl: 'single', icon: Box, label: '单层' },
  { lvl: 'multi', icon: Columns3, label: '多层' },
];

export default function SceneToolbar() {
  const { tree, recipeStore, runtime, view, initialView } = useScene();
  const buildings = useMemo(() => extractBuildings(tree), [tree]);
  const allStories = useMemo(() => buildings.flatMap((b) => b.stories), [buildings]);
  const searchItems = useMemo(() => buildDeviceSearchIndex(tree), [tree]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [chipsOpen, setChipsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const outIdToKey = useMemo(() => new Map(allStories.map((s) => [s.outId, s.key])), [allStories]);
  const keyToStory = useMemo(() => new Map(allStories.map((s) => [s.key, s])), [allStories]);
  const keyToBuilding = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of buildings) for (const s of b.stories) m.set(s.key, b.label);
    return m;
  }, [buildings]);
  const results = useMemo(() => searchDevices(searchItems, query), [searchItems, query]);
  const resultGroups = useMemo(() => groupDevicesByStory(results), [results]);

  // 从 Recipe 单一真相源派生选中集(外部聚焦 → 工具栏同步)
  const prevSelectedRef = useRef<Set<string>>(new Set());
  // 平面图(2D)模式:recipe.mode 单一真相源,切换走 patchStructural({mode})
  const [is2d, setIs2d] = useState(false);
  useEffect(() => {
    if (!recipeStore) {
      setIs2d(false);
      return;
    }
    const sync = (): void => setIs2d(recipeStore.getCurrent().structural.mode === '2D');
    sync();
    return recipeStore.subscribe(sync);
  }, [recipeStore]);

  useEffect(() => {
    if (!recipeStore) {
      setSelected(new Set());
      prevSelectedRef.current = new Set();
      return;
    }
    const sync = (): void => {
      const vs = recipeStore.getCurrent().structural.visibleStories;
      const next = new Set<string>();
      if (vs) {
        for (const outId of vs) {
          const k = outIdToKey.get(outId);
          if (k) next.add(k);
        }
      }
      // 外部进入单/多层(双击直达/档案卡片/告警联动):整体(空选中)→有选中时自动展开楼层列表
      if (prevSelectedRef.current.size === 0 && next.size > 0) setChipsOpen(true);
      prevSelectedRef.current = next;
      setSelected(next);
    };
    sync();
    return recipeStore.subscribe(sync);
  }, [recipeStore, outIdToKey]);

  /** 平面图/立体切换:2D 摊平当前楼层;整体视角进入时默认聚焦首层(全楼层同时摊平会叠影) */
  const toggleFlat = (): void => {
    if (!recipeStore || view !== 'ready') return;
    if (!is2d && selected.size === 0 && allStories[0]) {
      const keys = new Set([allStories[0].key]);
      setSelected(keys);
      apply(keys);
      recipeStore.patchStructural({ mode: '2D' });
      return;
    }
    recipeStore.patchStructural({ mode: is2d ? '3D' : '2D' });
  };

  const level: LayerLevel = levelFromStoryCount(selected.size);
  const selectedStories = useMemo(
    () => allStories.filter((s) => selected.has(s.key)),
    [allStories, selected],
  );

  const apply = (nextKeys: Set<string>): void => {
    if (!recipeStore || view !== 'ready') return;
    const outIds = allStories.filter((s) => nextKeys.has(s.key)).map((s) => s.outId).filter(Boolean);
    recipeStore.patchStructural({
      visibleStories: nextKeys.size === 0 ? null : outIds,
      visibleBuildings: null,
      ...deriveLayerPolicy(levelFromStoryCount(nextKeys.size)),
    });
  };

  const pickLevel = (lvl: LayerLevel): void => {
    // 已处于同级:保持当前楼层/选择,只确保列表展开(点「单层」不应把双击进入的楼层重置回首层)
    if (lvl !== 'whole' && lvl === level && selected.size > 0) {
      setChipsOpen(true);
      return;
    }
    let next = new Set<string>();
    if (lvl === 'single' && allStories[0]) {
      next = new Set([allStories[0].key]);
    } else if (lvl === 'multi' && allStories.length >= 2) {
      next = new Set([allStories[0].key, allStories[Math.min(allStories.length - 1, 5)].key]);
    }
    setSelected(next);
    setChipsOpen(lvl !== 'whole');
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
    const cur = levelFromStoryCount(selected.size);
    let next: Set<string>;
    if (cur === 'single') {
      next = new Set([key]); // 单层互斥:点另一层 = 换层,不叠成多层
    } else {
      next = new Set(selected);
      if (next.has(key)) {
        if (next.size <= 1) return; // 多层至少保留 1 层(回整体走「整体」/双击)
        next.delete(key);
      } else {
        next.add(key);
      }
    }
    setSelected(next);
    apply(next);
    if (runtime) {
      const target = keyToStory.get(key);
      if (target && next.has(key)) void runtime.flyToObject(target.outId).catch(() => {});
    }
  };

  const locate = (it: DeviceSearchItem): void => {
    void runtime?.flyToObject(it.outId).catch(() => {});
    runtime?.highlightObject(it.outId, '#22d3ee');
    setQuery('');
    searchRef.current?.blur();
  };

  // 快捷键:1/2/3 切层级;单/多层下 ↑↓ 换层/移动选择(输入框聚焦跳过)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        const lvl: LayerLevel = e.key === '1' ? 'whole' : e.key === '2' ? 'single' : 'multi';
        pickLevel(lvl);
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        if (selected.size === 0) return;
        e.preventDefault();
        const keys = allStories.map((s) => s.key);
        const cur = keys.findIndex((k) => selected.has(k));
        if (cur < 0) return;
        const nextKey = e.key === 'ArrowUp' ? keys[cur - 1] : keys[cur + 1];
        if (nextKey) toggleStory(nextKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allStories, selected]);

  // 所有 hook 必须在提前 return 之前(React Hooks 规则;否则楼层数据前后渲染 hook 序列不一致)
  if (buildings.length === 0 || allStories.length === 0) return null;

  // 楼层徽章文案:单层 → 楼层名(大);多层 → 已选层数;整体 → 全部层数
  const badgeMain =
    level === 'single' && selectedStories[0]
      ? selectedStories[0].label
      : level === 'multi'
        ? `${selected.size} 层`
        : `全部 ${allStories.length} 层`;
  const badgeSub =
    level === 'single' && selectedStories[0]
      ? keyToBuilding.get(selectedStories[0].key) ?? ''
      : level === 'multi' && selectedStories.length
        ? selectedStories.slice(0, 3).map((s) => s.label).join('、') + (selected.size > 3 ? ` 等` : '')
        : '双击楼层可聚焦';

  const searchActive = query.trim().length > 0;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-3 z-20 w-[min(620px,calc(100%-24px))] -translate-x-1/2">
      {/* 主条 */}
      <div className="flex items-center gap-1.5 rounded-full border border-line bg-bg-panel/85 px-2.5 py-1.5 shadow-lg shadow-black/30 backdrop-blur-[8px]">
        {/* 搜索 */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-text-3" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) locate(results[0]);
              if (e.key === 'Escape') {
                setQuery('');
                searchRef.current?.blur();
              }
            }}
            placeholder="搜索设备 / 类型 / 楼层…"
            className="h-6 min-w-0 flex-1 bg-transparent text-[12px] text-text-1 placeholder:text-text-3/60 focus:outline-none"
          />
          {!searchActive && (
            <span className="shrink-0 font-mono text-[10px] text-text-3/70">{searchItems.length}</span>
          )}
        </div>

        <span className="h-4 w-px shrink-0 bg-line" />

        {/* 层级切换 */}
        <div className="flex shrink-0 gap-0.5 rounded-full border border-line bg-bg-panel p-0.5">
          {LEVEL_BUTTONS.map(({ lvl, icon: Icon, label }) => (
            <button
              key={lvl}
              onClick={() => pickLevel(lvl)}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] transition ${
                level === lvl ? 'bg-cyan/20 text-cyan' : 'text-text-3 hover:text-text-1'
              }`}
              title={`${label}(快捷键 ${lvl === 'whole' ? '1' : lvl === 'single' ? '2' : '3'})`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        <span className="h-4 w-px shrink-0 bg-line" />

        {/* 平面图(2D)/立体(3D)切换:摊平成楼层平面图,配合两点导航打点 */}
        <button
          onClick={toggleFlat}
          className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition ${
            is2d ? 'border-orange/50 bg-orange/15 text-orange' : 'border-line text-text-3 hover:text-text-1'
          }`}
          title={is2d ? '回到立体视图' : '摊平为楼层平面图(2D)——配合底部「两点导航」在平面图上打点'}
        >
          <MapIcon className="h-3 w-3" />
          {is2d ? '立体' : '平面图'}
        </button>

        <span className="h-4 w-px shrink-0 bg-line" />

        {/* 当前楼层徽章(点击展开楼层 chip 云) */}
        <button
          onClick={() => setChipsOpen((v) => !v)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 transition ${
            level === 'single' ? 'border border-cyan/50 bg-cyan/10' : level === 'multi' ? 'border border-line bg-bg-panel-2' : ''
          } ${chipsOpen ? 'shadow-[inset_0_0_0_1px_rgba(34,211,238,0.4)]' : ''}`}
          title={level === 'whole' ? '双击场景楼层可聚焦,或切到单层/多层选层' : '点击展开楼层选择'}
        >
          <span className={`font-mono font-semibold leading-none ${level === 'single' ? 'text-[15px] text-cyan' : 'text-[12px] text-text-1'}`}>
            {badgeMain}
          </span>
          {level !== 'whole' && (
            <span className="hidden max-w-[120px] truncate text-[10px] text-text-3 md:inline">{badgeSub}</span>
          )}
          {level !== 'whole' && (
            <ChevronDown className={`h-3 w-3 text-text-3 transition-transform ${chipsOpen ? '' : '-rotate-90'}`} />
          )}
        </button>
      </div>

      {/* 下拉区:搜索结果优先,否则楼层 chip 云 */}
      <AnimatePresence initial={false}>
        {(searchActive || (chipsOpen && level !== 'whole')) && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mt-1.5 max-h-[320px] overflow-y-auto rounded-xl border border-line bg-bg-panel/92 p-2 shadow-xl shadow-black/40 backdrop-blur-[8px] [scrollbar-width:thin]"
          >
            {searchActive ? (
              results.length === 0 ? (
                <div className="py-3 text-center text-[11px] text-text-3">无匹配设备</div>
              ) : (
                resultGroups.map((g) => (
                  <div key={g.story} className="mb-1.5 last:mb-0">
                    <div className="sticky top-0 z-[1] flex items-baseline gap-1.5 rounded bg-bg-panel/95 px-2 py-1 backdrop-blur-[2px]">
                      <span className="text-[10px] font-semibold text-text-2">{g.story}</span>
                      <span className="text-[9px] text-text-3/70">{g.items.length}</span>
                    </div>
                    {g.items.map((it) => (
                      <button
                        key={it.outId}
                        onClick={() => locate(it)}
                        className="flex w-full items-baseline gap-2 rounded px-2 py-1 text-left transition hover:bg-bg-panel-2"
                      >
                        <span className="truncate text-[12px] text-text-1">{it.name}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-cyan">{it.typeLabel}</span>
                      </button>
                    ))}
                  </div>
                ))
              )
            ) : (
              <div className="flex flex-wrap gap-1">
                {allStories.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => toggleStory(s.key)}
                    className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                      selected.has(s.key)
                        ? 'border-cyan bg-cyan/10 text-cyan'
                        : 'border-line bg-bg-panel text-text-3 hover:border-line-glow hover:text-text-1'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
                <div className="w-full pt-1 text-center text-[10px] text-text-3/60">
                  {level === 'single' ? '单层:点选切换楼层 · ↑↓ 换层' : '多层:点选增删(至少 1 层)'}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
