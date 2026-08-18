// lib/__tests__/tree-layout.test.ts
// 验证 buildFlowGraph:纯逻辑测试,不需要 DOM/React。
// 覆盖:空输入 / 单根+子链 / 多根 / 同层多子 / 边 / 颜色映射 / 确定性 / 防环。
import { describe, it, expect } from 'vitest';
import {
  buildFlowGraph,
  NODE_TYPE_STYLES,
  LAYOUT_ROW_HEIGHT,
  LAYOUT_COL_WIDTH,
  EVENT_NODE_TYPE,
} from '../drill/tree-layout';
import type { TreeNode, TreeNodeType } from '../drill/drill-recorder';

/** 构造测试 TreeNode(减少样板;id+ts+type+label+可选 parentId)。 */
function makeNode(
  id: string,
  ts: number,
  type: TreeNodeType,
  label: string,
  parentId?: string,
): TreeNode {
  return { id, ts, type, label, parentId };
}

/** 从 buildFlowGraph 结果按 id 取 position(测试便捷辅助)。 */
function posOf(
    result: ReturnType<typeof buildFlowGraph>,
    id: string,
): { x: number; y: number } {
  const n = result.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`node ${id} not found`);
  return n.position;
}

describe('buildFlowGraph · 空输入', () => {
  it('空数组 → 空 nodes + 空 edges', () => {
    const result = buildFlowGraph([]);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});

describe('buildFlowGraph · 单根 + 子链(parentId 因果)', () => {
  it('单节点(无 parentId)→ 1 节点 0 边,位置 (0, 0)', () => {
    const result = buildFlowGraph([makeNode('a', 1, 'disaster', '起火')]);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(result.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('三层链 root → child → grandchild:y 按 depth 递增(每层 ROW_HEIGHT)', () => {
    const result = buildFlowGraph([
      makeNode('root', 1, 'disaster', '起火'),
      makeNode('child', 2, 'decision', '出水', 'root'),
      makeNode('gc', 3, 'execution', 'flyto', 'child'),
    ]);
    expect(result.nodes).toHaveLength(3);
    expect(result.edges).toHaveLength(2);
    // x = 全局 ts 序(整树共享时间轴):root idx0 / child idx1 / gc idx2
    expect(posOf(result, 'root')).toEqual({ x: 0, y: 0 });
    expect(posOf(result, 'child')).toEqual({ x: LAYOUT_COL_WIDTH, y: LAYOUT_ROW_HEIGHT });
    expect(posOf(result, 'gc')).toEqual({ x: 2 * LAYOUT_COL_WIDTH, y: 2 * LAYOUT_ROW_HEIGHT });
  });

  it('边 source=parentId, target=id', () => {
    const result = buildFlowGraph([
      makeNode('root', 1, 'disaster', 'r'),
      makeNode('child', 2, 'decision', 'c', 'root'),
    ]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0]).toMatchObject({ source: 'root', target: 'child' });
  });

  it('边 id 格式 e-{parentId}-{id}', () => {
    const result = buildFlowGraph([
      makeNode('p', 1, 'disaster', 'p'),
      makeNode('c', 2, 'decision', 'c', 'p'),
    ]);
    expect(result.edges[0].id).toBe('e-p-c');
  });
});

describe('buildFlowGraph · 多根(parentId undefined 多个)', () => {
  it('两个根均在 layer 0,按 ts 升序排 x(小 ts → x=0)', () => {
    const result = buildFlowGraph([
      makeNode('b', 5, 'disaster', 'B'),
      makeNode('a', 1, 'disaster', 'A'),
    ]);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(0);
    expect(posOf(result, 'a')).toEqual({ x: 0, y: 0 });
    expect(posOf(result, 'b')).toEqual({ x: LAYOUT_COL_WIDTH, y: 0 });
  });

  it('三根:ts 升序 → x 递增 (0, COL, 2×COL)', () => {
    const result = buildFlowGraph([
      makeNode('c', 30, 'disaster', 'C'),
      makeNode('a', 10, 'disaster', 'A'),
      makeNode('b', 20, 'disaster', 'B'),
    ]);
    expect(posOf(result, 'a').x).toBe(0);
    expect(posOf(result, 'b').x).toBe(LAYOUT_COL_WIDTH);
    expect(posOf(result, 'c').x).toBe(2 * LAYOUT_COL_WIDTH);
  });
});

describe('buildFlowGraph · 同层多子节点水平排列 + ts 升序', () => {
  it('同一父的三个子节点:按 ts 升序 x 递增,均在 layer 1', () => {
    const result = buildFlowGraph([
      makeNode('root', 0, 'disaster', 'root'),
      makeNode('c3', 30, 'decision', '三', 'root'),
      makeNode('c1', 10, 'decision', '一', 'root'),
      makeNode('c2', 20, 'decision', '二', 'root'),
    ]);
    const y1 = LAYOUT_ROW_HEIGHT;
    // x = 全局 ts 序:root idx0,c1/c2/c3 依次 idx1/2/3(不再每层独立从 0 起)
    expect(posOf(result, 'root')).toEqual({ x: 0, y: 0 });
    expect(posOf(result, 'c1')).toEqual({ x: LAYOUT_COL_WIDTH, y: y1 });
    expect(posOf(result, 'c2')).toEqual({ x: 2 * LAYOUT_COL_WIDTH, y: y1 });
    expect(posOf(result, 'c3')).toEqual({ x: 3 * LAYOUT_COL_WIDTH, y: y1 });
  });

  it('同 ts 时按 id 字典序(确定性 tiebreaker)', () => {
    const result = buildFlowGraph([
      makeNode('root', 0, 'disaster', 'root'),
      makeNode('z', 10, 'decision', 'Z', 'root'),
      makeNode('a', 10, 'decision', 'A', 'root'),
    ]);
    // x = 全局 ts 序:root idx0,a/z 依次 idx1/2
    expect(posOf(result, 'a').x).toBe(LAYOUT_COL_WIDTH);
    expect(posOf(result, 'z').x).toBe(2 * LAYOUT_COL_WIDTH);
  });

  it('不同父的子节点混在同层:仍按 ts 全局升序排 x', () => {
    const result = buildFlowGraph([
      makeNode('r1', 0, 'disaster', 'r1'),
      makeNode('r2', 1, 'disaster', 'r2'),
      makeNode('b', 5, 'decision', 'B', 'r1'),
      makeNode('a', 3, 'decision', 'A', 'r2'),
    ]);
    // x = 全局 ts 序:r1 idx0,r2 idx1,a(ts=3) idx2,b(ts=5) idx3
    expect(posOf(result, 'a').x).toBe(2 * LAYOUT_COL_WIDTH);
    expect(posOf(result, 'b').x).toBe(3 * LAYOUT_COL_WIDTH);
    expect(posOf(result, 'a').y).toBe(LAYOUT_ROW_HEIGHT);
    expect(posOf(result, 'b').y).toBe(LAYOUT_ROW_HEIGHT);
  });
});

describe('buildFlowGraph · 边正确性', () => {
  it('每条边 source=parentId 且 target=id', () => {
    const result = buildFlowGraph([
      makeNode('r', 1, 'disaster', 'r'),
      makeNode('a', 2, 'decision', 'a', 'r'),
      makeNode('b', 3, 'decision', 'b', 'r'),
      makeNode('a1', 4, 'execution', 'a1', 'a'),
    ]);
    for (const e of result.edges) {
      expect(e.source).not.toBe(e.target);
      expect(typeof e.source).toBe('string');
      expect(typeof e.target).toBe('string');
    }
    expect(result.edges).toHaveLength(3);
  });

  it('parentId 不在集中 → 视为根(不生成边)', () => {
    const result = buildFlowGraph([
      makeNode('orphan', 1, 'disaster', '孤', 'nonexistent'),
    ]);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(posOf(result, 'orphan')).toEqual({ x: 0, y: 0 });
  });

  it('自引用 parentId → 视为根(不生成自环边)', () => {
    const result = buildFlowGraph([
      makeNode('self', 1, 'disaster', '自', 'self'),
    ]);
    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
  });

  it('边类型 smoothstep(因果层级清晰)', () => {
    const result = buildFlowGraph([
      makeNode('r', 1, 'disaster', 'r'),
      makeNode('c', 2, 'decision', 'c', 'r'),
    ]);
    expect(result.edges[0].type).toBe('smoothstep');
  });
});

describe('buildFlowGraph · 类型 → 颜色映射(§5.4 颜色表)', () => {
  it('NODE_TYPE_STYLES 覆盖全部 7 种 TreeNodeType', () => {
    const types: TreeNodeType[] = [
      'disaster',
      'decision',
      'special',
      'arrival',
      'status',
      'execution',
      'generic',
    ];
    for (const t of types) {
      expect(NODE_TYPE_STYLES[t]).toBeDefined();
      expect(NODE_TYPE_STYLES[t].backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(NODE_TYPE_STYLES[t].borderColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(NODE_TYPE_STYLES[t].textColor).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof NODE_TYPE_STYLES[t].label).toBe('string');
    }
  });

  it('关键类型主色(borderColor)符合 §5.4 颜色表', () => {
    expect(NODE_TYPE_STYLES.disaster.borderColor).toBe('#ef4444');
    expect(NODE_TYPE_STYLES.decision.borderColor).toBe('#3b82f6');
    expect(NODE_TYPE_STYLES.special.borderColor).toBe('#f97316');
    expect(NODE_TYPE_STYLES.arrival.borderColor).toBe('#22c55e');
    expect(NODE_TYPE_STYLES.status.borderColor).toBe('#6b7280');
    expect(NODE_TYPE_STYLES.execution.borderColor).toBe('#a855f7');
    expect(NODE_TYPE_STYLES.generic.borderColor).toBe('#d1d5db');
  });

  it('每种类型有对应 backgroundColor(flow 节点背景)', () => {
    expect(NODE_TYPE_STYLES.disaster.backgroundColor).toBeTruthy();
    expect(NODE_TYPE_STYLES.decision.backgroundColor).toBeTruthy();
    expect(NODE_TYPE_STYLES.execution.backgroundColor).toBeTruthy();
  });
});

describe('buildFlowGraph · flow 节点字段保留', () => {
  it('data 保留原 TreeNode 全部字段(id/ts/type/label/可选字段)', () => {
    const node: TreeNode = {
      id: 'n1',
      ts: 5,
      type: 'decision',
      label: '出水压制',
      detail: '决策依据',
      agentName: '指挥agent',
      toolCallId: 'call_x',
      functionIdentifier: 'flyto',
      meta: { input_params: [1, 2], ok: true },
    };
    const result = buildFlowGraph([node]);
    expect(result.nodes[0].data).toMatchObject({
      id: 'n1',
      ts: 5,
      type: 'decision',
      label: '出水压制',
      detail: '决策依据',
      agentName: '指挥agent',
      toolCallId: 'call_x',
      functionIdentifier: 'flyto',
    });
    expect(result.nodes[0].data.meta).toEqual({ input_params: [1, 2], ok: true });
  });

  it(`flow 节点 type 字段 = '${EVENT_NODE_TYPE}'`, () => {
    const result = buildFlowGraph([makeNode('a', 1, 'disaster', 'x')]);
    expect(result.nodes[0].type).toBe(EVENT_NODE_TYPE);
  });

  it('flow 节点 position 存在且为非负有限值', () => {
    const result = buildFlowGraph([
      makeNode('a', 1, 'disaster', 'a'),
      makeNode('b', 2, 'decision', 'b', 'a'),
    ]);
    for (const n of result.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
      expect(n.position.x).toBeGreaterThanOrEqual(0);
      expect(n.position.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('buildFlowGraph · 确定性', () => {
  it('相同输入两次调用结果完全相同(深相等)', () => {
    const nodes = [
      makeNode('root', 1, 'disaster', 'r'),
      makeNode('b', 3, 'decision', 'b', 'root'),
      makeNode('a', 2, 'decision', 'a', 'root'),
      makeNode('c', 4, 'execution', 'c', 'a'),
    ];
    expect(buildFlowGraph(nodes)).toEqual(buildFlowGraph(nodes));
  });

  it('输入数组顺序不影响输出(按 ts+id 稳定排序)', () => {
    const order1 = [
      makeNode('root', 1, 'disaster', 'r'),
      makeNode('a', 2, 'decision', 'a', 'root'),
      makeNode('b', 3, 'decision', 'b', 'root'),
    ];
    const order2 = [
      makeNode('b', 3, 'decision', 'b', 'root'),
      makeNode('root', 1, 'disaster', 'r'),
      makeNode('a', 2, 'decision', 'a', 'root'),
    ];
    expect(buildFlowGraph(order1)).toEqual(buildFlowGraph(order2));
  });
});

describe('buildFlowGraph · 防环(理论防御)', () => {
  it('两节点互为父(A.parentId=B, B.parentId=A):算法终止,均被分配坐标', () => {
    const result = buildFlowGraph([
      makeNode('A', 1, 'disaster', 'A', 'B'),
      makeNode('B', 2, 'disaster', 'B', 'A'),
    ]);
    // 算法不挂死循环即可;两节点均应有坐标
    expect(result.nodes).toHaveLength(2);
    // 互环两端 parentId 均在集中且非自引用 → 按 spec 规则各产生 1 边(B→A + A→B,共 2 条)
    expect(result.edges).toHaveLength(2);
    for (const n of result.nodes) {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    }
  });
});

describe('buildFlowGraph · 深链(5 层 y 递增)', () => {
  it('5 层因果链 → 每层 y = depth × ROW_HEIGHT 递增 + 4 条边', () => {
    const result = buildFlowGraph([
      makeNode('n0', 0, 'disaster', '0'),
      makeNode('n1', 1, 'decision', '1', 'n0'),
      makeNode('n2', 2, 'execution', '2', 'n1'),
      makeNode('n3', 3, 'status', '3', 'n2'),
      makeNode('n4', 4, 'arrival', '4', 'n3'),
    ]);
    expect(posOf(result, 'n0').y).toBe(0 * LAYOUT_ROW_HEIGHT);
    expect(posOf(result, 'n1').y).toBe(1 * LAYOUT_ROW_HEIGHT);
    expect(posOf(result, 'n2').y).toBe(2 * LAYOUT_ROW_HEIGHT);
    expect(posOf(result, 'n3').y).toBe(3 * LAYOUT_ROW_HEIGHT);
    expect(posOf(result, 'n4').y).toBe(4 * LAYOUT_ROW_HEIGHT);
    expect(result.edges).toHaveLength(4);
  });
});
