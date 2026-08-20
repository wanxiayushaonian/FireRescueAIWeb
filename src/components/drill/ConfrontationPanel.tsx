// 演练对抗 · 对抗模式（二级界面全屏视图）
// 由 ScenarioPanel 挂载（Portal 到 body），drillStore 对抗扩展驱动。
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Bot, Swords, TriangleAlert, Shuffle, ChevronDown,
  Check, PencilLine, Stamp, ClipboardCheck, Timer,
} from 'lucide-react';
import type { FetchState } from '@/mock/types';
import {
  beginConfrontation, exitConfrontation, finishConfrontation,
  getConfrontationState, respondAdjustment, subscribeConfrontation,
} from '@/mock/drillStore';
import type { ConfrontationEvent, ConfrontationState } from '@/mock/drillStore';
import { showToast } from '@/components/Toast';
import DemoTag from '@/components/DemoTag';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

function fmtT(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = tSec % 60;
  return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 洗牌闪变：0.4s slot-machine 字符滚动后定格 */
function ShuffleText({ text, className = '' }: { text: string; className?: string }) {
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const chars = '0123456789ABCDEF#%&';
    let frame = 0;
    const iv = window.setInterval(() => {
      frame += 1;
      if (frame >= 8) {
        setShown(text);
        window.clearInterval(iv);
        return;
      }
      setShown(
        text
          .split('')
          .map((c) => (c === ' ' || /[一-龥]/.test(c) ? c : chars[Math.floor(Math.random() * chars.length)]))
          .join(''),
      );
    }, 50);
    return () => window.clearInterval(iv);
  }, [text]);
  return <span className={className}>{shown}</span>;
}

/** 三点跳动 */
function Dots({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        >.</motion.span>
      ))}
    </span>
  );
}

