'use client';

/**
 * DrillView — 演练对抗大屏(6.5 集成)。
 *
 * 布局(plan §5.5):
 * - 顶部条(DrillToolbar):标题 + 剧本选择 + 启动/暂停/恢复/1×/5×/停止 + T+{clock}
 * - 主区:左 3D 场景(使用全局 SceneProvider,不重新加载)
 *   + 右栏(上 EventTree / 下 DrillStatusPanel)
 *
 * 推演引擎由 ConfrontationPanel(对抗舱)接管。
 * 旧引擎 tick 编排已移除——bus/state/recorder/runner 不再参与渲染循环。
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.5
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RealSceneView } from '@/components/RealSceneView';
import { useScene } from '@/components/SceneProvider';
import { showToast } from '@/components/Toast';
import { EventTreeOverlay } from '@/drill/EventTreeOverlay';
import { DrillToolbar } from '@/drill/DrillToolbar';
import { DrillStatusPanel } from '@/drill/DrillStatusPanel';
import DrillScenarioPanel from '@/components/drill/DrillScenarioPanel';
import type { ScenarioApplyResult } from '@/components/drill/DrillScenarioPanel';
import { DrillEvaluationDialog } from '@/drill/DrillEvaluationDialog';
import type { EvaluationData, EvaluationImprovement } from '@/lib/agent-evaluate';
import { buildDrillJson, buildDrillMarkdown } from '@/lib/drill/drill-export';
import type { DisasterStatus } from '@/lib/drill/disaster-state';
import { DrillRecorder } from '@/lib/drill/drill-recorder';
import type { TreeNode } from '@/lib/drill/drill-recorder';
import { addLibraryItem } from '@/mock/planLibrary';
import DraggablePanel from '@/components/DraggablePanel';
import PlanLibraryPanel from '@/components/panels/PlanLibraryPanel';
import { Library, Star, Swords } from 'lucide-react';
import {
  DEFAULT_SCENARIO_ID,
  getScenario,
  getDefaultScenario,
  listScenarios,
  type DrillScenarioDef,
} from '@/drill/scenarios';
import { storyIdsForFloorSpec } from '@/lib/floor-focus';
import ConfrontationPanel from '@/drill/confrontation/ConfrontationPanel';
import type { Speed } from '@/lib/drill/timeline-engine';

// ============================================================
// DrillView
// ============================================================

export default function DrillView() {
  // ---- 单例 ----
  const recorderRef = useRef<DrillRecorder | null>(null);
  if (recorderRef.current === null) recorderRef.current = new DrillRecorder();
  const recorder = recorderRef.current;

  // ---- 剧本选择 ----
  const scenarios = useMemo(() => listScenarios(), []);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(DEFAULT_SCENARIO_ID);
  const activeScenario: DrillScenarioDef =
    getScenario(selectedScenarioId) ?? getDefaultScenario();

  // ---- 自定义灾情参数 ----
  const [customScenario, setCustomScenario] = useState<Parameters<typeof DrillScenarioPanel>[0]['baseScenario'] | null>(null);
  const [customBriefing, setCustomBriefing] = useState<string | null>(null);
  const handleApplyScenario = (r: ScenarioApplyResult): void => {
    setCustomScenario(r.scenario);
    setCustomBriefing(r.briefing);
    showToast('灾情参数已应用,启动演练时生效');
  };

  // ---- 对抗舱开关 ----
  const [confOpen, setConfOpen] = useState(false);

  // ---- 显示状态(旧引擎兼容占位,对抗模式不使用) ----
  const [clock, setClock] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [status, setStatus] = useState<'idle' | 'running'>('idle');

  // ---- 事件树 / 预案库 / 评估面板 ----
  const [treeOpen, setTreeOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [evalOpen, setEvalOpen] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalData, setEvalData] = useState<EvaluationData | null>(null);
  const [evalArchived, setEvalArchived] = useState<ReadonlySet<number>>(new Set());

  // ---- 3D/相机联动(事件树节点点击→相机回溯) ----
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

  // ---- Ctrl+K 唤出事件树悬浮面板 ----
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

  // ---- 种子事件记录(兼容旧引擎格式) ----
  const recordSeedEventsRef = useRef<((events: TreeNode[]) => void) | null>(null);
  recordSeedEventsRef.current = (_events: TreeNode[]): void => { /* no-op —对抗舱接管 */ };

  // ---- 演练启动 ----
  const handleStart = (): void => {
    if (status !== 'idle') return;
    recorder.clear();
    setClock(0);
    setReportReady(false);
    setEvalOpen(false);
    setEvalData(null);
    setEvalArchived(new Set());
    // ts=0 事件记录
    // (实际种子事件由对抗舱接管,此处保留空调用以兼容旧流程)
    setStatus('running');
  };

  // ---- 演练停止 ----
  const handleStop = (): void => {
    setStatus('idle');
    setClock(0);
    setReportReady(recorder.getAll().length > 0);
  };

  // ---- 演练评估(暂不实现,对抗舱评估由其内部处理) ----
  const runEvaluation = async (): Promise<void> => {
    setEvalOpen(true);
    setEvalLoading(true);
    setEvalData(null);
    // TODO: 对接对抗舱评估结果或旧引擎事件数据
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

  // ---- 演练事件导出 ----
  const exportDrill = (format: 'json' | 'md'): void => {
    const nodes = recorder.getAll();
    if (nodes.length === 0) {
      showToast('暂无演练事件可导出');
      return;
    }
    const input: Parameters<typeof buildDrillJson>[0] = {
      scenarioName: activeScenario.name,
      drillId: activeScenario.drillId,
      nodes,
      status: null,
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
          onPause={() => {}}
          onResume={() => {}}
          onSetSpeed={setSpeed}
          onStop={handleStop}
        />
        {/* 灾情参数条 */}
        <div className="mt-1">
          <DrillScenarioPanel
            baseScenario={activeScenario.scenario}
            disabled={status !== 'idle'}
            onApply={handleApplyScenario}
          />
        </div>
      </div>

      <div className="pointer-events-none flex min-h-0 flex-1 gap-2 p-2">
        {/* 左侧占位：3D 场景已在 App 层作为背景渲染，鼠标穿透 */}
        <div className="relative min-w-0 flex-1" />

        {/* 右栏 */}
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

          {/* 进入对抗模式按钮 */}
          {!confOpen && status === 'idle' && (
            <button
              type="button"
              onClick={() => {
                setConfOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-orange/60 bg-orange/10 px-3 py-2 text-[13px] font-medium text-orange transition hover:bg-orange/20"
              title="进入演练对抗模式"
            >
              <Swords className="h-4 w-4" />
              进入对抗模式
            </button>
          )}

          {/* 演练评估入口:停止后可用 */}
          {reportReady && status !== 'running' && (
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
            <DrillStatusPanel status={null} />
          </div>
        </aside>
      </div>

      {/* 事件树悬浮面板 */}
      <EventTreeOverlay
        recorder={recorder}
        open={treeOpen}
        onClose={() => setTreeOpen(false)}
        onExport={exportDrill}
        onNodeClick={(node) => {
          const spec = typeof node.meta?.location === 'string' ? node.meta.location : undefined;
          if (spec) focusFloors([spec]);
        }}
      />

      {/* 演练评估报告 */}
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

      {/* 预案库悬浮面板 */}
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

      {/* 对抗舱(Portal 到 body,active=false 时返回 null) */}
      {confOpen && <ConfrontationPanel />}
    </div>
  );
}
