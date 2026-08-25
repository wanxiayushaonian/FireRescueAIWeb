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
import { useEffect, useRef, useState } from 'react';
import { DrillToolbar } from '@/drill/DrillToolbar';
import ConfrontationPanel from '@/drill/confrontation/ConfrontationPanel';
import { beginConfrontation } from '@/drill/confrontation/confront-store';
import { subscribeConfrontation } from '@/drill/confrontation/confront-store';
import { getDrillState } from '@/mock/drillStore';
import { DEFAULT_DISASTER_SEED } from '@/drill/building-21';
import DraggablePanel from '@/components/DraggablePanel';
import { Swords, Crosshair, FileText, Archive } from 'lucide-react';
import ScenarioPanel from '@/components/panels/ScenarioPanel';
import PlanOutputPanel from '@/components/panels/PlanOutputPanel';
import PlanLibraryPanel from '@/components/panels/PlanLibraryPanel';

// ============================================================
// DrillView
// ============================================================

export default function DrillView() {
  // ---- 对抗舱开关 + 订阅 store，store.active 翻转为 false 时清理 ----
  const [confOpen, setConfOpen] = useState(false);
  const confOpenRef = useRef(confOpen);
  confOpenRef.current = confOpen;
  // ---- 工具条状态:对抗舱运行中 + T+ 真实秒数(订阅 startedAt 逐秒 tick) ----
  const [confRunning, setConfRunning] = useState(false);
  const [tPlus, setTPlus] = useState(0);
  const startedAtRef = useRef(0);
  useEffect(() => {
    const unsub = subscribeConfrontation((s) => {
      // 外部激活(情景面板「进入对抗模式」带参进入)自动开舱;关闭(exit)自动收起
      if (s.active && !confOpenRef.current) setConfOpen(true);
      if (!s.active && confOpenRef.current) {
        setConfOpen(false);
      }
      const running = s.active && s.status === 'running';
      setConfRunning(running);
      if (running && s.startedAt) startedAtRef.current = s.startedAt;
      if (!running) setTPlus(0);
    });
    return unsub;
  }, []);
  // 对抗中逐秒刷新 T+
  useEffect(() => {
    if (!confRunning) return;
    const iv = window.setInterval(() => {
      setTPlus(Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [confRunning]);

  // ---- 原型 3 面板管理 ----
  const [scenarioOpen, setScenarioOpen] = useState(true);
  const [planOpen, setPlanOpen] = useState(true);
  const [libraryOpen, setLibraryOpen] = useState(false);

  // ---- 演练启动/停止（对抗舱状态由 store 驱动，无独立引擎）----

  return (
    <div className="relative z-20 flex h-full flex-col bg-transparent">
      {/* ===== 顶部工具条 ===== */}
      <div className="pointer-events-auto relative z-30">
        <DrillToolbar running={confRunning} tPlus={tPlus} />
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

      {/* ===== 进入对抗模式(独立于工具条,不再被假启动状态隐藏) ===== */}
      {!confOpen && (
        <div className="pointer-events-auto absolute bottom-6 right-6 z-40">
          <button
            type="button"
            onClick={() => {
              // 灾情种子优先级:情景参数面板「生成灾情设定」的参数 > 21号楼默认(5F/电气/5人)
              const gen = getDrillState().scenario;
              beginConfrontation({
                seedScenario: {
                  building: gen?.buildingName ?? '21号楼',
                  floor: gen?.floor ?? DEFAULT_DISASTER_SEED.floor,
                  material: gen?.material ?? DEFAULT_DISASTER_SEED.material,
                  trapped: gen?.trapped ?? DEFAULT_DISASTER_SEED.trapped,
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
