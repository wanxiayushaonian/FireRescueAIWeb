import { describe, it, expect } from 'vitest';
import { countSceneNodes } from '../scene-stats';

describe('countSceneNodes', () => {
  it('统计楼层 / 普通设备 / 消防设备叶子', () => {
    const tree = {
      type: 'building',
      children: [
        {
          type: 'Story',
          children: [
            { type: 'StandaloneSmokeAlarm' }, // 消防设备
            { type: 'Desk' }, // 普通设备
          ],
        },
      ],
    };
    expect(countSceneNodes(tree)).toEqual({ story: 1, device: 1, fire: 1 });
  });

  it('容器类型(如 Space)叶子不计入设备', () => {
    expect(countSceneNodes({ type: 'Space' }).device).toBe(0);
    expect(countSceneNodes({ type: 'Wall' }).device).toBe(0);
  });

  it('空 type 叶子不计入设备', () => {
    expect(countSceneNodes({ type: '' }).device).toBe(0);
  });

  it('超深单链树不栈溢出:超出深度上限的节点被截断', () => {
    // 构造深度 10000 的单链树(每层一个 Story 子节点)。
    // 无深度保护时此递归会栈溢出;有保护时最多计入上限层。
    let node: unknown = { type: 'Story', children: [] };
    for (let i = 0; i < 10000; i++) {
      node = { type: 'Story', children: [node] };
    }
    const stats = countSceneNodes(node as never);
    expect(stats.story).toBeGreaterThan(0);
    // 上限内的楼层被计入,但不会无限递归到 10000
    expect(stats.story).toBeLessThanOrEqual(100);
  });
});
