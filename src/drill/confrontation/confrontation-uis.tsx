// 演练对抗·对抗舱 小组件(照抄原型 ConfrontationPanel.tsx 的 ShuffleText/Dots/ScoreRing/TimelineNode)。
'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

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

function fmtT(tSec: number): string {
  const m = Math.floor(tSec / 60);
  const s = tSec % 60;
  return `T+${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