function ScoreRing({ score, pass }: { score: number; pass: boolean }) {
  const r = 24;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
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

/** 初步部署摘要（3 行） */
function deployLines(s: NonNullable<ConfrontationState['seedScenario']>): string[] {
  return [
    `首调力量：城东/城西救援站 5 车 28 人`,
    `主战编队：${s.floor} 内攻一组 + 高喷车外部压制`,
    `进攻路线：首层东门 → 消防电梯 → ${s.floor}`,
  ];
}

export default function ConfrontationPanel() {
  const [conf, setConf] = useState<ConfrontationState>(getConfrontationState());
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [nowSec, setNowSec] = useState(0);
  const [hlId, setHlId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const toastedGen = useRef(0);
  const hlTimer = useRef<number | null>(null);

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

  const injects = useMemo(() => conf.events.filter((e) => e.kind === 'inject'), [conf.events]);
  const adjusts = useMemo(() => conf.events.filter((e) => e.kind === 'adjust'), [conf.events]);
  const tSecNow = conf.status === 'running' ? nowSec : conf.events.length ? conf.events[conf.events.length - 1].tSec : 0;

  if (!conf.active) return null;

  const handleEnter = (flow: FetchState) => {
    setDemoState(flow);
    beginConfrontation(flow);
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
                  onClick={() => beginConfrontation('ok')}
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
                  ['被困人数', `${conf.seedScenario.trapped} 人`],
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
                  {deployLines(conf.seedScenario).map((l) => (
                    <div key={l} className="text-[12px] leading-5 text-text-2">· {l}</div>
                  ))}
                </motion.div>
                <motion.button
                  variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                  onClick={() => beginConfrontation('ok')}
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
              onClick={finishConfrontation}
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
                <span className="rounded border border-red/50 px-1.5 py-px text-[11px] text-red">火势趋势：发展期</span>
                <span className="text-[12px] text-text-3">
                  {conf.seedScenario.material} · 被困 {conf.seedScenario.trapped} 人
                </span>
              </>
            ) : (
              <span className="text-text-3 text-[12px]">正在生成初步灾情…</span>
            )}
            <span className="ml-auto flex items-center gap-1.5 font-num text-[13px] text-cyan">
              <Timer className="h-3.5 w-3.5" />{fmtT(tSecNow)}
            </span>
          </div>

          {/* 3D 占位缩略区 */}
          <div
            className="relative h-[180px] shrink-0 overflow-hidden border-b border-line"
            style={{
              backgroundImage:
                'linear-gradient(rgba(28,58,84,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(28,58,84,.25) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          >
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
            <span className="absolute bottom-2 left-3 text-[11px] text-text-3">3D 占位缩略区 · 承接本局场景动作</span>
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
                          <span className="ml-auto font-mono text-[11px] text-text-3">{fmtT(inject.tSec)}</span>
                          <span className="rounded border border-orange/60 px-1 py-px text-[11px] text-orange">对抗智能体</span>
                        </div>
                        <div className="mt-1.5 text-[13px] leading-5 text-text-1">{inject.emergency}</div>
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
                                  onClick={() => respondAdjustment(adjust.id, true)}
                                  className="flex h-7 items-center gap-1 rounded-md border border-green/60 px-2 text-[12px] text-green transition hover:bg-green/10"
                                >
                                  <Check className="h-3 w-3" />采纳调整
                                </button>
                                <button
                                  onClick={() => {
                                    respondAdjustment(adjust.id, false);
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
                              预案输出智能体响应中<Dots />
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
                      {deployLines(conf.seedScenario).map((l) => (
                        <li key={l} className="flex gap-1.5 text-[13px] leading-5 text-text-2">
                          <span className="text-violet">·</span>{l}
                        </li>
                      ))}
                      <li className="flex gap-1.5 text-[13px] leading-5 text-text-2">
                        <span className="text-violet">·</span>
                        {`处置要点：到场即设前沿指挥部，先行侦察 ${conf.seedScenario.floor} 火点与被困人员（${conf.seedScenario.trapped} 人），出 2 支水枪堵截蔓延`}
                      </li>
                      <li className="flex gap-1.5 text-[13px] leading-5 text-text-2">
                        <span className="text-violet">·</span>
                        安全管控：设立安全员全程监测，内攻每 15 分钟轮换
                      </li>
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
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.1 } } }}
                className="relative rounded-lg border border-violet/60 bg-violet/5 p-3"
              >
                <motion.div variants={{ hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0 } }} className="flex items-center gap-3">
                  <ScoreRing score={conf.review.score} pass={conf.review.archived} />
                  <div>
                    <div className="text-[11px] text-text-3">对抗评估（{conf.review.score}/100）</div>
                    <div className={`text-[15px] font-bold ${conf.review.archived ? 'text-green' : 'text-red'}`}>
                      {conf.review.conclusion}
                    </div>
                  </div>
                </motion.div>
                <ul className="mt-2 flex flex-col gap-1">
                  {conf.review.comments.map((c) => (
                    <motion.li
                      key={c}
                      variants={{ hidden: { opacity: 0, x: -6 }, show: { opacity: 1, x: 0 } }}
                      className="flex gap-1.5 text-[12px] leading-4 text-text-2"
                    >
                      <ClipboardCheck className="mt-0.5 h-3 w-3 shrink-0 text-violet" />{c}
                    </motion.li>
                  ))}
                </ul>
                <div className="mt-2 border-t border-line pt-2">
                  <div className="mb-1 text-[11px] text-text-3">各特情应对结果</div>
                  {conf.review.outcomes.map((o, i) => (
                    <motion.div
                      key={i}
                      variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }}
                      className="flex items-center gap-1.5 text-[12px] leading-5"
                    >
                      {o === 'timely' ? (
                        <><Check className="h-3 w-3 text-green" /><span className="text-green">✓ 及时调整</span></>
                      ) : o === 'delayed' ? (
                        <><TriangleAlert className="h-3 w-3 text-amber" /><span className="text-amber">⚠ 调整滞后</span></>
                      ) : (
                        <><TriangleAlert className="h-3 w-3 text-red" /><span className="text-red">✗ 未响应</span></>
                      )}
                      <span className="text-text-3">· 特情 #{i + 1}</span>
                    </motion.div>
                  ))}
                </div>
                {conf.review.archived && (
                  <motion.div
                    initial={{ scale: 1.6, rotate: 0, opacity: 0 }}
                    animate={{ scale: 1, rotate: -8, opacity: 1 }}
                    transition={{ duration: 0.4, type: 'spring', bounce: 0.5 }}
                    className="absolute right-2 top-2 flex items-center gap-1 rounded-full border-2 border-green px-2 py-px text-[12px] font-bold text-green"
                  >
                    <Stamp className="h-3 w-3" />已归档
                  </motion.div>
                )}
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
    </div>,
    document.body,
  );
}

function TimelineNode({
  color, badge, tSec, text, pulse, onClick,
}: {
  color: string;
  badge: string;
  tSec: number;
  text: string;
  pulse: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      initial={{ x: 8, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className="relative mb-3 block w-full rounded-md px-1 py-0.5 text-left transition hover:bg-bg-panel-2/70"
    >
      <motion.span
        className="absolute -left-[23px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-bg-deep"
        style={{ backgroundColor: color }}
        animate={pulse ? { boxShadow: [`0 0 0 0 ${color}66`, `0 0 0 6px ${color}00`] } : undefined}
        transition={pulse ? { duration: 2, repeat: Infinity } : undefined}
      />
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-text-3">{fmtT(tSec)}</span>
        <span
          className="rounded border px-1 text-[10px] leading-4"
          style={{ color, borderColor: `${color}99` }}
        >
          {badge}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[12px] text-text-2">{text}</span>
    </motion.button>
  );
}
