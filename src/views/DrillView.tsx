'use client';

/**
 * DrillView — 演练对抗大屏(6.5 集成)。
 *
 * 布局(plan §5.5):
 * - 顶部条(DrillToolbar):标题 + 剧本选择 + 启动/暂停/恢复/1×/5×/停止 + T+{clock}
 * - 主区:左 3D 场景(使用全局 SceneProvider,不重新加载)
 *   + 右栏(上 EventTree / 下 DrillStatusPanel)
 *
 * tick 编排(useEffect[clock] 驱动,避免与 useTimeline 内部 onTick 冲突):
 * 每 tick → bus.getEvents(clock,clock) → state.tick(evs) → recorder.record(evs) → runner.onTick(clock)
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.5
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { RealSceneView } from '@/components/RealSceneView';
import { useScene } from '@/components/SceneProvider';
import { showToast } from '@/components/Toast';
import { EventTreeOverlay } from '@/drill/EventTreeOverlay';
import { DrillToolbar } from '@/drill/DrillToolbar';
import { DrillStatusPanel } from '@/drill/DrillStatusPanel';
import { useTimeline } from '@/drill/hooks/use-timeline';
import { useAgentRunner } from '@/drill/hooks/use-agent-runner';
import { EventBus, type DrillEvent } from '@/lib/drill/event-bus';
import { DisasterState, type DisasterStatus, type DisasterScenario } from '@/lib/drill/disaster-state';
import { DrillRecorder } from '@/lib/drill/drill-recorder';
import { storyIdsForFloorSpec } from '@/lib/floor-focus';
import { extractFloorSpec, floorSpecFromEvent, spreadFloorSpecs } from '@/lib/drill/drill-camera';
import DrillScenarioPanel from '@/components/drill/DrillScenarioPanel';
import type { ScenarioApplyResult } from '@/components/drill/DrillScenarioPanel';
import { DrillEvaluationDialog } from '@/drill/DrillEvaluationDialog';
import { evaluateViaAgent, type EvaluationData, type EvaluationImprovement } from '@/lib/agent-evaluate';
import { buildDrillJson, buildDrillMarkdown } from '@/lib/drill/drill-export';
import { addLibraryItem } from '@/mock/planLibrary';
import DraggablePanel from '@/components/DraggablePanel';
import PlanLibraryPanel from '@/components/panels/PlanLibraryPanel';
import { Library, Star } from 'lucide-react';
import {
  DEFAULT_SCENARIO_ID,
  getScenario,
  getDefaultScenario,
  listScenarios,
  type DrillScenarioDef,
} from '@/drill/scenarios';

// ============================================================
// 事件 → 事件树节点 label 辅助
// ============================================================

/** 从 DrillEvent 构造事件树节点 label(展示用)。 */
function eventLabel(ev: DrillEvent): string {
  switch (ev.type) {
    case 'disaster': {
      const desc = ev.payload.description;
      return typeof desc === 'string' ? desc : '灾情事件';
    }
    case 'arrival': {
      const s = Number(ev.payload.stations ?? 0);
      const v = Number(ev.payload.vehicles ?? 0);
      const p = Number(ev.payload.personnel ?? 0);
      return `力量派遣: ${s}站 ${v}车 ${p}人`;
    }
    case 'status': {
      const desc = ev.payload.description;
      return typeof desc === 'string' ? desc : '状态更新';
    }
    default:
      return '事件';
  }
}

/** 从 DrillEvent 提取详情文本(事件树节点 detail 字段)。 */
function eventDetail(ev: DrillEvent): string | undefined {
  const desc = ev.payload.description;
  return typeof desc === 'string' ? desc : undefined;
}

/** 将种子/剧本事件记录到 DrillRecorder(事件树展示用)。
 *  meta.location 保留楼层信息(如 seed disaster 的 '5F')——事件树点节点相机回溯用。 */
function recordSeedEvents(recorder: DrillRecorder, events: readonly DrillEvent[]): void {
  for (const ev of events) {
    const location = typeof ev.payload.location === 'string' ? ev.payload.location : undefined;
    recorder.record({
      ts: ev.ts,
      type: ev.type,
      label: eventLabel(ev),
      detail: eventDetail(ev),
      ...(location ? { meta: { location } } : {}),
    });
  }
}

