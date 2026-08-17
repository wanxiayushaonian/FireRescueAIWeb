'use client';

/**
 * 内容显隐模态框:按类别(type)控制 3D 场景内容显隐。
 * 整体建筑 / 单楼层 / 多楼层 分三个 tab,各 tab 配置独立、互不影响(切楼层用对应那套)。
 * 含建筑结构组(墙体/楼层/楼栋/场地)——墙体(24736)是渲染大头,全藏可大幅提帧(参考项目验证)。
 * 多类型组(消防设施/建筑结构)可展开单独控制;单类型组(门/楼梯/空间)只总开关。
 */
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import {
  ChevronDown,
  Eye,
  RotateCcw,
  Layers,
  Box,
  Columns3,
  Flame,
  DoorOpen,
  ArrowUp as StairsIcon,
  LayoutGrid,
  Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useScene } from './SceneProvider';
import type { StructuralRecipe } from '@/lib/scene-recipe/types';
import { HIDABLE_CATEGORY_GROUPS, defaultVisibleByLevel } from '@/lib/scene-categories';
import { saveSceneDisplayPrefs } from '@/lib/scene-display-prefs';
import ScenePackPanel from '@/components/ScenePackPanel';

type Level = 'whole' | 'single' | 'multi';

const LEVEL_TABS: { level: Level; label: string; icon: LucideIcon }[] = [
  { level: 'whole', label: '整体建筑', icon: Layers },
  { level: 'single', label: '单楼层', icon: Box },
  { level: 'multi', label: '多楼层', icon: Columns3 },
];

const GROUP_ICON: Record<string, LucideIcon> = {
  fireDevices: Flame,
  doors: DoorOpen,
  stairs: StairsIcon,
  spaces: LayoutGrid,
  buildingStructure: Building2,
};

/** 小开关按钮(ON/OFF) */
function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`min-w-[44px] rounded border px-2 py-0.5 text-[11px] transition ${
        on
          ? 'border-cyan bg-cyan/10 text-cyan'
          : 'border-line bg-bg-panel text-text-3 hover:border-line-glow hover:text-text-1'
      }`}
    >
      {on ? 'ON' : 'OFF'}
    </button>
  );
}

