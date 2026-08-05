import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Compass, Crosshair, FileText, Minus, Send, Sparkles, Zap } from 'lucide-react';
import DemoTag from './DemoTag';
import { addSceneAction } from '@/mock/sceneLog';
import {
  AGENT_FALLBACK,
  AGENT_SCRIPTS,
  AGENT_WELCOME,
  matchScript,
} from '@/mock/agentScripts';
import type { AgentPanelId, AgentReply, AgentSceneAction, AgentScript, ModuleKey } from '@/mock/agentScripts';

export interface AgentChatProps {
  /**
   * 智能体请求调起业务面板。
   * panelId 约定（见 src/mock/agentScripts.ts 的 AgentPanelId）：
   *  - 'force-resource'   → 切到态势总览模块并打开/聚焦「执勤力量资源库」面板
   *  - 'building-profile' → 切到对象总览模块并打开「单建筑档案」面板（自动选中 5F）
   *  - 'drill-scenario'   → 切到演练对抗模块并打开情景/预案面板（自动填入演示情景）
   *  - 'close-panels'     → 远程收起当前模块全部业务面板
   * 由主代理在 App.tsx 接线：<AgentChat onOpenPanel={...} />
   */
  onOpenPanel?: (panelId: AgentPanelId) => void;
  /** 当前业务模块：决定智能体身份（标题/副标题/图标），缺省为态势总览 */
  module?: ModuleKey;
}

/** 多身份映射：渐变不变，仅文案与图标随模块切换 */
const AGENT_IDENTITIES: Record<ModuleKey, { title: string; subtitle: string; Icon: typeof Bot }> = {
  overview: { title: '预案智能辅助智能体', subtitle: '对话驱动场景 · 远程调起面板', Icon: Bot },
  objects: { title: '预案智能辅助智能体', subtitle: '对话驱动场景 · 远程调起面板', Icon: Bot },
  drill: { title: '预案输出智能体', subtitle: '情景推演 · 预案生成与评估', Icon: FileText },
  training: { title: '熟悉引导智能体', subtitle: '引导熟悉 · 考核答疑', Icon: Compass },
  command: { title: '辅助决策智能体', subtitle: '实时灾情推理 · 调度建议', Icon: Crosshair },
};

interface ChatMessage {
  id: number;
  role: 'user' | 'agent';
  text: string;
  time: string;
  actions?: AgentSceneAction[];
}

const SPRING = [0.16, 1, 0.3, 1] as [number, number, number, number];

function nowTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

let msgId = 0;

/** 打字机智能体消息：文本逐步输出，完成后回调（动作日志由父组件统一去重写入） */
function AgentBubble({
  text,
  time,
  actions,
  onDone,
}: {
  text: string;
  time: string;
  actions?: AgentSceneAction[];
  onDone: () => void;
}) {
  const [len, setLen] = useState(0);
  const doneRef = useRef(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setLen((v) => {
        if (v >= text.length) {
          window.clearInterval(timer);
          if (!doneRef.current) {
            doneRef.current = true;
            onDoneRef.current();
          }
          return v;
        }
        return v + 3; // ~每帧 3 字
      });
    }, 50);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const typing = len < text.length;

  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-2"
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet to-cyan">
        <Bot className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="max-w-[85%]">
        <div className="rounded-xl rounded-tl-sm border border-line bg-violet/10 px-3 py-2 text-[13px] leading-5 text-text-1">
          {text.slice(0, len)}
          {typing && <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-caret-blink bg-violet align-middle" />}
        </div>
        {!typing && actions && actions.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {actions.map((a, i) => (
              <motion.div
                key={i}
                initial={{ x: -8, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.25, delay: i * 0.12 }}
                className="rounded-md border border-line bg-bg-panel-2/70 px-2 py-1.5"
                style={{ borderLeft: '2px solid var(--cyan)' }}
              >
                <div className="font-mono text-[11px] text-cyan">{a.label}</div>
                <div className="mt-0.5 text-[10px] text-text-3">已写入场景动作日志</div>
              </motion.div>
            ))}
          </div>
        )}
        <div className="mt-1 text-[11px] text-text-3">{time}</div>
      </div>
    </motion.div>
  );
}

