'use client';

/**
 * EventTreeOverlay — 事件树悬浮面板(Ctrl+K 唤出)。
 *
 * 需求:DrillView 右栏事件树太小、实时看没意义,改为大悬浮面板:
 * 演练中实时唤出查看增长 / 演练结束后复盘查看整树。
 *
 * 设计:
 * - 90vw × 85vh 居中悬浮(max-w 1600),遮罩 + backdrop-blur
 * - ESC 关闭 / 点遮罩关闭 / Ctrl+K 父组件切换
 * - 内含完整 EventTree(撑满,height='100%')
 *
 * 唤出由 DrillView 持有 treeOpen state + Ctrl+K keydown 监听(演练模块局部,
 * 不与态势总览 overview 的 Ctrl+K 命令面板冲突 —— 那是 RealGisMap 模块内绑定)。
 */
import { useEffect } from 'react';
import { EventTree } from './EventTree';
import type { DrillRecorder } from '@/lib/drill/drill-recorder';

export interface EventTreeOverlayProps {
  /** 事件树数据源(与 DrillView 同一 recorder 实例,实时增长)。 */
  readonly recorder: DrillRecorder;
  /** 是否展开。 */
  readonly open: boolean;
  /** 关闭回调(ESC / 遮罩 / 关闭按钮触发)。 */
  readonly onClose: () => void;
}

export function EventTreeOverlay({ recorder, open, onClose }: EventTreeOverlayProps) {
  // ESC 关闭(open 时才监听;Ctrl+K 切换由父组件 DrillView 处理)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="事件树"
    >
      <div
        className="relative flex h-[85vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-xl border border-line-glow/40 bg-bg-deep/5 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-1">事件树</span>
            <span className="text-[11px] text-text-3">
              实时增长 · 点节点看详情 · ESC 关闭
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-xs text-text-3 transition hover:bg-bg-panel hover:text-text-1"
            aria-label="关闭事件树"
          >
            关闭 ×
          </button>
        </div>

        {/* EventTree 撑满剩余空间 */}
        <div className="min-h-0 flex-1 p-3">
          <EventTree recorder={recorder} height="100%" />
        </div>
      </div>
    </div>
  );
}
