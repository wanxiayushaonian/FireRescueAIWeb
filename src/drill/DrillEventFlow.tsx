'use client';

/**
 * DrillEventFlow — 演练事件流(原型式:卡流 + 竖向时间轴,替代 React Flow 事件树)。
 *
 * 原型 DNA(消防救援前端原型 ConfrontationPanel):
 * - 中央卡流:特情卡(橙)+ 响应卡(缩进成对),新卡在上,初步部署类卡在底部
 * - 右栏竖向时间轴:border-l 竖线 + 色点 + T+ + badge,最新节点脉冲,
 *   点击跳转对应卡(scrollIntoView + 高亮)并触发相机回溯(onNodeClick)
 *
 * 数据源:DrillRecorder(getAll 初始 + subscribe 实时生长),卡流结构见
 * lib/drill/event-flow.ts(buildFlowItems)。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { TriangleAlert } from 'lucide-react';
import type { DrillRecorder, TreeNode } from '@/lib/drill/drill-recorder';
import { buildFlowItems, buildTimelineNodes, eventTypeMeta } from '@/lib/drill/event-flow';

export interface DrillEventFlowProps {
  readonly recorder: DrillRecorder;
  /** 节点点击(时间轴/卡片):DrillView 接 meta.location 相机回溯。 */
  readonly onNodeClick?: (node: TreeNode) => void;
}

export function DrillEventFlow({ recorder, onNodeClick }: DrillEventFlowProps) {
  const [nodes, setNodes] = useState<readonly TreeNode[]>(() => recorder.getAll());
  const [hlId, setHlId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hlTimer = useRef<number | null>(null);

  useEffect(() => {
    const sync = (): void => setNodes(recorder.getAll());
    const unsub = recorder.subscribe(sync);
    const unsubClear = recorder.onClear(sync);
    return () => {
      unsub();
      unsubClear();
      if (hlTimer.current) window.clearTimeout(hlTimer.current);
    };
  }, [recorder]);

  const items = useMemo(() => buildFlowItems(nodes), [nodes]);
  const timeline = useMemo(() => buildTimelineNodes(nodes), [nodes]);
  const latestId = timeline.length > 0 ? timeline[timeline.length - 1].id : null;

  /** 时间轴 → 跳卡 + 高亮 1s + 相机回溯。 */
  const jumpTo = (node: TreeNode): void => {
    const el = scrollRef.current?.querySelector(`#drill-card-${node.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHlId(node.id);
      if (hlTimer.current) window.clearTimeout(hlTimer.current);
      hlTimer.current = window.setTimeout(() => setHlId(null), 1000);
    }
    onNodeClick?.(node);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* 中央卡流(新卡在上) */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[13px] text-text-3">
            启动演练后事件在此实时生长
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {items.map(({ node, responses }) => (
                <motion.div
                  key={node.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-2"
                >
                  <EventCard
                    node={node}
                    highlighted={hlId === node.id}
                    onClick={() => jumpTo(node)}
                  />
                  {responses.map((r) => (
                    <EventCard
                      key={r.id}
                      node={r}
                      highlighted={hlId === r.id}
                      indent
                      onClick={() => jumpTo(r)}
                    />
                  ))}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 右栏竖向时间轴 */}
      <div className="flex w-[240px] shrink-0 flex-col border-l border-line">
        <div className="shrink-0 border-b border-line px-3 py-2 text-[12px] font-semibold text-text-2">
          时间轴
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="relative ml-2 border-l-2 border-line pl-4">
            {timeline.map((n) => (
              <TimelineNode
                key={n.id}
                node={n}
                pulse={n.id === latestId}
                onClick={() => jumpTo(n)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 事件卡(原型:特情卡橙 / 响应卡缩进;点击=跳卡+相机回溯)
// ============================================================

function EventCard({
  node,
  highlighted,
  indent = false,
  onClick,
}: {
  node: TreeNode;
  highlighted: boolean;
  indent?: boolean;
  onClick: () => void;
}) {
  const meta = eventTypeMeta(node.type);
  const isSpecial = node.type === 'special';
  return (
    <motion.button
      id={`drill-card-${node.id}`}
      type="button"
      onClick={onClick}
      initial={isSpecial ? { scale: 0.96 } : { opacity: 0, x: -8 }}
      animate={
        isSpecial
          ? { scale: 1, boxShadow: [`0 0 18px ${meta.color}59`, `0 0 4px ${meta.color}1f`] }
          : { opacity: 1, x: 0 }
      }
      transition={{ duration: isSpecial ? 1 : 0.3 }}
      className={`rounded-lg border p-3 text-left ${indent ? 'ml-5' : ''} ${
        highlighted ? 'ring-2' : ''
      }`}
      style={{
        borderColor: `${meta.color}99`,
        backgroundColor: meta.bg,
        // ring 颜色跟随类型(highlighted 时)
        ['--tw-ring-color' as string]: meta.color,
      }}
    >
      <div className="flex items-center gap-2">
        {isSpecial ? (
          <TriangleAlert className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
        ) : (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} />
        )}
        <span className="text-[13px] font-bold" style={{ color: meta.color }}>
          {indent ? '↳ ' : ''}{node.label}
        </span>
        <span className="ml-auto font-mono text-[11px] text-text-3">T+{node.ts}</span>
        <span
          className="rounded border px-1 py-px text-[10px] leading-4"
          style={{ color: meta.color, borderColor: `${meta.color}99` }}
        >
          {node.agentName ?? meta.label}
        </span>
      </div>
      {node.detail && (
        <div className="mt-1.5 whitespace-pre-wrap text-[13px] leading-5 text-text-1">
          {node.detail}
        </div>
      )}
      {typeof node.meta?.location === 'string' && (
        <div className="mt-1 text-[11px] text-text-3">位置:{node.meta.location}(点击卡片回溯现场)</div>
      )}
    </motion.button>
  );
}

// ============================================================
// 时间轴节点(原型 TimelineNode:竖线色点 + T+ + badge + 摘要,最新脉冲)
// ============================================================

function TimelineNode({
  node,
  pulse,
  onClick,
}: {
  node: TreeNode;
  pulse: boolean;
  onClick: () => void;
}) {
  const meta = eventTypeMeta(node.type);
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
        style={{ backgroundColor: meta.color }}
        animate={pulse ? { boxShadow: [`0 0 0 0 ${meta.color}66`, `0 0 0 6px ${meta.color}00`] } : undefined}
        transition={pulse ? { duration: 2, repeat: Infinity } : undefined}
      />
      <span className="flex items-center gap-1.5">
        <span className="font-mono text-[11px] text-text-3">T+{node.ts}</span>
        <span
          className="rounded border px-1 text-[10px] leading-4"
          style={{ color: meta.color, borderColor: `${meta.color}99` }}
        >
          {node.agentName ?? meta.label}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[12px] text-text-2">{node.label}</span>
    </motion.button>
  );
}