export function SceneDisplayModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { recipeStore, sceneId } = useScene();
  const [structural, setStructural] = useState<StructuralRecipe | null>(
    recipeStore?.getCurrent().structural ?? null,
  );
  const [activeLevel, setActiveLevel] = useState<Level>('whole');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['fireDevices']));
  // 顶层页签:内容显隐(开关) / 场景包内容(数据解析展示)
  const [topTab, setTopTab] = useState<'visibility' | 'pack'>('visibility');

  useEffect(() => {
    if (!recipeStore) return;
    setStructural(recipeStore.getCurrent().structural);
    return recipeStore.subscribe((next) => setStructural(next.structural));
  }, [recipeStore]);

  if (!recipeStore || !structural) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-line bg-bg-panel text-text-1 sm:max-w-md">
          <DialogHeader>
            <DialogTitle>内容显示</DialogTitle>
          </DialogHeader>
          <div className="py-6 text-center text-[12px] text-text-3">3D 场景未加载</div>
        </DialogContent>
      </Dialog>
    );
  }

  const visAll = structural.categoryVisibility ?? {};
  const vis = visAll[activeLevel] ?? {};
  // 兜底 = 层级默认(与 level-policy 渲染实际对齐):whole/multi 设备/门/空间默认藏,single 全显。
  // 未配置时开关显示的就是实际渲染状态,避免"UI 全 ON、实际全藏"的错觉。
  const defaults = defaultVisibleByLevel(activeLevel);
  const isVisible = (type: string): boolean => vis[type] ?? defaults[type] ?? true;

  const writeLevel = (levelVis: Record<string, boolean>): void => {
    const next = { ...visAll, [activeLevel]: levelVis };
    recipeStore.patchStructural({ categoryVisibility: next });
    // 模态框是唯一写入方:与场景 id 绑定持久化,场景(重)加载后由 App 回放
    saveSceneDisplayPrefs(sceneId, next);
  };
  const setCategory = (type: string, visible: boolean): void => writeLevel({ ...vis, [type]: visible });
  const setGroup = (types: string[], visible: boolean): void => {
    const next = { ...vis };
    types.forEach((t) => {
      next[t] = visible;
    });
    writeLevel(next);
  };
  const resetLevel = (): void => writeLevel({});
  const toggleGroup = (key: string): void =>
    setExpandedGroups((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-line bg-bg-panel text-text-1 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-text-1">
            <Eye className="h-4 w-4 text-cyan" />
            内容显示
          </DialogTitle>
          <DialogDescription className="text-text-3">
            按层级独立配置内容显隐,切楼层时自动应用对应配置
          </DialogDescription>
        </DialogHeader>

        {/* 顶层页签:内容显隐 / 场景包内容(数据解析) */}
        <div className="flex gap-1 rounded-md border border-line bg-bg-panel p-0.5">
          {([['visibility', '内容显隐'], ['pack', '场景包内容']] as const).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setTopTab(tab)}
              className={`flex-1 rounded px-2 py-1.5 text-[11px] transition ${
                topTab === tab ? 'bg-cyan/20 text-cyan' : 'text-text-3 hover:text-text-1'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {topTab === 'pack' ? (
          <ScenePackPanel onJumpVisibility={() => setTopTab('visibility')} />
        ) : (
          <>
        {/* 层级 tab:整体 / 单楼层 / 多楼层(各 tab 独立) */}
        <div className="flex gap-1 rounded-md border border-line bg-bg-panel p-0.5">
          {LEVEL_TABS.map(({ level, label, icon: Icon }) => (
            <button
              key={level}
              onClick={() => setActiveLevel(level)}
              className={`flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-[11px] transition ${
                activeLevel === level ? 'bg-cyan/20 text-cyan' : 'text-text-3 hover:text-text-1'
              }`}
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>

        {/* 当前 tab 的类别开关 */}
        <div className="space-y-1.5">
          {HIDABLE_CATEGORY_GROUPS.map((group) => {
            const types = group.types.map((t) => t.type);
            const allVisible = types.every((t) => isVisible(t));
            const isMulti = group.types.length > 1;
            const expanded = expandedGroups.has(group.key);
            const GroupIcon = GROUP_ICON[group.key] ?? Eye;
            return (
              <div key={group.key} className="rounded-md border border-line/60 bg-bg-panel-2/40">
                {/* 大类行 */}
                <div className="flex items-center gap-2 px-3 py-2">
                  {isMulti ? (
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="text-text-3 transition hover:text-text-1"
                      title={expanded ? '收起' : '展开'}
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`} />
                    </button>
                  ) : (
                    <span className="w-3.5" />
                  )}
                  <GroupIcon className="h-3.5 w-3.5 text-text-3" />
                  <span className="text-[13px] font-medium text-text-1">{group.label}</span>
                  <span className="ml-auto">
                    <Toggle on={allVisible} onClick={() => setGroup(types, !allVisible)} />
                  </span>
                </div>

                {/* 多类型组展开细分 */}
                {isMulti && expanded && (
                  <div className="border-t border-line/40 px-3 py-1.5">
                    {group.types.map((t) => {
                      const on = isVisible(t.type);
                      return (
                        <div key={t.type} className="flex items-center gap-2 py-1 pl-5">
                          <span className={`text-[12px] ${on ? 'text-text-2' : 'text-text-3'}`}>{t.label}</span>
                          <span className="ml-auto">
                            <Toggle on={on} onClick={() => setCategory(t.type, !on)} />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 底部:重置当前层级 */}
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-[10px] leading-relaxed text-text-3">
            当前配置仅对「{LEVEL_TABS.find((t) => t.level === activeLevel)?.label}」生效,不影响其他层级
          </span>
          <button
            onClick={resetLevel}
            className="flex items-center gap-1 rounded border border-line px-2 py-1 text-[11px] text-text-3 transition hover:border-line-glow hover:text-text-1"
            title="清除当前层级的全部配置(恢复默认全显)"
          >
            <RotateCcw className="h-3 w-3" />
            重置本层
          </button>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
