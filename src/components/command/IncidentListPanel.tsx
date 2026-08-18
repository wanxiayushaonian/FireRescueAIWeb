// 实时警情接入面板（command.md §2）：警情列表 + 状态机徽标 + 模拟新警情接入 + 三态演示
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, ChevronDown, ChevronUp, FlameKindling, AudioLines } from 'lucide-react';
import type { FetchState } from '@/mock/types';
import type { Incident, IncidentStatus } from '@/mock/incidents';
import PanelStateView from '@/components/PanelStateView';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

export const STATUS_STYLE: Record<IncidentStatus, { cls: string; dot: string }> = {
  接警: { cls: 'border-amber/60 bg-amber/10 text-amber', dot: 'bg-amber' },
  出动: { cls: 'border-blue/60 bg-blue/10 text-blue', dot: 'bg-blue' },
  到场: { cls: 'border-cyan/60 bg-cyan/10 text-cyan', dot: 'bg-cyan' },
  控制: { cls: 'border-green/60 bg-green/10 text-green', dot: 'bg-green' },
  熄灭: { cls: 'border-line bg-bg-panel-2 text-text-3', dot: 'bg-text-3' },
};

const TYPE_STYLE: Record<Incident['type'], string> = {
  建筑火灾: 'border-orange/60 bg-orange/10 text-orange',
  危化品: 'border-red/60 bg-red/10 text-red',
  抢险救援: 'border-blue/60 bg-blue/10 text-blue',
};

function relativeTime(receivedAt: string): string {
  const now = new Date();
  const [h, m, sec] = receivedAt.split(':').map(Number);
  let diff = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds() - (h * 3600 + m * 60 + sec);
  if (diff < 0) diff += 24 * 3600;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  return `${Math.floor(diff / 3600)} 小时前`;
}

function IncidentCard({
  incident, selected, dimmed, onSelect,
}: {
  incident: Incident;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const st = STATUS_STYLE[incident.status];
  const done = incident.status === '熄灭';
  return (
    <motion.button
      layout="position"
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      onClick={onSelect}
      className={`relative block w-full shrink-0 cursor-pointer overflow-hidden rounded-lg border px-3 py-2 text-left transition hover:bg-bg-panel-2 ${
        selected
          ? 'border-cyan shadow-[0_0_0_1px_rgba(34,211,238,.25),0_0_16px_rgba(34,211,238,.12)]'
          : 'border-line bg-bg-panel-2/40'
      } ${dimmed ? 'opacity-60' : ''}`}
    >
      {selected && <span className="absolute left-0 top-0 h-full w-[3px] bg-cyan" />}
      {/* 状态流转亮线闪烁 */}
      <motion.span
        key={incident.statusHistory.length}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 1.2 }}
        className="pointer-events-none absolute left-0 top-0 h-px w-full bg-gradient-to-r from-transparent via-cyan to-transparent"
      />
      {/* 第一行：ID + 状态徽标 + 时间。ID 可截断(min-w-0 + truncate)，状态徽标不缩，时间靠右不缩 */}
      <div className="flex items-center gap-2">
        <span className="min-w-0 shrink font-mono text-[12px] text-cyan truncate">{incident.id}</span>
        <span className={`flex shrink-0 items-center gap-1 rounded border px-1.5 py-px text-[11px] leading-4 ${st.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${done ? '' : 'animate-pulse'}`} />
          {incident.status}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-text-3">{relativeTime(incident.receivedAt)}</span>
      </div>
      <div className="mt-1 truncate text-[13px] text-text-1">{incident.address}</div>
      {/* 第三行：类型徽标 + 报警人。报警人可截断 */}
      <div className="mt-1 flex items-center gap-2">
        <span className={`shrink-0 rounded border px-1.5 py-px text-[11px] leading-4 ${TYPE_STYLE[incident.type]}`}>
          {incident.type}
        </span>
        <span className="min-w-0 truncate text-[11px] text-text-3">报警人 {incident.caller}</span>
      </div>
    </motion.button>
  );
}

