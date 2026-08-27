'use client';

import { motion } from 'framer-motion';
import {
  Bot, Check, ClipboardCheck, Clock, Download, Stamp, TriangleAlert, Wrench, X,
} from 'lucide-react';
import type { ConfrontationEvent, ConfrontationReview, ConfrontationState } from './confront-store';
import { fmtT } from './confront-helpers';
import { ScoreRing } from './confrontation-uis';
import { buildDrillReport } from './drill-report';
import { RichLocationText } from '@/components/RichLocationText';

function downloadBlob(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ConfrontationReviewWorkspace({
  review,
  events,
  building,
  state,
  onClose,
}: {
  review: ConfrontationReview;
  events: readonly ConfrontationEvent[];
  building: string;
  /** 完整对抗舱状态(P2 报告导出用:seed/态势/部署/事件)。 */
  state: ConfrontationState;
  onClose: () => void;
}) {
  const evidence = events.filter((event) => event.kind === 'inject' || event.kind === 'adjust' || event.kind === 'manual');
  // 已结束的局固定用最后事件时刻(历史快照回看不随当前时钟膨胀);进行中才走实时差值
  const elapsedSec =
    state.status === 'finished'
      ? (events.at(-1)?.tSec ?? 0)
      : state.startedAt
        ? Math.max(0, Math.round((Date.now() - state.startedAt) / 1000))
        : (events.at(-1)?.tSec ?? 0);
  const exportReport = () => {
    const report = buildDrillReport(state, elapsedSec);
    downloadBlob(report.markdown, `${report.title}.md`, 'text/markdown;charset=utf-8');
  };
  const exportJson = () => {
    const report = buildDrillReport(state, elapsedSec);
    downloadBlob(report.json, `${report.title}.json`, 'application/json;charset=utf-8');
  };
  return (
    <motion.div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-bg-deep/85 p-8 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.section
        role="dialog"
        aria-modal="true"
        aria-label="完整对抗评估复盘"
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.99 }}
        className="flex h-[min(820px,calc(100vh-64px))] w-[min(1180px,calc(100vw-80px))] flex-col overflow-hidden rounded-xl border border-violet/60 bg-bg-panel shadow-[0_0_50px_rgba(124,58,237,.24)]"
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-violet/60 bg-violet/10 text-violet">
            <ClipboardCheck className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[15px] font-bold text-text-1">演练对抗 · 完整评估复盘</div>
            <div className="text-[11px] text-text-3">{building} · 事件—决策证据化评估</div>
          </div>
          <span className="ml-auto rounded border border-green/50 bg-green/10 px-2 py-0.5 text-[10px] font-bold text-green">
            {review.source === 'agent' ? 'REAL EVALUATOR' : 'FALLBACK RULES'}
          </span>
          <button
            onClick={exportReport}
            className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-text-2 transition hover:border-line-glow hover:text-cyan"
            title="下载复盘报告(Markdown,含特情/决策/人工对比/评估)"
          >
            <Download className="h-3.5 w-3.5" />导出报告
          </button>
          <button
            onClick={exportJson}
            className="flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12px] text-text-2 transition hover:border-line-glow hover:text-cyan"
            title="下载完整演练数据(JSON)"
          >
            <Download className="h-3.5 w-3.5" />导出数据
          </button>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-text-3 transition hover:border-line-glow hover:text-cyan"
            aria-label="关闭完整复盘"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r border-line bg-bg-deep/35 p-5">
            <div className="flex items-center gap-4">
              <ScoreRing score={review.score} pass={review.archived} />
              <div>
                <div className="text-[11px] text-text-3">综合评分</div>
                <div className={`text-[18px] font-bold ${review.archived ? 'text-green' : 'text-amber'}`}>
                  {review.archived ? '预案韧性良好' : '建议修订后复演'}
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-violet/40 bg-violet/5 p-3 text-[13px] leading-5 text-text-1">
              <RichLocationText text={review.conclusion} />
            </div>
            <div className="mt-4 text-[11px] text-text-3">各特情应对结果</div>
            <div className="mt-2 flex flex-col gap-2">
              {review.outcomes.map((outcome, index) => (
                <div key={index} className="flex items-center gap-2 rounded-md border border-line bg-bg-panel-2/60 px-2.5 py-2 text-[12px]">
                  {outcome === 'timely' ? <Check className="h-3.5 w-3.5 text-green" /> : <TriangleAlert className={`h-3.5 w-3.5 ${outcome === 'delayed' ? 'text-amber' : 'text-red'}`} />}
                  <span className={outcome === 'timely' ? 'text-green' : outcome === 'delayed' ? 'text-amber' : 'text-red'}>
                    特情 #{index + 1} · {outcome === 'timely' ? '及时调整' : outcome === 'delayed' ? '调整滞后' : '未响应'}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-auto rounded-lg border border-line bg-bg-panel-2/50 p-3 text-[11px] leading-5 text-text-3">
              <div className="flex items-center gap-1 text-text-2"><Bot className="h-3 w-3 text-violet" />评估可信度说明</div>
              <div>输入包含初始部署、最终态势、全部特情、动态调整、采纳/改派和响应时间。</div>
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-5">
            <section>
              <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-text-1">
                <ClipboardCheck className="h-4 w-4 text-violet" />核心评估意见
              </div>
              <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                {review.comments.map((comment, index) => (
                  <div key={comment} className="rounded-lg border border-line bg-bg-panel-2/45 p-3 text-[12px] leading-5 text-text-2">
                    <span className="mr-1 font-mono text-violet">{String(index + 1).padStart(2, '0')}</span>
                    <RichLocationText text={comment} />
                  </div>
                ))}
              </div>
            </section>

            {review.dimensions && review.dimensions.length > 0 && (
              <section className="mt-5 border-t border-line pt-4">
                <div className="mb-3 text-[13px] font-bold text-text-1">七维评分与依据</div>
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                  {review.dimensions.map((dimension) => (
                    <div key={dimension.name} className="rounded-lg border border-line bg-bg-panel-2/45 p-3">
                      <div className="flex items-center justify-between text-[12px]">
                        <span className="font-bold text-text-1">{dimension.name}</span>
                        <span className={`font-mono text-[15px] font-bold ${dimension.score >= 85 ? 'text-green' : dimension.score >= 70 ? 'text-amber' : 'text-red'}`}>
                          {dimension.score}
                        </span>
                      </div>
                      <div className="my-2 h-1.5 overflow-hidden rounded bg-bg-deep">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${dimension.score}%` }}
                          className={`h-full ${dimension.score >= 85 ? 'bg-green' : dimension.score >= 70 ? 'bg-amber' : 'bg-red'}`}
                        />
                      </div>
                      <div className="text-[11px] leading-4 text-text-3">{dimension.comment}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-5 border-t border-line pt-4">
              <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-text-1">
                <Clock className="h-4 w-4 text-cyan" />特情—决策证据链
              </div>
              <div className="flex flex-col gap-2">
                {evidence.map((event) => (
                  <div key={event.id} className={`rounded-lg border p-3 ${event.kind === 'inject' ? 'border-orange/45 bg-orange/5' : event.kind === 'manual' ? 'border-amber/50 bg-amber/5' : 'border-cyan/45 bg-cyan/5'}`}>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono text-text-3">{fmtT(event.tSec)}</span>
                      <span className={event.kind === 'inject' ? 'text-orange' : event.kind === 'manual' ? 'text-amber' : 'text-cyan'}>
                        {event.kind === 'inject' ? `突发特情 #${event.seq}` : event.kind === 'manual' ? `人工改派方案 #${event.seq}` : event.seq === 0 ? '初始部署上报' : `指挥调整 #${event.seq}`}
                      </span>
                      {event.location && <span className="rounded border border-line px-1 text-text-3">{event.location}</span>}
                      {event.respondedWithinSec != null && <span className="ml-auto text-text-3">响应 {event.respondedWithinSec}s</span>}
                    </div>
                    <div className="mt-1 text-[12px] leading-5 text-text-2">
                      <RichLocationText text={event.kind === 'inject' ? event.emergency : event.adjustments?.join('；') ?? ''} />
                    </div>
                    {event.evidence?.length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {event.evidence.map((ev) => (
                          <span
                            key={`${ev.kind}:${ev.label}`}
                            title={ev.detail ?? ev.label}
                            className="rounded border border-line px-1 py-px text-[10px] text-text-3"
                          >
                            {ev.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {event.kind === 'manual' && event.note && (
                      <div className="mt-1 text-[11px] leading-5 text-text-3">处置原因：<RichLocationText text={event.note ?? ''} /></div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {review.improvements && review.improvements.length > 0 && (
              <section className="mt-5 border-t border-line pt-4">
                <div className="mb-3 flex items-center gap-2 text-[13px] font-bold text-text-1">
                  <Wrench className="h-4 w-4 text-amber" />改进措施与预案回流
                </div>
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
                  {review.improvements.map((improvement) => (
                    <div key={improvement.content} className="rounded-lg border border-amber/35 bg-amber/5 p-3">
                      <div className="text-[12px] leading-5 text-text-2"><RichLocationText text={improvement.content} /></div>
                      <div className="mt-2 inline-flex rounded border border-violet/45 bg-violet/10 px-1.5 py-0.5 text-[10px] text-violet">
                        → {improvement.target}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>

        <footer className="flex h-12 shrink-0 items-center border-t border-line px-5 text-[11px] text-text-3">
          {review.archived && <span className="flex items-center gap-1 text-green"><Stamp className="h-3.5 w-3.5" />评估与改进措施已回流预案库</span>}
          <button onClick={onClose} className="ml-auto rounded-md border border-line px-4 py-1.5 text-[12px] text-text-2 transition hover:border-line-glow hover:text-cyan">
            返回对抗时间线
          </button>
        </footer>
      </motion.section>
    </motion.div>
  );
}
