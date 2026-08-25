// 演练对抗 · 对抗模式（二级界面全屏视图）
// 由 ScenarioPanel 挂载（Portal 到 body），confront-store + ConfrontDriver 驱动。
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Bot, Swords, TriangleAlert, Shuffle, ChevronDown,
  Check, PencilLine, Timer,
} from 'lucide-react';
import type { FetchState } from '@/mock/types';
import { useScene } from '@/components/SceneProvider';
import { storyIdsForFloorSpec, extractFloorSpecFromText } from '@/lib/floor-focus';
import {
  beginConfrontation,
  exitConfrontation,
  finishAgentActivity,
  respondAdjustment,
  finishConfrontationLocal,
  getConfrontationState,
  setEvaluating,
  startAgentActivity,
  subscribeConfrontation,
} from './confront-store';
import type { ConfrontationEvent, ConfrontationState } from './confront-store';
import { ConfrontDriver } from './confront-driver';
import type { ConfrontAppIds } from './confront-driver';
import { ConfrontAdapter } from './confront-adapter';
import { useConfrontationDriver } from './use-confront-driver';
import { AgentActivityStrip, ShuffleText, Dots, ScoreRing, TimelineNode } from './confrontation-uis';
import { ConfrontationReviewWorkspace } from './ConfrontationReviewWorkspace';
import { fmtT, randInt, deployLines } from './confront-helpers';
import { addSceneAction } from '@/mock/sceneLog';
import { addLibraryItem } from '@/mock/planLibrary';
import { showToast } from '@/components/Toast';
import DemoTag from '@/components/DemoTag';
import { BUILDINGS, FIRE_MATERIALS } from '@/mock/drill';
import {
  ADVERSARY_APP_ID,
  DRILL_COMMANDER_APP_ID,
  DRILL_PLANNER_APP_ID,
  EVALUATE_APP_ID,
} from '@/lib/agent-app-ids';
import {
  BUILDING_21_SCENE_ID,
  BUILDING_21_ID,
  BUILDING_21_DRILL_ID,
} from '@/drill/building-21';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

