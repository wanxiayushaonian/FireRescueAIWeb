// 辅助决策推荐流面板（command.md §4/§5）：实时推荐卡 + 战后决策评估入口与评估卡（Dialog）
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Truck, Crosshair, AlertTriangle, Check, X, Route, ChevronDown, Download, Recycle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FetchState } from '@/mock/types';
import type { Incident, PostActionReview, Recommendation, RecommendType } from '@/mock/incidents';
import { fetchPostActionReview } from '@/mock/incidents';
import { addLibraryItem } from '@/mock/planLibrary';
import PanelStateView from '@/components/PanelStateView';

const TYPE_META: Record<RecommendType, { label: string; icon: LucideIcon; bar: string; chip: string }> = {
  force: { label: '力量调度', icon: Truck, bar: 'bg-cyan', chip: 'border-cyan/60 bg-cyan/10 text-cyan' },
  tactic: { label: '战术战法', icon: Crosshair, bar: 'bg-blue', chip: 'border-blue/60 bg-blue/10 text-blue' },
  keypoint: { label: '处置要点', icon: AlertTriangle, bar: 'bg-orange', chip: 'border-orange/60 bg-orange/10 text-orange' },
};

const TYPE_GLOW: Record<RecommendType, string> = {
  force: 'shadow-[0_0_12px_rgba(34,211,238,.2)]',
  tactic: 'shadow-[0_0_12px_rgba(59,130,246,.2)]',
  keypoint: 'shadow-[0_0_12px_rgba(249,115,22,.2)]',
};

function RecommendCard({
  rec, onAdopt, onIgnore, onShowRoute,
}: {
  rec: Recommendation;
  onAdopt: (r: Recommendation) => void;
  onIgnore: (r: Recommendation) => void;
  onShowRoute: (r: Recommendation) => void;
}) {
  const meta = TYPE_META[rec.type];
  const Icon = meta.icon;
  return (
    <motion.div
      layout="position"
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={`relative overflow-hidden rounded-lg border border-line bg-bg-panel-2/50 p-2.5 ${
        rec.ignored ? 'opacity-60' : ''
      }`}
    >
      <span className={`absolute left-0 top-0 h-full w-[3px] ${meta.bar}`} />
      {/* 新卡类型色边框发光 1.5s */}
      <motion.span
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 1.5 }}
        className={`pointer-events-none absolute inset-0 rounded-lg ${TYPE_GLOW[rec.type]}`}
      />
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-text-2" />
        <span className={`rounded border px-1.5 py-px text-[11px] leading-4 ${meta.chip}`}>{meta.label}</span>
        <span className="ml-auto font-mono text-[11px] text-text-3">{rec.ts}</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-5 text-text-1">{rec.content}</p>
      <div className="mt-1 text-[11px] text-text-3">依据：{rec.basis} · 演示数据</div>
      <div className="mt-2 flex items-center gap-2">
        {rec.type === 'force' && !rec.adopted && !rec.ignored && (
          <button
            onClick={() => onShowRoute(rec)}
            className="flex items-center gap-1 rounded-md border border-cyan/50 px-2 py-1 text-[12px] text-cyan transition hover:bg-cyan/10"
          >
            <Route className="h-3 w-3" />
            查看路线
          </button>
        )}
        {rec.adopted ? (
          <span className="ml-auto flex items-center gap-1 rounded-full border border-green/60 bg-green/10 px-2 py-0.5 text-[11px] text-green">
            <Check className="h-3 w-3" />
            已采纳
          </span>
        ) : rec.ignored ? (
          <span className="ml-auto text-[11px] text-text-3">已忽略</span>
        ) : (
          <span className="ml-auto flex gap-2">
            <button
              onClick={() => onAdopt(rec)}
              className="rounded-md border border-green/50 px-2.5 py-1 text-[12px] text-green transition hover:bg-green/10"
            >
              采纳
            </button>
            <button
              onClick={() => onIgnore(rec)}
              className="rounded-md border border-line px-2.5 py-1 text-[12px] text-text-3 transition hover:bg-white/5 hover:text-text-2"
            >
              忽略
            </button>
          </span>
        )}
      </div>
    </motion.div>
  );
}

/** 评分环：stroke-dashoffset 1s + 数字滚动 */
function ScoreRing({ score }: { score: number }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 1000);
      setN(Math.round(score * k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 88 88" className="h-full w-full -rotate-90">
        <circle cx="44" cy="44" r={R} fill="none" strokeWidth="6" className="stroke-line" />
        <motion.circle
          cx="44" cy="44" r={R} fill="none" strokeWidth="6" strokeLinecap="round"
          className="stroke-green"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - score / 100) }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-num text-[26px] font-bold leading-6 text-green">{n}</span>
        <span className="text-[10px] text-text-3">/ 100</span>
      </div>
    </div>
  );
}

