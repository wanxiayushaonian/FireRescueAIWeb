'use client';

// 六熟悉 AI 顺序引导面板(ref.md 模块三一级界面):六章按《条令》顺序步进,
// 每步自动联动 3D(楼层聚焦/整体恢复/设备类型高亮)与右面板点位详情;
// dynamic 步拉 znya 真实数据(周边水源/责任区单位/就近队站)拼装引导段落。
// 进度按建筑持久化(localStorage);章完成回写关联点位熟悉度。
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, ChevronLeft, ChevronRight, CheckCircle2, Sparkles, RotateCcw,
} from 'lucide-react';
import { useScene } from '@/components/SceneProvider';
import { storyIdsForFloorSpec, parseFloorSpec, parseFloorToken } from '@/lib/floor-focus';
import { buildDeviceSearchIndex } from '@/lib/scene-pick';
import { planAttackRoute, drawAttackRoute, clearSceneRoutes } from '@/lib/scene-navigation';
import { presets } from '@/lib/scene-recipe/presets';
import { effectiveDisplayPrefs } from '@/lib/scene-display-prefs';
import { fetchWaterSourcesInBbox } from '@/api/water';
import { fetchKeyUnits } from '@/api/key-units';
import { fetchStations } from '@/api/force';
import { showToast } from '@/components/Toast';
import DemoTag from '@/components/DemoTag';
import { findNode, type FamiliarNode } from '@/mock/training';
import {
  SIX_FAMILIAR_CHAPTERS,
  SIX_FAMILIAR_TOTAL_STEPS,
  loadGuideProgress,
  saveGuideProgress,
} from '@/mock/six-familiar';

/** 乐盈广场21号楼坐标(znya key_buildings 实测,动态数据 bbox 中心) */
const BUILDING_POS = { lng: 115.947508, lat: 29.661235 };

/** 近似距离(km,equirect) */
function distKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const dx = (a.lng - b.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180) * 111.32;
  const dy = (a.lat - b.lat) * 110.57;
  return Math.hypot(dx, dy);
}

