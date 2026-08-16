import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, ChevronDown, Droplets, Layers, MapPin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { FamiliarNode } from '@/mock/training';
import { FAMILIAR_PATHS } from '@/mock/training';
import type { FetchState } from '@/mock/types';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';
import PanelStateView from '@/components/PanelStateView';
import DemoTag from '@/components/DemoTag';

export const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

/** 「状态演示」下拉（与既有面板同款） */
export function StateSelect({ value, onChange }: { value: FetchState; onChange: (v: FetchState) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as FetchState)}
        className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
        title="状态演示"
      >
        {STATE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>状态演示：{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
    </div>
  );
}

const PATH_ICON: Record<FamiliarNode['category'], LucideIcon> = {
  byFloor: Layers,
  byFacility: Droplets,
  byKeyPart: MapPin,
};
const PATH_COLOR: Record<FamiliarNode['category'], string> = {
  byFloor: 'text-cyan',
  byFacility: 'text-blue',
  byKeyPart: 'text-orange',
};

export interface FamiliarPathPanelProps {
  state: FetchState;
  demoState: FetchState;
  onDemoStateChange: (s: FetchState) => void;
  onRetry: () => void;
  nodes: FamiliarNode[];
  selectedId: string | null;
  onSelect: (node: FamiliarNode) => void;
  onEnterExam: () => void;
  onAgentHint?: (topic: string) => void;
}

/** 一级 · 左面板：熟悉路径选择（三条路径 + 子树 + 进入考核） */
export default function FamiliarPathPanel({
  state,
  demoState,
  onDemoStateChange,
  onRetry,
  nodes,
  selectedId,
  onSelect,
  onEnterExam,
  onAgentHint,
}: FamiliarPathPanelProps) {
  const [openPath, setOpenPath] = useState<FamiliarNode['category'] | null>('byFloor');
  // 考核错题推导的强化点位（cyan 描边 + 「强化」徽标）
  const [boostIds, setBoostIds] = useState<Set<string>>(new Set());

  // ---------- 智能体连续导览 ----------
  const [touringPath, setTouringPath] = useState<FamiliarNode['category'] | null>(null);
  const tourTimer = useRef<number | null>(null);
  // 导览程序选中点位时置位，避免触发「手动暂停」逻辑
  const tourTicking = useRef(false);

  const clearTourTimer = () => {
    if (tourTimer.current) {
      window.clearInterval(tourTimer.current);
      tourTimer.current = null;
    }
  };

  const stopTour = (done = false, doneText = '导览完成 · 演示数据') => {
    clearTourTimer();
    setTouringPath(null);
    if (done) showToast(doneText);
  };

  // 组件卸载时清理定时器
  useEffect(() => clearTourTimer, []);

  /** 每站：复用点位选中逻辑 + 写场景动作日志（source 智能体） */
  const visitNode = (n: FamiliarNode, logPrefix = '') => {
    tourTicking.current = true;
    onSelect(n);
    tourTicking.current = false;
    addSceneAction({ action: 'flyTo', target: `${logPrefix}${n.name}`, params: { lng: n.lng, lat: n.lat }, source: '智能体' });
  };

  const startTour = (
    category: FamiliarNode['category'],
    pathNodes: FamiliarNode[],
    opts?: { firstLogPrefix?: string; doneText?: string },
  ) => {
    if (pathNodes.length === 0) return;
    clearTourTimer();
    setTouringPath(category);
    let idx = 0;
    visitNode(pathNodes[idx], opts?.firstLogPrefix ?? '');
    tourTimer.current = window.setInterval(() => {
      idx += 1;
      if (idx >= pathNodes.length) {
        stopTour(true, opts?.doneText ?? '导览完成 · 演示数据');
        return;
      }
      visitNode(pathNodes[idx]);
    }, 2500);
  };

  // ---------- 考核错题 → 强化导览（'training:start-tour' 事件契约） ----------
  // detail: { pointIds: string[], source: 'exam' }；点位序列已由考核侧按楼层从低到高排序
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ pointIds?: string[]; source?: string }>).detail;
      const ids = detail?.pointIds ?? [];
      const seq = ids
        .map((id) => nodes.find((n) => n.id === id))
        .filter((n): n is FamiliarNode => !!n);
      if (seq.length === 0) return;
      setBoostIds(new Set(seq.map((n) => n.id)));
      // 展开首站所属路径分组
      setOpenPath(seq[0].category);
      // 自动开始强化导览（2.5s/站），首条日志标注来自考核错题
      startTour(seq[0].category, seq, {
        firstLogPrefix: '强化导览（考核错题） · ',
        doneText: '强化导览完成 · 演示数据',
      });
    };
    window.addEventListener('training:start-tour', handler);
    return () => window.removeEventListener('training:start-tour', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  /** 用户手点其他点位：导览中则暂停导览 */
  const handleSelect = (n: FamiliarNode) => {
    if (touringPath && !tourTicking.current) {
      stopTour();
      showToast('已暂停导览 · 演示数据');
    }
    onSelect(n);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶部通栏：智能体在线条 + 状态演示 */}
      <div className="border-b border-line px-3 pb-2 pt-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAgentHint?.('熟悉引导：可询问任意点位')}
            className="flex h-7 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md border border-violet/40 bg-violet/10 px-2 text-left transition hover:border-violet/70 hover:bg-violet/15"
            title="呼叫熟悉引导智能体"
          >
            <Bot className="h-3.5 w-3.5 shrink-0 text-violet" />
            <span className="truncate text-[12px] text-violet">熟悉引导智能体在线 · 可询问任意点位</span>
            <DemoTag className="ml-auto shrink-0" />
          </button>
          <StateSelect value={demoState} onChange={onDemoStateChange} />
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-text-3">
          当前熟悉对象
          <span className="rounded border border-line bg-bg-panel-2 px-1.5 py-px text-text-2">乐盈广场21号楼 · 演示数据</span>
        </div>
      </div>

      {/* 路径列表 */}
      {state !== 'ok' ? (
        <div className="min-h-0 flex-1">
          <PanelStateView
            state={state}
            onRetry={state === 'error' ? onRetry : undefined}
            skeletonRows={8}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 [scrollbar-width:thin]">
          {nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
              <div className="text-[13px] text-text-2">暂无熟悉路径数据 · 演示数据</div>
            </div>
          ) : (
            FAMILIAR_PATHS.map((p, pi) => {
              const Icon = PATH_ICON[p.category];
              const children = nodes.filter((n) => n.category === p.category);
              const open = openPath === p.category;
              const avg = children.length
                ? Math.round(children.reduce((s, n) => s + n.familiarity, 0) / children.length)
                : 0;
              return (
                <motion.div
                  key={p.category}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: pi * 0.1, duration: 0.3 }}
                  className="mb-3 overflow-hidden rounded-md border border-line bg-bg-panel-2/30"
                >
                  <button
                    onClick={() => setOpenPath(open ? null : p.category)}
                    className="group flex h-[72px] w-full items-center gap-3 px-3 text-left transition hover:bg-bg-panel-2 hover:shadow-[inset_3px_0_0_#22d3ee]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-bg-panel">
                      <Icon className={`h-5 w-5 ${PATH_COLOR[p.category]}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold text-text-1">{p.name}</span>
                      <span className="block truncate text-[12px] text-text-3">{p.desc}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-num text-[15px] text-cyan">{avg}%</span>
                      <span className="block text-[11px] text-text-3">平均熟悉度</span>
                    </span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-text-3 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-line/60 px-2 py-1.5">
                          <div className="mb-1 flex justify-end">
                            <button
                              onClick={() =>
                                touringPath === p.category ? stopTour() : startTour(p.category, children)
                              }
                              className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition ${
                                touringPath === p.category
                                  ? 'border-red/60 bg-red/10 text-red hover:bg-red/15'
                                  : 'border-violet/60 text-violet hover:border-violet hover:bg-violet/10'
                              }`}
                              title={touringPath === p.category ? '停止智能体导览' : '智能体按路径逐点导览（2.5s/站）'}
                            >
                              {touringPath === p.category ? (
                                <>
                                  <span className="h-2 w-2 animate-pulse rounded-full bg-red" />
                                  停止导览
                                </>
                              ) : (
                                <>
                                  <Bot className="h-3.5 w-3.5" />
                                  开始导览
                                </>
                              )}
                            </button>
                          </div>
                          <PathSubtree nodes={children} selectedId={selectedId} onSelect={handleSelect} boostIds={boostIds} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })
          )}
        </div>
      )}

      {/* 底部：进入考核 */}
      <div className="shrink-0 border-t border-line px-3 py-2.5">
        <button
          onClick={onEnterExam}
          className="h-10 w-full rounded-md bg-cyan text-[14px] font-bold text-bg-deep transition hover:brightness-110 hover:shadow-[0_0_16px_rgba(34,211,238,.45)]"
        >
          进入考核
        </button>
        <div className="mt-1.5 text-center text-[12px] text-text-3">完成任意路径熟悉后可参加岗位考核</div>
      </div>
    </div>
  );
}

