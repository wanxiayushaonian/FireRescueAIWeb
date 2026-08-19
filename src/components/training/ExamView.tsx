import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Bot,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Flag,
  RefreshCcw,
  Route,
  Stamp,
  UserCheck,
} from 'lucide-react';
import type { ExamPost, ExamQuestion, ExamResult, ExamSession, SubmitExamInput } from '@/mock/training';
import {
  fetchExamPaper,
  findNode,
  getTourSuggestion,
  postNameOf,
  submitExam,
  submitExamResult,
} from '@/mock/training';
import type { FetchState } from '@/mock/types';
import { addSceneAction } from '@/mock/sceneLog';
import DemoTag from '@/components/DemoTag';
import { showToast } from '@/components/Toast';

type Step = 'quiz' | 'result';

interface Choice {
  chosen: number[];
  flagged: boolean;
  submitted: boolean;
}

export interface ExamViewProps {
  onBack: () => void;
  onRequestAgentHint?: (topic: string) => void;
}

/** 二级界面:综合考核(2026-08-19 简化:不带岗位,混编 mock 题库 → 在线考核 → 成绩展示)。
 *  Portal 到 body + z-[80]:覆盖 App 层场景切换器等浮层(此前考核页左上角露出场景包下拉框)。 */
export default function ExamView({ onBack, onRequestAgentHint }: ExamViewProps) {
  const [step, setStep] = useState<Step>('quiz');
  const [submitInput, setSubmitInput] = useState<SubmitExamInput | null>(null);
  /** 重开一局:变更 key 强制 QuizRunner 重挂载取新卷 */
  const [round, setRound] = useState(0);

  return createPortal(
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="scene-grid-weak fixed inset-0 z-[80] flex flex-col bg-bg-deep"
    >
      {/* 顶部返回条 */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-bg-panel/90 px-3 backdrop-blur-[8px]">
        <button
          onClick={onBack}
          className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-line px-2 text-[12px] text-text-2 transition hover:border-line-glow hover:text-cyan"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          返回熟悉
        </button>
        <span className="text-[15px] font-bold text-text-1">熟悉考核 · 综合考核</span>
        <DemoTag />
        <div className="ml-auto flex items-center gap-1.5">
          {(['quiz', 'result'] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className={`rounded-full border px-2 py-0.5 text-[12px] ${
                  step === s
                    ? 'border-cyan bg-cyan/15 text-cyan'
                    : 'border-line text-text-3'
                }`}
              >
                {['① 在线考核', '② 成绩展示'][i]}
              </span>
              {i < 1 && <ChevronRight className="h-3 w-3 text-text-3" />}
            </span>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        {step === 'quiz' && (
          <QuizRunner
            key={round}
            post="mixed"
            onSubmit={(input) => {
              setSubmitInput(input);
              setStep('result');
            }}
            onRequestAgentHint={onRequestAgentHint}
          />
        )}
        {step === 'result' && submitInput && (
          <ResultReview
            key={submitInput.startedAt}
            input={submitInput}
            onRestart={() => {
              setSubmitInput(null);
              setRound((r) => r + 1);
              setStep('quiz');
            }}
            onBack={onBack}
          />
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

// ---------- 步骤二：在线考核 ----------

const TYPE_META: Record<ExamQuestion['type'], { label: string; cls: string }> = {
  single: { label: '单选', cls: 'border-cyan/60 text-cyan' },
  multiple: { label: '多选', cls: 'border-blue/60 text-blue' },
  judge: { label: '判断', cls: 'border-violet/60 text-violet' },
};

const HINT_POOL = [
  '已答 3 题，平均用时 42 秒，节奏良好',
  '已完成 6 题，过半了，注意多选题不要漏选',
  '还剩最后几题，建议检查标记的疑题后再交卷',
];

function QuizRunner({
  post,
  onSubmit,
  onRequestAgentHint,
}: {
  post: ExamPost;
  onSubmit: (input: SubmitExamInput) => void;
  onRequestAgentHint?: (topic: string) => void;
}) {
  const [paperState, setPaperState] = useState<FetchState>('loading');
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [cur, setCur] = useState(0);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [timeLeft, setTimeLeft] = useState(600);
  const [startedAt] = useState(() => new Date().toISOString());
  const [hints, setHints] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [grading, setGrading] = useState(false);
  const submittedRef = useRef(false);
  const timeRef = useRef(timeLeft);
  timeRef.current = timeLeft;

  useEffect(() => {
    let alive = true;
    fetchExamPaper(post)
      .then((qs) => {
        if (!alive) return;
        if (qs.length === 0) setPaperState('empty');
        else {
          setQuestions(qs);
          setPaperState('ok');
        }
      })
      .catch(() => alive && setPaperState('error'));
    return () => { alive = false; };
  }, [post]);

  const answeredCount = useMemo(
    () => Object.values(choices).filter((c) => c.submitted).length,
    [choices],
  );

  const doSubmit = useCallback(() => {
    if (submittedRef.current || questions.length === 0) return;
    submittedRef.current = true;
    setGrading(true);
    const input: SubmitExamInput = {
      post,
      startedAt,
      durationSec: 600,
      questions,
      choices: questions.map((q) => ({
        questionId: q.id,
        chosen: choices[q.id]?.chosen ?? [],
        flagged: choices[q.id]?.flagged ?? false,
      })),
      usedSec: 600 - timeRef.current,
    };
    // 「评分中…」骨架 1.2s 后进入成绩回顾
    window.setTimeout(() => onSubmit(input), 1200);
  }, [choices, onSubmit, post, questions, startedAt]);

  // 倒计时
  useEffect(() => {
    if (paperState !== 'ok' || grading) return;
    const t = window.setInterval(() => {
      setTimeLeft((s) => {
        if (s <= 1) {
          window.clearInterval(t);
          window.setTimeout(doSubmit, 0);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [paperState, grading, doSubmit]);

  if (paperState === 'loading') {
    return (
      <div className="mx-auto flex h-full max-w-[640px] flex-col gap-2 p-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-bg-panel-2" style={{ opacity: 1 - i * 0.07 }} />
        ))}
        <div className="mt-2 text-center text-[13px] text-text-3">考核试卷加载中… · 演示数据</div>
      </div>
    );
  }
  if (paperState === 'error' || paperState === 'empty') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <img src={paperState === 'empty' ? '/empty-box.svg' : '/error-radar.svg'} alt="" className="h-[90px] w-[120px] opacity-80" />
        <div className="text-[13px] text-text-2">
          {paperState === 'empty' ? '暂无考核试卷数据 · 演示数据' : '试卷请求失败，请检查网络后重试'}
        </div>
      </div>
    );
  }

  if (grading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <ClipboardCheck className="h-10 w-10 animate-pulse text-cyan" />
        <div className="text-[15px] font-bold text-text-1">评分中…</div>
        <div className="text-[12px] text-text-3">正在核对答案与知识点分布 · 演示数据</div>
        <div className="flex w-64 flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-6 animate-pulse rounded-md bg-bg-panel-2" style={{ opacity: 1 - i * 0.2 }} />
          ))}
        </div>
      </div>
    );
  }

  const q = questions[cur];
  const choice: Choice = choices[q.id] ?? { chosen: [], flagged: false, submitted: false };
  const multiple = q.type === 'multiple';
  const correct = choice.submitted
    ? choice.chosen.length === q.answer.length && choice.chosen.every((i) => q.answer.includes(i))
    : null;
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const ss = String(timeLeft % 60).padStart(2, '0');
  const timerColor = timeLeft <= 60 ? 'text-red animate-pulse' : timeLeft <= 120 ? 'text-amber' : 'text-cyan';
  const unanswered = questions.length - answeredCount;

  const toggleOption = (idx: number) => {
    if (choice.submitted) return;
    setChoices((prev) => {
      const c = prev[q.id] ?? { chosen: [], flagged: false, submitted: false };
      let chosen: number[];
      if (multiple) {
        chosen = c.chosen.includes(idx) ? c.chosen.filter((i) => i !== idx) : [...c.chosen, idx].sort();
      } else {
        chosen = [idx];
      }
      return { ...prev, [q.id]: { ...c, chosen } };
    });
  };

  const submitCurrent = () => {
    if (choice.submitted || choice.chosen.length === 0) return;
    setChoices((prev) => ({ ...prev, [q.id]: { ...choice, submitted: true } }));
    const n = answeredCount + 1;
    if (n % 3 === 0 && n < questions.length) {
      const hint = HINT_POOL[Math.min(Math.floor(n / 3) - 1, HINT_POOL.length - 1)];
      setHints((prev) => [...prev, hint]);
      onRequestAgentHint?.(hint);
    }
  };

  const toggleFlag = () => {
    setChoices((prev) => {
      const c = prev[q.id] ?? { chosen: [], flagged: false, submitted: false };
      return { ...prev, [q.id]: { ...c, flagged: !c.flagged } };
    });
  };

  return (
    <div className="mx-auto flex h-full max-w-[1180px] gap-4 p-4">
      {/* 左栏 · 题目导航 */}
      <div className="flex w-[220px] shrink-0 flex-col rounded-lg border border-line bg-bg-panel/90 p-3 backdrop-blur-[8px]">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-bold text-text-1">
          题目导航
          <DemoTag />
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {questions.map((qu, i) => {
            const c = choices[qu.id];
            const isCur = i === cur;
            const wrong = c?.submitted && !(c.chosen.length === qu.answer.length && c.chosen.every((x) => qu.answer.includes(x)));
            return (
              <button
                key={qu.id}
                onClick={() => setCur(i)}
                className={`relative h-8 rounded-md border font-num text-[13px] transition ${
                  isCur
                    ? 'border-cyan bg-cyan text-bg-deep shadow-[0_0_10px_rgba(34,211,238,.4)]'
                    : wrong
                      ? 'border-red/70 text-red'
                      : c?.submitted
                        ? 'border-cyan/50 bg-cyan/20 text-cyan'
                        : 'border-line text-text-3 hover:border-line-glow hover:text-text-1'
                }`}
              >
                {i + 1}
                {c?.flagged && (
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber" title="标记疑题" />
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-auto pt-3">
          <div className="mb-1.5 flex items-center justify-between text-[12px] text-text-3">
            <span>已答 <span className="font-num text-cyan">{answeredCount}</span>/{questions.length}</span>
            <span className="font-num text-cyan">{Math.round((answeredCount / questions.length) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-cyan-dim/30">
            <motion.div
              className="h-full rounded-full bg-cyan"
              animate={{ width: `${(answeredCount / questions.length) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      </div>

      {/* 中栏 · 答题卡 */}
      <div className="flex min-w-0 max-w-[640px] flex-1 flex-col rounded-lg border border-line bg-bg-panel/90 p-4 backdrop-blur-[8px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={q.id}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.25 }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className={`rounded border px-1.5 py-px text-[12px] ${TYPE_META[q.type].cls}`}>
                {TYPE_META[q.type].label}
              </span>
              <span className="text-[12px] text-text-3">{q.knowledge}</span>
              {multiple && (
                <span className="text-[12px] text-text-3">已选 {choice.chosen.length} 项</span>
              )}
              <button
                onClick={toggleFlag}
                className={`ml-auto flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[12px] transition ${
                  choice.flagged
                    ? 'border-amber/60 bg-amber/10 text-amber'
                    : 'border-line text-text-3 hover:border-amber/50 hover:text-amber'
                }`}
              >
                <Flag className="h-3 w-3" />
                标记疑题
              </button>
            </div>

            <div className="mb-4 text-[16px] leading-7 text-text-1">
              <span className="mr-2 font-num text-cyan">{cur + 1}.</span>
              {q.stem}
            </div>

            {/* 选项 */}
            {q.type === 'judge' ? (
              <div className="flex gap-3">
                {q.options.map((opt, i) => {
                  const sel = choice.chosen.includes(i);
                  return (
                    <button
                      key={opt}
                      onClick={() => toggleOption(i)}
                      disabled={choice.submitted}
                      className={`flex h-[44px] flex-1 items-center justify-center gap-2 rounded-md border text-[14px] transition ${
                        sel
                          ? 'border-cyan bg-cyan/10 text-cyan shadow-[0_0_10px_rgba(34,211,238,.25)]'
                          : 'border-line text-text-2 hover:bg-bg-panel-2'
                      }`}
                    >
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${sel ? 'border-cyan' : 'border-line'}`}>
                        {sel && <span className="h-2 w-2 rounded-full bg-cyan" />}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const sel = choice.chosen.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleOption(i)}
                      disabled={choice.submitted}
                      className={`flex h-[44px] w-full items-center gap-3 rounded-md border px-3 text-left text-[14px] transition ${
                        sel
                          ? 'border-cyan bg-cyan/10 text-text-1'
                          : 'border-line text-text-2 hover:bg-bg-panel-2'
                      }`}
                    >
                      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${sel ? 'border-cyan' : 'border-line'}`}>
                        {sel && <span className="h-2 w-2 rounded-full bg-cyan" />}
                      </span>
                      <span className="mr-1 font-num text-text-3">{String.fromCharCode(65 + i)}</span>
                      <span className="min-w-0 flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* 逐题即时反馈 */}
            <AnimatePresence>
              {choice.submitted && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`mt-3 rounded-md border px-3 py-2 ${
                    correct
                      ? 'border-green/50 bg-green/10 shadow-[0_0_12px_rgba(52,211,153,.2)]'
                      : 'border-red/50 bg-red/10 shadow-[0_0_12px_rgba(239,68,68,.2)]'
                  }`}
                >
                  <div className={`text-[13px] font-bold ${correct ? 'text-green' : 'text-red'}`}>
                    {correct
                      ? '✓ 回答正确'
                      : `✗ 正确答案：${q.answer.map((i) => (q.type === 'judge' ? q.options[i] : String.fromCharCode(65 + i))).join('、')}`}
                  </div>
                  <div className="mt-0.5 text-[12px] leading-5 text-text-2">
                    解析：{q.analysis} · 演示数据
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 底部按钮 */}
            <div className="mt-auto flex items-center gap-2 pt-4">
              <button
                onClick={() => setCur((i) => Math.max(0, i - 1))}
                disabled={cur === 0}
                className="flex h-9 cursor-pointer items-center gap-1 rounded-md border border-line px-3 text-[13px] text-text-2 transition hover:border-line-glow hover:text-cyan disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                上一题
              </button>
              <button
                onClick={submitCurrent}
                disabled={choice.submitted || choice.chosen.length === 0}
                className="h-9 flex-1 rounded-md bg-cyan text-[13px] font-bold text-bg-deep transition hover:brightness-110 disabled:opacity-40"
              >
                {choice.submitted ? '已提交' : '提交当前题'}
              </button>
              {cur < questions.length - 1 ? (
                <button
                  onClick={() => setCur((i) => Math.min(questions.length - 1, i + 1))}
                  className="flex h-9 cursor-pointer items-center gap-1 rounded-md border border-line px-3 text-[13px] text-text-2 transition hover:border-line-glow hover:text-cyan"
                >
                  下一题
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (unanswered > 0) setConfirmOpen(true);
                    else doSubmit();
                  }}
                  className="flex h-9 cursor-pointer items-center gap-1 rounded-md bg-cyan px-4 text-[13px] font-bold text-bg-deep transition hover:brightness-110 hover:shadow-[0_0_12px_rgba(34,211,238,.4)]"
                >
                  交卷
                </button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 右栏 · 计时与智能体提示 */}
      <div className="flex w-[260px] shrink-0 flex-col gap-3">
        <div className="rounded-lg border border-line bg-bg-panel/90 p-3 text-center backdrop-blur-[8px]">
          <div className="mb-1 text-[12px] text-text-3">剩余时间</div>
          <motion.div
            key={timeLeft}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className={`font-num text-[40px] leading-none tracking-wider ${timerColor}`}
          >
            {mm}:{ss}
          </motion.div>
          <div className="mt-1 text-[11px] text-text-3">{postNameOf(post)} · 限时 10 分钟 · 演示数据</div>
        </div>

        <div className="flex-1 rounded-lg border border-violet/40 bg-violet/5 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-violet">
            <Bot className="h-4 w-4" />
            考核监督智能体
            <DemoTag className="ml-auto" />
          </div>
          <div className="space-y-2">
            {hints.length === 0 ? (
              <div className="text-[12px] leading-5 text-text-3">
                考核监督智能体在线，将按答题进度推送节奏提示（不提供答案）。
              </div>
            ) : (
              hints.map((h, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-md border border-violet/30 bg-bg-panel-2/60 px-2 py-1.5 text-[12px] leading-5 text-text-2"
                >
                  {h} · 演示数据
                </motion.div>
              ))
            )}
          </div>
          <button
            onClick={() => onRequestAgentHint?.('考核监督：节奏与注意事项提示')}
            className="mt-2 h-7 w-full cursor-pointer rounded-md border border-violet/40 text-[12px] text-violet transition hover:bg-violet/10"
          >
            呼叫考核监督智能体
          </button>
        </div>
      </div>

      {/* 交卷确认 Dialog */}
      <AnimatePresence>
        {confirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[340px] rounded-lg border border-line bg-bg-panel p-4 shadow-2xl"
            >
              <div className="mb-2 text-[15px] font-bold text-text-1">确认交卷？</div>
              <div className="mb-4 text-[13px] text-text-2">还有 {unanswered} 题未作答，确定交卷？</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmOpen(false)}
                  className="h-9 flex-1 cursor-pointer rounded-md border border-line text-[13px] text-text-2 transition hover:border-line-glow hover:text-cyan"
                >
                  继续作答
                </button>
                <button
                  onClick={() => {
                    setConfirmOpen(false);
                    doSubmit();
                  }}
                  className="h-9 flex-1 cursor-pointer rounded-md bg-cyan text-[13px] font-bold text-bg-deep transition hover:brightness-110"
                >
                  确定交卷
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- 步骤三：成绩与错题回顾 ----------

function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒`;
}

function ResultReview({
  input,
  onRestart,
  onBack,
}: {
  input: SubmitExamInput;
  onRestart: () => void;
  onBack: () => void;
}) {
  const [gradeState, setGradeState] = useState<FetchState>('loading');
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [session, setSession] = useState<ExamSession | null>(null);
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  // 每次交卷只发布一次成绩（重试/状态演示不重复回写熟悉度）
  const publishedKey = useRef<string | null>(null);

  const grade = useCallback((s: FetchState) => {
    setGradeState('loading');
    submitExam(input, { state: s })
      .then((res) => {
        setSession(res);
        setGradeState('ok');
        if (publishedKey.current !== input.startedAt) {
          publishedKey.current = input.startedAt;
          const wrong = res.questions
            .map((qu) => ({ qu, ans: res.answers.find((a) => a.questionId === qu.id)! }))
            .filter((x) => !x.ans.correct);
          const correctPointIds = res.questions
            .filter((qu) => res.answers.find((a) => a.questionId === qu.id)?.correct)
            .map((qu) => qu.relatedNodeId)
            .filter((id): id is string => !!id);
          setExamResult(
            submitExamResult(
              {
                postId: res.post,
                postName: postNameOf(res.post),
                score: res.score,
                total: res.questions.length,
                wrongQuestions: wrong.map(({ qu }) => ({
                  questionId: qu.id,
                  stem: qu.stem,
                  pointId: qu.relatedNodeId,
                  pointName: qu.relatedNodeId ? findNode(qu.relatedNodeId)?.name : undefined,
                })),
                finishedAt: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
                buildingName: '乐盈广场21号楼',
              },
              { correctPointIds },
            ),
          );
        }
      })
      .catch(() => {
        setSession(null);
        setGradeState('error');
      });
  }, [input]);

  useEffect(() => {
    grade(demoState);
  }, [grade, demoState]);

  if (gradeState === 'loading') {
    return (
      <div className="mx-auto flex h-full max-w-[860px] flex-col gap-3 p-6">
        <div className="h-[120px] animate-pulse rounded-lg bg-bg-panel-2" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-bg-panel-2" style={{ opacity: 1 - i * 0.2 }} />
        ))}
        <div className="text-center text-[13px] text-text-3">成绩加载中… · 演示数据</div>
      </div>
    );
  }

  if (gradeState === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <img src="/error-radar.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
        <div className="text-[13px] text-text-2">评分失败，请检查网络后重试</div>
        <button
          onClick={() => grade('ok')}
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-cyan/50 px-4 text-[13px] text-cyan transition hover:bg-cyan/10"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          重试
        </button>
      </div>
    );
  }

  if (!session) return null;

  const wrongList = session.questions
    .map((qu) => ({ qu, ans: session.answers.find((a) => a.questionId === qu.id)! }))
    .filter((x) => !x.ans.correct);
  const flaggedCount = session.answers.filter((a) => a.flagged).length;
  // 强化导览建议：错题点位去重、按楼层从低到高排序
  const tourPoints = getTourSuggestion(examResult);

  const startBoostTour = () => {
    if (tourPoints.length === 0) return;
    // 先退出考核视图（熟悉路径面板重新挂载），再派发导览事件
    onBack();
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('training:start-tour', {
          detail: { pointIds: tourPoints.map((p) => p.pointId), source: 'exam' },
        }),
      );
    }, 350);
  };
  const scoreColor = session.score >= 80 ? '#34d399' : session.score >= 60 ? '#fbbf24' : '#ef4444';
  const R = 44;
  const CIRC = 2 * Math.PI * R;

  return (
    <div className="mx-auto max-w-[860px] p-4">
      {/* 成绩总览卡 */}
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="mb-4 flex h-[120px] items-center gap-6 rounded-lg border border-line bg-bg-panel/90 px-5 shadow-[0_0_24px_rgba(34,211,238,.08)] backdrop-blur-[8px]"
      >
        {/* 评分环 */}
        <div className="relative h-[92px] w-[92px] shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={R} fill="none" stroke="#0e7490" strokeOpacity="0.3" strokeWidth="8" />
            <motion.circle
              cx="50" cy="50" r={R} fill="none"
              stroke={scoreColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              initial={{ strokeDashoffset: CIRC }}
              animate={{ strokeDashoffset: CIRC * (1 - session.score / 100) }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className="font-num text-[26px] font-bold leading-none"
              style={{ color: scoreColor }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {session.score}
            </motion.span>
            <span className="text-[11px] text-text-3">/ 100</span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[28px] font-bold" style={{ color: scoreColor }}>
              {session.passed ? '考核合格' : '考核不合格'}
            </span>
            <DemoTag />
          </div>
          <div className="mt-1 text-[13px] text-text-2">
            {postNameOf(session.post)}岗位 · 用时 {fmtSec(session.usedSec)}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <MiniStat label="正确" value={session.answers.filter((a) => a.correct).length} color="text-green" />
          <MiniStat label="错误" value={wrongList.length} color="text-red" />
          <MiniStat label="疑题" value={flaggedCount} color="text-amber" />
          {session.passed && (
            <div className="relative flex items-center gap-2 pl-2">
              <span className="rounded-full border border-green/60 bg-green/10 px-2.5 py-1 text-[12px] text-green">
                已记入个人训练档案
              </span>
              <motion.span
                initial={{ scale: 1.6, rotate: 0, opacity: 0 }}
                animate={{ scale: 1, rotate: -8, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="flex items-center gap-1 rounded border-2 border-green/70 px-1.5 py-0.5 text-[12px] font-bold text-green"
              >
                <Stamp className="h-3 w-3" />
                已归档
              </motion.span>
            </div>
          )}
        </div>

        <div className="relative shrink-0">
          <select
            value={demoState}
            onChange={(e) => setDemoState(e.target.value as FetchState)}
            className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
            title="状态演示"
          >
            <option value="ok">状态演示：正常</option>
            <option value="error">状态演示：失败</option>
          </select>
          <ChevronRight className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-90 text-text-3" />
        </div>
      </motion.div>

      {/* 错题回顾 */}
      <div className="mb-2 flex items-center gap-2 text-[14px] font-bold text-text-1">
        错题回顾
        <span className="font-num text-[12px] font-normal text-text-3">{wrongList.length} 题</span>
        <DemoTag />
      </div>
      {wrongList.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-green/40 bg-green/5 py-10">
          <UserCheck className="h-10 w-10 text-green" />
          <div className="text-[15px] font-bold text-green">全部答对，无错题 · 演示数据</div>
        </div>
      ) : (
        <div className="space-y-3 pb-4">
          {wrongList.map(({ qu, ans }, i) => {
            const node = qu.relatedNodeId ? findNode(qu.relatedNodeId) : undefined;
            const yourAns = ans.chosen.length
              ? ans.chosen.map((x) => (qu.type === 'judge' ? qu.options[x] : String.fromCharCode(65 + x))).join('、')
              : '未作答';
            const rightAns = qu.answer
              .map((x) => (qu.type === 'judge' ? qu.options[x] : String.fromCharCode(65 + x)))
              .join('、');
            return (
              <motion.div
                key={qu.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
                className="rounded-lg border border-line border-l-[3px] border-l-red bg-bg-panel/90 p-3 backdrop-blur-[8px]"
              >
                <div className="mb-1.5 flex items-center gap-2 text-[12px] text-text-3">
                  <span className={`rounded border px-1.5 py-px ${TYPE_META[qu.type].cls}`}>{TYPE_META[qu.type].label}</span>
                  {qu.knowledge}
                </div>
                <div className="mb-1.5 text-[14px] leading-6 text-text-1">{qu.stem}</div>
                <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  <span className="text-red line-through">你的答案：{yourAns}</span>
                  <span className="text-green">正确答案：{rightAns}</span>
                </div>
                <div className="mb-1 text-[12px] leading-5 text-text-2">解析：{qu.analysis} · 演示数据</div>
                <div className="mb-2 text-[12px] leading-5 text-amber">
                  错因：对「{qu.knowledge}」掌握不牢，建议结合关联点位实地复盘强化 · 演示数据
                </div>
                {node && (
                  <button
                    onClick={() => {
                      addSceneAction({
                        action: 'flyTo',
                        target: `${node.name} (${node.lng}, ${node.lat})`,
                        params: { lng: node.lng, lat: node.lat },
                        source: '面板',
                      });
                      showToast('可返回熟悉模块复习该点位 · 演示数据');
                    }}
                    className="cursor-pointer rounded-md border border-line bg-bg-panel-2 px-2 py-1 text-[12px] text-text-2 transition hover:border-cyan hover:text-cyan"
                    title="点击定位相关知识点位"
                  >
                    相关知识点位：{node.name}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* 底部按钮 */}
      <div className="flex gap-2 border-t border-line pt-3">
        <button
          onClick={startBoostTour}
          disabled={tourPoints.length === 0}
          className="flex h-9 items-center gap-1.5 rounded-md bg-cyan px-4 text-[13px] font-bold text-bg-deep transition hover:brightness-110 hover:shadow-[0_0_12px_rgba(34,211,238,.4)] disabled:opacity-40"
          title={tourPoints.length === 0 ? '无关联错题点位，无需强化导览' : `按楼层顺序导览 ${tourPoints.length} 个薄弱点位`}
        >
          <Route className="h-4 w-4" />
          生成强化导览{tourPoints.length > 0 ? `（${tourPoints.length} 站）` : ''}
        </button>
        <button
          onClick={onRestart}
          className="flex h-9 items-center gap-1.5 rounded-md border border-cyan/60 px-4 text-[13px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_10px_rgba(34,211,238,.3)]"
        >
          <RefreshCcw className="h-4 w-4" />
          重新考核
        </button>
        <button
          onClick={onBack}
          className="flex h-9 items-center gap-1.5 rounded-md border border-line px-4 text-[13px] text-text-2 transition hover:border-line-glow hover:text-cyan"
        >
          <ArrowLeft className="h-4 w-4" />
          返回熟悉
        </button>
        <button
          onClick={() => showToast('成绩单已导出 · 演示数据')}
          className="ml-auto flex h-9 items-center gap-1.5 rounded-md border border-line px-4 text-[13px] text-text-2 transition hover:border-line-glow hover:text-cyan"
        >
          <Download className="h-4 w-4" />
          导出成绩单（模拟）
        </button>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`font-num text-[22px] font-bold leading-none ${color}`}>{value}</div>
      <div className="mt-1 text-[11px] text-text-3">{label}</div>
    </div>
  );
}
