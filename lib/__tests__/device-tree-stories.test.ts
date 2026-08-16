// lib/__tests__/device-tree-stories.test.ts
// collectNonStructuralOutIdsWithinStories:单/多层聚焦时按楼层子树收设备 id(卡顿修复的纯逻辑核心)。
import { describe, it, expect } from 'vitest';
import { collectNonStructuralOutIds, collectNonStructuralOutIdsWithinStories } from '../device-tree';
import type { SceneTreeNode } from '../device-tree';

function node(id: string, type: string, children: SceneTreeNode[] = [], out?: string): SceneTreeNode {
  return {
    id, name: id, type, children,
    out_instance_id: out ?? id,
    twins_instance_id: `tw-${id}`,
  } as SceneTreeNode;
}

/** Site → Building → Story 1F/2F(各含设备+墙) + Site 级室外消火栓 */
function tree(): SceneTreeNode {
  return node('site', 'Site', [
    node('b1', 'Building', [
      node('st-1', 'Story', [
        node('dev-1', 'PointSmokeDetector'),
        node('wall-1', 'Wall'),
        node('sp-1', 'Space', [node('dev-1b', 'IndoorFireHydrant')]),
      ]),
      node('st-2', 'Story', [
        node('dev-2', 'PointSmokeDetector'),
      ]),
    ]),
    node('oh-1', 'OutdoorFireHydrant'),
  ]);
}

describe('collectNonStructuralOutIdsWithinStories', () => {
  it('只收指定楼层子树内的非结构节点(墙排除,空间子树内的设备也收)', () => {
    const ids = collectNonStructuralOutIdsWithinStories(tree(), ['st-1']);
    expect(ids.sort()).toEqual(['dev-1', 'dev-1b', 'sp-1'].sort());
  });

  it('多楼层并集;不含其他楼层与楼层外的 Site 级设备', () => {
    const ids = collectNonStructuralOutIdsWithinStories(tree(), ['st-1', 'st-2']);
    expect(ids).toContain('dev-2');
    expect(ids).not.toContain('oh-1');
    expect(ids).toHaveLength(4); // dev-1, dev-1b, sp-1, dev-2
  });

  it('空楼层集 → 空(全量场景走 collectNonStructuralOutIds 兜底)', () => {
    expect(collectNonStructuralOutIdsWithinStories(tree(), [])).toEqual([]);
    // 对照:全量收集含其他楼层与 Site 级设备
    expect(collectNonStructuralOutIds(tree())).toContain('oh-1');
    expect(collectNonStructuralOutIds(tree())).toContain('dev-2');
  });
});