function PathSubtree({
  nodes,
  selectedId,
  onSelect,
  boostIds,
}: {
  nodes: FamiliarNode[];
  selectedId: string | null;
  onSelect: (n: FamiliarNode) => void;
  boostIds?: Set<string>;
}) {
  // 按 group 分组保持子树层级
  const groups: Array<{ name: string; items: FamiliarNode[] }> = [];
  nodes.forEach((n) => {
    const g = n.group ?? '其他';
    const found = groups.find((x) => x.name === g);
    if (found) found.items.push(n);
    else groups.push({ name: g, items: [n] });
  });

  return (
    <div>
      {groups.map((g) => (
        <div key={g.name} className="mb-1">
          <div className="px-2 py-1 text-[12px] font-bold text-text-2">
            {g.name}
            <span className="ml-1 font-num text-[11px] font-normal text-text-3">{g.items.length} 项</span>
          </div>
          {g.items.map((n) => {
            const active = n.id === selectedId;
            const boost = boostIds?.has(n.id) ?? false;
            const sub = [n.floor, n.position, n.count != null ? `×${n.count}` : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <button
                key={n.id}
                onClick={() => onSelect(n)}
                className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-bg-panel-2 hover:shadow-[inset_2px_0_0_#22d3ee] ${
                  active ? 'bg-cyan/10 shadow-[inset_2px_0_0_#22d3ee]' : ''
                } ${boost ? 'ring-1 ring-cyan/70 shadow-[0_0_8px_rgba(34,211,238,.2)]' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className={`flex items-center gap-1.5 text-[13px] ${active ? 'text-cyan' : 'text-text-1'}`}>
                    <span className="truncate">{n.name}</span>
                    {boost && (
                      <span className="shrink-0 rounded border border-cyan/60 bg-cyan/15 px-1 py-px text-[10px] leading-3 text-cyan">
                        强化
                      </span>
                    )}
                  </div>
                  {sub && <div className="truncate text-[12px] text-text-3">{sub}</div>}
                </div>
                <div className="flex w-20 shrink-0 flex-col items-end gap-0.5">
                  <span className="font-num text-[12px] text-cyan">{n.familiarity}%</span>
                  <span className="h-1 w-20 overflow-hidden rounded-full bg-cyan-dim/30">
                    <motion.span
                      className="block h-full rounded-full bg-cyan"
                      initial={false}
                      animate={{ width: `${n.familiarity}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
