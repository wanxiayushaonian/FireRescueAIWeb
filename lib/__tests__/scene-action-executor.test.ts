import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapSceneAction, subscribeSceneActions } from '@/lib/scene-action-executor';
import { setGlobalRecipeStore } from '@/lib/scene-recipe/global-store';
import type { RecipeStore } from '@/lib/scene-recipe/store';
import { addSceneAction, clearSceneLog, type SceneAction } from '../../src/mock/sceneLog';
import type { SceneTreeNode } from '@/lib/ustudio';

function makeRuntime() {
  return {
    flyToObject: vi.fn(),
    highlightObject: vi.fn(),
    clearObjectHighlight: vi.fn(),
    resetCamera: vi.fn(),
    getObjectWorldPosition: vi.fn((_id: string): { x: number; y: number; z: number } | null => null),
    drawVirtualRoute: vi.fn(),
    clearVirtualRoute: vi.fn(),
  };
}

/** 1F 东门/西门最小树(showRoute 画线用)。 */
function makeTree(): SceneTreeNode {
  const n = (id: string, name: string, type: string, children: SceneTreeNode[] = []): SceneTreeNode => ({
    id, name, type, children,
    twins_instance_id: `tw-${id}`, twins_instance_name: name, twins_identifier: type, out_instance_id: id,
  });
  return n('t', '测试楼', 'Building', [
    n('s1', '1F', 'Story', [n('d1', '东门', 'Door'), n('d2', '西门', 'Door')]),
  ]);
}

describe('mapSceneAction', () => {
  afterEach(() => {
    setGlobalRecipeStore(null);
  });
  it('flyTo + id target → runtime.flyToObject(id)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '460054423520694453', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(true);
    expect(r.flyToObject).toHaveBeenCalledWith('460054423520694453');
  });

  it('flyTo + 中文建筑名 target → 不执行(记日志,待 id 对齐)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '金茂大厦', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/id/i);
    expect(r.flyToObject).not.toHaveBeenCalled();
  });

  it('highlight → runtime.highlightObject(id, color)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'highlight', target: 'obj-123', source: '面板' };
    mapSceneAction(a, r);
    expect(r.highlightObject).toHaveBeenCalledWith('obj-123', expect.anything());
  });

  it('switchFloor 无 store 无全局引用 → 拒绝(executed:false,不绕过显隐真相源)', () => {
    const r = makeRuntime();
    const a: SceneAction = {
      ts: '00:00:00', action: 'switchFloor', target: '5F', source: '面板',
      params: { storyIds: ['story-5'] },
    };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/RecipeStore/);
  });

  it('switchFloor 全局引用兜底 → patchStructural(单层 full+显设备)', () => {
    const r = makeRuntime();
    const patchStructural = vi.fn();
    setGlobalRecipeStore({ patchStructural } as unknown as RecipeStore);
    const a: SceneAction = {
      ts: '00:00:00', action: 'switchFloor', target: '5F', source: '面板',
      params: { storyIds: ['story-5'] },
    };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(true);
    expect(patchStructural).toHaveBeenCalledWith({
      visibleStories: ['story-5'], detailLevel: 'full', hideDevices: false,
    });
  });

  it('resetView → runtime.resetCamera()', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'resetView', target: '', source: '面板' };
    mapSceneAction(a, r);
    expect(r.resetCamera).toHaveBeenCalled();
  });

  it('drawZone/drawRoute/clearTactical/addMarker/removeMarker/updatePlan → 忽略(留后续)', () => {
    const r = makeRuntime();
    for (const action of ['drawZone', 'drawRoute', 'clearTactical', 'addMarker', 'removeMarker', 'updatePlan'] as const) {
      const a: SceneAction = { ts: '00:00:00', action, target: 'x', source: '面板' };
      expect(mapSceneAction(a, r).reason).toMatch(/忽略/);
    }
  });

  it('showRoute 无 steps → 不执行(旧日志动作仅记录)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'showRoute', target: 'r1', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/steps/);
    expect(r.drawVirtualRoute).not.toHaveBeenCalled();
  });

  it('showRoute 带 steps 但树未就绪 → 不执行(锚点无法解析)', () => {
    const r = makeRuntime();
    const a: SceneAction = {
      ts: '00:00:00', action: 'showRoute', target: '进攻路线', source: '预案引擎',
      params: { kind: 'attack', steps: ['1F 大堂', '25F 避难层'] },
    };
    const res = mapSceneAction(a, r, undefined, null);
    expect(res.executed).toBe(false);
    expect(r.drawVirtualRoute).not.toHaveBeenCalled();
  });

  it('showRoute 带 steps + 树就绪 → drawVirtualRoute 画预案折线', () => {
    const r = makeRuntime();
    r.getObjectWorldPosition.mockImplementation((id: string) =>
      id === 'd1' ? { x: 0, y: 0, z: 0 } : { x: 9, y: 0, z: 0 });
    const tree = makeTree();
    const a: SceneAction = {
      ts: '00:00:00', action: 'showRoute', target: '进攻路线', source: '预案引擎',
      params: { kind: 'attack', steps: ['首层东门', '西门'] },
    };
    const res = mapSceneAction(a, r, undefined, tree);
    expect(res.executed).toBe(true);
    expect(r.clearVirtualRoute).toHaveBeenCalledWith('plan-route-attack');
    expect(r.drawVirtualRoute).toHaveBeenCalledTimes(1);
    expect((r.drawVirtualRoute.mock.calls[0][0] as { route_id: string }).route_id).toBe('plan-route-attack');
  });

  it('hideRoute → 清除预案路线(kind 缺省两条)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'hideRoute', target: '清除进攻/疏散路线', source: '预案引擎' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(true);
    expect(r.clearVirtualRoute).toHaveBeenCalledTimes(2);
  });

  it('空 target → 不执行', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '', source: '面板' };
    expect(mapSceneAction(a, r).executed).toBe(false);
  });
});

describe('subscribeSceneActions 首次订阅回放', () => {
  afterEach(() => {
    clearSceneLog();
  });

  it('场景晚于预案就绪:回放日志里的 showRoute 补画(两种各一条)', () => {
    const r = makeRuntime();
    r.getObjectWorldPosition.mockImplementation((id: string) =>
      id === 'd1' ? { x: 0, y: 0, z: 0 } : { x: 9, y: 0, z: 0 });
    addSceneAction({
      action: 'showRoute', target: '进攻路线', source: '预案引擎',
      params: { kind: 'attack', steps: ['首层东门', '西门'] },
    });
    addSceneAction({
      action: 'showRoute', target: '疏散路线', source: '预案引擎',
      params: { kind: 'evacuate', steps: ['首层东门', '西门'] },
    });
    const unsub = subscribeSceneActions(r, undefined, makeTree());
    expect(r.drawVirtualRoute).toHaveBeenCalledTimes(2);
    expect(r.clearVirtualRoute).toHaveBeenCalledWith('plan-route-attack');
    expect(r.clearVirtualRoute).toHaveBeenCalledWith('plan-route-evacuate');
    unsub();
  });

  it('hideRoute 晚于 showRoute:不回放已被清除的路线', () => {
    const r = makeRuntime();
    addSceneAction({
      action: 'showRoute', target: '进攻路线', source: '预案引擎',
      params: { kind: 'attack', steps: ['首层东门', '西门'] },
    });
    addSceneAction({ action: 'hideRoute', target: '清除', source: '预案引擎' });
    const unsub = subscribeSceneActions(r, undefined, makeTree());
    expect(r.drawVirtualRoute).not.toHaveBeenCalled();
    unsub();
  });
});
