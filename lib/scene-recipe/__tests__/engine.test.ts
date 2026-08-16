import { describe, it, expect } from 'vitest';
import { applyRecipe } from '../engine';
import type { Changeset, RecipeRuntime, StructuralRecipe } from '../types';
import type { SceneTreeNode } from '../../ustudio';

function mockRuntime(): RecipeRuntime & { calls: string[]; viewModeParams: unknown[]; hideObjectsIds: string[] | null; sceneParams: unknown[] } {
  const calls: string[] = [];
  const viewModeParams: unknown[] = [];
  const sceneParams: unknown[] = [];
  const rt = {
    calls,
    viewModeParams,
    sceneParams,
    hideObjectsIds: null as string[] | null,
    setViewMode: async (params: unknown) => { calls.push('setViewMode'); viewModeParams.push(params); },
    setGisVisible: async () => { calls.push('setGisVisible'); },
    showLabels: () => { calls.push('showLabels'); },
    hideLabels: () => { calls.push('hideLabels'); },
    setScene: async (params: unknown) => { calls.push('setScene'); sceneParams.push(params); },
    flyToObject: async () => { calls.push('flyToObject'); },
    highlightObject: () => { calls.push('highlightObject'); return true; },
    setCameraViewpoint: async () => { calls.push('setCameraViewpoint'); },
    setVirtualRouteVisible: () => { calls.push('setVirtualRouteVisible'); },
    setVirtualPolygonVisible: () => { calls.push('setVirtualPolygonVisible'); },
    hideObjects: (ids: string[]) => { calls.push('hideObjects'); rt.hideObjectsIds = ids; },
    showObjects: () => { calls.push('showObjects'); },
  };
  return rt;
}

const tree = {} as unknown as SceneTreeNode;

function fullStructural(over: Partial<StructuralRecipe> = {}): StructuralRecipe {
  return {
    visibleStories: null,
    visibleBuildings: null,
    mode: '3D',
    yExtend: false,
    detailLevel: 'full',
    gisVisible: true,
    labels: { visible: false },
    ...over,
  };
}

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

  it('detailLevel:structure + 3D → setViewMode 主 params 只藏门窗(不藏 Wall 主体结构)', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, mode: '3D', detailLevel: 'structure' },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).toContain('setViewMode');
    const main = (rt.viewModeParams[0] as Array<{ hideWalls?: boolean; hideWindowAndDoor?: boolean }>)[0];
    expect(main.hideWindowAndDoor).toBe(true);
    expect(main.hideWalls).toBeUndefined(); // Wall 是主体结构,不藏
  });

  it('detailLevel:full(默认)→ 不附加 hideWalls', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, mode: '3D', visibleStories: ['1F'] },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    const main = (rt.viewModeParams[0] as Array<{ hideWalls?: boolean }>)[0];
    expect(main.hideWalls).toBeUndefined();
  });

  it('detailLevel:structure + 2D → 不附加 hideWalls(2D 下 SDK 自动等价隐藏)', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, mode: '2D', detailLevel: 'structure' },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    const main = (rt.viewModeParams[0] as Array<{ hideWalls?: boolean }>)[0];
    expect(main.hideWalls).toBeUndefined();
  });

  it('hideDevices:true → setViewMode 完成后调 hideObjects(时序:必须在其后重放,resetAll 才不会抹掉)', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, mode: '3D', hideDevices: true },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).toContain('setViewMode');
    expect(rt.calls).toContain('hideObjects');
    // hide 必须在 setViewMode 之后(时序关键)
    expect(rt.calls.indexOf('hideObjects')).toBeGreaterThan(rt.calls.indexOf('setViewMode'));
    expect(rt.hideObjectsIds).toEqual([]); // 测试 tree 为空,真实 tree 会收到设备 outId
  });

  it('hideDevices 未设(undefined)→ 不调 hideObjects/showObjects(向后兼容)', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, mode: '3D', visibleStories: ['1F'] },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).not.toContain('hideObjects');
    expect(rt.calls).not.toContain('showObjects');
  });

  it('hideDevices=false + 楼层变更 → setViewMode 后重放所选楼层设备(单层内换层设备可见)', async () => {
    const rt = mockRuntime();
    // 场景:单层模式从 3F 切 5F —— hideDevices 不变(false),仅 visibleStories 变
    const cs: Changeset = {
      structural: { __touched: true, visibleStories: ['st-5f'] },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs, fullStructural({ visibleStories: ['st-5f'], hideDevices: false }));
    expect(rt.calls).toContain('setViewMode');
    expect(rt.calls).toContain('showObjects');
    // 时序:重放必须在 setViewMode(resetAll)之后
    expect(rt.calls.indexOf('showObjects')).toBeGreaterThan(rt.calls.indexOf('setViewMode'));
  });

  it('hideDevices 不在 changeset 但完整态 next.hideDevices=true → setViewMode 后仍重放 hideDevices(修复状态脱节)', async () => {
    const rt = mockRuntime();
    // 只改 mode:hideDevices 未进 changeset(旧 bug 会漏重放,设备被 resetAll 恢复却不藏回)
    const cs: Changeset = {
      structural: { __touched: true, mode: '2D' },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs, fullStructural({ mode: '2D', hideDevices: true }));
    expect(rt.calls).toContain('setViewMode');
    expect(rt.calls).toContain('hideObjects');
    // 时序:重放必须在 setViewMode(resetAll)之后
    expect(rt.calls.indexOf('hideObjects')).toBeGreaterThan(rt.calls.indexOf('setViewMode'));
  });

  it('setViewMode 入参用完整态 mode(不因 changeset 缺 mode 而 fallback 到 3D)', async () => {
    const rt = mockRuntime();
    // 只改 hideDevices:changeset 无 mode,但完整态 mode=2D,setViewMode 应保持 2D 而非回 3D
    const cs: Changeset = {
      structural: { __touched: true, hideDevices: true },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs, fullStructural({ mode: '2D', hideDevices: true }));
    const main = (rt.viewModeParams[0] as Array<{ type: string }>)[0];
    expect(main.type).toBe('2D');
  });

  it('reachable 开(缺省 enabled)→ setScene({reachable:true, nodeId})', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, reachable: { nodeId: 'N1' } },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).toContain('setScene');
    expect(rt.sceneParams[0]).toEqual({ reachable: true, nodeId: 'N1' });
  });

  it('reachable enabled:false → setScene({reachable:false})(可关闭)', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, reachable: { nodeId: 'N1', enabled: false } },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.calls).toContain('setScene');
    expect(rt.sceneParams[0]).toEqual({ reachable: false });
  });

  it('reachable 与 connectivity 同变更 → 都调用(不吞分支)', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: {
        __touched: true,
        reachable: { nodeId: 'N1' },
        connectivity: { spaceId: 'S1', enabled: false },
      },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.sceneParams).toEqual([
      { reachable: true, nodeId: 'N1' },
      { connectivity: false },
    ]);
  });

  it('connectivity 开(带 spaceId)→ setScene({connectivity:true, spaceId})', async () => {
    const rt = mockRuntime();
    const cs: Changeset = {
      structural: { __touched: true, connectivity: { spaceId: 'S2' } },
      observational: { __touched: false },
    };
    await applyRecipe(rt, tree, cs);
    expect(rt.sceneParams[0]).toEqual({ connectivity: true, spaceId: 'S2' });
  });
});
