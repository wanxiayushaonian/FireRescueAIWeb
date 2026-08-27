// 灾情变量监测面板（command.md §3）：温度/烟气/被困/火势 2×2 仪表网格 + 阈值配色 + 趋势条
import { motion } from 'framer-motion';
import { Building2, Siren, Users, Flame, ArrowUp, ArrowDown, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import type { FetchState } from '@/mock/types';
import type { Incident } from '@/mock/incidents';
import type { LiveVars } from '@/mock/liveChannel';
import PanelStateView from '@/components/PanelStateView';

const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];

type Tone = 'cyan' | 'green' | 'amber' | 'orange' | 'red';
const TONE_TEXT: Record<Tone, string> = {
  cyan: 'text-cyan', green: 'text-green', amber: 'text-amber', orange: 'text-orange', red: 'text-red',
};
const TONE_BORDER: Record<Tone, string> = {
  cyan: 'border-cyan/40', green: 'border-green/40', amber: 'border-amber/40', orange: 'border-orange/50', red: 'border-red/50',
};
const TONE_GLOW: Record<Tone, string> = {
  cyan: 'shadow-[0_0_12px_rgba(34,211,238,.18)]',
  green: 'shadow-[0_0_12px_rgba(52,211,153,.18)]',
  amber: 'shadow-[0_0_12px_rgba(251,191,36,.18)]',
  orange: 'shadow-[0_0_12px_rgba(249,115,22,.22)]',
  red: 'shadow-[0_0_12px_rgba(239,68,68,.25)]',
};

function Sparkline({ points, className }: { points: number[]; className?: string }) {
  if (points.length < 2) return <div className="h-6" />;
  const w = 150;
  const h = 24;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const path = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - 3 - ((p - lo) / span) * (h - 6)}`)
    .join(' ');
  return (
    <motion.svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-6 w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
      preserveAspectRatio="none"
    >
      <polyline points={path} fill="none" strokeWidth="1.5" className={className} strokeLinejoin="round" />
    </motion.svg>
  );
}

interface GaugeDef {
  /** 数值型指标的历史键;文本型(floor/units)为 null → 不渲染趋势条与涨落箭头 */
  key: keyof LiveVars['history'] | null;
  name: string;
  icon: LucideIcon;
  display: string;
  unit: string;
  tone: Tone;
  delta: number;
  over: boolean; // 超阈值呼吸发光
  points?: number[];
  /** 文本型指标的副文案行(楼层功能区 / 参站单位名列表) */
  sub?: string;
}

function textGauge(name: string, icon: LucideIcon, vars: LiveVars): GaugeDef {
  if (name === 'floor') {
    return { key: null, name: '着火楼层', icon: Building2, display: vars.floor || '—', unit: '', tone: 'cyan', delta: 0, over: false };
  }
  const n = vars.units.length;
  return {
    key: null, name: '参战单位', icon: Siren,
    display: String(n), unit: n === 1 ? '支' : '支力量',
    tone: n >= 4 ? 'orange' : n >= 2 ? 'green' : 'cyan',
    delta: 0, over: false,
    sub: n > 0 ? vars.units.join('、') : '待调度确认',
  };
}

function buildGauges(vars: LiveVars): GaugeDef[] {
  const h = vars.history;
  const deltaOf = (arr: number[]) => (arr.length >= 2 ? arr[arr.length - 1] - arr[arr.length - 2] : 0);
  const trappedTone: Tone = vars.trapped > 0 ? 'orange' : 'green';
  const levelTone: Tone = vars.fireLevel >= 4 ? 'red' : vars.fireLevel === 3 ? 'orange' : 'cyan';
  return [
    textGauge('floor', Building2, vars),
    textGauge('units', Siren, vars),
    {
      key: 'trapped', name: '被困人数', icon: Users,
      display: String(vars.trapped), unit: vars.trapped === 0 ? '全部救出' : '人', tone: trappedTone,
      delta: deltaOf(h.trapped), over: false, points: h.trapped,
    },
    {
      key: 'fireLevel', name: '火势等级', icon: Flame,
      display: ROMAN[vars.fireLevel - 1] ?? '—', unit: '级', tone: levelTone,
      delta: deltaOf(h.fireLevel), over: vars.fireLevel >= 4, points: h.fireLevel,
    },
  ];
}

const STROKE_CLS: Record<Tone, string> = {
  cyan: 'stroke-cyan', green: 'stroke-green', amber: 'stroke-amber', orange: 'stroke-orange', red: 'stroke-red',
};

function EmptyHint() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
      <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
      <div className="text-[13px] text-text-2">请先在左侧选择或接入一起警情</div>
    </div>
  );
}

export default function DisasterVarsPanel({
  incident, vars,
}: {
  incident: Incident | null;
  vars: LiveVars | null;
}) {
  const [demoState, setDemoState] = useState<FetchState>('ok');

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        {incident && (
          <span className="flex items-center gap-1.5 text-[11px] text-cyan">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan [animation-duration:1.5s]" />
            实时刷新中
          </span>
        )}
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
          skeletonRows={3}
          onRetry={() => { setDemoState('loading'); window.setTimeout(() => setDemoState('ok'), 800); }}
        />
      ) : !incident || !vars ? (
        <EmptyHint />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-2.5">
          <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-hidden">
            {buildGauges(vars).map((g, i) => (
              <motion.div
                key={g.key}
                initial={{ scale: 0.96, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: i * 0.08 }}
                className={`flex min-h-0 flex-col gap-2 overflow-hidden rounded-lg border bg-bg-panel-2/50 p-2 ${
                  TONE_BORDER[g.tone]
                } ${g.over ? `${TONE_GLOW[g.tone]} animate-pulse [animation-duration:2s]` : ''}`}
              >
                <div className="flex shrink-0 items-center gap-1.5">
                  <g.icon className={`h-3.5 w-3.5 shrink-0 ${TONE_TEXT[g.tone]}`} />
                  <span className="min-w-0 truncate text-[12px] text-text-2">{g.name}</span>
                  {g.delta !== 0 && (
                    <motion.span
                      key={`${g.key}-${vars.sampledAt}`}
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 1 }}
                      className="ml-auto shrink-0"
                    >
                      {g.delta > 0 ? (
                        <ArrowUp className="h-3 w-3 text-red" />
                      ) : (
                        <ArrowDown className="h-3 w-3 text-green" />
                      )}
                    </motion.span>
                  )}
                </div>
                <div className="flex shrink-0 items-baseline gap-1">
                  <motion.span
                    key={`${g.key}-v-${vars.sampledAt}`}
                    initial={{ opacity: 0.2 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    className={`font-num min-w-0 truncate text-[30px] font-bold leading-8 ${TONE_TEXT[g.tone]}`}
                  >
                    {g.display}
                  </motion.span>
                  <span className="shrink-0 text-[11px] text-text-3">{g.unit}</span>
                </div>
                {'points' in g && g.points && g.points.length >= 2 ? (
                  <div className="min-h-0 flex-1">
                    <Sparkline points={g.points} className={STROKE_CLS[g.tone]} />
                  </div>
                ) : (
                  <div className="flex min-h-0 flex-1 items-start overflow-hidden">
                    <span className="truncate text-[11px] leading-4 text-text-3" title={g.sub}>{g.sub ?? ''}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
          <div className="shrink-0 pt-1.5 text-center text-[11px] text-text-3">
            数据源：现场回传（模拟）· 刷新周期 5-10s
          </div>
        </div>
      )}
    </div>
  );
}
