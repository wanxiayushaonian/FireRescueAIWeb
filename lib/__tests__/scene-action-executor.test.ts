import { describe, it, expect, vi, afterEach } from 'vitest';
import { mapSceneAction } from '@/lib/scene-action-executor';
import { setGlobalRecipeStore } from '@/lib/scene-recipe/global-store';
import type { RecipeStore } from '@/lib/scene-recipe/store';
import type { SceneAction } from '@/mock/sceneLog';

function makeRuntime() {
  return {
    flyToObject: vi.fn(),
    highlightObject: vi.fn(),
    clearObjectHighlight: vi.fn(),
    resetCamera: vi.fn(),
  };
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

  it('showRoute/drawZone/addMarker/updatePlan → 忽略(留架构第4步)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'showRoute', target: 'r1', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/忽略|未实现/);
  });

  it('空 target → 不执行', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '', source: '面板' };
    expect(mapSceneAction(a, r).executed).toBe(false);
  });
});
