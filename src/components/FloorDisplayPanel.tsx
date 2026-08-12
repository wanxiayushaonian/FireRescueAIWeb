'use client';

/**
 * 楼层展示面板 — 按楼层控制 3D 场景显隐。
 *
 * 参照参考项目 UStudioSceneTool 的楼层显隐逻辑：
 * - mode（2D/3D）+ yExtend（炸开）独立控制
 * - story.key = twins_instance_id，story.outId = out_instance_id 分离
 * - 无 building 节点时，所有 story 归入"全部楼层"分组
 * - setViewMode 不 early return 空数组
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Layers, Box, Grid3x3, Move, MapPin, RotateCcw } from 'lucide-react';
import { useScene } from './SceneProvider';
import { showToast } from './Toast';
import type { SceneTreeNode } from '@/lib/ustudio';

// ============================================================
// 类型定义
// ============================================================

type ViewMode = '2D' | '3D';

type StoryOption = {
  key: string; // twins_instance_id（UI 状态唯一标识）
  outId: string; // out_instance_id（SDK 调用用）
  nodeId: string; // twins_instance_id
  label: string;
  node: SceneTreeNode;
};

type BuildingOption = {
  key: string;
  outId: string;
  label: string;
  node: SceneTreeNode | null;
  stories: StoryOption[];
};

// ============================================================
// 辅助函数（参照参考项目 UStudioSceneTool）
// ============================================================

function nodeType(node: SceneTreeNode | null | undefined): string {
  return String(node?.twins_identifier ?? node?.type ?? '').toLowerCase();
}

function nodeOutId(node: SceneTreeNode | null | undefined): string {
  return String(node?.out_instance_id ?? node?.id ?? node?.twins_instance_id ?? '');
}

function nodeTwinId(node: SceneTreeNode | null | undefined): string {
  return String(node?.twins_instance_id ?? node?.id ?? node?.out_instance_id ?? '');
}

function nodeLabel(node: SceneTreeNode | null | undefined, fallback: string): string {
  return String(node?.twins_instance_name ?? node?.name ?? fallback);
}

function childrenOf(node: SceneTreeNode | null | undefined): SceneTreeNode[] {
  return Array.isArray(node?.children) ? node.children : [];
}

function walk(node: SceneTreeNode | null | undefined, visit: (node: SceneTreeNode) => void): void {
  if (!node) return;
  visit(node);
  childrenOf(node).forEach((child) => walk(child, visit));
}

function isBuilding(node: SceneTreeNode): boolean {
  const type = nodeType(node);
  return type === 'building' || type.endsWith('building') || type.includes('building');
}

function isStory(node: SceneTreeNode): boolean {
  const type = nodeType(node);
  return type === 'story' || type.endsWith('story') || type.includes('floor');
}

function sortStory(a: StoryOption, b: StoryOption): number {
  const na = Number(a.label.match(/-?\d+/)?.[0] ?? Number.NaN);
  const nb = Number(b.label.match(/-?\d+/)?.[0] ?? Number.NaN);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a.label.localeCompare(b.label, 'zh-Hans-CN');
}

/** 从场景树提取楼栋/楼层结构（无 building 节点时，所有 story 归入一个分组） */
function extractBuildings(tree: SceneTreeNode | null): BuildingOption[] {
  if (!tree) return [];

  const roots: SceneTreeNode[] = [tree];
  const buildings: SceneTreeNode[] = [];
  const allStories: SceneTreeNode[] = [];

  roots.forEach((root) => {
    walk(root, (node) => {
      if (isBuilding(node)) buildings.push(node);
      if (isStory(node)) allStories.push(node);
    });
  });

  const collectStories = (node: SceneTreeNode): SceneTreeNode[] => {
    const stories: SceneTreeNode[] = [];
    walk(node, (child) => {
      if (child !== node && isStory(child)) stories.push(child);
    });
    return stories;
  };

  // 无 building 节点 → 所有 story 归入"全部楼层"分组
  if (buildings.length === 0) {
    const stories = allStories.map((story, index) => ({
      key: nodeTwinId(story) || `story-${index}`,
      outId: nodeOutId(story),
      nodeId: nodeTwinId(story),
      label: nodeLabel(story, `${index + 1}F`),
      node: story,
    }));
    stories.sort(sortStory);
    return [{ key: 'all-buildings', outId: '', label: '全部楼层', node: null, stories }];
  }

  return buildings.map((building, buildingIndex) => {
    const stories = collectStories(building).map((story, storyIndex) => ({
      key: nodeTwinId(story) || `${nodeOutId(building)}-${storyIndex}`,
      outId: nodeOutId(story),
      nodeId: nodeTwinId(story),
      label: nodeLabel(story, `${storyIndex + 1}F`),
      node: story,
    }));
    stories.sort(sortStory);
    return {
      key: nodeOutId(building) || nodeTwinId(building) || `building-${buildingIndex}`,
      outId: nodeOutId(building),
      label: nodeLabel(building, `楼栋 ${buildingIndex + 1}`),
      node: building,
      stories,
    };
  });
}

