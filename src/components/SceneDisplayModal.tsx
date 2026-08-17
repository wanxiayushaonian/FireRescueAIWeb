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
  Droplets,
  Droplet,
  Bell,
  Wind,
  Flashlight,
  FireExtinguisher,
  Monitor,
  Truck,
  DoorOpen,
  ArrowUp as StairsIcon,
  LayoutGrid,
  Building2,
  Flame as FlameIcon,
  Trees,
  MapPin,
  Shapes,
  Sun,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useScene } from './SceneProvider';
import type { StructuralRecipe } from '@/lib/scene-recipe/types';
import { HIDABLE_CATEGORY_GROUPS, defaultVisibleByLevel } from '@/lib/scene-categories';
import { saveSceneDisplayPrefs } from '@/lib/scene-display-prefs';
import { loadSceneSkyPref, saveSceneSkyPref } from '@/lib/scene-sky-prefs';
import ScenePackPanel from '@/components/ScenePackPanel';
import { showToast } from '@/components/Toast';

type Level = 'whole' | 'single' | 'multi';

const LEVEL_TABS: { level: Level; label: string; icon: LucideIcon }[] = [
  { level: 'whole', label: '整体建筑', icon: Layers },
  { level: 'single', label: '单楼层', icon: Box },
  { level: 'multi', label: '多楼层', icon: Columns3 },
];

