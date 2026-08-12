'use client';
// 右侧智能体对话侧边栏:壳(折叠栏/标题栏)+ assistant-ui Thread(AgentChatThread)。
// 对话/流式/思考/图片/工具卡由 assistant-ui 渲染,协议桥接见 AgentChatThread;历史对话见 ChatHistoryPanel。
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Compass, Crosshair, FileText, Sparkles, ChevronLeft, ChevronRight,
  Wifi, WifiOff, History,
} from 'lucide-react';
import type { AgentPanelId, ModuleKey } from '@/mock/agentScripts';
import { AgentChatThread, type AgentConnState } from '@/components/assistant-ui/AgentChatThread';
import ChatHistoryPanel from '@/components/assistant-ui/ChatHistoryPanel';

export interface AgentSidebarProps {
  onOpenPanel?: (panelId: AgentPanelId) => void;
  module?: ModuleKey;
}

/** 多身份映射：标题/副标题/图标随模块切换 */
const AGENT_IDENTITIES: Record<ModuleKey, { title: string; subtitle: string; Icon: typeof Bot }> = {
  overview: { title: '态势研判智能体', subtitle: '资源查询 · 场景联动 · 辅助研判', Icon: Crosshair },
  objects: { title: '档案分析智能体', subtitle: '建筑档案 · 设施查询 · 风险研判', Icon: Bot },
  drill: { title: '预案推演智能体', subtitle: '情景推演 · 预案生成与评估', Icon: FileText },
  training: { title: '熟悉引导智能体', subtitle: '引导熟悉 · 考核答疑', Icon: Compass },
  command: { title: '辅助决策智能体', subtitle: '实时灾情推理 · 调度建议', Icon: Crosshair },
};

/** 连接状态徽标(标题栏右侧) */
function ConnBadge({ state }: { state: AgentConnState }) {
  const cfg: Record<AgentConnState, { cls: string; dot: string; text: string }> = {
    idle: { cls: 'border-line text-text-3', dot: 'bg-text-3', text: '就绪' },
    streaming: { cls: 'border-violet/40 text-violet', dot: 'bg-violet animate-pulse', text: '对话中' },
    online: { cls: 'border-green/40 text-green', dot: 'bg-green', text: '在线' },
    error: { cls: 'border-red/40 text-red', dot: 'bg-red', text: '连接异常' },
  };
  const c = cfg[state];
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${c.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {state === 'error' ? <WifiOff className="h-2.5 w-2.5" /> : <Wifi className="h-2.5 w-2.5" />}
      {c.text}
    </span>
  );
}

export default function AgentSidebar({ onOpenPanel, module = 'overview' }: AgentSidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const [conn, setConn] = useState<AgentConnState>('idle');
  const [unread, setUnread] = useState(0);
  // 展开宽度:可拖拽调整(260~560,默认 400);折叠固定 56
  const [panelWidth, setPanelWidth] = useState(400);
  // 历史对话:当前会话 id + 历史面板开关
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const sendRef = useRef<((text: string) => void) | null>(null);
  const identity = AGENT_IDENTITIES[module];

  const handleToggle = () => {
    setExpanded((v) => !v);
    if (!expanded) setUnread(0);
  };

  // 切模块时重置会话(历史按模块隔离)
  useEffect(() => {
    setActiveSessionId(undefined);
    setHistoryOpen(false);
  }, [module]);

  const Icon = identity.Icon;

  // 左缘拖拽调宽:pointerdown 记录起点 → pointermove 算 delta → clamp 260~560
  const startResize = (e: React.PointerEvent) => {
    resizeRef.current = { startX: e.clientX, startW: panelWidth };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const r = resizeRef.current;
    if (!r) return;
    const w = Math.min(560, Math.max(260, r.startW - (e.clientX - r.startX)));
    setPanelWidth(w);
  };
  const endResize = () => {
    resizeRef.current = null;
  };

  return (
    <div
      className="relative flex h-full shrink-0"
      style={{ width: expanded ? panelWidth : 56 }}
    >
      {/* 左缘拖拽手柄(展开态可见) */}
      {expanded && (
        <div
          onPointerDown={startResize}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          className="group absolute -left-1 top-0 z-20 flex h-full w-2 cursor-col-resize items-center justify-center"
          title="拖拽调整宽度"
        >
          <div className="h-10 w-0.5 rounded-full bg-line transition group-hover:bg-cyan/60 group-active:bg-cyan" />
        </div>
      )}
      <motion.div
        animate={{ width: expanded ? panelWidth : 56 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex h-full shrink-0 flex-col overflow-hidden border-l border-line bg-bg-panel/95"
      >
      {/* 折叠态:图标栏 */}
      {!expanded && (
        <div className="flex h-full flex-col items-center py-3">
          <button
            onClick={handleToggle}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet/30 to-cyan/20 shadow-[0_0_12px_rgba(167,139,250,.25)] transition hover:from-violet/50 hover:to-cyan/40"
            title="展开智能体"
          >
            <Icon className="h-5 w-5 text-text-1" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          <button
            onClick={handleToggle}
            className="mt-auto flex h-9 w-9 items-center justify-center rounded-lg text-text-3 transition hover:bg-white/5 hover:text-text-1"
            title="展开"
          >
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        </div>
      )}

      {/* 展开态:完整面板 */}
      {expanded && (
        <div className="flex h-full flex-col">
          {/* 标题栏 */}
          <div className="relative flex h-12 shrink-0 items-center gap-2 bg-gradient-to-r from-violet/25 via-bg-panel to-cyan/15 px-3">
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan/50 to-transparent" />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={module}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex min-w-0 items-center gap-2"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet to-cyan shadow-[0_0_12px_rgba(167,139,250,.4)]">
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="whitespace-nowrap text-[14px] font-bold text-text-1">{identity.title}</span>
                    <Sparkles className="h-3 w-3 text-violet" />
                  </div>
                  <div className="whitespace-nowrap text-[10px] text-text-3">{identity.subtitle}</div>
                </div>
              </motion.div>
            </AnimatePresence>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <ConnBadge state={conn} />
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className={`rounded p-1 transition hover:bg-white/10 hover:text-text-1 ${historyOpen ? 'bg-white/10 text-cyan' : 'text-text-3'}`}
                title="历史对话"
              >
                <History className="h-4 w-4" />
              </button>
              <button
                onClick={handleToggle}
                className="rounded p-1 text-text-3 transition hover:bg-white/10 hover:text-text-1"
                title="收起"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* 对话区(assistant-ui Thread)+ 历史浮层 */}
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {historyOpen ? (
              <ChatHistoryPanel
                module={module}
                activeId={activeSessionId}
                onSelect={(id) => {
                  setActiveSessionId(id);
                  setHistoryOpen(false);
                }}
                onNew={() => {
                  setActiveSessionId(undefined);
                  setHistoryOpen(false);
                }}
                onClose={() => setHistoryOpen(false)}
              />
            ) : (
              <AgentChatThread
                module={module}
                sessionId={activeSessionId}
                onSessionChange={(s) => setActiveSessionId(s?.id)}
                sendRef={sendRef}
                onStateChange={(s) => setConn(s)}
              />
            )}
          </div>
        </div>
      )}
      </motion.div>
    </div>
  );
}
