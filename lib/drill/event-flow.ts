/**
 * event-flow.ts — 演练事件流展示数据组装(纯逻辑,2026-08-18 原型式整改)。
 *
 * 原型(消防救援前端原型 ConfrontationPanel)的事件呈现不是图,而是:
 * 中央「特情→响应」卡对流(新卡在上,响应卡缩进成对)+ 右栏竖向时间轴。
 * 本文件把 DrillRecorder 的 TreeNode[] 组装成该结构:
 * - special 节点 = 主卡;parentId 指向 special 的节点 = 其响应卡(缩进)
 * - 其余节点 = 独立卡;整体按 ts 倒序(新事件在上),同 ts 按 id 字典序(确定性)
 *
 * @see 消防救援前端原型/app/src/components/drill/ConfrontationPanel.tsx
 */
import type { TreeNode, TreeNodeType } from './drill-recorder';

// ============================================================
// 类型视觉表(沿用 §5.4 色板,原型同款语义:特情橙/决策蓝/灾情红/到场绿/状态灰)
// ============================================================

export interface EventTypeMeta {
  /** 主色(边框/圆点/徽章文字)。 */
  readonly color: string;
  /** 徽章底色(translucent)。 */
  readonly bg: string;
  /** 类型中文名。 */
  readonly label: string;
}

export const EVENT_TYPE_META: Readonly<Record<TreeNodeType, EventTypeMeta>> = {
  disaster: { color: '#ef4444', bg: 'rgba(239,68,68,.12)', label: '灾情' },
  decision: { color: '#3b82f6', bg: 'rgba(59,130,246,.12)', label: '决策' },
  special: { color: '#f97316', bg: 'rgba(249,115,22,.12)', label: '特情' },
  arrival: { color: '#22c55e', bg: 'rgba(34,197,94,.12)', label: '到场' },
  status: { color: '#9ca3af', bg: 'rgba(156,163,175,.10)', label: '状态' },
  execution: { color: '#a855f7', bg: 'rgba(168,85,247,.12)', label: '执行' },
  generic: { color: '#d1d5db', bg: 'rgba(209,213,219,.10)', label: '其他' },
};

export function eventTypeMeta(type: TreeNodeType): EventTypeMeta {
  return EVENT_TYPE_META[type] ?? EVENT_TYPE_META.generic;
}

// ============================================================
// 卡流组装
// ============================================================

/** 一条卡流项:主卡 + 挂在其下的响应卡(原型「特情-调整」卡对)。 */
export interface FlowItem {
  readonly node: TreeNode;
  /** parentId = node.id 的响应节点(按 ts 升序)。 */
  readonly responses: readonly TreeNode[];
}

/**
 * TreeNode[] → 卡流(新卡在上)。
 * 归组规则:parentId 指向 special 节点的节点归入其响应;其余独立。
 * (决策链 parentId 互挂不参与缩进——层级过深反而难读,顺序由时间轴表达。)
 */
export function buildFlowItems(nodes: readonly TreeNode[]): FlowItem[] {
  const specialIds = new Set(nodes.filter((n) => n.type === 'special').map((n) => n.id));
  const responsesOf = new Map<string, TreeNode[]>();
  const mains: TreeNode[] = [];
  for (const n of nodes) {
    if (n.parentId && specialIds.has(n.parentId)) {
      const arr = responsesOf.get(n.parentId);
      if (arr) arr.push(n);
      else responsesOf.set(n.parentId, [n]);
    } else {
      mains.push(n);
    }
  }
  const items: FlowItem[] = mains.map((node) => {
    const responses = (responsesOf.get(node.id) ?? []).slice().sort(compareNode);
    return { node, responses };
  });
  // 新卡在上:ts 倒序;同 ts 按 id 字典序(确定性 tiebreaker)
  items.sort((a, b) => b.node.ts - a.node.ts || compareNode(a.node, b.node));
  return items;
}

/** 时间轴节点(竖向):ts 升序(老→新,原型同款从开局往下生长)。 */
export function buildTimelineNodes(nodes: readonly TreeNode[]): TreeNode[] {
  return nodes.slice().sort(compareNode);
}

/** TreeNode 稳定排序:ts 升序,同 ts 按 id 字典序。 */
function compareNode(a: TreeNode, b: TreeNode): number {
  if (a.ts !== b.ts) return a.ts - b.ts;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
