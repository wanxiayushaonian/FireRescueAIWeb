'use client';

/**
 * EventTreeNode — React Flow 自定义节点组件(演练事件树)。
 *
 * 接收 React Flow NodeProps,data 中承载原 TreeNode 字段(经 tree-layout
 * 的 buildFlowGraph 转换)。渲染:
 * - 左侧色条(类型主色)+ 类型标签
 * - label + 演练时钟(T+{ts})+ agentName(可选小字)
 * - detail 超长截断(详情面板完整显示)
 * - Handle 上下(Connectable 关闭,仅做因果链视觉)
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.4
 */
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { getNodeTypeStyle, type FlowNode } from '@/lib/drill/tree-layout';

/** detail 截断阈值(字符数,超出用 … 截断;完整文本在详情面板)。 */
const DETAIL_MAX_CHARS = 60;

/** 演练时钟格式化:T+{ts}。 */
function formatTs(ts: number): string {
  return `T+${ts}`;
}

/** 超长文本截断(单行展示,完整内容在详情面板)。 */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}

/**
 * 事件树节点组件(经 memo 优化,仅在 data/selected 变化时重渲染)。
 * 由 EventTree 通过 nodeTypes={{ eventNode: EventTreeNode }} 注册。
 */
function EventTreeNodeComponent({ data, selected }: NodeProps<FlowNode>) {
  const style = getNodeTypeStyle(data.type);

  return (
    <div
      style={{
        background: style.backgroundColor,
        borderColor: style.borderColor,
        borderLeftWidth: '4px',
        color: style.textColor,
        boxShadow: selected
          ? `0 0 0 2px ${style.borderColor}, 0 4px 12px rgba(0,0,0,0.35)`
          : '0 2px 8px rgba(0,0,0,0.25)',
      }}
      className="w-56 rounded-md border px-3 py-2 transition-shadow"
      title={data.detail ?? data.label}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />

      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-semibold tracking-wide"
          style={{ color: style.borderColor }}
        >
          {style.label}
        </span>
        <span className="font-mono text-[10px] opacity-70">
          {formatTs(data.ts)}
        </span>
      </div>

      <div
        className="mt-0.5 truncate text-sm font-semibold"
        title={data.label}
      >
        {data.label}
      </div>

      {data.detail ? (
        <div className="mt-0.5 line-clamp-2 text-xs opacity-80">
          {truncate(data.detail, DETAIL_MAX_CHARS)}
        </div>
      ) : null}

      {data.agentName ? (
        <div className="mt-0.5 truncate text-[10px] opacity-60">
          {data.agentName}
        </div>
      ) : null}

      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}

export const EventTreeNode = memo(EventTreeNodeComponent);
