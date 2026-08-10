'use client';

/**
 * DrillView — 演练对抗大屏(6.5 集成)。
 *
 * 布局(plan §5.5):
 * - 顶部条(DrillToolbar):标题 + 剧本选择 + 启动/暂停/恢复/1×/5×/停止 + T+{clock}
 * - 主区:左 3D 场景(RealSceneView,scene_id=BUILDING_21_SCENE_ID)
 *   + 右栏(上 EventTree / 下 DrillStatusPanel)
 *
 * tick 编排(useEffect[clock] 驱动,避免与 useTimeline 内部 onTick 冲突):
 * 每 tick → bus.getEvents(clock,clock) → state.tick(evs) → recorder.record(evs) → runner.onTick(clock)
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.5
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { RealSceneView } from '@/components/RealSceneView';
import { EventTreeOverlay } from '@/drill/EventTreeOverlay';
import { DrillToolbar } from '@/drill/DrillToolbar';
import { DrillStatusPanel } from '@/drill/DrillStatusPanel';
import { useTimeline } from '@/drill/hooks/use-timeline';
import { useAgentRunner } from '@/drill/hooks/use-agent-runner';
import { EventBus, type DrillEvent } from '@/lib/drill/event-bus';
import { DisasterState, type DisasterStatus } from '@/lib/drill/disaster-state';
import { DrillRecorder } from '@/lib/drill/drill-recorder';
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

/** 将种子/剧本事件记录到 DrillRecorder(事件树展示用)。 */
function recordSeedEvents(recorder: DrillRecorder, events: readonly DrillEvent[]): void {
  for (const ev of events) {
    recorder.record({
      ts: ev.ts,
      type: ev.type,
      label: eventLabel(ev),
      detail: eventDetail(ev),
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
    adversaryEveryNTicks: activeScenario.adversaryEveryNTicks, // 剧本配置;MVP=0
    scenarioKey: activeScenario.id, // 切换剧本时重建 runner,确保新 appId/sceneId 生效
  });

  // ---- 显示状态 ----
  const [snapshot, setSnapshot] = useState<DisasterStatus | null>(null);
  /** 事件树悬浮面板开关(Ctrl+K 唤出/切换,ESC 关闭)。 */
  const [treeOpen, setTreeOpen] = useState(false);
  /** 上次处理过的 tick,防止 resume 时同 clock 重复处理。 */
  const lastTickRef = useRef(-1);

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
    // 4. 对抗 agent 触发检查(adversaryEveryNTicks=0 时 no-op)
    runner.onTick(clock);
    // 5. 刷新态势面板
    setSnapshot(state.getStatus());
  }, [clock, bus, state, recorder, runner]);

  // ---- 启动 ----
  const handleStart = (): void => {
    // 防御:仅 idle 允许启动(running 时 Toolbar 已隐藏启动按钮,此处兜底防 race)
    if (status !== 'idle') return;
    // 重置(支持反复启动)
    bus.clear();
    recorder.clear();
    state.init(activeScenario.scenario);
    bus.seed(activeScenario.seedEvents);
    lastTickRef.current = -1;

    // ts=0 事件(engine 首 tick clock=1,ts=0 不会被 effect 捕获,在此显式记录)
    recordSeedEvents(recorder, bus.getEvents(0, 0));

    // 初始快照
    setSnapshot(state.getStatus());

    // 启动时间轴(1× 起步)
    start();

    // 触发指挥 agent(异步 fire-and-forget,不阻塞 tick)
    // TODO(6.6): runAgent 失败仅 logger.warn,UI 无感知;后续注入 status/execution
    // 事件到 bus/recorder 让操作员看到「agent 触发失败」。
    void runner.triggerCommander(activeScenario.briefing);
  };

  // ---- 停止 ----
  const handleStop = (): void => {
    stop();
    bus.clear();
    recorder.clear();
    lastTickRef.current = -1;
    setSnapshot(null);
  };

  // ---- 渲染 ----
  return (
    <div className="flex h-full flex-col">
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

      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* 左:3D 场景(事件树移出右栏后扩大)*/}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg border border-line">
          <RealSceneView sceneId={activeScenario.sceneId} />
        </div>

        {/* 右:事件树入口按钮 + 态势面板(事件树本体改 Ctrl+K 悬浮唤出)*/}
        <aside className="flex w-[360px] shrink-0 flex-col gap-2 overflow-y-auto">
          <button
            type="button"
            onClick={() => setTreeOpen(true)}
            className="flex items-center justify-between rounded-lg border border-line bg-bg-panel/60 px-3 py-2 text-left transition hover:border-line-glow"
            title="Ctrl+K 唤出事件树(实时增长 / 事后复盘)"
          >
            <span className="text-[13px] text-text-1">事件树(实时 / 复盘)</span>
            <kbd className="rounded border border-line bg-bg-deep px-1.5 py-0.5 text-[10px] text-text-3">
              Ctrl+K
            </kbd>
          </button>
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-bg-panel/60">
            <div className="border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">
              态势
            </div>
            <DrillStatusPanel status={snapshot} />
          </div>
        </aside>
      </div>

      {/* 事件树悬浮面板(Ctrl+K 唤出,大尺寸;演练中实时增长 + 结束后复盘)*/}
      <EventTreeOverlay
        recorder={recorder}
        open={treeOpen}
        onClose={() => setTreeOpen(false)}
      />
    </div>
  );
}
