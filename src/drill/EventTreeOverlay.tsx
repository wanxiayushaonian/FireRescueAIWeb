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
import { DrillEventFlow } from './DrillEventFlow';
import type { DrillRecorder, TreeNode } from '@/lib/drill/drill-recorder';

export interface EventTreeOverlayProps {
  /** 事件树数据源(与 DrillView 同一 recorder 实例,实时增长)。 */
  readonly recorder: DrillRecorder;
  /** 是否展开。 */
  readonly open: boolean;
  /** 关闭回调(ESC / 遮罩 / 关闭按钮触发)。 */
  readonly onClose: () => void;
  /** 节点点击回调(DrillView:meta.location → 相机回溯到事件现场)。 */
  readonly onNodeClick?: (node: TreeNode) => void;
}

export function EventTreeOverlay({ recorder, open, onClose, onNodeClick }: EventTreeOverlayProps) {
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
      // pointer-events-auto:drill 内容层(App.tsx)整层 pointer-events-none,浮层须自救恢复交互
      // (此前关闭按钮/遮罩点击全穿透到 3D 场景层,ESC 是唯一可用关闭路径)
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="推演过程"
    >
      <div
        className="relative flex h-[85vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-xl border border-line-glow/40 bg-bg-deep/5 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-1">推演过程</span>
            <span className="text-[11px] text-text-3">
              实时增长 · 点节点回溯现场 · ESC 关闭
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-0.5 text-xs text-text-3 transition hover:bg-bg-panel hover:text-text-1"
            aria-label="关闭推演过程"
          >
            关闭 ×
          </button>
        </div>

        {/* 事件流(卡流 + 时间轴,原型式)撑满剩余空间 */}
        <div className="min-h-0 flex-1">
          <DrillEventFlow recorder={recorder} onNodeClick={onNodeClick} />
        </div>
      </div>
    </div>
  );
}