// ============================================================
// DrillView
// ============================================================

export default function DrillView() {
  // ---- 单例(useRef 懒初始化,贯穿组件生命周期)----
  const busRef = useRef<EventBus | null>(null);
  if (busRef.current === null) busRef.current = new EventBus();
  const bus = busRef.current;

  const stateRef = useRef<DisasterState | null>(null);
  if (stateRef.current === null) stateRef.current = new DisasterState();
  const state = stateRef.current;

  const recorderRef = useRef<DrillRecorder | null>(null);
  if (recorderRef.current === null) recorderRef.current = new DrillRecorder();
  const recorder = recorderRef.current;

  // ---- 剧本选择(Scenario Registry;listScenarios 驱动工具栏下拉)----
  const scenarios = useMemo(() => listScenarios(), []);
  const [selectedScenarioId, setSelectedScenarioId] =
    useState<string>(DEFAULT_SCENARIO_ID);
  // registry 启动时已注册 DEFAULT_SCENARIO_ID(index.ts import 触发 building-21 注册);
  // getDefaultScenario 内部保证非空(未注册时 throw,封装在函数内不破坏 hooks 顺序)。
  const activeScenario: DrillScenarioDef =
    getScenario(selectedScenarioId) ?? getDefaultScenario();

  // ---- 自定义灾情参数(ref 4.1 手动设定/随机/按建筑生成;应用后重建演练) ----
  const [customScenario, setCustomScenario] = useState<DisasterScenario | null>(null);
  const [customBriefing, setCustomBriefing] = useState<string | null>(null);
  const handleApplyScenario = (r: ScenarioApplyResult): void => {
    setCustomScenario(r.scenario);
    setCustomBriefing(r.briefing);
    showToast('灾情参数已应用,启动演练时生效');
  };
  // 有效灾情 = 自定义 ?? 剧本默认
  const effectiveScenario = customScenario ?? activeScenario.scenario;
  const effectiveBriefing = customBriefing ?? activeScenario.briefing;

  // ---- Timeline + AgentRunner ----
  const { status, speed, clock, start, pause, resume, setSpeed, stop } = useTimeline();

  const { runner } = useAgentRunner({
    bus,
    state,
    recorder,
    commanderAppId: activeScenario.commanderAppId,
    buildingId: activeScenario.buildingId,
    sceneId: activeScenario.sceneId,
    drillId: activeScenario.drillId,
    adversaryEveryNTicks: activeScenario.adversaryEveryNTicks, // 未配置对抗 appId 时为 0(no-op)
    adversaryAppId: activeScenario.adversaryAppId,
    commanderEveryNTicks: activeScenario.commanderEveryNTicks, // 周期简报(持续指挥)
    scenarioKey: activeScenario.id, // 切换剧本时重建 runner,确保新 appId/sceneId 生效
  });

  // ---- 显示状态 ----
  const [snapshot, setSnapshot] = useState<DisasterStatus | null>(null);
  /** 事件树悬浮面板开关(Ctrl+K 唤出/切换,ESC 关闭)。 */
  const [treeOpen, setTreeOpen] = useState(false);
  /** 预案库面板开关（演练评估归档 / 正式预案建档可查）。 */
  const [libraryOpen, setLibraryOpen] = useState(false);
  /** 演练评估:停止后可生成报告(事件树保留);agent 结果/加载/已回流标记。 */
  const [reportReady, setReportReady] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalData, setEvalData] = useState<EvaluationData | null>(null);
  const [evalArchived, setEvalArchived] = useState<ReadonlySet<number>>(new Set());
  /** 上次处理过的 tick,防止 resume 时同 clock 重复处理。 */
  const lastTickRef = useRef(-1);
  /** 上次联动过的火势等级(蔓延/熄灭视角切换去重)。 */
  const lastFireLevelRef = useRef(-1);

  // ---- 面板关闭时的事件 toast(3D 场景上方推送,2026-08-19)----
  // 面板开着时事件已可见,不重复打扰;只推灾情/特情/决策(状态类信息噪声大)
  const treeOpenRef = useRef(treeOpen);
  treeOpenRef.current = treeOpen;
  useEffect(() => {
    const TOAST_TYPES = new Set(['disaster', 'special', 'decision']);
    return recorder.subscribe((node) => {
      if (treeOpenRef.current) return;
      if (!TOAST_TYPES.has(node.type)) return;
      const tag = node.type === 'special' ? '特情' : node.type === 'decision' ? '决策' : '灾情';
      showToast(`[演练·${tag}] ${node.label}${node.detail ? `:${node.detail.slice(0, 40)}` : ''}`);
    });
  }, [recorder]);

  // ---- 3D/相机联动(事件树整改:视角反馈)----
  // useScene 对象经 ref 读取,避免 tick effect 依赖抖动;场景未就绪时静默跳过
  const { runtime, tree, recipeStore } = useScene();
  const sceneRef = useRef({ runtime, tree, recipeStore });
  sceneRef.current = { runtime, tree, recipeStore };

  /** 聚焦楼层集合 + 相机飞向首个楼层(与 focus_floors/BuildingProfilePanel 同机制)。 */
  const focusFloors = (specs: string[]): void => {
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
  };
  const focusFloorsRef = useRef(focusFloors);
  focusFloorsRef.current = focusFloors;

  /** 熄灭/结束:恢复全楼视角。 */
  const restoreFullView = (): void => {
    const { recipeStore: store } = sceneRef.current;
    store?.patchStructural({ visibleStories: null, detailLevel: 'full' });
  };
  const restoreFullViewRef = useRef(restoreFullView);
  restoreFullViewRef.current = restoreFullView;

  // ---- Ctrl+K 唤出事件树悬浮面板(演练模块局部,不冲突态势总览 overview 的 Ctrl+K)----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setTreeOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- tick 编排:clock 变化 → 推演一个 tick ----
  useEffect(() => {
    if (clock <= 0 || clock <= lastTickRef.current) return;
    lastTickRef.current = clock;

    // 1. 取本 tick 事件
    const evs = bus.getEvents(clock, clock);
    // 2. 推进态势
    state.tick(evs);
    // 3. 记录事件树(种子事件;agent 决策/特情由 AgentRunner 直接 record)
    recordSeedEvents(recorder, evs);
    // 4. agent 触发检查(指挥官周期简报/特情即时反应 + 对抗互斥触发;
    //    本 tick 有特情时把首个特情 id 传入,指挥官简报挂因果链)
    const specialId = evs.find((e) => e.type === 'special')?.id;
    runner.onTick(clock, specialId ? { specialEventId: specialId } : undefined);
    // 5. 刷新态势面板
    setSnapshot(state.getStatus());

    // 6. 3D/相机联动(视角反馈):
    //    a. disaster/special 事件带楼层(location 或可解析 description)→ 聚焦+飞向
    //    b. 火势等级变化 → 蔓延近似(3级炸开+1层,4级+2层);熄灭 → 恢复全楼
    let cameraMoved = false;
    for (const ev of evs) {
      if (ev.type === 'disaster' || ev.type === 'special') {
        const spec = floorSpecFromEvent(ev.payload);
        if (spec) {
          focusFloorsRef.current([spec]);
          cameraMoved = true;
          break; // 一 tick 最多一次相机动作(多事件同 tick 取首个)
        }
      }
    }
    if (!cameraMoved) {
      const level = state.getStatus().fireLevel;
      const fireFloor = effectiveScenario.fireFloor;
      if (fireFloor && level !== lastFireLevelRef.current) {
        const specs = spreadFloorSpecs(fireFloor, level);
        if (specs) focusFloorsRef.current(specs);
        else restoreFullViewRef.current();
      }
      lastFireLevelRef.current = level;
    }

    // 7. 剧本时长上限:到达自动暂停(防"时间无限长"——特情无限注入),
    //    事件树/态势保留供评估;只提示一次(pause 后 clock 不再走,不会重复)
    if (activeScenario.maxTicks && status === 'running' && clock >= activeScenario.maxTicks) {
      pause();
      setReportReady(true);
      showToast(`剧本时长结束(T+${activeScenario.maxTicks}),可生成演练评估报告`);
    }
  }, [clock, bus, state, recorder, runner, effectiveScenario, activeScenario, status, pause]);

  // ---- 启动 ----
  const handleStart = (): void => {
    // 防御:仅 idle 允许启动(running 时 Toolbar 已隐藏启动按钮,此处兜底防 race)
    if (status !== 'idle') return;
    // 重置(支持反复启动)
    bus.clear();
    recorder.clear();
    state.init(effectiveScenario);
    bus.seed(activeScenario.seedEvents);
    lastTickRef.current = -1;
    setReportReady(false);
    setEvalOpen(false);
    setEvalData(null);
    setEvalArchived(new Set());

    // ts=0 事件(engine 首 tick clock=1,ts=0 不会被 effect 捕获,在此显式记录)
    recordSeedEvents(recorder, bus.getEvents(0, 0));

    // 初始快照
    setSnapshot(state.getStatus());

    // 开场视角:聚焦着火层 + 相机飞去(场景未就绪时静默跳过)
    lastFireLevelRef.current = effectiveScenario.initialFireLevel ?? 1;
    if (effectiveScenario.fireFloor) {
      focusFloorsRef.current([effectiveScenario.fireFloor]);
    }

    // 启动时间轴(1× 起步)
    start();

    // 触发指挥 agent(异步 fire-and-forget,不阻塞 tick)
    // TODO(6.6): runAgent 失败仅 logger.warn,UI 无感知;后续注入 status/execution
    // 事件到 bus/recorder 让操作员看到「agent 触发失败」。
    void runner.triggerCommander(effectiveBriefing);
  };

  // ---- 停止 ----
  // 保留 recorder/snapshot:事件树供复盘,态势供评估报告(此前 stop 即清空,
  // 「结束后复盘整树」实际不可用;下一场 handleStart 会重新清空,不影响反复演练)。
  const handleStop = (): void => {
    stop();
    lastTickRef.current = -1;
    setReportReady(recorder.getAll().length > 0);
  };

  // ---- 演练评估(评估 agent:事件树 + 最终态势 → 报告;失败可重试) ----
  const runEvaluation = async (): Promise<void> => {
    setEvalOpen(true);
    setEvalLoading(true);
    setEvalData(null);
    const data = await evaluateViaAgent({
      kind: 'drill-plan',
      subject: `${activeScenario.name} 演练处置过程评估`,
      process: {
        scenario: { name: activeScenario.name, briefing: effectiveBriefing },
        finalStatus: state.getStatus(),
        events: recorder
          .getAll()
          .slice(0, 60)
          .map((n) => ({ ts: n.ts, type: n.type, label: n.label, detail: n.detail })),
      },
    });
    setEvalData(data);
    setEvalLoading(false);
  };

  const archiveImprovement = (imp: EvaluationImprovement, index: number): void => {
    addLibraryItem({
      kind: '改进措施',
      title: imp.content.length > 28 ? `${imp.content.slice(0, 28)}…` : imp.content,
      status: '待落地',
      summary: [imp.content],
      sourceDetail: `来源:演练对抗 · 演练评估(${activeScenario.name})→ ${imp.target}`,
    });
    setEvalArchived((prev) => new Set(prev).add(index));
    showToast('改进措施已回流预案库');
  };

  // ---- 演练事件导出(2026-08-19:检验演练合理性——时长/特情密度/结局) ----
  const exportDrill = (format: 'json' | 'md'): void => {
    const nodes = recorder.getAll();
    if (nodes.length === 0) {
      showToast('暂无演练事件可导出');
      return;
    }
    const input = {
      scenarioName: activeScenario.name,
      drillId: activeScenario.drillId,
      nodes,
      status: state.getStatus(),
    };
    const content = format === 'json' ? buildDrillJson(input) : buildDrillMarkdown(input);
    const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `演练导出-${activeScenario.id}-${format === 'json' ? 'events.json' : 'report.md'}`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(format === 'json' ? '已导出事件 JSON' : '已导出评估报告 Markdown');
  };

  // ---- 渲染 ----
  return (
    <div className="relative z-20 flex h-full flex-col bg-transparent">
      <div className="pointer-events-auto relative z-30">
        <DrillToolbar
          status={status}
          speed={speed}
          clock={clock}
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          onSelectScenario={setSelectedScenarioId}
          onStart={handleStart}
          onPause={pause}
          onResume={resume}
          onSetSpeed={setSpeed}
          onStop={handleStop}
        />
        {/* 灾情参数条(ref 4.1 手动/随机/按建筑生成);运行中禁用 */}
        <div className="mt-1">
          <DrillScenarioPanel
            baseScenario={activeScenario.scenario}
            disabled={status !== 'idle'}
            onApply={handleApplyScenario}
          />
        </div>
      </div>
      {/* 顶部工具栏需恢复 pointer-events(父层 pointer-events-none) */}

      <div className="pointer-events-none flex min-h-0 flex-1 gap-2 p-2">
        {/* 左侧占位：3D 场景已在 App 层作为背景渲染，鼠标穿透 */}
        <div className="relative min-w-0 flex-1" />

        {/* 右:事件树入口按钮 + 预案库入口 + 态势面板 */}
        <aside className="pointer-events-auto relative z-30 flex w-[360px] shrink-0 flex-col gap-2 overflow-y-auto">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTreeOpen(true)}
              className="flex min-w-0 flex-1 items-center justify-between rounded-lg border border-line bg-bg-panel/60 px-3 py-2 text-left transition hover:border-line-glow"
              title="Ctrl+K 唤出推演过程(实时增长 / 事后复盘)"
            >
              <span className="text-[13px] text-text-1">推演过程(实时 / 复盘)</span>
              <kbd className="rounded border border-line bg-bg-deep px-1.5 py-0.5 text-[10px] text-text-3">
                Ctrl+K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-violet/50 bg-bg-panel/60 px-3 py-2 text-[13px] text-violet transition hover:border-violet hover:bg-violet/10"
              title="预案库（演练评估归档 / 正式预案建档）"
            >
              <Library className="h-4 w-4" />
              预案库
            </button>
          </div>
          {/* 演练评估入口:停止后可用(事件树+最终态势喂评估 agent) */}
          {reportReady && status === 'idle' && (
            <button
              type="button"
              onClick={() => void runEvaluation()}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-300/50 bg-amber-300/10 px-3 py-2 text-[13px] font-medium text-amber-300 transition hover:bg-amber-300/20"
              title="由评估智能体对本场演练打分(响应/编成/战术/协同等维度)"
            >
              <Star className="h-4 w-4" />
              生成演练评估报告
            </button>
          )}
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-bg-panel/60">
            <div className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">
              态势
            </div>
            <DrillStatusPanel status={snapshot} />
          </div>
        </aside>
      </div>

      {/* 事件树悬浮面板(Ctrl+K 唤出,大尺寸;演练中实时增长 + 结束后复盘)。
          点节点:meta.location → 相机回溯到事件现场(设计文档「回溯」的视角版) */}
      <EventTreeOverlay
        recorder={recorder}
        open={treeOpen}
        onClose={() => setTreeOpen(false)}
        onExport={exportDrill}
        onNodeClick={(node) => {
          const spec = extractFloorSpec(
            typeof node.meta?.location === 'string' ? node.meta.location : undefined,
          );
          if (spec) focusFloorsRef.current([spec]);
        }}
      />

      {/* 演练评估报告(停止后「生成演练评估报告」唤出;改进措施可回流预案库) */}
      <DrillEvaluationDialog
        open={evalOpen}
        loading={evalLoading}
        data={evalData}
        scenarioName={activeScenario.name}
        onClose={() => setEvalOpen(false)}
        onRetry={() => void runEvaluation()}
        onArchive={archiveImprovement}
        archived={evalArchived}
      />

      {/* 预案库悬浮面板（默认关闭；归档条目 / 正式预案页签） */}
      <DraggablePanel
        panelId="drill-library"
        title="预案库"
        icon={Library}
        width={480}
        dock="right"
        defaultPos={{ x: 16, y: 16 }}
        height="min(560px, 76dvh)"
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
      >
        <PlanLibraryPanel />
      </DraggablePanel>
    </div>
  );
}
