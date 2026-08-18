'use client';

/**
 * DrillEvaluationDialog — 演练评估报告对话框(2026-08-18 演练闭环收尾)。
 *
 * 演练停止后由 DrillView「生成评估报告」唤出:事件树 + 最终态势经 evaluateViaAgent
 * (评估 agent)打分;改进措施可逐条回流预案库(与实战指挥战后评估同一 addLibraryItem 通道)。
 * 评估 agent 未配置/超时/JSON 解析失败 → evaluateViaAgent 返回 null → 展示重试态(不造假 mock)。
 */
import { AnimatePresence, motion } from 'framer-motion';
import { X, Star, Recycle, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { EvaluationData, EvaluationImprovement } from '@/lib/agent-evaluate';

interface Props {
  open: boolean;
  loading: boolean;
  /** null=尚未请求/请求失败(配合 loading=false 显示重试态) */
  data: EvaluationData | null;
  scenarioName: string;
  onClose: () => void;
  onRetry: () => void;
  /** 回流单条改进措施到预案库(DrillView 里 addLibraryItem + 标记已回流)。 */
  onArchive: (imp: EvaluationImprovement, index: number) => void;
  /** 已回流成功的 improvement 下标(防重复回流)。 */
  archived: ReadonlySet<number>;
}

export function DrillEvaluationDialog({
  open, loading, data, scenarioName, onClose, onRetry, onArchive, archived,
}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // pointer-events-auto:drill 内容层(App.tsx)整层 pointer-events-none 让 3D 接收事件,
          // 固定浮层必须自救恢复交互,否则整个对话框点击全穿透到场景层
          className="pointer-events-auto fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[82dvh] w-[560px] flex-col overflow-hidden rounded-xl border border-line bg-bg-panel shadow-2xl"
          >
            {/* 标题栏 */}
            <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
              <Star className="h-4 w-4 text-amber-300" />
              <span className="text-[14px] font-bold text-text-1">演练评估报告</span>
              <span className="truncate text-[11px] text-text-3">{scenarioName}</span>
              <button
                onClick={onClose}
                className="ml-auto rounded p-1 text-text-3 transition hover:bg-white/5 hover:text-text-1"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex flex-col items-center gap-3 py-14 text-text-3">
                  <RefreshCw className="h-5 w-5 animate-spin text-cyan" />
                  <span className="text-[12px]">评估智能体分析中(事件树 + 最终态势)…</span>
                </div>
              ) : !data ? (
                <div className="flex flex-col items-center gap-3 py-14">
                  <span className="text-[12px] text-text-3">评估智能体未响应(未配置/超时/输出异常)</span>
                  <button
                    onClick={onRetry}
                    className="rounded-md border border-cyan/50 px-3 py-1.5 text-[12px] text-cyan transition hover:bg-cyan/10"
                  >
                    重试
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 总分 + 总评 */}
                  <div className="flex items-center gap-4 rounded-lg border border-line bg-bg-panel-2/50 px-4 py-3">
                    <div className={`font-num text-[34px] font-bold leading-none ${
                      data.score >= 80 ? 'text-green' : data.score >= 60 ? 'text-amber-300' : 'text-red'
                    }`}>
                      {data.score}
                    </div>
                    <div className="min-w-0 text-[12px] leading-5 text-text-2">{data.conclusion}</div>
                  </div>

                  {/* 维度 */}
                  {data.dimensions.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">
                        分维度评价
                      </div>
                      <div className="space-y-1.5">
                        {data.dimensions.map((d) => (
                          <div key={d.name} className="rounded-md border border-line/60 bg-bg-panel-2/40 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-text-1">{d.name}</span>
                              <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-deep">
                                <div
                                  className={`h-full rounded-full ${d.score >= 80 ? 'bg-green' : d.score >= 60 ? 'bg-amber-300' : 'bg-red'}`}
                                  style={{ width: `${d.score}%` }}
                                />
                              </div>
                              <span className="font-num text-[12px] text-text-2">{d.score}</span>
                            </div>
                            {d.comment && <div className="mt-1 text-[11px] text-text-3">{d.comment}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 评估要点 */}
                  {data.opinions.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">
                        评估要点
                      </div>
                      <ul className="list-disc space-y-1 pl-4 text-[12px] leading-5 text-text-2">
                        {data.opinions.map((o, i) => <li key={i}>{o}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* 改进措施(回流预案库) */}
                  {data.improvements.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">
                        改进措施(可回流预案库)
                      </div>
                      <div className="space-y-1.5">
                        {data.improvements.map((imp, i) => (
                          <div key={i} className="flex items-start gap-2 rounded-md border border-line/60 bg-bg-panel-2/40 px-3 py-2">
                            <div className="min-w-0 flex-1">
                              <div className="text-[12px] leading-5 text-text-1">{imp.content}</div>
                              <div className="mt-0.5 text-[11px] text-violet">→ {imp.target}</div>
                            </div>
                            {archived.has(i) ? (
                              <span className="flex shrink-0 items-center gap-1 text-[11px] text-green">
                                <CheckCircle2 className="h-3.5 w-3.5" />已回流
                              </span>
                            ) : (
                              <button
                                onClick={() => onArchive(imp, i)}
                                className="flex shrink-0 items-center gap-1 rounded border border-violet/50 px-2 py-1 text-[11px] text-violet transition hover:bg-violet/10"
                              >
                                <Recycle className="h-3 w-3" />回流预案库
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
