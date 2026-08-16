import { describe, expect, it } from 'vitest';
import { planAttackRoute } from '../scene-navigation';
import type { SceneTreeNode } from '../ustudio';

/** 模拟场景树:Site → Building → Story(B1F/1F/2F/3F),1F 有门,各层有楼梯,3F/B1F 有目标设备 */
function fakeTree(): SceneTreeNode {
  const node = (id: string, name: string, type: string, children: SceneTreeNode[] = []): SceneTreeNode =>
    ({
      id, name, type, children,
      twins_instance_id: `tw-${id}`, twins_instance_name: name, twins_identifier: type, out_instance_id: id,
    }) as SceneTreeNode;
  return node('site', '21D', 'Site', [
    node('b1', '广场21D', 'Building', [
      node('st-b1', 'B1F', 'Story', [
        node('stair-b1-a', '楼梯_B1F_0', 'Stairs'),
        node('dev-b1', 'B1 配电柜', 'Space'),
      ]),
      node('st-1', '1F', 'Story', [
        node('door-1-a', '门_1F_9', 'Door'),
        node('door-1-b', '门_1F_22', 'Door'),
        node('stair-1-a', '楼梯_1F_0', 'Stairs'),
        node('stair-1-b', '楼梯_1F_1', 'Stairs'),
      ]),
      node('st-2', '2F', 'Story', [
        node('stair-2-a', '楼梯_2F_0', 'Stairs'),
      ]),
      node('st-3', '3F', 'Story', [
        node('stair-3-a', '楼梯_3F_0', 'Stairs'),
        node('dev-3', '室内消火栓3F', 'IndoorFireHydrant'),
      ]),
    ]),
    node('oh-out', '室外消火栓', 'OutdoorFireHydrant'),
  ]);
}

describe('planAttackRoute', () => {
  it('地上目标:大门=最低地上层第一个门;途经楼层含两端且升序', () => {
    const plan = planAttackRoute(fakeTree(), 'dev-3');
    expect(plan).not.toBeNull();
    expect(plan!.targetFloor).toBe(3);
    expect(plan!.targetName).toBe('室内消火栓3F');
    expect(plan!.gateOutId).toBe('door-1-a');
    expect(plan!.gateFloor).toBe(1);
    expect(plan!.stairCandidates.map((s) => s.floor)).toEqual([1, 2, 3]);
    expect(plan!.stairCandidates[0]?.outIds).toEqual(['stair-1-a', 'stair-1-b']);
  });

  it('地下目标:途经楼层降序(1F→B1F);目标楼层为负', () => {
    const plan = planAttackRoute(fakeTree(), 'dev-b1');
    expect(plan!.targetFloor).toBe(-1);
    expect(plan!.stairCandidates.map((s) => s.floor)).toEqual([1, -1]);
  });

  it('大门层目标(无爬升)与无楼层归属目标(室外):无楼梯段', () => {
    const same = planAttackRoute(fakeTree(), 'stair-1-a');
    expect(same!.targetFloor).toBe(1);
    expect(same!.stairCandidates).toEqual([]);
    const outdoor = planAttackRoute(fakeTree(), 'oh-out');
    expect(outdoor!.targetFloor).toBeNull();
    expect(outdoor!.stairCandidates).toEqual([]);
    expect(outdoor!.gateOutId).toBe('door-1-a');
  });

  it('目标不在树中 → null;空入参安全', () => {
    expect(planAttackRoute(fakeTree(), 'nope')).toBeNull();
    expect(planAttackRoute(null, 'dev-3')).toBeNull();
    expect(planAttackRoute(fakeTree(), '')).toBeNull();
  });
});
