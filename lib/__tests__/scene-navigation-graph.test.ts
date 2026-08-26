// 图节点吸附纯函数测试:kgraph 仅含 Door/Stairs,导航端点必须吸附(2026-08-27 实测结论)。
import { describe, expect, it } from 'vitest';
import type { SceneTreeNode } from '../ustudio';
import { collectGraphNodes, pickNearestGraphNode } from '../scene-navigation';

function node(partial: Partial<SceneTreeNode> & { children?: SceneTreeNode[] }): SceneTreeNode {
  return {
    id: partial.id ?? '',
    type: partial.type ?? '',
    name: partial.name ?? '',
    twins_instance_id: partial.twins_instance_id,
    twins_instance_name: partial.twins_instance_name,
    twins_identifier: partial.twins_identifier,
    out_instance_id: partial.out_instance_id,
    children: partial.children ?? [],
  } as SceneTreeNode;
}

const POSITIONS: Record<string, { x: number; y: number; z: number }> = {
  door1: { x: 0, y: 0, z: 0 },
  door2: { x: 10, y: 0, z: 0 },
  stair13: { x: 2, y: 50, z: 2 },
};

const getPosition = (outId: string) => POSITIONS[outId] ?? null;

const TREE = node({
  type: 'Building',
  children: [
    node({ type: 'Story', twins_instance_id: 'story1', children: [
      node({ type: 'Space', twins_instance_id: 'space1', children: [
        node({ type: 'Door', twins_instance_id: 'gdoor1', out_instance_id: 'door1' }),
        node({ type: 'FireHydrant', twins_instance_id: 'dev1', out_instance_id: 'dev1out' }),
      ] }),
      node({ type: 'Stairs', twins_instance_id: 'gstair', out_instance_id: 'stair13' }),
      node({ type: 'Door', twins_instance_id: '', out_instance_id: 'doorX' }), // 无 twins id → 跳过
    ] }),
  ],
});

describe('collectGraphNodes', () => {
  it('只收集 Door/Stairs,且必须同时有 twins id 与 out id', () => {
    const entries = collectGraphNodes(TREE);
    expect(entries.map((e) => e.nodeId).sort()).toEqual(['gdoor1', 'gstair']);
  });

  it('按树缓存(同一棵树返回同一实例)', () => {
    expect(collectGraphNodes(TREE)).toBe(collectGraphNodes(TREE));
  });

  it('空树安全', () => {
    expect(collectGraphNodes(null)).toEqual([]);
  });
});

describe('pickNearestGraphNode', () => {
  const entries = collectGraphNodes(TREE);

  it('3D 最近者胜(高处查询命中楼梯而非地面门)', () => {
    const snap = pickNearestGraphNode(entries, { x: 1, y: 49, z: 1 }, getPosition);
    expect(snap?.entry.nodeId).toBe('gstair');
  });

  it('地面查询命中近门', () => {
    const snap = pickNearestGraphNode(entries, { x: 0.5, y: 0, z: 0 }, getPosition);
    expect(snap?.entry.nodeId).toBe('gdoor1');
  });

  it('定位不到坐标的节点被跳过;全空返回 null', () => {
    const only2 = entries.filter((e) => e.outId !== 'door1');
    const snap = pickNearestGraphNode(only2, { x: 0, y: 0, z: 0 }, getPosition);
    expect(snap?.entry.nodeId).toBe('gstair'); // door2 无坐标记录?door2 不在树里;stair 距离远但可用
    expect(pickNearestGraphNode(entries, { x: 0, y: 0, z: 0 }, () => null)).toBeNull();
    expect(pickNearestGraphNode([], { x: 0, y: 0, z: 0 }, getPosition)).toBeNull();
  });
});
