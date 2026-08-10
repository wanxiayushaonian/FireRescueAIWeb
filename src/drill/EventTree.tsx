'use client';

/**
 * EventTree — 演练事件树 React Flow 容器(动态生长 + 自动布局 + 节点详情)。
 *
 * 数据源:DrillRecorder(6.3 AgentRunner 写入)。
 * - 初始:recorder.getAll() → buildFlowGraph → setNodes/setEdges
 * - 订阅:recorder.subscribe(新节点 → 重布局)。id 去重由 buildFlowGraph 保证
 *   (输入全量 getAll,输出确定性图);unmount 取消订阅
 * - 节点详情面板:点击节点 → setSelectedDetail + 高亮(onNodeClick 回调保留
 *   供 6.6 接推演引擎回放 —— MVP 只展示详情,不回放状态快照)
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.4
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  Controls,
  MiniMap,
  ReactFlow,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { DrillRecorder, TreeNode } from '@/lib/drill/drill-recorder';
import {
  buildFlowGraph,
  getNodeTypeStyle,
  type EventNodeData,
  type FlowEdge,
  type FlowNode,
} from '@/lib/drill/tree-layout';
import { EventTreeNode } from './EventTreeNode';

/** EventTree 入参。 */
export interface EventTreeProps {
  /** 事件树数据源(6.3 DrillRecorder)。 */
  readonly recorder: DrillRecorder;
  /** 容器高度(px 或 CSS 字符串如 '100%',默认 480)。 */
  readonly height?: number | string;
  /**
   * 节点点击回调(MVP:显示详情面板;预留 6.6 推演引擎回放接入点)。
   */
  readonly onNodeClick?: (node: TreeNode) => void;
}

/** MiniMap 显示阈值(节点数 > 此值时显示小地图)。 */
const MINIMAP_THRESHOLD = 20;

/**
 * 演练事件树容器。
 * 订阅 recorder 动态生长,点击节点显示详情面板。
 */
export function EventTree({ recorder, height = 480, onNodeClick }: EventTreeProps) {
  const [flowNodes, setFlowNodes] = useState<FlowNode[]>([]);
  const [flowEdges, setFlowEdges] = useState<FlowEdge[]>([]);
  const [selected, setSelected] = useState<TreeNode | null>(null);

  // 选中 id 经 ref 传递到 rebuild(避免 effect 依赖 selected 导致反复订阅)
  const selectedIdRef = useRef<string | null>(null);

  // ---- 订阅 recorder:动态生长(初始 + 新节点 → 重布局)----
  useEffect(() => {
    const rebuild = (): void => {
      const { nodes, edges } = buildFlowGraph(recorder.getAll());
      const sid = selectedIdRef.current;
      const adjusted =
        sid !== null
          ? nodes.map((n) =>
              n.id === sid ? { ...n, selected: true } : { ...n, selected: false },
            )
          : nodes;
      setFlowNodes(adjusted);
      setFlowEdges(edges);
    };
    rebuild();
    const unsub = recorder.subscribe(() => rebuild());
    // clear 通知:recorder.clear() 后刷新(清空残留节点 + 选中态)
    const unsubClear = recorder.onClear(() => {
      selectedIdRef.current = null;
      setSelected(null);
      rebuild();
    });
    return () => {
      unsub();
      unsubClear();
    };
  }, [recorder]);

  // ---- 节点点击:显示详情 + 高亮(保留 onNodeClick 给 6.6)----
  const handleNodeClick = useCallback<NodeMouseHandler<FlowNode>>(
    (_evt, node) => {
      const id = node.id;
      selectedIdRef.current = id;
      setFlowNodes((prev) =>
        prev.map((n) => ({ ...n, selected: n.id === id })),
      );
      const tn = recorder.getNode(id);
      if (tn) {
        setSelected(tn);
        onNodeClick?.(tn);
      }
    },
    [recorder, onNodeClick],
  );

  const handleCloseDetail = useCallback(() => {
    setSelected(null);
    selectedIdRef.current = null;
    setFlowNodes((prev) => prev.map((n) => ({ ...n, selected: false })));
  }, []);

  // nodeTypes 稳定引用(避免 ReactFlow 每 render 重建内部映射)
  const nodeTypes = useMemo(() => ({ eventNode: EventTreeNode }), []);

  // MiniMap 节点配色(按类型主色)
  const miniMapNodeColor = useCallback(
    (n: FlowNode): string => {
      return getNodeTypeStyle((n.data as EventNodeData).type).borderColor;
    },
    [],
  );

  const showMiniMap = flowNodes.length > MINIMAP_THRESHOLD;

  return (
    <div
      style={{ height, width: '100%', position: 'relative' }}
      className="overflow-hidden rounded-lg border border-line/20 bg-transparent"
    >
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesConnectable={false}
        nodesDraggable={false}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
      >
        <Controls showInteractive={false} />
        {showMiniMap ? (
          <MiniMap
            nodeColor={miniMapNodeColor}
            maskColor="rgba(15,23,42,0.7)"
            pannable
            zoomable
          />
        ) : null}
      </ReactFlow>

      {selected ? (
        <NodeDetailPanel node={selected} onClose={handleCloseDetail} />
      ) : null}
    </div>
  );
}

// ============================================================
// 节点详情面板(内部组件)
// ============================================================

interface DetailPanelProps {
  readonly node: TreeNode;
  readonly onClose: () => void;
}

/**
 * 节点详情面板:右上角浮层,显示选中节点完整信息。
 * 字段:类型徽章 / label / T+{ts} / agentName / detail(完整) /
 * toolCallId / functionIdentifier / meta(JSON)。
 */
function NodeDetailPanel({ node, onClose }: DetailPanelProps) {
  const style = getNodeTypeStyle(node.type);

  return (
    <div
      className="absolute right-3 top-3 z-10 max-h-[calc(100%-24px)] w-72 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900/95 p-3 text-slate-200 shadow-2xl backdrop-blur"
      role="complementary"
      aria-label="事件节点详情"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            background: style.backgroundColor,
            color: style.textColor,
            border: `1px solid ${style.borderColor}`,
          }}
        >
          {style.label}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 transition-colors hover:text-slate-100"
          aria-label="关闭详情"
        >
          关闭 ×
        </button>
      </div>

      <div className="text-sm font-semibold text-slate-100">{node.label}</div>
      <div className="mt-0.5 font-mono text-[10px] text-slate-400">
        T+{node.ts}
      </div>

      {node.agentName ? (
        <Field label="发起 Agent" value={node.agentName} />
      ) : null}

      {node.detail ? (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            详情
          </div>
          <div className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
            {node.detail}
          </div>
        </div>
      ) : null}

      {node.functionIdentifier ? (
        <Field label="功能标识" value={node.functionIdentifier} mono />
      ) : null}

      {node.toolCallId ? (
        <Field label="toolCallId" value={node.toolCallId} mono />
      ) : null}

      {node.meta ? (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            meta
          </div>
          <pre className="mt-0.5 overflow-x-auto rounded bg-slate-950/60 p-1.5 text-[10px] leading-relaxed text-slate-400">
            {JSON.stringify(node.meta, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

/** 标签 + 值的键值对行(内部辅助)。 */
function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): ReactElement {
  return (
    <div className="mt-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div
        className={`mt-0.5 break-all text-xs text-slate-300 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}