/** 智能体「正在输入」三点跳动指示 */
function TypingIndicator() {
  return (
    <motion.div
      initial={{ y: 8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex items-start gap-2"
    >
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet to-cyan">
        <Bot className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="flex items-center gap-1 rounded-xl rounded-tl-sm border border-line bg-violet/10 px-3 py-2.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-violet"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
        <span className="ml-1.5 text-[11px] text-text-3">智能体思考中…</span>
      </div>
    </motion.div>
  );
}

export default function AgentChat({ onOpenPanel, module = 'overview' }: AgentChatProps) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<AgentReply[]>([]);
  const panelRef = useRef<AgentPanelId | undefined>(undefined);
  const identity = AGENT_IDENTITIES[module];
  const visibleScripts = AGENT_SCRIPTS.filter((s) => !s.modules || s.modules.includes(module));

  // 首次载入 5s 后出现未读红点
  useEffect(() => {
    const t = window.setTimeout(() => setUnread(true), 5000);
    return () => window.clearTimeout(t);
  }, []);

  // 新消息自动滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  const pushAgentReply = (reply: AgentReply) => {
    setMessages((prev) => [
      ...prev,
      { id: ++msgId, role: 'agent', text: reply.text, time: nowTime(), actions: reply.actions },
    ]);
  };

  /** 播放一组智能体回复（逐条：思考态 → 打字机 → 下一条） */
  const playReplies = (replies: AgentReply[]) => {
    setPlaying(true);
    setThinking(true);
    queueRef.current = [...replies];
  };

  /**
   * 打字机完成 → 播下一条或结束播放。
   * 注意：场景动作不在这里写入，而是在回复出队（下方 thinking 定时器）时写入，
   * 保证「一条回复的动作只写一次」与气泡/队列时序解耦，杜绝日志重复。
   */
  const handleReplyDone = () => {
    if (queueRef.current.length > 0) {
      setThinking(true);
      return;
    }
    // 全部回复播放完毕：调起业务面板
    setThinking(false);
    setPlaying(false);
    if (panelRef.current && onOpenPanel) {
      const pid = panelRef.current;
      panelRef.current = undefined;
      onOpenPanel(pid);
    }
  };

  // 思考态 1s 后：队列首条回复出队 → 写入场景动作（仅此处写一次）→ 弹出气泡
  useEffect(() => {
    if (!thinking) return;
    const t = window.setTimeout(() => {
      const head = queueRef.current[0];
      if (head) {
        queueRef.current = queueRef.current.slice(1);
        head.actions?.forEach((a) => {
          addSceneAction({ action: a.action, target: a.target, params: a.params, source: '智能体' });
        });
        if (head.openPanel) panelRef.current = head.openPanel;
        setThinking(false);
        pushAgentReply(head);
      } else {
        setThinking(false);
        setPlaying(false);
      }
    }, 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thinking]);

  const runScript = (script: AgentScript) => {
    if (playing) return;
    setOpen(true);
    setUnread(false);
    setMessages((prev) => [...prev, { id: ++msgId, role: 'user', text: script.userText, time: nowTime() }]);
    playReplies(script.replies);
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || playing) return;
    setInput('');
    setMessages((prev) => [...prev, { id: ++msgId, role: 'user', text, time: nowTime() }]);
    const script = matchScript(text);
    if (script) {
      playReplies(script.replies);
    } else {
      playReplies([{ text: AGENT_FALLBACK }]);
    }
  };

  const handleOpen = () => {
    setOpen(true);
    setUnread(false);
    setMessages((prev) =>
      prev.length === 0
        ? [{ id: ++msgId, role: 'agent', text: AGENT_WELCOME, time: nowTime() }]
        : prev,
    );
  };

  return (
    <div className="pointer-events-none absolute bottom-6 right-6 z-50">
      <AnimatePresence mode="wait">
        {!open ? (
          /* 圆形入口 */
          <motion.button
            key="fab"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.8 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            onClick={handleOpen}
            title="智能体助手 · 演示数据"
            className="pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet to-cyan text-white shadow-lg"
            style={{ animation: 'agent-halo 3s ease-in-out infinite' }}
          >
            <style>{`@keyframes agent-halo { 0%,100% { box-shadow: 0 0 0 2px rgba(167,139,250,.35), 0 0 20px rgba(167,139,250,.15);} 50% { box-shadow: 0 0 0 6px rgba(167,139,250,.12), 0 0 32px rgba(167,139,250,.3);} }`}</style>
            <Sparkles className="h-6 w-6" />
            {unread && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red text-[10px] font-bold text-white">
                1
              </span>
            )}
          </motion.button>
        ) : (
          /* 对话面板 */
          <motion.div
            key="panel"
            initial={{ scale: 0.6, opacity: 0, borderRadius: '50%' }}
            animate={{ scale: 1, opacity: 1, borderRadius: '8px' }}
            exit={{ scale: 0.6, opacity: 0, borderRadius: '50%' }}
            transition={{ duration: 0.35, ease: SPRING }}
            className="pointer-events-auto flex h-[560px] w-[380px] origin-bottom-right flex-col overflow-hidden border border-line bg-bg-panel/95 shadow-2xl backdrop-blur-[8px]"
          >
            {/* 标题栏 */}
            <div className="flex h-12 shrink-0 items-center gap-2 bg-gradient-to-r from-violet/25 to-cyan/15 px-3">
              {/* 模块切换时身份区 0.25s 淡入过渡（渐变不变，仅文案与图标切换） */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={module}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex min-w-0 items-center gap-2"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet to-cyan">
                    <identity.Icon className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="whitespace-nowrap text-[15px] font-bold text-text-1">{identity.title}</span>
                      <DemoTag />
                    </div>
                    <div className="whitespace-nowrap text-[11px] text-text-3">{identity.subtitle}</div>
                  </div>
                </motion.div>
              </AnimatePresence>
              <button
                onClick={() => setOpen(false)}
                className="ml-auto rounded p-1 text-text-3 transition hover:bg-white/10 hover:text-text-1"
                title="最小化"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>

            {/* 快捷脚本 chips */}
            <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-3 py-2">
              {visibleScripts.map((s) => (
                <button
                  key={s.id}
                  onClick={() => runScript(s)}
                  disabled={playing}
                  className="flex shrink-0 items-center gap-1 rounded-full border border-violet/40 bg-violet/10 px-2.5 py-1 text-[11px] text-violet transition hover:border-violet hover:bg-violet/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Zap className="h-3 w-3" />
                  {s.chip}
                </button>
              ))}
            </div>

            {/* 消息区 */}
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {messages.map((m) =>
                m.role === 'user' ? (
                  <motion.div
                    key={m.id}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-col items-end"
                  >
                    <div className="max-w-[85%] rounded-xl rounded-br-sm border border-cyan/50 bg-cyan/15 px-3 py-2 text-[13px] leading-5 text-text-1">
                      {m.text}
                    </div>
                    <div className="mt-1 text-[11px] text-text-3">{m.time}</div>
                  </motion.div>
                ) : (
                  <AgentBubble
                    key={m.id}
                    text={m.text}
                    time={m.time}
                    actions={m.actions}
                    onDone={handleReplyDone}
                  />
                ),
              )}
              <AnimatePresence>{thinking && <TypingIndicator key="typing" />}</AnimatePresence>
            </div>

            {/* 输入区 */}
            <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2.5">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={playing}
                placeholder={playing ? '演示对话播放中…' : '向智能体提问，例如：查一下金茂大厦的消防设施…'}
                className="min-w-0 flex-1 rounded-md border border-line bg-bg-panel-2/60 px-2.5 py-1.5 text-[13px] text-text-1 placeholder:text-text-3 focus:border-cyan/60 focus:outline-none disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={playing || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-cyan text-bg-deep transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                title="发送"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
