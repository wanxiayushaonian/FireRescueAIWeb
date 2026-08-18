'use client';
// 右侧智能体对话侧边栏:壳(折叠栏/标题栏)+ assistant-ui Thread(AgentChatThread)。
// 对话/流式/思考/图片/工具卡由 assistant-ui 渲染,协议桥接见 AgentChatThread;历史对话见 ChatHistoryPanel。
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, Compass, Crosshair, FileText, Sparkles, ChevronLeft, ChevronRight,
  Wifi, WifiOff, History,
} from 'lucide-react';
import type { AgentPanelId, ModuleKey } from '@/mock/agentScripts';
import { AGENT_APP_IDS, GLOBAL_ASSISTANT_APP_ID } from '@/lib/agent-app-ids';
import { buildAgentContext, type AgentContextDeps } from '@/lib/agent-context';
import { AgentChatThread, type AgentConnState } from '@/components/assistant-ui/AgentChatThread';
import ChatHistoryPanel from '@/components/assistant-ui/ChatHistoryPanel';

export interface AgentSidebarProps {
  onOpenPanel?: (panelId: AgentPanelId) => void;
  module?: ModuleKey;
  /** 模块上下文依赖(App 层组装;经 buildAgentContext 注入每次发送的消息前缀)。 */
  contextDeps?: AgentContextDeps;
  /** 外部预填消息(六熟悉「问智能体」等:自动展开面板并发送;ts 变化触发)。 */
  prefillText?: { text: string; ts: number } | null;
}

/** 多身份映射：标题/副标题/图标随模块切换 */
const AGENT_IDENTITIES: Record<ModuleKey, { title: string; subtitle: string; Icon: typeof Bot }> = {
  overview: { title: '态势研判智能体', subtitle: '资源查询 · 场景联动 · 辅助研判', Icon: Crosshair },
  objects: { title: '档案分析智能体', subtitle: '建筑档案 · 设施查询 · 风险研判', Icon: Bot },
  drill: { title: '预案推演智能体', subtitle: '情景推演 · 预案生成与评估', Icon: FileText },
  training: { title: '熟悉引导智能体', subtitle: '引导熟悉 · 考核答疑', Icon: Compass },
  command: { title: '辅助决策智能体', subtitle: '实时灾情推理 · 调度建议', Icon: Crosshair },
};

/** 全局助手身份(双 tab 第二页签;五模块共享同一 app:工作流串联 + 通识)。 */
const GLOBAL_IDENTITY = { title: '全局助手', subtitle: '跨模块工作流 · 消防通识', Icon: Sparkles };

/** 侧边栏助手维度:business=本模块业务助手;global=全局助手(共享 app)。 */
type AgentTab = 'business' | 'global';

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

export default function AgentSidebar({ onOpenPanel, module = 'overview', contextDeps, prefillText }: AgentSidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const [conn, setConn] = useState<AgentConnState>('idle');
  const [unread, setUnread] = useState(0);
  // 展开宽度:可拖拽调整(260~560,默认 400);折叠固定 56
  const [panelWidth, setPanelWidth] = useState(400);
  // 历史对话:当前会话 id + 历史面板开关
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(undefined);
  const [historyOpen, setHistoryOpen] = useState(false);
  // 双 tab:业务助手/全局助手(全局 app 未配时隐藏 tab 条,退化为单助手)
  const [agentTab, setAgentTab] = useState<AgentTab>('business');
  const resizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const sendRef = useRef<((text: string) => void) | null>(null);
  const identity = agentTab === 'global' ? GLOBAL_IDENTITY : AGENT_IDENTITIES[module];
  const hasGlobal = Boolean(GLOBAL_ASSISTANT_APP_ID);
  const appId = agentTab === 'global' ? AGENT_APP_IDS[module].global : AGENT_APP_IDS[module].business;
  // 上下文注入:仅业务助手(全局助手定位通识,不注入模块状态);每次发送时新鲜计算
  const buildContext = useCallback(
    () => (agentTab === 'business' ? buildAgentContext(module, contextDeps) : null),
    [agentTab, module, contextDeps],
  );

  const handleToggle = () => {
    setExpanded((v) => !v);
    if (!expanded) setUnread(0);
  };

  /** 折叠栏快捷入口:展开并直接落到指定 tab(业务助手/全局助手)。 */
  const expandTo = (tab: AgentTab) => {
    setAgentTab(tab);
    setExpanded(true);
    setUnread(0);
  };

  // 切模块时重置会话(历史按模块隔离);tab 切换同理(业务/全局助手会话不同)
  useEffect(() => {
    setActiveSessionId(undefined);
    setHistoryOpen(false);
  }, [module, agentTab]);

  // 外部预填消息(六熟悉「问智能体」):展开面板并发送(等 thread 挂载后 sendRef 就绪)
  useEffect(() => {
    if (!prefillText?.text) return;
    setExpanded(true);
    setUnread(0);
    const t = window.setTimeout(() => {
      sendRef.current?.(prefillText.text);
    }, 180);
    return () => window.clearTimeout(t);
  }, [prefillText?.ts]);

  const Icon = identity.Icon;
  // 折叠栏业务入口固定用模块图标(不随 agentTab 变化——收起后看到的是本模块业务助手入口)
  const ModuleIcon = AGENT_IDENTITIES[module].Icon;

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
      {/* 折叠态:图标栏——业务助手/全局助手双快捷入口(点击直接展开到对应 tab) */}
      {!expanded && (
        <div className="flex h-full flex-col items-center gap-2 py-3">
          <button
            onClick={() => expandTo('business')}
            className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet/30 to-cyan/20 shadow-[0_0_12px_rgba(167,139,250,.25)] transition hover:from-violet/50 hover:to-cyan/40"
            title={`展开${AGENT_IDENTITIES[module].title}`}
          >
            <ModuleIcon className="h-5 w-5 text-text-1" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red text-[10px] font-bold text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {hasGlobal && (
            <button
              onClick={() => expandTo('global')}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan/25 bg-cyan/8 transition hover:border-cyan/50 hover:bg-cyan/15"
              title="展开全局助手"
            >
              <Sparkles className="h-5 w-5 text-cyan" />
            </button>
          )}

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
                key={`${module}-${agentTab}`}
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

          {/* 双 tab:本模块业务助手 / 全局助手(全局 app 未配时隐藏,退化为单助手) */}
          {hasGlobal && (
            <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line/60 px-2">
              {([['business', AGENT_IDENTITIES[module].title], ['global', '全局助手']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setAgentTab(key)}
                  className={`h-6 rounded-md px-2.5 text-[11px] transition ${
                    agentTab === key
                      ? 'bg-gradient-to-r from-violet/40 to-cyan/30 text-text-1'
                      : 'text-text-3 hover:bg-white/5 hover:text-text-2'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* 对话区(assistant-ui Thread)+ 历史浮层 */}
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            {historyOpen ? (
              <ChatHistoryPanel
                module={module}
                appId={appId}
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
                appId={appId}
                buildContext={buildContext}
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