export default function SixFamiliarGuide({
  onRelatedNode,
  onAgentHint,
}: {
  /** 引导步联动右面板(传 null 收起) */
  onRelatedNode?: (node: FamiliarNode | null) => void;
  onAgentHint?: (topic: string) => void;
}) {
  const { tree, recipeStore, runtime, view, sceneId, initialView } = useScene();
  const [progress, setProgress] = useState(() => loadGuideProgress());
  const [dynamicParas, setDynamicParas] = useState<string[]>([]);
  const [dynamicLoading, setDynamicLoading] = useState(false);

  const deviceIndex = useMemo(() => buildDeviceSearchIndex(tree), [tree]);

  const chapter = SIX_FAMILIAR_CHAPTERS[progress.chapterIdx];
  const step = chapter?.steps[progress.stepIdx] ?? null;
  const doneAll = progress.doneChapters.length === SIX_FAMILIAR_CHAPTERS.length;
  const doneSteps = useMemo(
    () => SIX_FAMILIAR_CHAPTERS.reduce(
      (n, c, ci) => n + (progress.doneChapters.includes(c.id) || ci < progress.chapterIdx ? c.steps.length : 0),
      0,
    ),
    [progress.doneChapters, progress.chapterIdx],
  );

  // ---- 动态数据段落(water/units/stations;znya 真实数据,失败降级为提示) ----
  useEffect(() => {
    const kind = step?.dynamic;
    if (!kind) {
      setDynamicParas([]);
      return;
    }
    let alive = true;
    setDynamicLoading(true);
    setDynamicParas([]);
    const finish = (paras: string[]): void => {
      if (!alive) return;
      setDynamicParas(paras);
      setDynamicLoading(false);
    };
    if (kind === 'water') {
      const d = 0.012;
      fetchWaterSourcesInBbox({
        minLng: BUILDING_POS.lng - d, minLat: BUILDING_POS.lat - d,
        maxLng: BUILDING_POS.lng + d, maxLat: BUILDING_POS.lat + d,
      })
        .then((rows) => {
          const withPos = rows.filter((w) => w.lng != null && w.lat != null);
          const byType = new Map<string, number>();
          for (const w of withPos) byType.set(w.type, (byType.get(w.type) ?? 0) + 1);
          const typeLine = [...byType.entries()].map(([t, n]) => `${t} ${n} 处`).join('、');
          const nearest = withPos
            .map((w) => ({ w, km: distKm({ lng: w.lng!, lat: w.lat! }, BUILDING_POS) }))
            .sort((a, b) => a.km - b.km)
            .slice(0, 4);
          finish([
            `本建筑周边约 1.3km 范围内共有消防水源 ${withPos.length} 处（${typeLine}）。`,
            ...nearest.map((n) => `· ${n.w.name}（${n.w.type}）— 直线约 ${Math.round(n.km * 1000)}m${n.w.address ? `，${n.w.address}` : ''}`),
            '取水要点：消防车优先抢占最近市政消火栓，天然水源需确认取水码头与枯水期水位。',
          ]);
        })
        .catch(() => finish(['周边水源数据暂不可用（znya 水源库未连通）——按备案水源分布继续讲解。']));
    } else if (kind === 'units') {
      fetchKeyUnits()
        .then((rows) => {
          const byType = new Map<string, number>();
          for (const u of rows) byType.set(u.unitType || '未分类', (byType.get(u.unitType || '未分类') ?? 0) + 1);
          const top = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
          finish([
            `本责任区共有消防安全重点单位 ${rows.length} 家，主要构成为：`,
            ...top.map(([t, n]) => `· ${t}：${n} 家`),
            '掌握分类分布的意义：不同类型的单位对应不同的处置预案与首批力量编成。',
          ]);
        })
        .catch(() => finish(['责任区单位数据暂不可用（znya key_units 未连通）。']));
    } else {
      fetchStations()
        .then((rows) => {
          const nearest = rows
            .filter((s) => s.lng != null && s.lat != null)
            .map((s) => ({ s, km: distKm({ lng: s.lng!, lat: s.lat! }, BUILDING_POS) }))
            .sort((a, b) => a.km - b.km)
            .slice(0, 3);
          finish([
            ...nearest.map((n) => `· ${n.s.name}（${n.s.type}）— 直线约 ${n.km.toFixed(1)}km，执勤 ${n.s.personnel} 人、车辆 ${n.s.vehicles} 台`),
            '第一响应梯队 = 单位微型站（自救）→ 就近执勤队站（首批）→ 增援队站（梯次投入）。',
          ]);
        })
        .catch(() => finish(['就近队站数据暂不可用（znya fire_stations 未连通）。']));
    }
    return () => {
      alive = false;
    };
  }, [step?.id, step?.dynamic]);

  // ---- 步进 3D 联动 + 右面板联动(同一步重放安全:幂等聚焦) ----
  useEffect(() => {
    if (!step || view !== 'ready') return;
    // 右面板点位联动
    const node = step.relatedNodeId ? findNode(step.relatedNodeId) : undefined;
    onRelatedNode?.(node ?? null);
    if (!recipeStore) return;
    // 3D:whole 步恢复整体视角(回放该场景显隐存档)+ 回初始镜头;floorSpec 步聚焦楼层并飞向(与档案楼层卡片/工具栏同策略)
    if (step.whole) {
      recipeStore.setStructural({
        ...presets.objectsOverview.structural,
        categoryVisibility: effectiveDisplayPrefs(sceneId),
      });
      if (runtime && initialView) {
        void runtime.setCameraViewpoint(initialView, true).catch(() => {});
      }
      // 整体视角下的类型高亮(2026-08-19 前三章联动:出入口/室外消火栓等场景包室外对象)
      if (step.highlightTypes?.length && runtime) {
        const hits = deviceIndex.filter((d) => step.highlightTypes!.includes(d.type)).slice(0, 12);
        for (const h of hits) runtime.highlightObject(h.outId, '#22d3ee');
        if (hits.length === 0) showToast(`场景中未找到 ${step.highlightTypes.join('/')} 类型对象,无法高亮`);
      }
      return;
    }
    if (step.floorSpec && tree) {
      const storyIds = storyIdsForFloorSpec(tree, step.floorSpec);
      if (storyIds.length > 0) {
        const multi = storyIds.length > 1;
        recipeStore.patchStructural({
          visibleStories: storyIds,
          yExtend: multi,
          hideDevices: multi,
        });
        // 镜头飞向首层(多层段飞向最低层,炸开视角自然覆盖整段)
        void runtime?.flyToObject(storyIds[0]).catch(() => {});
        if (step.highlightTypes?.length) {
          // 聚焦后高亮本层目标类型设备(前 6 个)
          const floors = new Set(parseFloorSpec(step.floorSpec) ?? []);
          const hits = deviceIndex.filter(
            (d) => step.highlightTypes!.includes(d.type)
              && (floors.size === 0 || floors.has(parseFloorToken(d.storyLabel ?? '') ?? Number.NaN)),
          ).slice(0, 6);
          for (const h of hits) runtime?.highlightObject(h.outId, '#22d3ee');
        }
      }
    }
    // 进攻路线演示(处置程序步):首层出入口 → 5F 室内消火栓(着火层目标点)。
    // 独立于 whole/floorSpec 分支:步数据用 floorSpec='1-5F' 炸开,路线在炸开视角可见
    // (整体视角下路线在建筑内部被外壳遮挡,2026-08-19 实测)。
    if (step.attackRoute && runtime && tree) {
      const target = deviceIndex.find(
        (d) => d.type === 'IndoorFireHydrant' && parseFloorToken(d.storyLabel ?? '') === 5,
      );
      const plan = target ? planAttackRoute(tree, target.outId) : null;
      if (plan) {
        void drawAttackRoute(runtime, plan).then((r) => {
          if (!r) showToast('进攻路线绘制失败:无可用路径');
        });
      } else {
        showToast('进攻路线规划失败:未找到 5F 室内消火栓目标点');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, view, tree, recipeStore, runtime, deviceIndex, sceneId, initialView]);

  // 章节完成:回写关联点位熟悉度 + 进度
  const completeChapter = useCallback((chapterId: string): void => {
    setProgress((prev) => {
      if (prev.doneChapters.includes(chapterId)) return prev;
      const next = { ...prev, doneChapters: [...prev.doneChapters, chapterId] };
      saveGuideProgress(next);
      return next;
    });
    const ch = SIX_FAMILIAR_CHAPTERS.find((c) => c.id === chapterId);
    let touched = 0;
    for (const st of ch?.steps ?? []) {
      const node = st.relatedNodeId ? findNode(st.relatedNodeId) : undefined;
      if (node) {
        node.familiarity = Math.min(100, node.familiarity + 4);
        node.lastExamAt = new Date().toISOString().slice(0, 10);
        touched += 1;
      }
    }
    showToast(`「${ch?.index ?? ''}、${ch?.title ?? ''}」已完成${touched ? ` · ${touched} 个点位熟悉度 +4` : ''}`);
    if (SIX_FAMILIAR_CHAPTERS.every((c) => chapterId === c.id || progress.doneChapters.includes(c.id))) {
      showToast('六熟悉全部完成 🎉 建议进入岗位考核检验成效');
    }
  }, [progress.doneChapters]);

  const goStep = (chapterIdx: number, stepIdx: number): void => {
    runtime?.clearAllHighlight();
    clearSceneRoutes(runtime); // 进攻路线演示步离开即清除
    const next = { ...progress, chapterIdx, stepIdx };
    setProgress(next);
    saveGuideProgress(next);
  };

  const prevStep = (): void => {
    if (progress.stepIdx > 0) goStep(progress.chapterIdx, progress.stepIdx - 1);
    else if (progress.chapterIdx > 0) goStep(progress.chapterIdx - 1, SIX_FAMILIAR_CHAPTERS[progress.chapterIdx - 1].steps.length - 1);
  };

  const nextStep = (): void => {
    const isLast = progress.stepIdx >= chapter.steps.length - 1;
    if (isLast) {
      completeChapter(chapter.id);
      if (progress.chapterIdx < SIX_FAMILIAR_CHAPTERS.length - 1) {
        goStep(progress.chapterIdx + 1, 0);
      }
      return;
    }
    goStep(progress.chapterIdx, progress.stepIdx + 1);
  };

  const resetProgress = (): void => {
    if (!window.confirm('重置六熟悉引导进度?')) return;
    const next = { doneChapters: [], chapterIdx: 0, stepIdx: 0 };
    setProgress(next);
    saveGuideProgress(next);
  };

  if (!chapter || !step) return null;

  return (
    <div className="flex h-full flex-col">
      {/* 进度头 */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-[12px] font-semibold text-text-1">六熟悉顺序引导</span>
        <DemoTag />
        <span className="ml-auto font-mono text-[10px] text-text-3">
          {doneSteps}/{SIX_FAMILIAR_TOTAL_STEPS} 步 · {progress.doneChapters.length}/6 章
        </span>
        <button
          onClick={resetProgress}
          className="rounded p-1 text-text-3 transition hover:bg-white/5 hover:text-text-1"
          title="重置进度"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 章节列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div className="space-y-1 p-2">
          {SIX_FAMILIAR_CHAPTERS.map((c, ci) => {
            const done = progress.doneChapters.includes(c.id);
            const current = ci === progress.chapterIdx;
            return (
              <button
                key={c.id}
                onClick={() => goStep(ci, 0)}
                className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                  current ? 'border-cyan/50 bg-cyan/10' : 'border-line bg-bg-panel hover:border-line-glow'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green" />
                ) : (
                  <BookOpen className={`mt-0.5 h-4 w-4 shrink-0 ${current ? 'text-cyan' : 'text-text-3'}`} />
                )}
                <span className="min-w-0 flex-1">
                  <span className={`block text-[12px] font-medium ${current ? 'text-cyan' : done ? 'text-text-2' : 'text-text-1'}`}>
                    {c.index}、{c.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[10px] text-text-3">{c.focus}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* 当前步卡片 */}
        <div className="m-2 mt-0 rounded-xl border border-line bg-bg-panel-2/60 p-3">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] text-cyan">{chapter.index}、{chapter.title}</span>
            <span className="ml-auto font-mono text-[10px] text-text-3">{progress.stepIdx + 1}/{chapter.steps.length}</span>
          </div>
          <div className="mt-1.5 text-[13px] font-semibold text-text-1">{step.title}</div>

          {/* 引导词(含动态段落) */}
          <div className="mt-2 space-y-1.5">
            {step.narration.map((p, i) => (
              <p key={i} className="text-[12px] leading-relaxed text-text-2">{p}</p>
            ))}
            {dynamicLoading && <p className="text-[11px] text-text-3">正在获取真实数据…</p>}
            {dynamicParas.map((p, i) => (
              <p key={`d-${i}`} className={`text-[12px] leading-relaxed ${p.startsWith('·') ? 'pl-2 text-text-3' : 'text-text-2'}`}>{p}</p>
            ))}
          </div>

          {/* 联动状态徽标 */}
          <div className="mt-2.5 flex flex-wrap gap-1">
            {step.whole && <Badge>整体视角</Badge>}
            {step.floorSpec && <Badge accent>已聚焦 {step.floorSpec}</Badge>}
            {step.highlightTypes?.length ? <Badge accent>高亮 {step.highlightTypes.length} 类设施</Badge> : null}
            {step.attackRoute && <Badge accent>进攻路线已绘制</Badge>}
            {step.dynamic && <Badge>znya 实时数据</Badge>}
          </div>

          {/* 步进控制 */}
          <div className="mt-3 flex items-center gap-1.5 border-t border-line/60 pt-2.5">
            <button
              onClick={prevStep}
              disabled={progress.chapterIdx === 0 && progress.stepIdx === 0}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-text-2 transition hover:border-line-glow hover:text-cyan disabled:opacity-40"
            >
              <ChevronLeft className="h-3 w-3" /> 上一步
            </button>
            <button
              onClick={() => onAgentHint?.(`${chapter.index}、${chapter.title}·${step.title}`)}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[11px] text-text-2 transition hover:border-line-glow hover:text-cyan"
              title="向熟悉引导智能体提问当前步骤(智能体配置后生效)"
            >
              <Sparkles className="h-3 w-3" /> 问智能体
            </button>
            <button
              onClick={nextStep}
              className="ml-auto flex items-center gap-1 rounded-md bg-cyan/20 px-2.5 py-1 text-[11px] font-medium text-cyan transition hover:bg-cyan/30"
            >
              {progress.stepIdx >= chapter.steps.length - 1
                ? progress.chapterIdx < SIX_FAMILIAR_CHAPTERS.length - 1 ? '完成本章,下一章' : doneAll ? '重新回顾' : '完成引导'
                : '下一步'}
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span className={`rounded border px-1.5 py-px text-[9px] ${accent ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-line bg-bg-panel text-text-3'}`}>
      {children}
    </span>
  );
}
