import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minus, X, ChevronsRight, ChevronsLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import DemoTag from './DemoTag';

export interface DraggablePanelProps {
  panelId: string;
  title: string;
  icon: LucideIcon;
  width: number;
  /** 默认停靠位置 */
  dock: 'left' | 'right';
  defaultPos: { x: number; y: number };
  height?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

/** 可拖拽业务面板：展开 / 最小化胶囊 / 关闭 三态 */
export default function DraggablePanel({
  title,
  icon: Icon,
  width,
  dock,
  defaultPos,
  height = 'calc(100dvh - 96px)',
  open,
  onOpenChange,
  headerExtra,
  children,
}: DraggablePanelProps) {
  const [minimized, setMinimized] = useState(false);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <>
      {/* 拖拽约束层：覆盖工作区 */}
      <div ref={constraintsRef} className="pointer-events-none absolute inset-0 z-30" />
      <AnimatePresence>
        {open && !minimized && (
          <motion.div
            key="panel"
            drag
            dragConstraints={constraintsRef}
            dragMomentum={false}
            onDragStart={() => setDragging(true)}
            onDragEnd={() => setDragging(false)}
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 12 }}
            transition={{ duration: 0.3 }}
            style={
              dock === 'right'
                ? { right: defaultPos.x, top: defaultPos.y, width, height }
                : { left: defaultPos.x, top: defaultPos.y, width, height }
            }
            className={`pointer-events-auto absolute z-40 flex flex-col overflow-hidden rounded-lg border bg-bg-panel/90 backdrop-blur-[8px] ${
              dragging ? 'panel-glow border-line-glow shadow-2xl' : 'border-line shadow-xl'
            }`}
          >
            {/* 标题栏（拖拽把手） */}
            <div
              className={`flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg-panel-2/60 px-3 select-none ${
                dragging ? 'cursor-grabbing' : 'cursor-grab'
              }`}
            >
              <Icon className="h-4 w-4 text-cyan" />
              <span className="text-[16px] font-bold text-text-1">{title}</span>
              <DemoTag />
              <div className="ml-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                {headerExtra}
                <button
                  onClick={() => setMinimized(true)}
                  className="rounded p-1 text-text-3 transition hover:bg-white/10 hover:text-text-1"
                  title="最小化"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onOpenChange(false)}
                  className="rounded p-1 text-text-3 transition hover:bg-red/20 hover:text-red"
                  title="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          </motion.div>
        )}
        {open && minimized && (
          <motion.button
            key="capsule"
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
            onClick={() => setMinimized(false)}
            className={`pointer-events-auto absolute top-[72px] z-40 flex w-10 cursor-pointer flex-col items-center gap-2 rounded-lg border border-line bg-bg-panel/90 py-3 text-text-2 backdrop-blur hover:border-line-glow hover:text-cyan ${
              dock === 'left' ? 'left-[80px]' : 'right-2'
            }`}
            title={`展开 ${title}`}
          >
            <Icon className="h-4 w-4 text-cyan" />
            <span className="text-[12px] leading-4 tracking-widest [writing-mode:vertical-rl]">{title}</span>
            {dock === 'left' ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
