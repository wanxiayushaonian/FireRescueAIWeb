import { describe, expect, it } from 'vitest';
import { parseFloorToken, parseFloorSpec, storyIdsForFloorSpec } from '../floor-focus';
import type { SceneTreeNode } from '../device-tree';

describe('parseFloorToken', () => {
  it.each([
    ['3F', 3],
    ['F3', 3],
    ['3', 3],
    [' 2f ', 2],
    ['B2F', -2],
    ['B2', -2],
    ['BF2', -2],
    ['58F', 58],
  ])('解析 %s → %i', (input, expected) => {
    expect(parseFloorToken(input)).toBe(expected);
  });

  it.each(['M', '', 'B', '办公室', '1-2', 'F', 'B层'])('无法解析:%s → null', (input) => {
    expect(parseFloorToken(input)).toBeNull();
  });
});

describe('parseFloorSpec', () => {
  it('单层', () => {
    expect(parseFloorSpec('1F')).toEqual([1]);
    expect(parseFloorSpec('B1F')).toEqual([-1]);
  });

  it('连续段(含反序)', () => {
    expect(parseFloorSpec('2-5F')).toEqual([2, 3, 4, 5]);
    expect(parseFloorSpec('10-25F')).toHaveLength(16);
    expect(parseFloorSpec('5-3F')).toEqual([3, 4, 5]);
    expect(parseFloorSpec('B2-B1F')).toEqual([-2, -1]);
  });

  it('逗号/顿号列表与混合', () => {
    expect(parseFloorSpec('1F,3F')).toEqual([1, 3]);
    expect(parseFloorSpec('1F、3-4F')).toEqual([1, 3, 4]);
    expect(parseFloorSpec('1F,1F')).toEqual([1]); // 去重
  });

  it('非法输入 → null(含超长段防呆)', () => {
    expect(parseFloorSpec('顶层')).toBeNull();
    expect(parseFloorSpec('')).toBeNull();
    expect(parseFloorSpec('1-999F')).toBeNull();
  });
});

/** 模拟场景树:Site → Building → Stories(+噪声节点),Site 级环境设备。 */
function fakeTree(): SceneTreeNode {
  const story = (name: string, outId: string): SceneTreeNode => ({
    id: `node-${outId}`, name, type: 'Story', children: [], out_instance_id: outId,
  });
  return {
    id: 'SITE_ROOT', name: '21D', type: 'Site',
    children: [
      {
        id: 'b1', name: '广场21D', type: 'Building',
        children: [
          story('B1F', 'ob1'),
          story('1F', 'o1'),
          story('2F', 'o2'),
          story('3F', 'o3'),
          story('5F', 'o5'),
          { id: 'sp1', name: '办公区', type: 'Space', children: [] },
          { id: 'dev1', name: '烟感', type: 'PointSmokeDetector', children: [] },
        ],
      },
      { id: 'hyd1', name: '室外消火栓', type: 'OutdoorFireHydrant', children: [] },
    ],
  };
}

describe('storyIdsForFloorSpec', () => {
  it('按楼层段返回 Story out_instance_id(升序段内匹配)', () => {
    expect(storyIdsForFloorSpec(fakeTree(), '2-3F')).toEqual(['o2', 'o3']);
  });

  it('地下层与单层', () => {
    expect(storyIdsForFloorSpec(fakeTree(), 'B1F')).toEqual(['ob1']);
    expect(storyIdsForFloorSpec(fakeTree(), '5F')).toEqual(['o5']);
  });

  it('只认 Story 节点:Space/设备/环境节点不参与、不受影响', () => {
    const ids = storyIdsForFloorSpec(fakeTree(), '1-5F');
    expect(ids).toEqual(['o1', 'o2', 'o3', 'o5']);
    expect(ids).not.toContain('sp1');
    expect(ids).not.toContain('dev1');
    expect(ids).not.toContain('hyd1');
  });

  it('匹配不到(场景无该层/字段非法)→ 空数组', () => {
    expect(storyIdsForFloorSpec(fakeTree(), '6F')).toEqual([]);
    expect(storyIdsForFloorSpec(fakeTree(), '顶层')).toEqual([]);
  });

  it('树里没有 Story → 空数组', () => {
    const noStory: SceneTreeNode = { id: 'r', name: 'r', type: 'Site', children: [{ id: 'x', name: '草地', type: 'Ground', children: [] }] };
    expect(storyIdsForFloorSpec(noStory, '1F')).toEqual([]);
  });
});