// ============================================================
// 组件
// ============================================================

export function FloorDisplayPanel() {
  const { tree, runtime, view, initialView, setCustomInitialView, resetCustomInitialView } = useScene();
  const [expanded, setExpanded] = useState(true);
  const [selectedStoryKeys, setSelectedStoryKeys] = useState<Set<string>>(new Set());
  const [selectedBuildingKeys, setSelectedBuildingKeys] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ViewMode>('3D');
  const [yExtend, setYExtend] = useState(false);
  const initializedRef = useRef(false);
  /** 用户是否主动操作过楼层/模式（未操作前不主动调用 setViewMode，避免挂载即重置场景） */
  const dirtyRef = useRef(false);
  /** 楼层激活顺序（取消时聚焦剩余楼层中最后激活的那层） */
  const activatedOrderRef = useRef<string[]>([]);

  // 从场景树提取楼栋/楼层
  const buildings = useMemo(() => extractBuildings(tree), [tree]);

  // 诊断：树就绪时打印结构摘要（一次性）
  useEffect(() => {
    if (!tree || initializedRef.current) return;
    const types: Record<string, number> = {};
    walk(tree, (n) => {
      const t = nodeType(n) || '(空)';
      types[t] = (types[t] || 0) + 1;
    });
    console.info('[FloorDisplay] 场景树 type 分布:', types, '| 提取楼栋:', buildings.length, '| 楼层总数:', buildings.reduce((s, b) => s + b.stories.length, 0));
  }, [tree, buildings]);

  // 所有 story 选项（扁平，用于查找）
  const allStories = useMemo(() => buildings.flatMap((b) => b.stories), [buildings]);

  // 初始化：默认选中所有（只执行一次）
  useEffect(() => {
    if (allStories.length > 0 && !initializedRef.current) {
      const keys = allStories.map((s) => s.key);
      setSelectedStoryKeys(new Set(keys));
      setSelectedBuildingKeys(new Set(buildings.map((b) => b.key)));
      activatedOrderRef.current = keys;
      initializedRef.current = true;
    }
  }, [allStories, buildings]);

  // 选中的 story outId 列表（SDK 调用用）
  const selectedStoryOutIds = useMemo(() => {
    return allStories
      .filter((s) => selectedStoryKeys.has(s.key))
      .map((s) => s.outId)
      .filter(Boolean);
  }, [allStories, selectedStoryKeys]);

  // 选中的 building outId 列表
  const selectedBuildingOutIds = useMemo(() => {
    return buildings
      .filter((b) => {
        if (selectedBuildingKeys.has(b.key)) return true;
        return b.stories.some((s) => selectedStoryKeys.has(s.key));
      })
      .map((b) => b.outId)
      .filter(Boolean);
  }, [buildings, selectedBuildingKeys, selectedStoryKeys]);

  // 应用视图模式到场景
  const applyViewMode = useCallback(() => {
    // 用户未主动操作前不调用 setViewMode，避免挂载即重置场景
    if (!dirtyRef.current) return;
    if (!runtime || view !== 'ready' || !tree) return;

    const storyOutIds = selectedStoryOutIds;
    const buildingOutIds = selectedBuildingOutIds;

    // 构建 params：基础 mode + 可选炸开（参照参考项目）
    const params: Array<{ type: string; ids: string[] }> = [{ type: mode, ids: storyOutIds }];
    if (yExtend) params.push({ type: 'YExtend', ids: storyOutIds });

    console.info('[FloorDisplay] setViewMode', { mode, yExtend, storyCount: storyOutIds.length, buildingCount: buildingOutIds.length });

    void (async () => {
      await runtime.setViewMode(params, tree, storyOutIds, buildingOutIds);
    })();
  }, [runtime, view, tree, selectedStoryOutIds, selectedBuildingOutIds, mode, yExtend]);

  // 选择/模式变化时自动应用
  useEffect(() => {
    applyViewMode();
  }, [applyViewMode]);

  // 统一提交选中变化：自动堆栈(>1层炸开) + 由 story keys 推导 building keys
  const commitSelection = (nextStoryKeys: Set<string>) => {
    setYExtend(nextStoryKeys.size > 1);
    const nextBuildingKeys = new Set<string>();
    for (const b of buildings) {
      if (b.stories.some((s) => nextStoryKeys.has(s.key))) nextBuildingKeys.add(b.key);
    }
    setSelectedBuildingKeys(nextBuildingKeys);
    setSelectedStoryKeys(nextStoryKeys);
  };

  // 按 key 查 story
  const findStory = useCallback(
    (key: string): StoryOption | undefined => allStories.find((s) => s.key === key),
    [allStories],
  );

  // 切换楼栋选中
  const toggleBuilding = (buildingKey: string) => {
    dirtyRef.current = true;
    const building = buildings.find((b) => b.key === buildingKey);
    if (!building) return;
    const isOn = selectedBuildingKeys.has(buildingKey);
    const storyKeys = building.stories.map((s) => s.key);

    const nextKeys = new Set(selectedStoryKeys);
    if (isOn) {
      storyKeys.forEach((k) => {
        nextKeys.delete(k);
        activatedOrderRef.current = activatedOrderRef.current.filter((o) => o !== k);
      });
    } else {
      storyKeys.forEach((k) => {
        if (!nextKeys.has(k)) activatedOrderRef.current.push(k);
        nextKeys.add(k);
      });
      // 飞到该楼栋首个楼层
      if (runtime && building.stories[0]) {
        void runtime.flyToObject(building.stories[0].outId).catch(() => {});
      }
    }
    commitSelection(nextKeys);
  };

  // 切换楼层选中
  const toggleStory = (buildingKey: string, storyKey: string) => {
    dirtyRef.current = true;
    const building = buildings.find((b) => b.key === buildingKey);
    if (!building) return;
    const story = building.stories.find((s) => s.key === storyKey);
    const isOn = selectedStoryKeys.has(storyKey);

    const nextKeys = new Set(selectedStoryKeys);
    if (isOn) {
      nextKeys.delete(storyKey);
      activatedOrderRef.current = activatedOrderRef.current.filter((o) => o !== storyKey);
    } else {
      nextKeys.add(storyKey);
      activatedOrderRef.current.push(storyKey);
    }

    // 视角联动
    if (runtime) {
      if (!isOn && story) {
        // 选中 → 飞到该层（多楼层时 setViewMode 的 YExtend 会自动堆栈展开）
        void runtime.flyToObject(story.outId).catch(() => {});
      } else if (isOn) {
        // 取消 → 剩余激活楼层 >0 聚焦最后激活的，否则回全局
        const remaining = activatedOrderRef.current
          .map((k) => findStory(k))
          .filter((s): s is StoryOption => !!s);
        if (remaining.length > 0) {
          void runtime.flyToObject(remaining[remaining.length - 1].outId).catch(() => {});
        } else if (initialView) {
          void runtime.setCameraViewpoint(initialView, true).catch(() => {});
        }
      }
    }

    commitSelection(nextKeys);
  };

  const selectAll = () => {
    dirtyRef.current = true;
    activatedOrderRef.current = allStories.map((s) => s.key);
    commitSelection(new Set(allStories.map((s) => s.key)));
  };

  const selectNone = () => {
    dirtyRef.current = true;
    activatedOrderRef.current = [];
    if (runtime && initialView) {
      void runtime.setCameraViewpoint(initialView, true).catch(() => {});
    }
    commitSelection(new Set());
  };

  // 模式切换也需标记 dirty（用户主动切换视图模式时才应用到场景）
  const changeMode = (m: ViewMode) => {
    dirtyRef.current = true;
    setMode(m);
  };

  const toggleYExtend = () => {
    dirtyRef.current = true;
    setYExtend((v) => !v);
  };

  // 将当前相机视角保存为全局视角（持久化）
  const saveCurrentAsGlobal = () => {
    if (!runtime) return;
    try {
      const vp = runtime.getCameraViewpoint();
      if (!vp) { showToast('当前引擎不支持视角读取'); return; }
      setCustomInitialView(vp);
      showToast('已保存当前视角为全局视角');
    } catch {
      showToast('当前引擎不支持视角读取');
    }
  };

  const resetGlobalView = () => {
    resetCustomInitialView();
    showToast('已恢复默认全局视角');
  };

  // 无数据时不渲染
  if (buildings.length === 0 || allStories.length === 0) {
    return null;
  }

  return (
    <div className="mb-2 overflow-hidden rounded-md border border-line bg-bg-panel-2/30">
      {/* 标题栏 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-bg-panel-2"
      >
        <Layers className="h-3.5 w-3.5 text-cyan" />
        <span className="text-[13px] font-bold text-text-1">楼层展示</span>
        <span className="ml-auto font-mono text-[11px] text-text-3">
          {selectedStoryKeys.size}/{allStories.length} 层
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-text-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="border-t border-line/60 px-3 py-2">
              {/* 视图模式切换：2D / 3D / 炸开（独立） */}
              <div className="mb-2 flex items-center gap-1 rounded-md border border-line bg-bg-panel p-0.5">
                <button
                  onClick={() => changeMode('3D')}
                  className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] transition ${
                    mode === '3D' ? 'bg-cyan/20 text-cyan' : 'text-text-3 hover:text-text-1'
                  }`}
                >
                  <Box className="h-3 w-3" />
                  3D
                </button>
                <button
                  onClick={() => changeMode('2D')}
                  className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] transition ${
                    mode === '2D' ? 'bg-cyan/20 text-cyan' : 'text-text-3 hover:text-text-1'
                  }`}
                >
                  <Grid3x3 className="h-3 w-3" />
                  2D
                </button>
                <button
                  onClick={toggleYExtend}
                  className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11px] transition ${
                    yExtend ? 'bg-amber/20 text-amber' : 'text-text-3 hover:text-text-1'
                  }`}
                  title="楼层炸开（可与 2D/3D 叠加）"
                >
                  <Move className="h-3 w-3" />
                  炸开
                </button>
              </div>

              {/* 操作按钮 */}
              <div className="mb-2 flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="rounded border border-line px-2 py-0.5 text-[10px] text-text-3 transition hover:border-line-glow hover:text-text-1"
                >
                  全选
                </button>
                <button
                  onClick={selectNone}
                  className="rounded border border-line px-2 py-0.5 text-[10px] text-text-3 transition hover:border-line-glow hover:text-text-1"
                >
                  取消全选
                </button>
              </div>

              {/* 全局视角自定义：把当前相机角度保存为全局视角 / 重置 */}
              <div className="mb-2 flex items-center gap-2 border-t border-line/40 pt-2">
                <button
                  onClick={saveCurrentAsGlobal}
                  className="flex flex-1 items-center justify-center gap-1 rounded border border-cyan/40 bg-cyan/5 px-2 py-1 text-[10px] text-cyan transition hover:bg-cyan/15"
                  title="将当前相机角度保存为全局视角（取消楼层/重新加载时使用）"
                >
                  <MapPin className="h-3 w-3" />
                  设当前为全局
                </button>
                <button
                  onClick={resetGlobalView}
                  className="flex items-center justify-center gap-1 rounded border border-line px-2 py-1 text-[10px] text-text-3 transition hover:border-line-glow hover:text-text-1"
                  title="清除自定义，恢复引擎默认全局视角"
                >
                  <RotateCcw className="h-3 w-3" />
                  重置
                </button>
              </div>

              {/* 楼栋/楼层列表 */}
              <div className="max-h-[200px] space-y-1 overflow-y-auto [scrollbar-width:thin]">
                {buildings.map((building) => {
                  const selectedInBuilding = building.stories.filter((s) => selectedStoryKeys.has(s.key)).length;
                  // 单栋分组（无 building 节点时的"全部楼层"）不显示 checkbox
                  const isAllGroup = building.key === 'all-buildings';
                  return (
                    <div key={building.key} className="rounded border border-line/50 bg-bg-panel/50 p-2">
                      <label className={`flex items-center gap-2 ${isAllGroup ? 'cursor-default' : 'cursor-pointer'}`}>
                        {!isAllGroup && (
                          <input
                            type="checkbox"
                            checked={selectedBuildingKeys.has(building.key)}
                            onChange={() => toggleBuilding(building.key)}
                            className="h-3.5 w-3.5 accent-cyan"
                          />
                        )}
                        <span className="text-[12px] font-medium text-text-1">{building.label}</span>
                        <span className="ml-auto font-mono text-[10px] text-text-3">
                          {selectedInBuilding}/{building.stories.length}
                        </span>
                      </label>

                      {building.stories.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {building.stories.map((story) => (
                            <button
                              key={story.key}
                              onClick={() => toggleStory(building.key, story.key)}
                              className={`rounded border px-1.5 py-0.5 text-[10px] transition ${
                                selectedStoryKeys.has(story.key)
                                  ? 'border-cyan bg-cyan/10 text-cyan'
                                  : 'border-line bg-bg-panel text-text-3 hover:border-line-glow hover:text-text-1'
                              }`}
                            >
                              {story.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FloorDisplayPanel;
