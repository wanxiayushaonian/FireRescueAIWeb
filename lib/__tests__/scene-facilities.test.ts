import { describe, it, expect } from 'vitest';
import { countSceneFacilities } from '../scene-facilities';
import type { SceneTreeNode } from '../ustudio';

/** 构造最小场景树:Story 下挂设备(结构类被排除)。 */
function story(label: string, devices: Array<[type: string, name: string]>): SceneTreeNode {
  return {
    id: label,
    name: label,
    type: 'Story',
    children: devices.map(([type, name], i) => ({
      id: `${label}-${type}-${i}`,
      out_instance_id: `${label}-${type}-${i}`,
      name,
      type,
    })),
  } as unknown as SceneTreeNode;
}

function fakeTree(): SceneTreeNode {
  return {
    id: 'root',
    name: 'root',
    type: 'Site',
    children: [
      story('5F', [
        ['IndoorFireHydrant', '室内消火栓'],
        ['IndoorFireHydrant', '室内消火栓'],
        ['OpenSprinklerHead', '喷淋嘴'],
        ['PointSmokeDetector', '感烟探测器'],
        ['Wall', '墙'], // 结构类应排除
      ]),
      story('B1', [
        ['IndoorFireHydrant', '室内消火栓'],
        ['Shuixiangshuibeng', '水箱水泵'],
        ['Door', '门'], // 门不是消防系统类(FIRE_DEVICE_TYPES 不含 Door)
      ]),
    ],
  } as unknown as SceneTreeNode;
}

describe('countSceneFacilities', () => {
  it('统计消防设施按类型(中文标签)与楼层分组,排除结构类', () => {
    const c = countSceneFacilities(fakeTree());
    expect(c.fireByTypeLabel).toEqual({ 室内消火栓: 3, 喷淋嘴: 1, 感烟探测器: 1, 水箱水泵: 1 });
    expect(c.fireByFloor).toEqual({ '5F': 4, 'B1': 2 });
    expect(c.floors).toEqual(['B1', '5F']); // 升序(地下在前)
    expect(c.total).toBe(7); // 全部非结构节点(含门;墙被排除);fireBy* 只含消防系统类
  });

  it('按楼层过滤', () => {
    const c = countSceneFacilities(fakeTree(), { floor: '5F' });
    expect(c.fireByTypeLabel).toEqual({ 室内消火栓: 2, 喷淋嘴: 1, 感烟探测器: 1 });
    expect(c.fireByFloor).toEqual({ '5F': 4 });
  });

  it('按类型过滤(中文/英文子串均可)', () => {
    expect(countSceneFacilities(fakeTree(), { type: '消火栓' }).fireByTypeLabel).toEqual({ 室内消火栓: 3 });
    expect(countSceneFacilities(fakeTree(), { type: 'Sprinkler' }).fireByTypeLabel).toEqual({ 喷淋嘴: 1 });
  });

  it('空树/空数据返回零值', () => {
    const c = countSceneFacilities(null);
    expect(c.total).toBe(0);
    expect(c.floors).toEqual([]);
  });
});
