/**
 * tree-layout — 事件树 → React Flow 图数据(纯逻辑,无 React/DOM 依赖)。
 *
 * 输入 TreeNode[](来自 DrillRecorder),输出 React Flow 可直接渲染的
 * { nodes, edges }。Node/Edge 类型从 @xyflow/react `import type`(编译期擦除,
 * 运行时零依赖)——tree-layout 只产出数据,不渲染。
 *
 * 布局:简单分层(parentId 因果链决定深度,y = depth × ROW_HEIGHT);
 * 同层按 ts 升序排列(x = index × COL_WIDTH)。
 * 确定性:相同输入 → 相同输出(无随机/Date/排序稳定),适合 vitest 断言。
 *
 * @see plan/2026-08-09-drill-simulation-plan.md §6.4
 */
import type { Edge, Node } from '@xyflow/react';
import type { TreeNode, TreeNodeType } from './drill-recorder';

// ============================================================
// 布局常量(导出供测试断言)
// ============================================================

/** 行高:层间距(根→子垂直步进),px。 */
export const LAYOUT_ROW_HEIGHT = 120;
/** 列宽:同层节点水平步进,px。 */
export const LAYOUT_COL_WIDTH = 240;

// ============================================================
// 节点样式映射(§5.4 颜色表)
// ============================================================

/** 节点视觉描述(色条/背景/文字/类型名)。 */
export interface NodeStyle {
  /** 节点背景(浅色系,配合 borderColor 主色)。 */
  readonly backgroundColor: string;
  /** 边框/色条(主色系)。 */
  readonly borderColor: string;
  /** 文字(深色系,在 backgroundColor 上可读)。 */
  readonly textColor: string;
  /** 类型中文名(展示用,如"灾情")。 */
  readonly label: string;
}

/** TreeNodeType → NodeStyle 映射(§5.4 颜色表)。 */
export const NODE_TYPE_STYLES: Readonly<Record<TreeNodeType, NodeStyle>> = {
  disaster: {
    backgroundColor: '#fee2e2',
    borderColor: '#ef4444',
    textColor: '#7f1d1d',
    label: '灾情',
  },
  decision: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
    textColor: '#1e3a8a',
    label: '决策',
  },
  special: {
    backgroundColor: '#ffedd5',
    borderColor: '#f97316',
    textColor: '#7c2d12',
    label: '特情',
  },
  arrival: {
    backgroundColor: '#dcfce7',
    borderColor: '#22c55e',
    textColor: '#14532d',
    label: '到场',
  },
  status: {
    backgroundColor: '#f3f4f6',
    borderColor: '#6b7280',
    textColor: '#374151',
    label: '状态',
  },
  execution: {
    backgroundColor: '#f3e8ff',
    borderColor: '#a855f7',
    textColor: '#581c87',
    label: '执行',
  },
  generic: {
    backgroundColor: '#f9fafb',
    borderColor: '#d1d5db',
    textColor: '#374151',
    label: '其他',
  },
};

/** 按 TreeNodeType 取样式(未知类型 fallback generic)。 */
export function getNodeTypeStyle(type: TreeNodeType): NodeStyle {
  return NODE_TYPE_STYLES[type] ?? NODE_TYPE_STYLES.generic;
}

// ============================================================
// React Flow 类型别名(type-only import,运行时无依赖)
// ============================================================

/** 自定义 React Flow 节点 type 标识。 */
export const EVENT_NODE_TYPE = 'eventNode' as const;

/**
 * React Flow 节点 data 字段(承载原 TreeNode 全部字段)。
 * extends Record<string, unknown> 以满足 Node<NodeData> 泛型约束。
 */