export default function IncidentListPanel({
  incidents, selectedId, onSelect, onInject, channelDown,
}: {
  incidents: Incident[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onInject?: () => void;
  channelDown: boolean;
}) {
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [state, setState] = useState<FetchState>('ok');
  const [handledOpen, setHandledOpen] = useState(false);

  const applyDemo = (s: FetchState) => {
    setDemoState(s);
    if (s === 'ok') {
      setState('loading');
      window.setTimeout(() => setState('ok'), 500);
    } else {
      setState(s);
    }
  };
  const retry = () => {
    setState('loading');
    window.setTimeout(() => { setState('ok'); setDemoState('ok'); }, 800);
  };

  const active = incidents.filter((i) => i.status !== '熄灭');
  const extinguished = incidents.filter((i) => i.status === '熄灭');
  const visibleExt = extinguished.slice(0, Math.max(0, 8 - active.length));
  const folded = extinguished.slice(visibleExt.length);
  const list = [...active, ...visibleExt];

  return (
    <div className="flex h-full flex-col">
      {/* 工具区：接入状态 + 状态演示 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        {channelDown || state === 'error' ? (
          <span className="flex items-center gap-1.5 rounded-full border border-red/60 bg-red/10 px-2 py-0.5 text-[11px] text-red">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red" />
            通道中断 · 模拟
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full border border-green/60 bg-green/10 px-2 py-0.5 text-[11px] text-green">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green [animation-duration:2s]" />
            110 联动 · 模拟通道
          </span>
        )}
        <div className="relative ml-auto">
          <select
            value={demoState}
            onChange={(e) => applyDemo(e.target.value as FetchState)}
            title="状态演示"
            className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
          >
            {STATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>状态演示：{o.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-3" />
        </div>
      </div>

      {state !== 'ok' ? (
        state === 'empty' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
            <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
            <div className="text-[13px] text-text-2">当前无接入警情 · 演示数据</div>
          </div>
        ) : state === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
            <img src="/error-radar.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
            <div className="text-[13px] text-text-2">警情通道连接失败，请重试</div>
            <button
              onClick={retry}
              className="rounded-md border border-cyan/50 px-4 py-1.5 text-[13px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_8px_rgba(34,211,238,.3)]"
            >
              重试
            </button>
          </div>
        ) : (
          <PanelStateView state="loading" skeletonRows={5} />
        )
      ) : (
        <>
          <div className="shrink-0 px-3 pt-3">
            {onInject && (
              <button
                onClick={onInject}
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-orange text-[13px] font-bold text-bg-deep transition hover:brightness-110 hover:shadow-[0_0_10px_rgba(249,115,22,.4)]"
              >
                <AudioLines className="h-4 w-4 animate-pulse" />
                模拟新警情接入
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {list.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
                <div className="text-[13px] text-text-2">当前无接入警情 · 演示数据</div>
              </div>
            )}
            <AnimatePresence initial={false}>
              {list.map((inc) => (
                <IncidentCard
                  key={inc.id}
                  incident={inc}
                  selected={inc.id === selectedId}
                  dimmed={inc.status === '熄灭'}
                  onSelect={() => onSelect(inc.id)}
                />
              ))}
            </AnimatePresence>
            {folded.length > 0 && (
              <div className="rounded-lg border border-line">
                <button
                  onClick={() => setHandledOpen((v) => !v)}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-[12px] text-text-2 transition hover:bg-bg-panel-2"
                >
                  <FlameKindling className="h-3.5 w-3.5 text-text-3" />
                  已处置（{folded.length}）
                  {handledOpen ? <ChevronUp className="ml-auto h-3.5 w-3.5" /> : <ChevronDown className="ml-auto h-3.5 w-3.5" />}
                </button>
                {handledOpen && (
                  <div className="space-y-2 border-t border-line p-2">
                    {folded.map((inc) => (
                      <IncidentCard
                        key={inc.id}
                        incident={inc}
                        selected={inc.id === selectedId}
                        dimmed
                        onSelect={() => onSelect(inc.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="shrink-0 border-t border-line px-3 py-1.5 text-center text-[11px] text-text-3">
            <Radio className="mr-1 inline h-3 w-3" />
            模拟通道 · 数据为前端生成 · 演示数据
          </div>
        </>
      )}
    </div>
  );
}
