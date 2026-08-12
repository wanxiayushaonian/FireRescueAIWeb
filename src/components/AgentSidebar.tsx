'use client';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Compass, Crosshair, FileText, Send, Sparkles, Zap, ChevronLeft, ChevronRight } from 'lucide-react';
import DemoTag from './DemoTag';
import { addSceneAction } from '@/mock/sceneLog';
import {
  AGENT_FALLBACK,
  AGENT_SCRIPTS,
  AGENT_WELCOME,
  matchScript,
} from '@/mock/agentScripts';
import type { AgentPanelId, AgentReply, AgentSceneAction, AgentScript, ModuleKey } from '@/mock/agentScripts';

export interface AgentSidebarProps {
  onOpenPanel?: (panelId: AgentPanelId) => void;
  module?: ModuleKey;
}

/** 多身份映射：标题/副标题/图标随模块切换 */
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

function nowTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

let msgId = 0;

/** 打字机智能体消息 */
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
        return v + 3;
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
        <span className="ml-1.5 text-[11px] text-text-3">思考中…</span>
      </div>
    </motion.div>
  );
}

export default function AgentSidebar({ onOpenPanel, module = 'overview' }: AgentSidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const queueRef = useRef<AgentReply[]>([]);
  const panelRef = useRef<AgentPanelId | undefined>(undefined);
  const identity = AGENT_IDENTITIES[module];
  const visibleScripts = AGENT_SCRIPTS.filter((s) => !s.modules || s.modules.includes(module));
  const initedRef = useRef(false);

  // 首次载入欢迎消息
  useEffect(() => {
    if (initedRef.current) return;
    initedRef.current = true;
    setMessages([{ id: ++msgId, role: 'agent', text: AGENT_WELCOME, time: nowTime() }]);
  }, []);

  // 新消息自动滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  // 新消息时如果面板收起，增加未读计数
  useEffect(() => {
    if (!expanded && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'agent') {
        setUnread((c) => c + 1);
      }
    }
  }, [messages, expanded]);

  const pushAgentReply = (reply: AgentReply) => {
    setMessages((prev) => [
      ...prev,
      { id: ++msgId, role: 'agent', text: reply.text, time: nowTime(), actions: reply.actions },
    ]);
  };

  const playReplies = (replies: AgentReply[]) => {
    setPlaying(true);
    setThinking(true);
    queueRef.current = [...replies];
  };

  const handleReplyDone = () => {
    if (queueRef.current.length > 0) {
      setThinking(true);
      return;
    }
    setThinking(false);
    setPlaying(false);
    if (panelRef.current && onOpenPanel) {
      const pid = panelRef.current;
      panelRef.current = undefined;
      onOpenPanel(pid);
    }
  };

  // 思考态 1s 后：队列首条回复出队 → 写入场景动作 → 弹出气泡
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

  const handleToggle = () => {
    setExpanded((v) => !v);
    if (!expanded) setUnread(0); // 展开时清除未读
  };

  const Icon = identity.Icon;

  return (
    <motion.div
      animate={{ width: expanded ? 380 : 56 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full shrink-0 flex-col overflow-hidden border-l border-line bg-bg-panel/95"
    >
      {/* 折叠态：图标栏 */}
      {!expanded && (
        <div className="flex h-full flex-col items-center py-3">
          {/* 智能体图标 */}
          <button
            onClick={handleToggle}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet/30 to-cyan/20 transition hover:from-violet/50 hover:to-cyan/40"
            title="展开智能体"
          >
            <Icon className="h-5 w-5 text-text-1" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {/* 快捷脚本图标 */}
          <div className="mt-4 flex flex-col gap-2">
            {visibleScripts.slice(0, 4).map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setExpanded(true);
                  setUnread(0);
                  setTimeout(() => runScript(s), 300);
                }}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet/30 bg-violet/10 text-violet transition hover:bg-violet/20"
                title={s.chip}
              >
                <Zap className="h-4 w-4" />
              </button>
            ))}
          </div>

          {/* 展开按钮 */}
          <button
            onClick={handleToggle}
            className="mt-auto flex h-9 w-9 items-center justify-center rounded-lg text-text-3 transition hover:bg-white/5 hover:text-text-1"
            title="展开"
          >
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        </div>
      )}

      {/* 展开态：完整面板 */}
      {expanded && (
        <div className="flex h-full flex-col">
          {/* 标题栏 */}
          <div className="flex h-12 shrink-0 items-center gap-2 bg-gradient-to-r from-violet/25 to-cyan/15 px-3">
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
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="whitespace-nowrap text-[14px] font-bold text-text-1">{identity.title}</span>
                    <DemoTag />
                  </div>
                  <div className="whitespace-nowrap text-[10px] text-text-3">{identity.subtitle}</div>
                </div>
              </motion.div>
            </AnimatePresence>
            <button
              onClick={handleToggle}
              className="ml-auto rounded p-1 text-text-3 transition hover:bg-white/10 hover:text-text-1"
              title="收起"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* 快捷脚本 chips */}
          <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-3 py-2">
            {visibleScripts.map((s) => (
              <button
                key={s.id}
                onClick={() => runScript(s)}
                disabled={playing}
                className="flex shrink-0 items-center gap-1 rounded-full border border-violet/40 bg-violet/10 px-2 py-0.5 text-[11px] text-violet transition hover:border-violet hover:bg-violet/20 disabled:cursor-not-allowed disabled:opacity-40"
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
              placeholder={playing ? '播放中…' : '向智能体提问…'}
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
        </div>
      )}
    </motion.div>
  );
}
