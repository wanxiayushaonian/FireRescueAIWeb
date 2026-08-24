'use client';

/**
 * DrillView — 演练对抗模块视图（对齐原型布局）。
 *
 * 布局（原型 App.tsx L190-238）：
 * - DraggablePanel「情景参数设置」(左400, scenarioOpen)
 * - DraggablePanel「预案输出」(右480, planOpen)
 * - 预案库按钮(左下角) + DraggablePanel「预案库」(左420, libraryOpen)
 * - 对抗舱(全屏 Portal)
 * - 顶部 DrillToolbar
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScene } from '@/components/SceneProvider';
import { DrillToolbar } from '@/drill/DrillToolbar';
import ConfrontationPanel from '@/drill/confrontation/ConfrontationPanel';
import { beginConfrontation } from '@/drill/confrontation/confront-store';
import { subscribeConfrontation } from '@/drill/confrontation/confront-store';
import { getDrillState } from '@/mock/drillStore';
import type { Speed } from '@/drill/DrillToolbar';
import {
  DEFAULT_SCENARIO_ID,
  getScenario,
  getDefaultScenario,
  listScenarios,
  type DrillScenarioDef,
} from '@/drill/scenarios';
import { storyIdsForFloorSpec } from '@/lib/floor-focus';
import DraggablePanel from '@/components/DraggablePanel';
import { Swords, Crosshair, FileText, Archive } from 'lucide-react';
import ScenarioPanel from '@/components/panels/ScenarioPanel';
import PlanOutputPanel from '@/components/panels/PlanOutputPanel';
import PlanLibraryPanel from '@/components/panels/PlanLibraryPanel';

// ============================================================
// DrillView
// ============================================================

export default function DrillView() {
  // ---- 剧本选择 ----
  const scenarios = useMemo(() => listScenarios(), []);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(DEFAULT_SCENARIO_ID);
  const activeScenario: DrillScenarioDef =
    getScenario(selectedScenarioId) ?? getDefaultScenario();

  // ---- 对抗舱开关 + 订阅 store，store.active 翻转为 false 时清理 ----
  const [confOpen, setConfOpen] = useState(false);
  const confOpenRef = useRef(confOpen);
  confOpenRef.current = confOpen;
  useEffect(() => {
    const unsub = subscribeConfrontation((s) => {
      // 外部激活(情景面板「进入对抗模式」带参进入)自动开舱;关闭(exit)自动收起
      if (s.active && !confOpenRef.current) setConfOpen(true);
      if (!s.active && confOpenRef.current) {
        setConfOpen(false);
      }
    });
    return unsub;
  }, []);

  // ---- 显示状态(旧引擎兼容占位，对抗模式不使用) ----
  const [clock, setClock] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [status, setStatus] = useState<'idle' | 'running'>('idle');

  // ---- 原型 3 面板管理 ----
  const [scenarioOpen, setScenarioOpen] = useState(true);
  const [planOpen, setPlanOpen] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // ---- 3D/相机联动 ----
  const { runtime, tree, recipeStore } = useScene();
  const sceneRef = useRef({ runtime, tree, recipeStore });
  sceneRef.current = { runtime, tree, recipeStore };

  const focusFloors = useCallback((specs: string[]): void => {
    const { runtime: rt, tree: tr, recipeStore: store } = sceneRef.current;
    if (!rt || !tr || !store || specs.length === 0) return;
    const storyIds = [...new Set(specs.flatMap((s) => storyIdsForFloorSpec(tr, s)))];
    if (storyIds.length === 0) return;
    const single = storyIds.length === 1;
    store.patchStructural({
      visibleStories: storyIds,
      detailLevel: 'full',
      yExtend: !single,
      hideDevices: !single,
    });
    void rt.flyToObject(storyIds[0]);
  }, []);

  // ---- 演练启动/停止 ----
  const handleStart = (): void => {
    if (status !== 'idle') return;
    setClock(0);
    setStatus('running');
  };

  const handleStop = (): void => {
    setStatus('idle');
    setClock(0);
  };

  return (
    <div className="relative z-20 flex h-full flex-col bg-transparent">
      {/* ===== 顶部工具条 ===== */}
      <div className="pointer-events-auto relative z-30">
        <DrillToolbar
          status={status}
          speed={speed}
          clock={clock}
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          onSelectScenario={setSelectedScenarioId}
          onStart={handleStart}
          onPause={() => {}}
          onResume={() => {}}
          onSetSpeed={setSpeed}
          onStop={handleStop}
        />
      </div>

      {/* ===== 主区域 ===== */}
      <main className="pointer-events-none relative z-10 flex min-h-0 flex-1 gap-2 p-2">
        {/* 3D 场景：鼠标穿透 */}
        <div className="relative min-w-0 flex-1" />

        {/* ===== 情景参数设置 ===== */}
        <DraggablePanel
          panelId="drill-scenario"
          title="情景参数设置"
          icon={Crosshair}
          width={400}
          dock="left"
          defaultPos={{ x: 16, y: 16 }}
          open={scenarioOpen}
          onOpenChange={setScenarioOpen}
        >
          <ScenarioPanel />
        </DraggablePanel>

        {/* ===== 预案输出 ===== */}
        <DraggablePanel
          panelId="drill-plan"
          title="预案输出"
          icon={FileText}
          width={480}
          dock="right"
          defaultPos={{ x: 16, y: 16 }}
          height="calc(100% - 280px)"
          open={planOpen}
          onOpenChange={setPlanOpen}
        >
          <PlanOutputPanel />
        </DraggablePanel>

        {/* ===== 预案库按钮 + 面板 ===== */}
        {!libraryOpen && (
          <button
            onClick={() => setLibraryOpen(true)}
            className="absolute bottom-6 left-4 z-40 flex items-center gap-1.5 rounded-lg border border-line bg-bg-panel/90 px-3 py-2 text-[13px] text-text-2 backdrop-blur transition hover:border-line-glow hover:text-cyan"
            title="打开预案库（归档预案/对抗评估/改进措施）"
          >
            <Archive className="h-4 w-4 text-cyan" />
            预案库
          </button>
        )}

        <DraggablePanel
          panelId="plan-library"
          title="预案库"
          icon={Archive}
          width={420}
          dock="left"
          defaultPos={{ x: 16, y: 430 }}
          open={libraryOpen}
          onOpenChange={setLibraryOpen}
        >
          <PlanLibraryPanel />
        </DraggablePanel>
      </main>

      {/* ===== 进入对抗模式 ===== */}
      {!confOpen && status === 'idle' && (
        <div className="pointer-events-auto absolute bottom-6 right-6 z-40">
          <button
            type="button"
            onClick={() => {
              // 灾情种子优先级:情景参数面板「生成灾情设定」的参数 > 剧本默认参数
              const gen = getDrillState().scenario;
              beginConfrontation({
                seedScenario: {
                  building: gen?.buildingName ?? '21号楼',
                  floor: gen?.floor ?? activeScenario.scenario.fireFloor ?? '5F',
                  material: gen?.material ?? activeScenario.scenario.material ?? '电气',
                  trapped: gen?.trapped ?? activeScenario.scenario.trappedCount ?? 5,
                  seed: `#${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')}`,
                },
                plannedTotal: 3 + Math.floor(Math.random() * 3),
              });
              setConfOpen(true);
            }}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-orange/60 bg-orange/10 px-4 py-2.5 text-[14px] font-medium text-orange transition hover:bg-orange/20"
            title="进入演练对抗模式"
          >
            <Swords className="h-5 w-5" />
            进入对抗模式
          </button>
        </div>
      )}

      {/* ===== 对抗舱(Portal) ===== */}
      {confOpen && <ConfrontationPanel />}
    </div>
  );
}
