// 演练对抗·对抗舱 小组件(照抄原型 ConfrontationPanel.tsx 的 ShuffleText/Dots/ScoreRing/TimelineNode)。
'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { fmtT } from './confront-helpers';
import { Bot, Check, CircleDashed, ClipboardCheck, Shield, Swords } from 'lucide-react';
import type { ConfrontAgentActivity, ConfrontAgentRole } from './confront-store';

const ROLE_UI: Record<ConfrontAgentRole, { label: string; color: string; icon: typeof Bot }> = {
  planner: { label: '预案规划员', color: '#a78bfa', icon: Bot },
  adversary: { label: '导调对手', color: '#f97316', icon: Swords },
  commander: { label: '现场总指挥', color: '#22d3ee', icon: Shield },
  evaluator: { label: '评估与复盘专家', color: '#34d399', icon: ClipboardCheck },
};

const TOOL_LABELS: Record<string, string> = {
  resolve_operational_context: '作战上下文', query_building_profile: '建筑档案',
  query_key_parts: '重点部位', query_facilities: '设施台账',
  query_scene_facilities: '3D设施', reconcile_building_facilities: '设施对账',
  query_operational_plan: '正式预案', query_force_availability: '可用力量',
  query_water_sources: '消防水源', analyze_response: '响应分析',
  query_knowledge: '预案知识', inject_event: '注入特情', report_decision: '上报决策',
};

/** 真实执行轨迹：显示角色、耗时与工具状态，不展示模型 reasoning 正文。 */
export function AgentActivityStrip({ activity }: { activity: ConfrontAgentActivity }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (activity.status !== 'running') return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activity.status, activity.startedAt]);
  const ui = ROLE_UI[activity.role];
  const Icon = ui.icon;
  const elapsed = Math.max(0, Math.ceil(((activity.finishedAt ?? now) - activity.startedAt) / 1000));
  const tools = activity.tools.slice(-6);
  return (
    <motion.div
      key={`${activity.role}-${activity.startedAt}`}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="shrink-0 overflow-hidden border-b border-line bg-bg-panel/95"
    >
      <div className="flex min-h-[72px] items-center gap-3 px-4 py-2.5">
        <motion.span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
          style={{ color: ui.color, borderColor: `${ui.color}99`, backgroundColor: `${ui.color}12` }}
          animate={activity.status === 'running' ? { boxShadow: [`0 0 0 ${ui.color}00`, `0 0 16px ${ui.color}88`, `0 0 0 ${ui.color}00`] } : undefined}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <Icon className="h-4 w-4" />
        </motion.span>
        <div className="min-w-[210px]">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold" style={{ color: ui.color }}>{ui.label}</span>
            <span className="rounded border border-green/50 bg-green/10 px-1.5 py-px text-[10px] font-bold text-green">
              REAL AGENT
            </span>
            <span className="font-mono text-[10px] text-text-3">App …{activity.appIdSuffix}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-text-2">
            {activity.status === 'running' ? <CircleDashed className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {activity.phase}
            {activity.status === 'running' && <Dots />}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-center justify-between text-[10px] text-text-3">
            <span>可审计工具轨迹 · 不展示模型原始思维</span>
            <span className="font-mono">{tools.length} 次调用 · {elapsed}s</span>
          </div>
          <div className="flex min-h-6 flex-wrap gap-1.5">
            {tools.length === 0 ? (
              <span className="rounded border border-line px-2 py-0.5 text-[11px] text-text-3">正在建立智能体会话</span>
            ) : tools.map((tool, index) => (
              <span
                key={`${tool.name}-${index}`}
                className="flex items-center gap-1 rounded border border-line bg-bg-panel-2 px-2 py-0.5 text-[11px] text-text-2"
              >
                {tool.status === 'done'
                  ? <Check className="h-2.5 w-2.5 text-green" />
                  : <CircleDashed className="h-2.5 w-2.5 animate-spin" style={{ color: ui.color }} />}
                {TOOL_LABELS[tool.name] ?? tool.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** 洗牌闪变:0.4s slot-machine 字符滚动后定格(照抄原型 L33-55)。 */
export function ShuffleText({ text, className = '' }: { text: string; className?: string }) {
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

/** 三点跳动(照抄原型 L57-70)。 */
export function Dots({ className = '' }: { className?: string }) {
  return (
    <span className={className}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
        >
          .
        </motion.span>
      ))}
    </span>
  );
}

/** 环形分数(照抄原型 L72-93)。 */
export function ScoreRing({ score, pass }: { score: number; pass: boolean }) {
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

/** 时间轴节点(照抄原型 L676-712)。 */
export function TimelineNode({
  color,
  badge,
  tSec,
  text,
  pulse,
  onClick,
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
