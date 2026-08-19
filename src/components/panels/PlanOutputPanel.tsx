import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Bot, ChevronDown, RefreshCw, ShieldAlert, ClipboardCheck, TriangleAlert,
  Gauge, Users, Swords, ListOrdered, Route, ShieldCheck, Stamp,
} from 'lucide-react';
import type { FetchState } from '@/mock/types';
import { buildDrillPlan, evaluatePlan, pickEmergency, renderEmergency } from '@/mock/drill';
import type { EmergencyEvent, EvaluationResult } from '@/mock/drill';
import { evaluateViaAgent } from '@/lib/agent-evaluate';
import {
  beginEvaluate, beginGenerate, finishEvaluate, finishGenerate,
  getConfrontationState, getDrillState, injectEmergency, reopenConfrontation,
  subscribeConfrontation, subscribeDrill,
} from '@/mock/drillStore';
import type { ConfrontationState, DrillState } from '@/mock/drillStore';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';
import PanelStateView from '@/components/PanelStateView';
import DemoTag from '@/components/DemoTag';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

const GROUP_COUNT = 6;
const GROUP_META = [
  { key: 'level', title: '响应等级', icon: Gauge },
  { key: 'forces', title: '力量编成', icon: Users },
  { key: 'tactics', title: '战术战法', icon: Swords },
  { key: 'keyPoints', title: '处置要点', icon: ListOrdered },
  { key: 'routes', title: '进攻疏散路线', icon: Route },
  { key: 'safety', title: '安全管控', icon: ShieldCheck },
] as const;

/** 分组出现时同步写入场景动作（source=预案引擎） */
function writeGroupSceneActions(groupKey: string, s: NonNullable<DrillState['scenario']>) {
  if (groupKey === 'level') {
    addSceneAction({ action: 'switchFloor', target: `${s.buildingName} ${s.floor}`, params: { floor: s.floor }, source: '预案引擎' });
  }
  if (groupKey === 'routes') {
    addSceneAction({ action: 'showRoute', target: `进攻路线（cyan）：首层东门 → 消防电梯 → ${s.floor}`, params: { kind: 'attack', color: '#22d3ee' }, source: '预案引擎' });
    addSceneAction({ action: 'showRoute', target: `疏散路线（green）：${s.floor} → 防烟楼梯间 B → 首层北侧集结点`, params: { kind: 'evacuate', color: '#34d399' }, source: '预案引擎' });
  }
  if (groupKey === 'safety') {
    addSceneAction({ action: 'batchHighlight', target: `${s.floor} 关键设备（消火栓×4、喷淋阀×2、防火门×3）`, params: { floor: s.floor, count: 9 }, source: '预案引擎' });
  }
}

/** 打字机文本：逐字 ~20 字/帧；瞬显模式整段淡入 */
function TypewriterText({ text, enabled, className = '' }: { text: string; enabled: boolean; className?: string }) {
  const [n, setN] = useState(enabled ? 0 : text.length);
  useEffect(() => {
    if (!enabled) { setN(text.length); return; }
    setN(0);
    const iv = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) { window.clearInterval(iv); return v; }
        return v + 2;
      });
    }, 100);
    return () => window.clearInterval(iv);
  }, [text, enabled]);
  const typing = enabled && n < text.length;
  return (
    <motion.span
      initial={enabled ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className={className}
    >
      {text.slice(0, n)}
      {typing && <span className="ml-px inline-block h-[1em] w-px translate-y-[2px] animate-pulse bg-cyan" />}
    </motion.span>
  );
}

