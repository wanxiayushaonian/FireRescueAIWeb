import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildDeviceSearchIndex,
  buildPickIndex,
  groupDevicesByStory,
  resolvePick,
  resolvePickAcross,
  searchDevices,
} from '../scene-pick';
import { loadSceneViewBookmarks, saveSceneViewBookmarks, sceneViewsKey } from '../scene-view-bookmarks';
import type { SceneTreeNode } from '../ustudio';

/** 模拟场景树:Site → Building → Story(1F/2F) → 设备/门/墙 + Site 级室外消火栓 */
function fakeTree(): SceneTreeNode {
  const node = (id: string, name: string, type: string, children: SceneTreeNode[] = []): SceneTreeNode =>
    ({
      id, name, type, children,
      twins_instance_id: `tw-${id}`, twins_instance_name: name, twins_identifier: type, out_instance_id: id,
    }) as SceneTreeNode;
  return node('site', '21D', 'Site', [
    node('b1', '广场21D', 'Building', [
      node('st1', '1F', 'Story', [
        node('dev-out-1', '灭火器箱01', 'ExtinguisherCabinet'),
        node('door-1', '防火门', 'Door'),
        node('wall-1', '墙', 'Wall'),
      ]),
      node('st2', '2F', 'Story', [
        node('hyd-2', '室内消火栓2F', 'IndoorFireHydrant'),
        node('elev-2', '货梯', 'Elevator'),
      ]),
    ]),
    node('oh-out', '室外消火栓', 'OutdoorFireHydrant'),
  ]);
}

describe('buildPickIndex / resolvePick', () => {
  it('非结构节点进索引,结构骨架(Site/Building/Story/Wall)不进', () => {
    const idx = buildPickIndex(fakeTree());
    expect(idx.has('dev-out-1')).toBe(true);
    expect(idx.has('door-1')).toBe(true);
    expect(idx.has('oh-out')).toBe(true);
    expect(idx.has('wall-1')).toBe(false);
    expect(idx.has('st1')).toBe(false);
  });

  it('resolvePick 按父链最近优先:先命中构件自身;类型标签双字典(scene-categories > fire-types)优先、无则原文回退', () => {
    const idx = buildPickIndex(fakeTree());
    // 构件→墙→楼层 的父链:第一个可交互节点优先
    const hit = resolvePick(['dev-out-1', 'wall-1', 'st1', 'b1'], idx);
    expect(hit?.outId).toBe('dev-out-1');
    expect(hit?.typeLabel).toBe('灭火器箱'); // fire-types 字典命中
    const viaHidable = resolvePick(['hyd-2', 'st2', 'b1'], idx);
    expect(viaHidable?.typeLabel).toBe('室内消火栓'); // scene-categories 字典命中
    const raw = resolvePick(['elev-2', 'st2', 'b1'], idx);
    expect(raw?.typeLabel).toBe('Elevator'); // 两字典皆无 → 原文
    // 全结构链 → null
    expect(resolvePick(['wall-x', 'st1', 'b1'], idx)).toBeNull();
    expect(resolvePick([], idx)).toBeNull();
  });

  it('resolvePickAcross 跨链解析:首链为墙(结构)时取后链设备(遮挡场景)', () => {
    const idx = buildPickIndex(fakeTree());
    const chains = [
      ['wall-1', 'st1', 'b1'], // 首链:墙(结构骨架,无卡)
      ['dev-out-1', 'wall-1', 'st1'], // 后链:设备
    ];
    expect(resolvePickAcross(chains, idx)?.outId).toBe('dev-out-1');
    expect(resolvePickAcross([['wall-1', 'st1']], idx)).toBeNull();
    expect(resolvePickAcross([], idx)).toBeNull();
  });
});

describe('buildDeviceSearchIndex / searchDevices', () => {
  it('带楼层标签;Site 级设备楼层层为空', () => {
    const items = buildDeviceSearchIndex(fakeTree());
    const hyd = items.find((x) => x.outId === 'hyd-2');
    expect(hyd?.storyLabel).toBe('2F');
    const outdoor = items.find((x) => x.outId === 'oh-out');
    expect(outdoor?.storyLabel).toBeUndefined();
  });

  it('搜索:名称前缀优先于包含,类型/楼层可命中,空查询无结果', () => {
    const items = buildDeviceSearchIndex(fakeTree());
    const r1 = searchDevices(items, '消火栓');
    expect(r1.map((x) => x.outId)).toContain('hyd-2');
    expect(r1.map((x) => x.outId)).toContain('oh-out');
    const r2 = searchDevices(items, '灭火器');
    expect(r2[0]?.outId).toBe('dev-out-1'); // 名称命中
    const r3 = searchDevices(items, '2F');
    expect(r3.map((x) => x.outId)).toContain('hyd-2'); // 楼层命中
    expect(searchDevices(items, '  ')).toEqual([]);
  });
});

describe('groupDevicesByStory', () => {
  it('按楼层分组:组顺序=首现顺序(相关度),组内保持原序;无楼层归「未归属楼层」', () => {
    const items = buildDeviceSearchIndex(fakeTree());
    const groups = groupDevicesByStory(searchDevices(items, '消火栓'));
    // 室外消火栓(Site 级,无楼层)与 2F 室内消火栓都命中;首现者所在组在前
    expect(groups.map((g) => g.story)).toContain('2F');
    expect(groups.map((g) => g.story)).toContain('未归属楼层');
    for (const g of groups) {
      for (const it of g.items) {
        expect(it.storyLabel?.trim() || '未归属楼层').toBe(g.story);
      }
    }
  });

  it('空结果 → 空分组;全有楼层时不出现未归属组', () => {
    expect(groupDevicesByStory([])).toEqual([]);
    const items = buildDeviceSearchIndex(fakeTree());
    const groups = groupDevicesByStory(searchDevices(items, '灭火器'));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.story).toBe('1F');
  });
});

describe('scene-view-bookmarks', () => {
  function installMemoryStorage() {
    const store = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
  }
  beforeEach(installMemoryStorage);
  afterEach(() => vi.unstubAllGlobals());

  it('保存 → 读取往返;按场景隔离', () => {
    const mark = { name: '全景', viewpoint: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 } };
    saveSceneViewBookmarks('s1', [mark]);
    expect(loadSceneViewBookmarks('s1')).toEqual([mark]);
    expect(loadSceneViewBookmarks('s2')).toEqual([]);
    expect(sceneViewsKey('s1')).not.toBe(sceneViewsKey('s2'));
  });

  it('损坏数据/非法条目被过滤;无 window 安全', () => {
    window.localStorage.setItem(sceneViewsKey('s'), '{"bad":1}');
    expect(loadSceneViewBookmarks('s')).toEqual([]);
    window.localStorage.setItem(sceneViewsKey('s'), JSON.stringify([{ name: 'x' }, { name: 'ok', viewpoint: { position: {}, target: {} } }]));
    expect(loadSceneViewBookmarks('s')).toHaveLength(1);
    vi.unstubAllGlobals();
    expect(loadSceneViewBookmarks('s')).toEqual([]);
  });
});