export default function ConfrontationPanel() {
  const [conf, setConf] = useState<ConfrontationState>(getConfrontationState());
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [nowSec, setNowSec] = useState(0);
  const [hlId, setHlId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastedGen = useRef(0);
  const openedReviewGen = useRef(0);
  const hlTimer = useRef<number | null>(null);

  const adapter = useMemo(() => new ConfrontAdapter(), []);
  const appIds = useMemo<ConfrontAppIds>(
    () => ({
      planner: DRILL_PLANNER_APP_ID,
      adversary: ADVERSARY_APP_ID || DRILL_PLANNER_APP_ID,
      commander: DRILL_COMMANDER_APP_ID,
    }),
    [],
  );

  // ---- 3D 联动:特情注入 → 楼层聚焦 + 飞向(经 ref 取最新句柄,回调保持稳定引用) ----
  const { tree: sceneTree, recipeStore, runtime: sceneRuntime, containerRef } = useScene();
  const sceneRef = useRef({ tree: sceneTree, recipeStore, runtime: sceneRuntime });
  sceneRef.current = { tree: sceneTree, recipeStore, runtime: sceneRuntime };

  // ---- 实时 3D 缩略区:开舱时把主画布容器迁进来(整个容器 div 迁移,ResizeObserver/事件系统
  // 都绑在容器上,自动适配缩略区尺寸且可交互);关舱时 insertBefore 精确复位。
  // 布局效应在提交阶段同步执行,无闪烁;React 不管理容器子节点,物理迁移安全。
  const slotRef = useRef<HTMLDivElement>(null);
  const [sceneMigrated, setSceneMigrated] = useState(false);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    const el = containerRef?.current;
    if (!slot || !el) return;
    const originParent = el.parentElement;
    const nextSibling = el.nextSibling;
    slot.appendChild(el);
    setSceneMigrated(true);
    return () => {
      if (originParent) {
        // React/HMR/连续开关舱可能已重建原兄弟节点;旧 nextSibling 不再属于
        // originParent 时直接 insertBefore 会抛 NotFoundError。锚点失效则安全追加。
        const anchor = nextSibling?.parentNode === originParent ? nextSibling : null;
        originParent.insertBefore(el, anchor);
      }
      setSceneMigrated(false);
    };
  }, [containerRef]);
  const onInjectScene = useCallback((evt: { emergency: string; location?: string }): void => {
    const { tree, recipeStore: store, runtime: rt } = sceneRef.current;
    if (!tree || !store || !rt || !evt.location) return;
    // agent location 多为自由文本("5F影院放映厅"),整串解析必 miss——先严格、落空再抽取楼层段
    let storyIds = storyIdsForFloorSpec(tree, evt.location);
    if (storyIds.length === 0) {
      const extracted = extractFloorSpecFromText(evt.location);
      if (extracted) storyIds = storyIdsForFloorSpec(tree, extracted);
    }
    if (storyIds.length === 0) return; // 楼层未命中(如特情在场景外)静默,不打断对抗
    const single = storyIds.length === 1;
    store.patchStructural({
      visibleStories: storyIds,
      detailLevel: 'full',
      yExtend: !single,
      hideDevices: !single,
    });
    // 镜头飞向楼层段整体中心(多层段合并包围盒,一次看全)
    if (rt && typeof rt.flyToObjects === 'function') {
      void rt.flyToObjects(storyIds).catch(() => {});
    } else {
      void rt.flyToObject(storyIds[0]).catch(() => {});
    }
  }, []);

  useConfrontationDriver({
    adapter,
    appIds,
    buildingId: BUILDING_21_ID,
    sceneId: BUILDING_21_SCENE_ID,
    drillId: BUILDING_21_DRILL_ID,
    onInjectScene,
  });

  useEffect(() => subscribeConfrontation(setConf), []);

  // T+ 秒级计时
  useEffect(() => {
    if (!conf.active || conf.status !== 'running' || !conf.startedAt) return;
    const iv = window.setInterval(() => {
      setNowSec(Math.max(0, Math.round((Date.now() - conf.startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(iv);
  }, [conf.active, conf.status, conf.startedAt]);

  // 归档 Toast（每局一次）
  useEffect(() => {
    if (conf.review?.archived && toastedGen.current !== conf.generation) {
      toastedGen.current = conf.generation;
      showToast('对抗演练已归档');
    }
  }, [conf.review, conf.generation]);

  useEffect(() => {
    if (conf.review && conf.status === 'finished' && openedReviewGen.current !== conf.generation) {
      openedReviewGen.current = conf.generation;
      setReviewOpen(true);
    }
  }, [conf.review, conf.status, conf.generation]);

  const injects = useMemo(() => conf.events.filter((e) => e.kind === 'inject'), [conf.events]);
  const adjusts = useMemo(() => conf.events.filter((e) => e.kind === 'adjust'), [conf.events]);
  const tSecNow = conf.status === 'running' ? nowSec : conf.events.length ? conf.events[conf.events.length - 1].tSec : 0;

  if (!conf.active) return null;

  const generateSeed = (flow: FetchState) => {
    if (flow === 'error') return { seedError: '灾情生成失败，请重试' };
    if (flow === 'empty') return { seedError: '暂无可演练建筑' };
    const b = BUILDINGS[Math.floor(Math.random() * BUILDINGS.length)];
    const above = b.floors.filter((f) => f.endsWith('F'));
    const floor = above[randInt(Math.min(2, above.length - 1), above.length - 1)] ?? '5F';
    return {
      seedScenario: {
        building: b.name,
        floor,
        material: FIRE_MATERIALS[Math.floor(Math.random() * FIRE_MATERIALS.length)],
        trapped: randInt(1, 8),
        seed: `#${Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0')}`,
      },
    };
  };

  const handleEnter = (flow: FetchState) => {
    setDemoState(flow);
    if (flow === 'loading') {
      beginConfrontation({ seedLoading: true, plannedTotal: randInt(3, 5) });
      return;
    }
    const seed = generateSeed(flow);
    beginConfrontation({
      seedScenario: seed.seedScenario,
      seedError: seed.seedError,
      plannedTotal: randInt(3, 5),
    });
  };

  const handleRespond = (eventId: string, adopted: boolean) => {
    const elapsedSec = conf.startedAt
      ? Math.max(0, Math.round((Date.now() - conf.startedAt) / 1000))
      : 0;
    respondAdjustment(eventId, adopted, elapsedSec);
    if (adopted) {
      addSceneAction({
        action: 'showRoute',
        target: '动态调整已采纳',
        params: { kind: 'adjust', color: '#22d3ee' },
        source: '预案引擎',
      });
    }
  };

  const finishConfrontation = async () => {
    if (conf.status !== 'running') return;
    const elapsedSec = conf.startedAt
      ? Math.max(0, Math.round((Date.now() - conf.startedAt) / 1000))
      : 0;

    const driver = new ConfrontDriver({
      adapter,
      appIds,
      buildingId: BUILDING_21_ID,
      sceneId: BUILDING_21_SCENE_ID,
      drillId: BUILDING_21_DRILL_ID,
      seed: conf.seedScenario,
      events: conf.events,
      getState: () => ({ events: conf.events, situation: conf.situation, deploy: conf.deploy }),
    });

    setEvaluating(true);
    startAgentActivity('evaluator', EVALUATE_APP_ID, '正在汇总完整时间线并执行七维评分');
    let review;
    try {
      review = await driver.finishEvaluate(elapsedSec);
    } catch {
      finishAgentActivity('error', '评估服务异常，请稍后重试');
      setEvaluating(false);
      showToast('评估服务异常，请稍后重试');
      return;
    }
    finishAgentActivity(
      'success',
      review.source === 'agent' ? '真实评估智能体已生成完整复盘' : '评估智能体未响应，规则降级复盘已生成',
    );
    finishConfrontationLocal(review, conf.events.length + 1, elapsedSec);

    addLibraryItem({
      kind: '对抗评估',
      title: `${conf.seedScenario?.building ?? '未指定建筑'} 对抗演练评估记录`,
      buildingName: conf.seedScenario?.building,
      score: review.score,
      status: review.archived ? '已归档' : '需修订',
      summary: [...review.comments],
      sourceDetail: `来源：演练对抗 · 对抗评估（${review.conclusion}${review.source === 'fallback' ? '，评估 agent 未响应 · 本地规则降级打分' : ''}，本局特情 ${injects.length} 条）`,
    });

    // 改进措施逐条回流预案库(与实战指挥战后评估同模式:待落地,自动关联同建筑演练预案)
    for (const imp of review.improvements ?? []) {
      addLibraryItem({
        kind: '改进措施',
        title: imp.content,
        buildingName: conf.seedScenario?.building,
        status: '待落地',
        summary: [imp.content],
        sourceDetail: `来源：演练对抗 · 对抗评估（${review.conclusion}）→ ${imp.target}`,
      });
    }

    driver.clearAll();

    showToast(review.archived ? '对抗演练已归档' : '评估完成');
  };

  const jumpTo = (evt: ConfrontationEvent) => {
    const el = scrollRef.current?.querySelector(`#conf-card-${evt.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHlId(evt.id);
      if (hlTimer.current) window.clearTimeout(hlTimer.current);
      hlTimer.current = window.setTimeout(() => setHlId(null), 1000);
    }
  };

  const statusCapsule =
    conf.status === 'running' ? (
      <span className="flex items-center gap-1.5 rounded-full border border-orange/60 px-2.5 py-0.5 text-[12px] text-orange">
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-orange"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        对抗中
      </span>
    ) : conf.status === 'finished' ? (
      <span className="rounded-full border border-green/60 px-2.5 py-0.5 text-[12px] text-green">已结束</span>
    ) : (
      <span className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-text-3">待机</span>
    );

  const agentStatus = conf.thinking
    ? '正在研判你的部署…'
    : conf.status === 'finished'
      ? `对抗结束，共制造 ${injects.length} 条特情`
      : injects.length > 0
        ? `已制造特情 ${injects.length} 条`
        : '待机';

  // 中央卡片序列：初步部署卡 + 特情/调整卡（新卡在上）
  const pairs: Array<{ inject: ConfrontationEvent; adjust?: ConfrontationEvent }> = injects
    .slice()
    .sort((a, b) => b.seq - a.seq)
    .map((inj) => ({ inject: inj, adjust: adjusts.find((a) => a.seq === inj.seq) }));

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-bg-deep"
      style={{
        backgroundImage:
          'linear-gradient(rgba(28,58,84,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(28,58,84,.18) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}
    >
      {/* 返回条 */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-bg-panel px-4">
        <button
          onClick={exitConfrontation}
          className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[12px] text-text-2 transition hover:border-line-glow hover:text-cyan"
        >
          <ArrowLeft className="h-3.5 w-3.5" />返回演练设置
        </button>
        <span className="text-[14px] font-bold text-text-1">演练对抗 · 对抗模式</span>
        <DemoTag />
        <span className="ml-auto">{statusCapsule}</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* 左栏：对抗态势卡 + 对抗智能体 */}
        <div className="flex w-[280px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-line p-3">
          {/* 对抗态势卡 */}
          <div className="rounded-lg border border-violet/50 bg-bg-panel p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-violet">
                <Bot className="h-3.5 w-3.5" />对抗态势卡
              </span>
              <div className="relative">
                <select
                  value={demoState}
                  onChange={(e) => handleEnter(e.target.value as FetchState)}
                  className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[11px] text-text-2 focus:border-line-glow focus:outline-none"
                  title="状态演示"
                >
                  {STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>状态演示：{o.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-3" />
              </div>
            </div>

            {conf.seedLoading ? (
              <div>
                <div className="mb-2 flex items-center gap-1 text-[12px] text-violet">
                  预案输出智能体抽取灾情中<Dots />
                </div>
                <div className="flex flex-col gap-2">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-violet/15" style={{ width: `${85 - i * 12}%` }} />
                  ))}
                </div>
              </div>
            ) : conf.seedError ? (
              <div className="flex flex-col items-center gap-2 py-3">
                <img src="/error-radar.svg" alt="" className="h-[70px] w-[90px] opacity-80" />
                <div className="text-center text-[12px] text-text-2">{conf.seedError}</div>
                <button
                  onClick={() => handleEnter('ok')}
                  className="rounded-md border border-cyan/60 px-3 py-1 text-[12px] text-cyan transition hover:bg-cyan/10"
                >
                  重试
                </button>
              </div>
            ) : conf.seedScenario ? (
              <motion.div
                key={conf.generation}
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.08 } } }}
                className="flex flex-col gap-1.5"
              >
                {[
                  ['着火建筑', conf.seedScenario.building],
                  ['着火楼层', conf.seedScenario.floor],
                  ['着火物质', conf.seedScenario.material],
                  ['当前被困', `${conf.situation.trappedCount} 人`],
                  ['当前火势', `${conf.situation.fireLevel} 级`],
                  ['设施损伤', `${conf.situation.damageLevel} 级`],
                ].map(([k, v]) => (
                  <motion.div
                    key={k}
                    variants={{ hidden: { x: -8, opacity: 0 }, show: { x: 0, opacity: 1 } }}
                    className="flex items-center justify-between text-[13px]"
                  >
                    <span className="text-text-3">{k}</span>
                    <ShuffleText text={v} className="font-mono font-bold text-text-1" />
                  </motion.div>
                ))}
                <motion.div
                  variants={{ hidden: { x: -8, opacity: 0 }, show: { x: 0, opacity: 1 } }}
                  className="font-mono text-[10px] text-text-3"
                >
                  seed: {conf.seedScenario.seed}
                </motion.div>
                <motion.div
                  variants={{ hidden: { x: -8, opacity: 0 }, show: { x: 0, opacity: 1 } }}
                  className="mt-1 rounded-md border border-line bg-bg-panel-2/60 p-2"
                >
                  <div className="mb-1 text-[12px] font-bold text-text-2">初步部署</div>
                  {(conf.deploy ?? deployLines(conf.seedScenario)).map((l) => (
                    <div key={l} className="text-[12px] leading-5 text-text-2">· {l}</div>
                  ))}
                </motion.div>
                <motion.button
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                  onClick={() => handleEnter('ok')}
                  disabled={conf.status !== 'running'}
                  className="mt-1 flex h-8 items-center justify-center gap-1.5 rounded-md border border-line text-[12px] text-text-2 transition hover:border-line-glow hover:text-cyan disabled:opacity-40"
                >
                  <Shuffle className="h-3.5 w-3.5" />重新随机
                </motion.button>
              </motion.div>
            ) : null}
          </div>

          {/* 智能对抗智能体形象卡 */}
          <motion.div
            animate={
              conf.thinking
                ? { boxShadow: ['0 0 0px rgba(249,115,22,0)', '0 0 16px rgba(249,115,22,.45)', '0 0 0px rgba(249,115,22,0)'] }
                : { boxShadow: '0 0 0px rgba(249,115,22,0)' }
            }
            transition={conf.thinking ? { duration: 1.4, repeat: Infinity } : { duration: 0.3 }}
            className="rounded-lg border border-orange/60 bg-bg-panel p-3"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: 'linear-gradient(135deg, #f97316, #b45309)' }}
              >
                <Swords className="text-bg-deep" style={{ width: 18, height: 18 }} />
              </span>
              <div>
                <div className="text-[13px] font-bold text-orange">智能对抗智能体</div>
                <div className="flex items-center text-[12px] text-text-2">
                  {conf.thinking ? (
                    <>正在研判你的部署<Dots className="text-orange" /></>
                  ) : (
                    agentStatus
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2 text-[11px] leading-4 text-text-3">
              将按时间线制造突发特情，检验预案韧性
            </div>
          </motion.div>

          {/* 结束对抗并评估 */}
          <div className="mt-auto">
            <button
              onClick={() => void finishConfrontation()}
              disabled={conf.status !== 'running' || injects.length < 2 || conf.evaluating}
              className={`h-10 w-full rounded-md text-[14px] font-bold transition ${
                conf.status === 'running' && injects.length >= 2 && !conf.evaluating
                  ? 'bg-cyan text-bg-deep hover:brightness-110 hover:shadow-[0_0_16px_rgba(34,211,238,.45)] active:brightness-90'
                  : 'cursor-not-allowed bg-bg-panel-2 text-text-3'
              }`}
            >
              {conf.evaluating ? '评估中…' : '结束对抗并评估'}
            </button>
            {conf.status === 'running' && injects.length < 2 && (
              <div className="mt-1.5 text-center text-[11px] text-text-3">至少经历 2 条特情后可评估</div>
            )}
          </div>
        </div>

        {/* 中央推演主区 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 灾情摘要条 */}
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4 text-[13px]">
            {conf.seedScenario ? (
              <>
                <span className="text-text-1 font-bold">{conf.seedScenario.building}</span>
                <span className="rounded border border-orange/50 px-1.5 py-px text-[11px] text-orange">
                  {conf.seedScenario.floor} 着火
                </span>
                <span className="rounded border border-red/50 px-1.5 py-px text-[11px] text-red">
                  火势 {conf.situation.fireLevel} 级
                </span>
                <span className="text-[12px] text-text-3">
                  {conf.seedScenario.material} · 被困 {conf.situation.trappedCount} 人
                  {conf.situation.wind ? ` · 风向 ${conf.situation.wind}` : ''}
                </span>
              </>
            ) : (
              <span className="text-text-3 text-[12px]">正在生成初步灾情…</span>
            )}
            <span className="ml-auto flex items-center gap-1.5 font-num text-[13px] text-cyan">
              <Timer className="h-3.5 w-3.5" />{fmtT(tSecNow)}
            </span>
          </div>

          <AnimatePresence initial={false}>
            {conf.agentActivity && <AgentActivityStrip activity={conf.agentActivity} />}
          </AnimatePresence>

          {/* 实时 3D 缩略区:主画布容器经 slot 迁入(useLayoutEffect);场景未就绪时回落 SVG 占位 */}
          <div
            ref={slotRef}
            className="relative h-[180px] shrink-0 overflow-hidden border-b border-line"
            style={{
              backgroundImage:
                'linear-gradient(rgba(28,58,84,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(28,58,84,.25) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
            {!sceneMigrated && (
              <>
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 180" preserveAspectRatio="none">
                  <motion.polyline
                    points="40,150 180,110 320,120 460,60 560,40"
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2"
                    strokeLinecap="round"
                    initial={{ pathLength: 0, opacity: 0.4 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    style={{ filter: 'drop-shadow(0 0 6px rgba(34,211,238,.7))' }}
                  />
                  <motion.polyline
                    points="40,160 200,140 380,150 540,100"
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="1.5"
                    strokeDasharray="6 5"
                    initial={{ pathLength: 0, opacity: 0.3 }}
                    animate={{ pathLength: 1, opacity: 0.8 }}
                    transition={{ duration: 1.4, ease: 'easeOut', delay: 0.3 }}
                    style={{ filter: 'drop-shadow(0 0 5px rgba(249,115,22,.6))' }}
                  />
                </svg>
                <span className="absolute bottom-2 left-3 text-[11px] text-text-3">3D 场景接入中…</span>
              </>
            )}
            {sceneMigrated && (
              <span className="pointer-events-none absolute bottom-2 left-3 z-10 rounded bg-bg-deep/70 px-1.5 py-px text-[11px] text-text-3">
                实时场景 · 承接本局场景动作（可拖拽旋转/缩放）
              </span>
            )}
          </div>

          {/* 特情-调整卡对滚动区（新卡在上） */}
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
            {!conf.seedScenario && !conf.seedError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
                <div className="text-[13px] text-text-2">正在生成初步灾情…</div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <AnimatePresence initial={false}>
                  {pairs.map(({ inject, adjust }) => (
                    <motion.div
                      key={inject.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col gap-2"
                    >
                      {/* 特情卡 */}
                      <motion.div
                        id={`conf-card-${inject.id}`}
                        initial={{ scale: 0.96 }}
                        animate={{ scale: 1, boxShadow: ['0 0 18px rgba(249,115,22,.35)', '0 0 4px rgba(249,115,22,.12)'] }}
                        transition={{ duration: 1 }}
                        className={`rounded-lg border border-orange/60 bg-orange/10 p-3 ${hlId === inject.id ? 'ring-2 ring-orange' : ''}`}
                      >
                        <div className="flex items-center gap-2">
                          <TriangleAlert className="h-4 w-4 shrink-0 text-orange" />
                          <span className="text-[13px] font-bold text-orange">
                            ⚠ 突发特情 #{inject.seq}：
                          </span>
                          {inject.specialType && (
                            <span className="rounded border border-violet/60 px-1 py-px font-mono text-[10px] text-violet">
                              {inject.specialType}
                            </span>
                          )}
                          {inject.location && (
                            <span className="rounded border border-orange/50 bg-orange/10 px-1 py-px font-mono text-[11px] text-orange">
                              {inject.location}
                            </span>
                          )}
                          <span className="ml-auto font-mono text-[11px] text-text-3">{fmtT(inject.tSec)}</span>
                          <span className="rounded border border-orange/60 px-1 py-px text-[11px] text-orange">对抗智能体</span>
                        </div>
                        <div className="mt-1.5 text-[13px] leading-5 text-text-1">{inject.emergency}</div>
                        {inject.delta && (
                          <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-amber">
                            {inject.delta.fireLevelDelta != null && inject.delta.fireLevelDelta !== 0 && <span>火势 {inject.delta.fireLevelDelta >= 0 ? '+' : ''}{inject.delta.fireLevelDelta}</span>}
                            {inject.delta.trappedDelta != null && inject.delta.trappedDelta !== 0 && <span>被困 {inject.delta.trappedDelta >= 0 ? '+' : ''}{inject.delta.trappedDelta}</span>}
                            {inject.delta.damageDelta != null && inject.delta.damageDelta !== 0 && <span>损伤 {inject.delta.damageDelta >= 0 ? '+' : ''}{inject.delta.damageDelta}</span>}
                            {inject.delta.wind && <span>风向→{inject.delta.wind}</span>}
                          </div>
                        )}
                      </motion.div>

                      {/* 动态调整卡 / 响应骨架 */}
                      {adjust ? (
                        <motion.div
                          id={`conf-card-${adjust.id}`}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          className={`ml-5 rounded-lg border border-cyan/50 bg-cyan/5 p-3 ${hlId === adjust.id ? 'ring-2 ring-cyan' : ''}`}
                        >
                          <div className="text-[13px] font-bold text-cyan">↳ 部署/战法动态调整：</div>
                          <ul className="mt-1 flex flex-col gap-1">
                            {adjust.adjustments?.map((a) => (
                              <li key={a} className="flex gap-1.5 text-[13px] leading-5 text-text-2">
                                <span className="text-cyan">·</span>{a}
                              </li>
                            ))}
                          </ul>
                          <div className="mt-2 flex items-center gap-2">
                            {adjust.adopted === undefined && conf.status === 'running' ? (
                              <>
                                <button
                                  onClick={() => handleRespond(adjust.id, true)}
                                  className="flex h-7 items-center gap-1 rounded-md border border-green/60 px-2 text-[12px] text-green transition hover:bg-green/10"
                                >
                                  <Check className="h-3 w-3" />采纳调整
                                </button>
                                <button
                                  onClick={() => {
                                    handleRespond(adjust.id, false);
                                    showToast('已记录人工决策');
                                  }}
                                  className="flex h-7 items-center gap-1 rounded-md border border-line px-2 text-[12px] text-text-2 transition hover:border-line-glow hover:text-cyan"
                                >
                                  <PencilLine className="h-3 w-3" />人工改派
                                </button>
                              </>
                            ) : adjust.adopted !== undefined ? (
                              <span
                                className={`rounded-full border px-2 py-px text-[11px] ${
                                  adjust.adopted ? 'border-green/60 text-green' : 'border-amber/60 text-amber'
                                }`}
                              >
                                {adjust.adopted ? '已采纳' : '已人工改派'} · 用时 {adjust.respondedWithinSec}s
                              </span>
                            ) : (
                              <span className="rounded-full border border-red/50 px-2 py-px text-[11px] text-red">未响应</span>
                            )}
                          </div>
                        </motion.div>
                      ) : (
                        conf.status === 'running' && (
                          <div className="ml-5 rounded-lg border border-cyan/30 bg-bg-panel-2/60 p-3">
                            <div className="mb-1.5 h-3.5 w-36 animate-pulse rounded bg-cyan/15" />
                            <div className="h-3 animate-pulse rounded bg-bg-panel-2" />
                            <div className="mt-1.5 flex items-center text-[12px] text-cyan">
                              演练指挥官响应中<Dots />
                            </div>
                          </div>
                        )
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {/* 初步部署卡（violet 描边，展开版） */}
                {conf.seedScenario && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-lg border border-violet/60 bg-violet/5 p-3"
                  >
                    <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-violet">
                      <Bot className="h-3.5 w-3.5" />初步部署（预案输出智能体）
                      <span className="ml-auto font-mono text-[11px] text-text-3">T+00:00</span>
                    </div>
                    <ul className="flex flex-col gap-1">
                      {(conf.deploy ?? deployLines(conf.seedScenario)).map((l) => (
                        <li key={l} className="flex gap-1.5 text-[13px] leading-5 text-text-2">
                          <span className="text-violet">·</span>{l}
                        </li>
                      ))}
                      {/* agent 部署未回时补充静态处置要点;真实输出已含动作与依据,不重复追加 */}
                      {!conf.deploy && conf.status === 'running' && (
                        <li className="flex gap-1.5 text-[12px] leading-5 text-violet/80">
                          <span className="text-violet">·</span>
                          预案输出智能体生成中<Dots className="text-violet" />
                        </li>
                      )}
                      {!conf.deploy && (
                        <>
                          <li className="flex gap-1.5 text-[13px] leading-5 text-text-2">
                            <span className="text-violet">·</span>
                            {`处置要点：到场即设前沿指挥部，先行侦察 ${conf.seedScenario.floor} 火点与被困人员（${conf.seedScenario.trapped} 人），出 2 支水枪堵截蔓延`}
                          </li>
                          <li className="flex gap-1.5 text-[13px] leading-5 text-text-2">
                            <span className="text-violet">·</span>
                            安全管控：设立安全员全程监测，内攻每 15 分钟轮换
                          </li>
                        </>
                      )}
                    </ul>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 右栏：对抗时间轴 + 评估卡 */}
        <div className="flex w-[300px] shrink-0 flex-col border-l border-line">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="text-[13px] font-bold text-text-1">对抗过程时间轴</span>
            <DemoTag />
            <span className="ml-auto font-num text-[24px] font-bold leading-7 text-cyan">{fmtT(tSecNow)}</span>
          </div>

          {/* 时间轴节点 */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="relative ml-2 border-l-2 border-line pl-4">
              {/* 开局节点（violet） */}
              {conf.seedScenario && (
                <TimelineNode
                  color="#a78bfa"
                  badge="预案输出智能体"
                  tSec={0}
                  text={`随机生成初步灾情：${conf.seedScenario.building} ${conf.seedScenario.floor}`}
                  pulse={conf.events.length === 0 && conf.status === 'running'}
                  onClick={() => scrollRef.current?.scrollTo({ top: 99999, behavior: 'smooth' })}
                />
              )}
              {conf.events.map((e, i) => {
                const color =
                  e.kind === 'inject' ? '#f97316' : e.kind === 'adjust' ? '#22d3ee' : '#34d399';
                const badge =
                  e.kind === 'inject' ? '对抗智能体' : e.kind === 'adjust' ? '动态调整' : '评估';
                const text =
                  e.kind === 'inject'
                    ? `突发特情 #${e.seq}`
                    : e.kind === 'adjust'
                      ? `部署/战法调整 #${e.seq}${e.adopted === true ? ' · 已采纳' : e.adopted === false ? ' · 人工改派' : ''}`
                      : e.emergency;
                const isLatest = i === conf.events.length - 1 && conf.status === 'running';
                return (
                  <TimelineNode
                    key={e.id}
                    color={color}
                    badge={badge}
                    tSec={e.tSec}
                    text={text}
                    pulse={isLatest}
                    onClick={() => jumpTo(e)}
                  />
                );
              })}
            </div>
          </div>

          {/* 评估区 */}
          <div className="shrink-0 border-t border-line p-3">
            {conf.evaluating && (
              <div className="rounded-lg border border-violet/40 bg-bg-panel-2/60 p-3">
                <div className="mb-2 h-4 w-24 animate-pulse rounded bg-violet/20" />
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => <div key={i} className="h-3.5 animate-pulse rounded bg-bg-panel-2" />)}
                </div>
                <div className="mt-2 text-[12px] text-violet">对抗评估中，生成评估结论…</div>
              </div>
            )}
            {conf.review && !conf.evaluating && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-violet/60 bg-violet/5 p-3"
              >
                <div className="flex items-center gap-3">
                  <ScoreRing score={conf.review.score} pass={conf.review.archived} />
                  <div className="min-w-0">
                    <div className="text-[11px] text-text-3">综合评估 · {conf.review.score}/100</div>
                    <div className={`line-clamp-2 text-[13px] font-bold leading-5 ${conf.review.archived ? 'text-green' : 'text-amber'}`}>
                      {conf.review.conclusion}
                    </div>
                    <span className={`mt-1 inline-flex rounded border px-1 py-px text-[10px] ${conf.review.source === 'agent' ? 'border-green/50 bg-green/10 text-green' : 'border-amber/50 bg-amber/10 text-amber'}`}>
                      {conf.review.source === 'agent' ? '真实评估智能体' : '降级评估 · 规则打分'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setReviewOpen(true)}
                  className="mt-3 h-9 w-full rounded-md bg-violet text-[12px] font-bold text-white transition hover:brightness-110 hover:shadow-[0_0_14px_rgba(124,58,237,.45)]"
                >
                  查看完整评估复盘
                </button>
              </motion.div>
            )}
            {conf.status === 'finished' && (
              <button
                onClick={exitConfrontation}
                className="mt-2 h-9 w-full rounded-md border border-line text-[13px] text-text-2 transition hover:border-line-glow hover:text-cyan"
              >
                返回演练设置
              </button>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {reviewOpen && conf.review && (
          <ConfrontationReviewWorkspace
            review={conf.review}
            events={conf.events}
            building={conf.seedScenario?.building ?? '未指定建筑'}
            onClose={() => setReviewOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