function GroupCard({
  index, children,
}: { index: number; children: React.ReactNode }) {
  const meta = GROUP_META[index];
  const Icon = meta.icon;
  const level = meta.key === 'level';
  return (
    <motion.div
      variants={{ hidden: { x: -8, opacity: 0 }, show: { x: 0, opacity: 1 } }}
      className={`rounded-lg border bg-bg-panel-2/60 p-3 ${level ? 'border-orange/50' : 'border-line'}`}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${level ? 'text-orange' : 'text-cyan'}`} />
        <span className="text-[13px] font-bold text-text-1">{meta.title}</span>
        {level && (
          <span className="rounded border border-orange/60 px-1 py-px text-[11px] leading-4 text-orange">等级徽标</span>
        )}
      </div>
      {children}
    </motion.div>
  );
}

function ScoreRing({ score, pass }: { score: number; pass: boolean }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16">
      <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#1c3a54" strokeWidth="5" />
        <motion.circle
          cx="32" cy="32" r={r} fill="none"
          stroke={pass ? '#34d399' : '#ef4444'} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-num text-[16px] font-bold text-text-1">
        {score}
      </div>
    </div>
  );
}

export default function PlanOutputPanel() {
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [drill, setDrill] = useState<DrillState>(getDrillState());
  const [confront, setConfront] = useState<ConfrontationState>(getConfrontationState());
  const [typewriter, setTypewriter] = useState(true);
  const [revealed, setRevealed] = useState(0);
  const toastedGen = useRef(0);
  const reduced = useReducedMotion();

  useEffect(() => subscribeDrill(setDrill), []);
  useEffect(() => subscribeConfrontation(setConfront), []);

  const { phase, plan, scenario, emergencies, evaluating, evaluation, generation } = drill;
  const doneRevealing = phase === 'done' && revealed >= GROUP_COUNT;

  // 分组流式输出：每 500ms 出现一组，并同步写场景动作
  useEffect(() => {
    if (phase !== 'done' || !plan || !scenario) { setRevealed(0); return; }
    setRevealed(0);
    let i = 0;
    const iv = window.setInterval(() => {
      i += 1;
      setRevealed(i);
      writeGroupSceneActions(GROUP_META[i - 1].key, scenario);
      if (i >= GROUP_COUNT) {
        window.clearInterval(iv);
        if (toastedGen.current !== generation) {
          toastedGen.current = generation;
          showToast('预案生成完成 · 演示数据');
        }
      }
    }, 500);
    return () => window.clearInterval(iv);
  }, [phase, plan, scenario, generation]);

  const handleRegenerate = () => {
    if (!scenario) return;
    addSceneAction({ action: 'hideRoute', target: '清除进攻/疏散路线', source: '预案引擎' });
    addSceneAction({ action: 'removeMarker', target: `${scenario.buildingName} 着火点/关键设备标记`, source: '预案引擎' });
    beginGenerate(scenario);
    window.setTimeout(() => finishGenerate(buildDrillPlan(scenario)), 600);
  };

  const handleInject = () => {
    if (!scenario) return;
    const raw = pickEmergency(emergencies.map((e) => e.id));
    const e = renderEmergency(raw, scenario);
    injectEmergency(e);
    addSceneAction({ action: 'highlight', target: `特情位置：${e.location}`, source: '预案引擎' });
    showToast('已注入突发特情 · 演示数据');
  };

  const handleEvaluate = async () => {
    beginEvaluate();
    const cur = getDrillState();
    // 评估智能体优先（未配置 / 失败自动降级 mock，保留评估节奏）
    const agentData = await evaluateViaAgent({
      kind: 'drill-plan',
      subject: `${cur.scenario?.buildingName ?? '未指定建筑'} ${cur.scenario?.floor ?? ''} ${cur.scenario?.material ?? ''}火灾处置预案`,
      process: {
        scenario: {
          buildingName: cur.scenario?.buildingName,
          floor: cur.scenario?.floor,
          material: cur.scenario?.material,
          trapped: cur.scenario?.trapped,
        },
        plan: cur.plan,
        emergencies: cur.emergencies.map((e: EmergencyEvent) => ({ text: e.text, location: e.location })),
        evaluatedCount: cur.evaluatedCount,
      },
    });
    let result: EvaluationResult | null = null;
    if (agentData) {
      const pass = agentData.score >= 70;
      result = {
        verdict: pass ? '合格' : '需修订',
        score: agentData.score,
        opinions: agentData.opinions.length > 0 ? agentData.opinions : [agentData.conclusion],
        archived: pass,
      };
    }
    if (!result) {
      await new Promise((r) => window.setTimeout(r, 1200));
      result = evaluatePlan(cur.emergencies.length, cur.evaluatedCount);
    }
    finishEvaluate(result);
    if (result.archived) showToast('预案已归档 · 演示数据');
  };

  const handleRetry = () => {
    setDemoState('loading');
    window.setTimeout(() => setDemoState('ok'), 800);
  };

  const itemCls = 'text-[13px] leading-5 text-text-2';

  const renderBody = () => {
    if (demoState === 'loading') return <PanelStateView state="loading" skeletonRows={8} />;
    if (demoState === 'error') return <PanelStateView state="error" onRetry={handleRetry} skeletonRows={8} />;
    if (demoState === 'empty' || phase === 'idle' || !plan || !scenario) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
          <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
          <div className="max-w-[280px] text-center text-[13px] text-text-2">
            尚未生成预案，请在左侧设置情景参数并点击「生成灾情设定」
          </div>
          <div className="max-w-[280px] text-center text-[12px] text-text-3">
            或直接『进入对抗模式』由智能体随机生成灾情
          </div>
          {confront.lastRound && (
            <button
              onClick={reopenConfrontation}
              className="text-[12px] text-cyan underline-offset-2 transition hover:underline"
            >
              上一局对抗：{confront.lastRound.score} 分 · {confront.lastRound.archived ? '已归档' : '需修订'}
            </button>
          )}
          <DemoTag />
        </div>
      );
    }

    const shown = GROUP_META.slice(0, revealed);
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* 生成进度条 */}
        <div className="shrink-0 border-b border-line px-3 py-2">
          {phase === 'generating' || !doneRevealing ? (
            <div>
              <div className="mb-1 flex items-center gap-1 text-[12px] text-cyan">
                预案输出智能体推演中
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  >.</motion.span>
                ))}
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-cyan-dim/30">
                <motion.div
                  className="h-full w-1/3 rounded-full bg-cyan"
                  animate={reduced ? undefined : { x: ['-100%', '300%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
              </div>
            </div>
          ) : (
            <motion.div initial={{ opacity: 1 }} animate={{ opacity: 0.7 }} className="flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full bg-green/70" />
              <span className="text-[12px] text-green">推演完成</span>
            </motion.div>
          )}
        </div>

        {/* 卡片流 */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <motion.div
            key={generation}
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.15 } } }}
            className="flex flex-col gap-3"
          >
            {shown.map((meta, gi) => (
              <GroupCard key={`${generation}-${meta.key}`} index={gi}>
                {meta.key === 'level' && (
                  <TypewriterText enabled={typewriter} text={plan.responseLevel} className="text-[14px] font-bold text-orange" />
                )}
                {meta.key === 'forces' && (
                  <ul className="flex flex-col gap-1.5">
                    {plan.forces.map((t) => <li key={t} className={itemCls}><TypewriterText enabled={typewriter} text={t} /></li>)}
                  </ul>
                )}
                {meta.key === 'tactics' && (
                  <ul className="flex flex-col gap-1.5">
                    {plan.tactics.map((t) => (
                      <li key={t} className={`${itemCls} flex gap-1.5`}>
                        <span className="text-cyan">·</span><TypewriterText enabled={typewriter} text={t} />
                      </li>
                    ))}
                  </ul>
                )}
                {meta.key === 'keyPoints' && (
                  <ol className="flex flex-col gap-1.5">
                    {plan.keyPoints.map((t, i) => (
                      <li key={t} className={`${itemCls} flex gap-2`}>
                        <span className="font-mono text-cyan">{String(i + 1).padStart(2, '0')}</span>
                        <TypewriterText enabled={typewriter} text={t} />
                      </li>
                    ))}
                    {/* 注入的突发特情：橙色卡片追加到末尾 */}
                    <AnimatePresence>
                      {emergencies.map((e) => (
                        <motion.li
                          key={`${e.id}-${e.text}`}
                          initial={{ scale: 0.96, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ duration: 0.3 }}
                          className="rounded-md border border-orange/60 bg-orange/10 p-2 shadow-[0_0_12px_rgba(249,115,22,.15)]"
                        >
                          <div className={`${itemCls} flex gap-1.5 text-orange`}>
                            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span><span className="font-bold">突发特情：</span>{e.text}</span>
                          </div>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ol>
                )}
                {meta.key === 'routes' && (
                  <div className="flex flex-col gap-2">
                    <div className={`${itemCls} flex flex-wrap items-center gap-1`}>
                      <span className="mr-1 rounded border border-cyan/50 px-1 text-[11px] text-cyan">进攻</span>
                      {plan.routes.attack.map((p, i) => (
                        <span key={p} className="flex items-center gap-1 text-cyan">
                          {i > 0 && <span>→</span>}
                          <TypewriterText enabled={typewriter} text={p} />
                        </span>
                      ))}
                    </div>
                    <div className={`${itemCls} flex flex-wrap items-center gap-1`}>
                      <span className="mr-1 rounded border border-green/50 px-1 text-[11px] text-green">疏散</span>
                      {plan.routes.evacuate.map((p, i) => (
                        <span key={p} className="flex items-center gap-1 text-green">
                          {i > 0 && <span>→</span>}
                          <TypewriterText enabled={typewriter} text={p} />
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {meta.key === 'safety' && (
                  <ul className="flex flex-col gap-1.5">
                    {plan.safetyControls.map((t) => (
                      <li key={t} className={`${itemCls} flex gap-1.5`}>
                        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green" />
                        <TypewriterText enabled={typewriter} text={t} />
                      </li>
                    ))}
                  </ul>
                )}
              </GroupCard>
            ))}

            {/* 评估中骨架 */}
            {evaluating && (
              <div className="rounded-lg border border-violet/40 bg-bg-panel-2/60 p-3">
                <div className="mb-2 h-4 w-24 animate-pulse rounded bg-violet/20" />
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => <div key={i} className="h-3.5 animate-pulse rounded bg-bg-panel-2" />)}
                </div>
                <div className="mt-2 text-[12px] text-violet">预案评估智能体评估中…</div>
              </div>
            )}

            {/* 评估结论卡片 */}
            {evaluation && !evaluating && (
              <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.1 } } }}
                className="relative rounded-lg border border-violet/60 bg-violet/5 p-3"
              >
                <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} className="flex items-center gap-3">
                  <ScoreRing score={evaluation.score} pass={evaluation.verdict === '合格'} />
                  <div>
                    <div className="text-[12px] text-text-3">评估结论（评分 {evaluation.score}/100）</div>
                    <div className={`text-[18px] font-bold ${evaluation.verdict === '合格' ? 'text-green' : 'text-red'}`}>
                      评估结论：{evaluation.verdict}
                    </div>
                  </div>
                </motion.div>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {evaluation.opinions.map((o) => (
                    <motion.li
                      key={o}
                      variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
                      className={`${itemCls} flex gap-1.5`}
                    >
                      <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet" />{o}
                    </motion.li>
                  ))}
                </ul>
                {evaluation.archived && (
                  <motion.div
                    initial={{ scale: 1.6, rotate: 0, opacity: 0 }}
                    animate={{ scale: 1, rotate: -8, opacity: 1 }}
                    transition={{ duration: 0.4, type: 'spring', bounce: 0.5 }}
                    className="absolute right-3 top-3 flex items-center gap-1 rounded-full border-2 border-green px-2.5 py-0.5 text-[13px] font-bold text-green"
                  >
                    <Stamp className="h-3.5 w-3.5" />已归档
                  </motion.div>
                )}
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* 底部工具条：对抗模式与评估 */}
        <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2">
          <button
            onClick={handleRegenerate}
            disabled={!doneRevealing}
            className="flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-[12px] text-text-2 transition hover:border-line-glow hover:text-cyan disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />重新生成
          </button>
          <button
            onClick={handleInject}
            disabled={!doneRevealing || confront.active}
            title={confront.active ? '对抗模式下由对抗智能体自动注入' : undefined}
            className="flex h-8 items-center gap-1.5 rounded-md border border-orange/60 px-2.5 text-[12px] text-orange transition hover:bg-orange/10 hover:shadow-[0_0_10px_rgba(249,115,22,.35)] disabled:opacity-40"
          >
            <ShieldAlert className="h-3.5 w-3.5" />突发特情注入
          </button>
          <button
            onClick={handleEvaluate}
            disabled={!doneRevealing || evaluating}
            title={doneRevealing ? undefined : '需先生成灾情设定并等预案输出完毕,才能评估'}
            className="flex h-8 items-center gap-1.5 rounded-md border border-cyan/60 px-2.5 text-[12px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_10px_rgba(34,211,238,.35)] disabled:opacity-40"
          >
            <ClipboardCheck className="h-3.5 w-3.5" />{evaluating ? '评估中…' : '预案评估'}
          </button>
          {!doneRevealing && (
            <span className="text-[10px] leading-tight text-text-3/70">
              先「生成灾情设定」产出预案后可评估
            </span>
          )}
          <span className="ml-auto text-[11px] text-text-3">演示数据</span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶部通栏：智能体身份 + 逐字开关 + 状态演示 */}
      <div className="flex items-center gap-2 border-b border-line bg-violet/5 px-3 py-2">
        <Bot className="h-4 w-4 text-violet" />
        <span className="whitespace-nowrap text-[13px] font-bold text-violet">预案输出智能体</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-text-2">
            逐字输出
            <button
              role="switch"
              aria-checked={typewriter}
              onClick={() => setTypewriter((v) => !v)}
              className={`relative h-[18px] w-8 rounded-full transition ${typewriter ? 'bg-cyan/70' : 'border border-line bg-bg-panel-2'}`}
            >
              <span
                className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-text-1 transition-all ${typewriter ? 'left-[18px]' : 'left-1'}`}
              />
            </button>
          </label>
          <div className="relative">
            <select
              value={demoState}
              onChange={(e) => setDemoState(e.target.value as FetchState)}
              className="h-8 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-7 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
              title="状态演示"
            >
              {STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>状态演示：{o.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1">{renderBody()}</div>
    </div>
  );
}