const GROUP_ICON: Record<string, LucideIcon> = {
  hydrantSupply: Droplets,
  sprinkler: Droplet,
  fireAlarm: Bell,
  smokeControl: Wind,
  evacuation: Flashlight,
  extinguisher: FireExtinguisher,
  controlRoom: Monitor,
  doors: DoorOpen,
  stairs: StairsIcon,
  spaces: LayoutGrid,
  outdoorHydrant: Droplets,
  vehicles: Truck,
  sceneAccess: MapPin,
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
  const { recipeStore, sceneId, runtime } = useScene();
  const [structural, setStructural] = useState<StructuralRecipe | null>(
    recipeStore?.getCurrent().structural ?? null,
  );
  const [activeLevel, setActiveLevel] = useState<Level>('whole');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['hydrantSupply']));
  // 消防设施大目录展开态(父级总开关)
  const [fireDirOpen, setFireDirOpen] = useState(true);
  // 顶层页签:内容显隐(开关) / 场景包内容(数据解析展示)
  const [topTab, setTopTab] = useState<'visibility' | 'pack'>('visibility');
  // 平台标注的区域多边形(随场景包加载):经 setVirtualPolygonVisible 控制显隐
  const [polygons, setPolygons] = useState<Array<{ polygon_id: string; polygon_name?: string }>>([]);
  const [polygonVis, setPolygonVis] = useState<Record<string, boolean>>({});
  // 天空背景:长期开关,按场景持久化;切换场景时同步存档
  const [skyOn, setSkyOn] = useState(() => loadSceneSkyPref(sceneId));
  useEffect(() => {
    if (!sceneId) return;
    setSkyOn(loadSceneSkyPref(sceneId));
  }, [sceneId]);

  useEffect(() => {
    if (!open || !sceneId) return;
    let alive = true;
    fetch(`/api/ustudio/polygons?sceneId=${encodeURIComponent(sceneId)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: unknown) => {
        if (!alive || !Array.isArray(rows)) return;
        setPolygons(
          rows
            .filter((r): r is { polygon_id: string; polygon_name?: string } => !!r && typeof (r as { polygon_id?: unknown }).polygon_id === 'string'),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, sceneId]);

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
  /** 天空背景:长期开关,立即应用 + 按场景持久化(场景重载后由 App 回放) */
  const toggleSky = (): void => {
    const next = !skyOn;
    setSkyOn(next);
    saveSceneSkyPref(sceneId, next);
    runtime?.setSceneSky(next);
    showToast(next ? '已开启天空背景(轻量渐变)' : '已关闭天空背景');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-h-[85vh] overflow-y-auto border-line bg-bg-panel text-text-1 ${topTab === 'pack' ? 'sm:max-w-lg' : 'sm:max-w-md'}`}
      >
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
        {/* 场景级显示:天空背景(长期开关,按场景记忆;非层级配置) */}
        <div className="mb-1.5 flex items-center gap-2 rounded-md border border-line/60 bg-bg-panel-2/40 px-3 py-2">
          <Sun className="h-3.5 w-3.5 shrink-0 text-amber" />
          <span className="text-[13px] font-medium text-text-1">天空背景</span>
          <span className="hidden text-[10px] text-text-3 sm:inline">轻量渐变天空 · 按场景记忆</span>
          <span className="ml-auto">
            <Toggle on={skyOn} onClick={toggleSky} />
          </span>
        </div>

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

        {/* 当前 tab 的类别开关:室内/室外语义分区,消防设施为可统一隐藏的大目录 */}
        {(() => {
          const renderGroup = (group: (typeof HIDABLE_CATEGORY_GROUPS)[number], nested = false): React.ReactNode => {
            const types = group.types.map((t) => t.type);
            const allVisible = types.every((t) => isVisible(t));
            const isMulti = group.types.length > 1;
            const expanded = expandedGroups.has(group.key);
            const GroupIcon = GROUP_ICON[group.key] ?? Eye;
            return (
              <div key={group.key} className="rounded-md border border-line/60 bg-bg-panel-2/40">
                {/* 大类行 */}
                <div className={`flex items-center gap-2 px-3 py-2 ${nested ? 'py-1.5' : ''}`}>
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
                  <span className={`font-medium text-text-1 ${nested ? 'text-[12px]' : 'text-[13px]'}`}>{group.label}</span>
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
          };

          const fireGroups = HIDABLE_CATEGORY_GROUPS.filter((g) => g.fireSystem);
          const fireTypes = fireGroups.flatMap((g) => g.types.map((t) => t.type));
          const fireAllVisible = fireTypes.every((t) => isVisible(t));
          const outdoorGroups = HIDABLE_CATEGORY_GROUPS.filter((g) => g.zone === 'outdoor');
          const indoorOthers = HIDABLE_CATEGORY_GROUPS.filter((g) => !g.fireSystem && g.zone !== 'outdoor');
          const zoneHeader = (label: string): React.ReactNode => (
            <div className="flex items-center gap-2 pt-1 text-[10px] font-semibold tracking-widest text-text-3">
              <span className="h-px flex-1 bg-line" />
              {label}
              <span className="h-px flex-1 bg-line" />
            </div>
          );

          return (
            <div className="space-y-1.5">
              {zoneHeader('室 内')}

              {/* 消防设施大目录:父级总开关统一隐藏,内含各专业系统子组 */}
              <div className="rounded-md border border-cyan/30 bg-cyan/5">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    onClick={() => setFireDirOpen((v) => !v)}
                    className="text-text-3 transition hover:text-text-1"
                    title={fireDirOpen ? '收起' : '展开'}
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${fireDirOpen ? 'rotate-0' : '-rotate-90'}`} />
                  </button>
                  <FlameIcon className="h-3.5 w-3.5 text-orange" />
                  <span className="text-[13px] font-semibold text-text-1">消防设施</span>
                  <span className="text-[10px] text-text-3">{fireGroups.length} 个系统 · {fireTypes.length} 类</span>
                  <span className="ml-auto">
                    <Toggle on={fireAllVisible} onClick={() => setGroup(fireTypes, !fireAllVisible)} />
                  </span>
                </div>
                {fireDirOpen && (
                  <div className="space-y-1 border-t border-line/40 p-1.5">
                    {fireGroups.map((g) => renderGroup(g, true))}
                  </div>
                )}
              </div>

              {indoorOthers.map((g) => renderGroup(g))}

              {zoneHeader('室 外')}
              {outdoorGroups.map((g) => renderGroup(g))}

              {/* 区域多边形:平台标注区域,默认未绘制——开启=拉详情 drawVirtualPolygon 绘制,
                  关闭=隐藏/清除(与场景路线同款"列表→详情→绘制"模式) */}
              {polygons.length > 0 && (() => {
                const togglePolygon = (p: { polygon_id: string; polygon_name?: string }, on: boolean): void => {
                  if (!runtime || !sceneId) return;
                  if (on) {
                    fetch(`/api/ustudio/polygons/detail?sceneId=${encodeURIComponent(sceneId)}&polygonId=${encodeURIComponent(p.polygon_id)}`)
                      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('详情加载失败'))))
                      .then((detail: Record<string, unknown>) =>
                        runtime.drawVirtualPolygon(
                          { ...detail, polygon_id: p.polygon_id, polygon_name: p.polygon_name ?? detail.polygon_name },
                          { id: p.polygon_id },
                        ),
                      )
                      .then(() => {
                        setPolygonVis((v) => ({ ...v, [p.polygon_id]: true }));
                      })
                      .catch(() => {
                        showToast('多边形绘制失败(无顶点数据或引擎不支持)');
                      });
                    return;
                  }
                  // 关闭:虚拟多边形注册表里有则隐藏,没有(未绘制)静默
                  try {
                    runtime.setVirtualPolygonVisible(p.polygon_id, false);
                  } catch {
                    try {
                      runtime.clearVirtualPolygon(p.polygon_id);
                    } catch {
                      /* 未绘制,无事可做 */
                    }
                  }
                  setPolygonVis((v) => ({ ...v, [p.polygon_id]: false }));
                };
                const allOn = polygons.every((p) => polygonVis[p.polygon_id] ?? false);
                return (
                  <div className="rounded-md border border-line/60 bg-bg-panel-2/40">
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="w-3.5" />
                      <Shapes className="h-3.5 w-3.5 text-text-3" />
                      <span className="text-[13px] font-medium text-text-1">区域多边形</span>
                      <span className="ml-auto">
                        <Toggle on={allOn} onClick={() => polygons.forEach((p) => togglePolygon(p, !allOn))} />
                      </span>
                    </div>
                    <div className="border-t border-line/40 px-3 py-1.5">
                      {polygons.map((p) => {
                        const on = polygonVis[p.polygon_id] ?? false;
                        return (
                          <div key={p.polygon_id} className="flex items-center gap-2 py-1 pl-5">
                            <span className={`text-[12px] ${on ? 'text-text-2' : 'text-text-3'}`}>
                              {p.polygon_name || p.polygon_id}
                            </span>
                            <span className="ml-auto">
                              <Toggle on={on} onClick={() => togglePolygon(p, !on)} />
                            </span>
                          </div>
                        );
                      })}
                      <div className="py-1 text-[9px] text-text-3/60">平台标注区域 · 默认不绘制,开启时按详情绘制为覆盖层</div>
                    </div>
                  </div>
                );
              })()}

              {/* 周边环境:不在语义树内,无独立开关 */}
              <div className="flex items-start gap-2 rounded-md border border-line/40 bg-bg-panel-2/20 px-3 py-2">
                <Trees className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-3" />
                <span className="text-[10px] leading-relaxed text-text-3">
                  周边环境(草地 / 道路 / 周边建筑)属环境网格,不在语义树内——随「建筑结构」组整体显隐,暂不支持独立开关
                </span>
              </div>
            </div>
          );
        })()}

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
