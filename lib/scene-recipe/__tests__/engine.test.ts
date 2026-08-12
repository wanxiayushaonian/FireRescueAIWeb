import { describe, it, expect } from 'vitest';
import { applyRecipe } from '../engine';
import type { Changeset, RecipeRuntime } from '../types';
import type { SceneTreeNode } from '../../ustudio';

function mockRuntime(): RecipeRuntime & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setViewMode: async () => { calls.push('setViewMode'); },
    setGisVisible: async () => { calls.push('setGisVisible'); },
    showLabels: () => { calls.push('showLabels'); },
    hideLabels: () => { calls.push('hideLabels'); },
    setScene: async () => { calls.push('setScene'); },
    flyToObject: async () => { calls.push('flyToObject'); },
    highlightObject: () => { calls.push('highlightObject'); return true; },
    setCameraViewpoint: async () => { calls.push('setCameraViewpoint'); },
    setVirtualRouteVisible: () => { calls.push('setVirtualRouteVisible'); },
    setVirtualPolygonVisible: () => { calls.push('setVirtualPolygonVisible'); },
  };
}

const tree = {} as unknown as SceneTreeNode;

describe('applyRecipe', () => {
  it('两层都不 touched → 零调用', async () => {
    const rt = mockRuntime();
    const cs: Changeset = { structural: { __touched: false }, observational: { __touched: false } };
    const r = await applyRecipe(rt, tree, cs);
    expect(rt.calls).toEqual([]);
    expect(r.applied).toEqual([]);
  });

  it('结构层先于观察层(setViewMode 在 flyToObject 之前)', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, visibleStories: ['1F'], mode: '3D', yExtend: false },
      observational: { __touched: true, focus: { objectId: 'X' } },
    };
    await applyRecipe(rt, tree, cs);
    const vm = rt.calls.indexOf('setViewMode');
    const fly = rt.calls.indexOf('flyToObject');
    expect(vm).toBeGreaterThanOrEqual(0);
    expect(fly).toBeGreaterThan(vm);
  });

  it('focus 优先于 viewpoint(有 focus 不调 setCameraViewpoint)', async () => {
    const rt = mockRuntime();
    const cs = {
      structural: { __touched: false },
      observational: { __touched: true, focus: { objectId: 'X' }, viewpoint: { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 } },
    } as unknown as Changeset;
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).toContain('flyToObject');
    expect(rt.calls).not.toContain('setCameraViewpoint');
  });

  it('best-effort:一调用失败不阻断其余,记入 failed', async () => {
    const rt = mockRuntime();
    rt.setGisVisible = async () => { throw new Error('boom'); };
    const cs: Changeset = {
      structural: { __touched: true, gisVisible: false },
      observational: { __touched: true, focus: { objectId: 'X' } },
    };
    const r = await applyRecipe(rt, tree, cs);
    expect(r.failed.some((f) => f.field === 'gisVisible')).toBe(true);
    expect(r.applied).toContain('focus');
  });

  it('仅 gisVisible 变(不动楼层/mode)→ 不调 setViewMode', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, gisVisible: false },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).not.toContain('setViewMode');
    expect(rt.calls).toContain('setGisVisible');
  });

  it('visibleStories=null(恢复全集)或 mode 变 → 调 setViewMode(storyIds 用全集)', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, visibleStories: null, mode: '2D' },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).toContain('setViewMode');
  });
});