function ReviewDialog({
  review, onClose, onFlush, onExport,
}: {
  review: PostActionReview;
  onClose: () => void;
  onFlush: (imp: PostActionReview['improvements'][number]) => void;
  onExport: () => void;
}) {
  const [flushed, setFlushed] = useState<Set<string>>(new Set());
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 12, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 12, opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.3 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[82dvh] w-[480px] flex-col overflow-hidden rounded-lg border border-violet/60 bg-bg-panel shadow-[0_0_32px_rgba(167,139,250,.15)]"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg-panel-2/60 px-3">
          <Bot className="h-4 w-4 text-violet" />
          <span className="text-[15px] font-bold text-text-1">战后决策评估</span>
          <span className="font-mono text-[11px] text-violet">{review.incidentId}</span>
          <span className="ml-auto rounded-full border border-amber/70 px-1.5 py-px text-[11px] text-amber">演示数据</span>
          <button onClick={onClose} className="rounded p-1 text-text-3 transition hover:bg-red/20 hover:text-red">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {/* 总评 */}
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-4"
          >
            <ScoreRing score={review.totalScore} />
            <div>
              <div className="text-[12px] text-text-2">总评</div>
              <div className="mt-1 text-[15px] font-bold text-green">{review.conclusion}</div>
              <div className="mt-1 text-[11px] text-text-3">评估智能体复盘生成 · 演示数据</div>
            </div>
          </motion.div>
          {/* 评分维度 */}
          <div className="space-y-2">
            {review.dimensions.map((d, i) => (
              <motion.div
                key={d.name}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.12 * (i + 1) }}
                className="rounded-lg border border-line bg-bg-panel-2/50 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-text-1">{d.name}</span>
                  <span className="font-num text-[16px] font-bold text-cyan">{d.score}</span>
                  <div className="ml-auto flex gap-0.5">
                    {Array.from({ length: 10 }).map((_, k) => (
                      <span
                        key={k}
                        className={`h-3 w-2 rounded-sm ${k < Math.round(d.score / 10) ? 'bg-cyan' : 'bg-bg-panel-2 border border-line'}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="mt-1 text-[12px] text-text-2">{d.comment}</div>
              </motion.div>
            ))}
          </div>
          {/* 改进措施回流 */}
          <motion.div
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.6 }}
            className="border-t border-cyan/40 pt-3"
          >
            <div className="mb-2 flex items-center gap-1.5">
              <Recycle className="h-3.5 w-3.5 text-cyan" />
              <span className="text-[13px] font-bold text-text-1">改进措施 · 回流预案体系</span>
            </div>
            <div className="space-y-2">
              {review.improvements.map((imp) => {
                const done = flushed.has(imp.id);
                return (
                  <div key={imp.id} className="rounded-lg border border-line bg-bg-panel-2/50 p-2.5">
                    <p className="text-[12px] leading-5 text-text-1">{imp.content}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="rounded border border-violet/50 bg-violet/10 px-1.5 py-px text-[11px] text-violet">
                        → {imp.target}
                      </span>
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        disabled={done}
                        onClick={() => {
                          setFlushed((s) => new Set(s).add(imp.id));
                          onFlush(imp);
                        }}
                        className={`ml-auto rounded-md border px-2.5 py-1 text-[12px] transition ${
                          done
                            ? 'border-green/60 bg-green/10 text-green shadow-[0_0_8px_rgba(52,211,153,.3)]'
                            : 'border-cyan/50 text-cyan hover:bg-cyan/10'
                        }`}
                      >
                        {done ? '已回流 ✓' : '确认回流'}
                      </motion.button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
          {/* 卡尾 */}
          <button
            onClick={onExport}
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line py-2 text-[13px] text-text-2 transition hover:border-line-glow hover:text-cyan"
          >
            <Download className="h-3.5 w-3.5" />
            导出评估报告（模拟）
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function RecommendPanel({
  incident,
  recommendations,
  onAdopt,
  onIgnore,
  onShowRoute,
  onFlushImprovement,
  onExportReport,
}: {
  incident: Incident | null;
  recommendations: Recommendation[];
  onAdopt: (r: Recommendation) => void;
  onIgnore: (r: Recommendation) => void;
  onShowRoute: (r: Recommendation) => void;
  onFlushImprovement: (impId: string, incidentId: string) => void;
  onExportReport: () => void;
}) {
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [reviewPhase, setReviewPhase] = useState<'idle' | 'loading' | 'done'>('idle');
  const [review, setReview] = useState<PostActionReview | null>(null);
  const [reviewDismissed, setReviewDismissed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);

  // 切换警情时重置评估状态
  useEffect(() => {
    setReviewPhase('idle');
    setReview(null);
    setReviewDismissed(false);
  }, [incident?.id]);

  useEffect(() => () => {
    timersRef.current.forEach((t) => window.clearTimeout(t));
  }, []);

  // 新推荐自动滚顶
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [recommendations.length]);

  const startReview = () => {
    if (!incident) return;
    setReviewPhase('loading');
    const t = window.setTimeout(async () => {
      try {
        const r = await fetchPostActionReview(incident.id);
        setReview(r);
        setReviewPhase('done');
      } catch {
        setReviewPhase('idle');
      }
    }, 1500); // 「评估智能体复盘中…」1.5s 骨架
    timersRef.current.push(t);
  };

  const showEntry = incident?.status === '熄灭' && !reviewDismissed && reviewPhase === 'idle';

  return (
    <div className="flex h-full flex-col">
      {/* 身份条 + 状态演示 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <span className="flex items-center gap-1.5 rounded-full border border-violet/50 bg-violet/10 px-2 py-0.5 text-[11px] text-violet">
          <Bot className="h-3 w-3" />
          辅助决策智能体
        </span>
        <div className="relative ml-auto">
          <select
            value={demoState}
            onChange={(e) => setDemoState(e.target.value as FetchState)}
            title="状态演示"
            className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
          >
            <option value="ok">状态演示：正常</option>
            <option value="loading">状态演示：加载中</option>
            <option value="empty">状态演示：空态</option>
            <option value="error">状态演示：失败</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-3" />
        </div>
      </div>

      {demoState !== 'ok' ? (
        <PanelStateView
          state={demoState}
          skeletonRows={4}
          onRetry={() => { setDemoState('loading'); window.setTimeout(() => setDemoState('ok'), 800); }}
        />
      ) : !incident ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
          <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
          <div className="text-[13px] text-text-2">请先在左侧选择或接入一起警情</div>
        </div>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {/* 战后评估入口卡 */}
          <AnimatePresence>
            {showEntry && (
              <motion.div
                initial={{ y: -12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-violet/60 bg-[rgba(167,139,250,.08)] p-3"
              >
                <div className="flex items-start gap-2">
                  <Bot className="mt-0.5 h-4 w-4 shrink-0 text-violet" />
                  <p className="text-[13px] leading-5 text-text-1">
                    辅助决策智能体：警情 <span className="font-mono text-violet">{incident.id}</span> 已处置完毕，是否生成战后决策评估？
                  </p>
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={startReview}
                    className="rounded-md bg-violet px-3 py-1.5 text-[12px] font-bold text-bg-deep transition hover:brightness-110"
                  >
                    生成评估
                  </button>
                  <button
                    onClick={() => setReviewDismissed(true)}
                    className="rounded-md border border-line px-3 py-1.5 text-[12px] text-text-3 transition hover:text-text-2"
                  >
                    暂不
                  </button>
                </div>
              </motion.div>
            )}
            {reviewPhase === 'loading' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-lg border border-violet/40 bg-[rgba(167,139,250,.06)] p-3"
              >
                <div className="flex items-center gap-2 text-[12px] text-violet">
                  <Bot className="h-3.5 w-3.5 animate-pulse" />
                  评估智能体复盘中…
                </div>
                <div className="mt-2 space-y-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-bg-panel-2" style={{ opacity: 1 - i * 0.2 }} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {recommendations.length === 0 && !showEntry ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
              <div className="text-[13px] text-text-2">暂无推荐，智能体将持续跟踪灾情变化</div>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {recommendations.map((rec) => (
                <RecommendCard
                  key={rec.id}
                  rec={rec}
                  onAdopt={onAdopt}
                  onIgnore={onIgnore}
                  onShowRoute={onShowRoute}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      )}

      {/* 战后决策评估卡（Dialog 形态） */}
      <AnimatePresence>
        {reviewPhase === 'done' && review && (
          <ReviewDialog
            review={review}
            onClose={() => setReviewPhase('idle')}
            onFlush={(imp) => {
              if (!incident) return;
              // 改进措施回流预案库闭环：入库「待落地」，可在预案库面板跟踪
              addLibraryItem({
                kind: '改进措施',
                title: imp.content.length > 28 ? `${imp.content.slice(0, 28)}…` : imp.content,
                status: '待落地',
                summary: [imp.content],
                sourceDetail: `来源：实战指挥 · 战后决策评估（${review.incidentId}）→ ${imp.target} · 演示数据`,
              });
              onFlushImprovement(imp.id, incident.id);
            }}
            onExport={onExportReport}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