export interface EventNodeData extends Record<string, unknown> {
  readonly id: string;
  readonly ts: number;
  readonly type: TreeNodeType;
  readonly label: string;
  readonly detail?: string;
  readonly parentId?: string;
  readonly agentName?: string;
  readonly toolCallId?: string;
  readonly functionIdentifier?: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** 事件树 Flow 节点(类型固定 EVENT_NODE_TYPE)。 */
export type FlowNode = Node<EventNodeData, typeof EVENT_NODE_TYPE>;

/** 事件树 Flow 边(因果:parentId → id)。 */
export type FlowEdge = Edge;

/** buildFlowGraph 返回值。 */
export interface FlowGraph {
  readonly nodes: FlowNode[];
  readonly edges: FlowEdge[];
}

// ============================================================
// 核心:buildFlowGraph
// ============================================================

/**
 * 构建因果图:TreeNode[] → React Flow { nodes, edges }。
 *
 * 布局规则:
 * 1. 根节点(parentId undefined / parentId 不在节点集 / parentId 自引用)→ depth 0
 * 2. 子节点 depth = 父 depth + 1(BFS 逐层);防环:入队前标记 depth
 * 3. 同层节点按 ts 升序(同 ts 按 id 字典序)→ x = index × COL_WIDTH
 * 4. y = depth × ROW_HEIGHT
 * 5. 边:parentId → id(仅 parentId 在集中且非自引用)
 *
 * 确定性:稳定排序 + 纯函数;相同输入 → 相同输出。
 * 复杂度:O(n log n)(排序)+ O(n)(BFS/建图)。
 */
export function buildFlowGraph(nodes: readonly TreeNode[]): FlowGraph {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  // 稳定排序:ts 升序,同 ts 按 id 字典序
  const sorted: TreeNode[] = [...nodes].sort(compareTreeNode);

  // 节点 id 集合(判断 parentId 是否在集中)
  const idSet = new Set(sorted.map((n) => n.id));

  // parentId → children 映射 + 识别根(自引用也视为根)
  const childrenOf = new Map<string, TreeNode[]>();
  const roots: TreeNode[] = [];
  for (const n of sorted) {
    if (hasValidParent(n, idSet)) {
      appendChild(childrenOf, n.parentId as string, n);
    } else {
      roots.push(n);
    }
  }

  // BFS 分层
  const depthMap = computeDepths(sorted, childrenOf, roots);

  // 按 layer 分组(保持 sorted 顺序 → 同层已按 ts 升序)
  const layers = groupByLayer(sorted, depthMap);

  // 分配坐标
  const positionMap = assignPositions(layers);

  // 构建 Flow 节点
  const flowNodes: FlowNode[] = sorted.map((n) => ({
    id: n.id,
    type: EVENT_NODE_TYPE,
    position: positionMap.get(n.id) ?? { x: 0, y: 0 },
    data: toEventNodeData(n),
    selectable: true,
  }));

  // 构建 Flow 边(因果:parentId → id)
  const flowEdges: FlowEdge[] = [];
  for (const n of sorted) {
    if (hasValidParent(n, idSet)) {
      flowEdges.push({
        id: `e-${n.parentId as string}-${n.id}`,
        source: n.parentId as string,
        target: n.id,
        type: 'smoothstep',
        animated: false,
      });
    }
  }

  return { nodes: flowNodes, edges: flowEdges };
}

// ============================================================
// 内部辅助(纯函数,文件内私有)
// ============================================================

/** TreeNode 稳定排序:ts 升序,同 ts 按 id 字典序(保证确定性)。 */
function compareTreeNode(a: TreeNode, b: TreeNode): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/** 判断节点是否有有效父(parentId 在集中且非自引用)。 */
function hasValidParent(node: TreeNode, idSet: Set<string>): boolean {
  return (
    node.parentId !== undefined &&
    node.parentId !== node.id &&
    idSet.has(node.parentId)
  );
}

/** 追加 child 到 parentId 的子列表(Map 空间预分配优化)。 */
function appendChild(
  map: Map<string, TreeNode[]>,
  parentId: string,
  child: TreeNode,
): void {
  const arr = map.get(parentId);
  if (arr) {
    arr.push(child);
  } else {
    map.set(parentId, [child]);
  }
}

/**
 * BFS 分层:从 roots 出发逐层分配 depth。
 * 防环:入队即标记 depth,避免重复入队(自引用/环不阻塞)。
 */
function computeDepths(
  nodes: readonly TreeNode[],
  childrenOf: Map<string, TreeNode[]>,
  roots: readonly TreeNode[],
): Map<string, number> {
  const depthMap = new Map<string, number>();
  let frontier: TreeNode[] = [...roots];
  let depth = 0;
  while (frontier.length > 0) {
    const next: TreeNode[] = [];
    for (const node of frontier) {
      if (depthMap.has(node.id)) continue; // 已分配(防环冗余保护)
      depthMap.set(node.id, depth);
      const children = childrenOf.get(node.id);
      if (children) {
        for (const child of children) {
          if (!depthMap.has(child.id)) next.push(child);
        }
      }
    }
    frontier = next;
    depth += 1;
  }
  // 兜底:未到达节点(理论不发生,纯防御)→ depth 0
  for (const n of nodes) {
    if (!depthMap.has(n.id)) depthMap.set(n.id, 0);
  }
  return depthMap;
}

/** 按 depth 分组,组内保持 sorted 顺序(ts 升序)。 */
function groupByLayer(
  sorted: readonly TreeNode[],
  depthMap: Map<string, number>,
): Map<number, TreeNode[]> {
  const layers = new Map<number, TreeNode[]>();
  for (const n of sorted) {
    const d = depthMap.get(n.id) ?? 0;
    const arr = layers.get(d);
    if (arr) {
      arr.push(n);
    } else {
      layers.set(d, [n]);
    }
  }
  return layers;
}

/** 按 layer × index 分配坐标(x = index × COL_WIDTH, y = depth × ROW_HEIGHT)。 */
function assignPositions(
  layers: Map<number, TreeNode[]>,
): Map<string, { x: number; y: number }> {
  const positionMap = new Map<string, { x: number; y: number }>();
  for (const [depth, layerNodes] of layers) {
    layerNodes.forEach((n, i) => {
      positionMap.set(n.id, {
        x: i * LAYOUT_COL_WIDTH,
        y: depth * LAYOUT_ROW_HEIGHT,
      });
    });
  }
  return positionMap;
}

/** TreeNode → EventNodeData(显式字段拷贝,隔离内外 mutation)。 */
function toEventNodeData(n: TreeNode): EventNodeData {
  return {
    id: n.id,
    ts: n.ts,
    type: n.type,
    label: n.label,
    detail: n.detail,
    parentId: n.parentId,
    agentName: n.agentName,
    toolCallId: n.toolCallId,
    functionIdentifier: n.functionIdentifier,
    meta: n.meta,
  };
}
