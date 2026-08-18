// lib/drill/__tests__/event-flow.test.ts
// 事件流卡流组装:特情→响应归组、新卡在上、时间轴升序
import { describe, expect, it } from 'vitest';
import { buildFlowItems, buildTimelineNodes, eventTypeMeta } from '../event-flow';
import type { TreeNode, TreeNodeType } from '../drill-recorder';

let seq = 0;
function makeNode(id: string, ts: number, type: TreeNodeType, parentId?: string): TreeNode {
  seq += 1;
  return { id, ts, type, label: `${type}-${id}-${seq}`, ...(parentId ? { parentId } : {}) };
}

describe('buildFlowItems:特情→响应卡对归组', () => {
  it('parentId 指向 special 的节点归入其 responses,不独立出现', () => {
    const items = buildFlowItems([
      makeNode('s1', 9, 'special'),
      makeNode('d1', 10, 'decision', 's1'),
      makeNode('st1', 11, 'status'),
    ]);
    const special = items.find((i) => i.node.id === 's1');
    expect(special?.responses.map((r) => r.id)).toEqual(['d1']);
    // d1 不作为独立卡出现
    expect(items.filter((i) => i.node.id === 'd1')).toHaveLength(0);
    expect(items.filter((i) => i.node.id === 'st1')).toHaveLength(1);
  });

  it('parentId 指向非 special(如 decision)→ 仍独立(不参与缩进)', () => {
    const items = buildFlowItems([
      makeNode('d1', 5, 'decision'),
      makeNode('s1', 6, 'special', 'd1'),
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.responses.length === 0)).toBe(true);
  });

  it('新卡在上:ts 倒序;同 ts 按 id 字典序(确定性)', () => {
    const items = buildFlowItems([
      makeNode('a', 1, 'status'),
      makeNode('c', 3, 'status'),
      makeNode('b', 3, 'arrival'),
    ]);
    expect(items.map((i) => i.node.id)).toEqual(['b', 'c', 'a']);
  });

  it('多个响应按 ts 升序排列', () => {
    const items = buildFlowItems([
      makeNode('s1', 9, 'special'),
      makeNode('d2', 15, 'decision', 's1'),
      makeNode('d1', 11, 'decision', 's1'),
    ]);
    expect(items[0].responses.map((r) => r.id)).toEqual(['d1', 'd2']);
  });

  it('空输入 → 空卡流', () => {
    expect(buildFlowItems([])).toEqual([]);
  });
});

describe('buildTimelineNodes:时间轴 ts 升序', () => {
  it('老→新排列', () => {
    const tl = buildTimelineNodes([
      makeNode('c', 9, 'special'),
      makeNode('a', 1, 'disaster'),
      makeNode('b', 5, 'decision'),
    ]);
    expect(tl.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('eventTypeMeta:类型色表', () => {
  it('7 种类型全覆盖', () => {
    const types: TreeNodeType[] = ['disaster', 'decision', 'special', 'arrival', 'status', 'execution', 'generic'];
    for (const t of types) {
      expect(eventTypeMeta(t).color).toBeTruthy();
      expect(eventTypeMeta(t).label).toBeTruthy();
    }
  });
});
