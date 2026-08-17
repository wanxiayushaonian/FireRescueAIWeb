import { describe, expect, it } from 'vitest';
import { analyzeScenePack } from '../scene-pack-inventory';
import type { SceneTreeNode } from '../ustudio';

function fakeTree(): SceneTreeNode {
  const node = (id: string, name: string, type: string, children: SceneTreeNode[] = []): SceneTreeNode =>
    ({
      id, name, type, children,
      twins_instance_id: `tw-${id}`, twins_instance_name: name, twins_identifier: type, out_instance_id: id,
    }) as SceneTreeNode;
  return node('site', '21D', 'Site', [
    node('in1', '出入口1', 'SceneInOut'),
    node('truck', '排烟消防车1', 'SmokeExhaustFireTruck'),
    node('oh', '室外消火栓1', 'OutdoorFireHydrant'),
    node('b', '广场21D', 'Building', [
      node('st1', '1F', 'Story', [
        node('sp1', '房间', 'Space', [node('dev1', '室内消火栓', 'IndoorFireHydrant')]),
        node('d1', '门_1F_9', 'Door'),
      ]),
      node('st2', '2F', 'Story', [node('w1', '墙', 'Wall')]),
      node('stb', 'B1F', 'Story', [node('sp2', '弱电井', 'Space')]),
      node('stx', '未定义楼层', 'Story', []),
    ]),
  ]);
}

describe('analyzeScenePack', () => {
  it('类型统计含 Site 级拆分;层级排序 地下→地上→未定义', () => {
    const inv = analyzeScenePack(fakeTree());
    const byType = new Map(inv.types.map((t) => [t.type, t]));
    expect(byType.get('IndoorFireHydrant')).toMatchObject({ count: 1, siteLevel: 0, label: '室内消火栓' });
    expect(byType.get('OutdoorFireHydrant')).toMatchObject({ count: 1, siteLevel: 1 });
    expect(byType.get('Story')).toMatchObject({ count: 4 });
    expect(inv.stories.map((s) => s.name)).toEqual(['B1F', '1F', '2F', '未定义楼层']);
    expect(inv.stories[0]?.floor).toBe(-1);
    expect(inv.stories.find((s) => s.name === '未定义楼层')?.floor).toBeNull();
  });

  it('楼层内容计数含自身与子树;Space 分类;出入口与 Site 级清单', () => {
    const inv = analyzeScenePack(fakeTree());
    const f1 = inv.stories.find((s) => s.name === '1F')!;
    expect(f1.total).toBe(4); // Story 自身 + Space + 设备 + 门
    expect(f1.byType).toContainEqual({ type: 'IndoorFireHydrant', count: 1 });
    expect(inv.spaceTaxonomy).toEqual(
      expect.arrayContaining([{ name: '房间', count: 1 }, { name: '弱电井', count: 1 }]),
    );
    expect(inv.entrances).toEqual([{ name: '出入口1', twinsId: 'tw-in1', outId: 'in1' }]);
    const siteTypes = inv.siteLevel.map((s) => s.type).sort();
    expect(siteTypes).toEqual(['Building', 'OutdoorFireHydrant', 'SceneInOut', 'SmokeExhaustFireTruck']);
  });

  it('空树/空入参安全', () => {
    expect(analyzeScenePack(null).totalNodes).toBe(0);
    expect(analyzeScenePack(undefined).types).toEqual([]);
  });
});
