import { describe, it, expect, vi, afterEach } from 'vitest';
import { registerDefaultTools } from '../handlers';
import { dispatch, __resetForTest } from '../registry';
import type { SceneSdkLike } from '../types';

describe('fly_to handler', () => {
  it('调用 sdk.fly(target)', async () => {
    __resetForTest();
    const fly = vi.fn().mockResolvedValue(undefined);
    const sdk = { fly } as unknown as SceneSdkLike;
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'fly_to', args: { target: 'd1' }, ts: 0 }, sdk);
    expect(fly).toHaveBeenCalledWith('d1');
  });
});

describe('focus_objects handler', () => {
  it('空 ids(无先前高亮)→ 不调 cancelHeighLight', async () => {
    __resetForTest();
    const cancelHeighLight = vi.fn();
    const sdk = { fly: vi.fn(), heighLight: vi.fn(), cancelHeighLight } as unknown as SceneSdkLike;
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'focus_objects', args: { ids: [] }, ts: 0 }, sdk);
    expect(cancelHeighLight).not.toHaveBeenCalled();
    expect(sdk.heighLight).not.toHaveBeenCalled();
  });

  it('多 ids → 高亮全部 + 飞向第一个', async () => {
    __resetForTest();
    const fly = vi.fn();
    const heighLight = vi.fn();
    const cancelHeighLight = vi.fn();
    const sdk = { fly, heighLight, cancelHeighLight } as unknown as SceneSdkLike;
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'focus_objects', args: { ids: ['a', 'b'] }, ts: 0 }, sdk);
    expect(heighLight).toHaveBeenCalledWith('a', expect.anything());
    expect(heighLight).toHaveBeenCalledWith('b', expect.anything());
    expect(fly).toHaveBeenCalledWith('a');
    expect(cancelHeighLight).not.toHaveBeenCalled();
  });

  it('先 focus 再 focus 空 → 逐个取消先前高亮(调用即替换)', async () => {
    __resetForTest();
    const cancelHeighLight = vi.fn();
    const sdk = { fly: vi.fn(), heighLight: vi.fn(), cancelHeighLight } as unknown as SceneSdkLike;
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'focus_objects', args: { ids: ['a', 'b'] }, ts: 0 }, sdk);
    await dispatch({ id: '2', tool: 'focus_objects', args: { ids: [] }, ts: 0 }, sdk);
    expect(cancelHeighLight).toHaveBeenCalledWith('a');
    expect(cancelHeighLight).toHaveBeenCalledWith('b');
  });
});

describe('focus_floors handler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('有 store → 走 RecipeStore.patchStructural(单层 full+显设备,与 floor-focus 一致)', async () => {
    __resetForTest();
    const patchStructural = vi.fn();
    const store = { patchStructural } as unknown as Parameters<typeof registerDefaultTools>[2];
    const sdk = {} as unknown as SceneSdkLike;
    registerDefaultTools(sdk, undefined, store);
    await dispatch({ id: '1', tool: 'focus_floors', args: { story_ids: ['s1'] }, ts: 0 }, sdk);
    expect(patchStructural).toHaveBeenCalledWith({
      visibleStories: ['s1'], detailLevel: 'full', hideDevices: false,
    });
  });

  it('有 store → 多层/恢复全楼层 detailLevel 恒 full(避免 hideWindowAndDoor 孤儿隐藏藏掉周边底模)', async () => {
    __resetForTest();
    const patchStructural = vi.fn();
    const store = { patchStructural } as unknown as Parameters<typeof registerDefaultTools>[2];
    const sdk = {} as unknown as SceneSdkLike;
    registerDefaultTools(sdk, undefined, store);
    await dispatch({ id: '2', tool: 'focus_floors', args: { story_ids: ['s1', 's2'] }, ts: 0 }, sdk);
    expect(patchStructural).toHaveBeenLastCalledWith({
      visibleStories: ['s1', 's2'], detailLevel: 'full', hideDevices: true,
    });
    await dispatch({ id: '3', tool: 'focus_floors', args: { story_ids: [] }, ts: 0 }, sdk);
    expect(patchStructural).toHaveBeenLastCalledWith({
      visibleStories: null, detailLevel: 'full', hideDevices: true,
    });
  });

  it('非空 story_ids → 拉 tree + setViewMode 传 storyIds', async () => {
    __resetForTest();
    const setViewMode = vi.fn().mockResolvedValue(undefined);
    const sdk = { fly: vi.fn(), heighLight: vi.fn(), cancelHeighLight: vi.fn(), setViewMode } as unknown as SceneSdkLike;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ type: 'Building', id: 'b', name: '楼', children: [{ type: 'Story', id: 's1', name: '一层' }] }),
        { headers: { 'content-type': 'application/json' } },
      ),
    ));
    vi.stubGlobal('window', { __sceneId: 'scene1' });
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'focus_floors', args: { story_ids: ['s1'] }, ts: 0 }, sdk);
    expect(setViewMode).toHaveBeenCalled();
    expect(setViewMode.mock.calls[0][2]).toEqual(['s1']);
  });

  it('空 story_ids → setViewMode 传空数组(恢复全楼层)', async () => {
    __resetForTest();
    const setViewMode = vi.fn().mockResolvedValue(undefined);
    const sdk = { fly: vi.fn(), heighLight: vi.fn(), cancelHeighLight: vi.fn(), setViewMode } as unknown as SceneSdkLike;
    vi.stubGlobal('window', { __sceneId: 'scene1' });
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'focus_floors', args: { story_ids: [] }, ts: 0 }, sdk);
    expect(setViewMode).toHaveBeenCalled();
    expect(setViewMode.mock.calls[0][2]).toEqual([]);
  });

  it('场景未就绪(无 window.__sceneId)→ 跳过,不调 setViewMode', async () => {
    __resetForTest();
    const setViewMode = vi.fn().mockResolvedValue(undefined);
    const sdk = { fly: vi.fn(), setViewMode } as unknown as SceneSdkLike;
    vi.stubGlobal('window', {});
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'focus_floors', args: { story_ids: ['s1'] }, ts: 0 }, sdk);
    expect(setViewMode).not.toHaveBeenCalled();
  });
});

describe('show_route handler', () => {
  it('注入 addSceneAction → 写场景总线(showRoute + 智能体 source)', async () => {
    __resetForTest();
    const addSceneAction = vi.fn();
    const sdk = {} as unknown as SceneSdkLike;
    registerDefaultTools(sdk, { addSceneAction });
    await dispatch({ id: '1', tool: 'show_route', args: { routes: [{ stationName: '站A' }] }, ts: 0 }, sdk);
    expect(addSceneAction).toHaveBeenCalledTimes(1);
    expect(addSceneAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'showRoute', source: '智能体' }),
    );
  });

  it('未注入 addSceneAction → 降级 warn,不写总线', async () => {
    __resetForTest();
    const addSceneAction = vi.fn();
    const sdk = {} as unknown as SceneSdkLike;
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'show_route', args: { routes: [{ stationName: 'A' }] }, ts: 0 }, sdk);
    expect(addSceneAction).not.toHaveBeenCalled();
  });

  it('空 routes → warn,不写总线', async () => {
    __resetForTest();
    const addSceneAction = vi.fn();
    const sdk = {} as unknown as SceneSdkLike;
    registerDefaultTools(sdk, { addSceneAction });
    await dispatch({ id: '1', tool: 'show_route', args: { routes: [] }, ts: 0 }, sdk);
    expect(addSceneAction).not.toHaveBeenCalled();
  });
});

describe('gis_fly_to handler', () => {
  it('注入 addSceneAction → 写场景总线(flyTo + 坐标 + zoom/layer + 智能体 source)', async () => {
    __resetForTest();
    const addSceneAction = vi.fn();
    const sdk = {} as unknown as SceneSdkLike;
    registerDefaultTools(sdk, { addSceneAction });
    await dispatch({ id: '1', tool: 'gis_fly_to', args: { lat: 29.6612, lng: 115.9475, zoom: 16, layer: 'water', label: '市政消火栓A' }, ts: 0 }, sdk);
    expect(addSceneAction).toHaveBeenCalledTimes(1);
    expect(addSceneAction).toHaveBeenCalledWith({
      action: 'flyTo',
      target: '市政消火栓A',
      params: { lng: 115.9475, lat: 29.6612, zoom: 16, layer: 'water' },
      source: '智能体',
    });
  });

  it('无 label → target 用坐标兜底;无 zoom → params 不含 zoom', async () => {
    __resetForTest();
    const addSceneAction = vi.fn();
    const sdk = {} as unknown as SceneSdkLike;
    registerDefaultTools(sdk, { addSceneAction });
    await dispatch({ id: '1', tool: 'gis_fly_to', args: { lat: 29.6612, lng: 115.9475 }, ts: 0 }, sdk);
    expect(addSceneAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'flyTo',
        params: { lng: 115.9475, lat: 29.6612 },
      }),
    );
    expect(addSceneAction.mock.calls[0][0].target).toContain('115.94750');
  });

  it('缺坐标/非法坐标 → warn,不写总线', async () => {
    __resetForTest();
    const addSceneAction = vi.fn();
    const sdk = {} as unknown as SceneSdkLike;
    registerDefaultTools(sdk, { addSceneAction });
    await dispatch({ id: '1', tool: 'gis_fly_to', args: {}, ts: 0 }, sdk);
    await dispatch({ id: '2', tool: 'gis_fly_to', args: { lat: 'x', lng: 115.9475 }, ts: 0 }, sdk);
    expect(addSceneAction).not.toHaveBeenCalled();
  });

  it('未注入 addSceneAction → 降级 warn,不写总线', async () => {
    __resetForTest();
    const addSceneAction = vi.fn();
    const sdk = {} as unknown as SceneSdkLike;
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'gis_fly_to', args: { lat: 29.6612, lng: 115.9475 }, ts: 0 }, sdk);
    expect(addSceneAction).not.toHaveBeenCalled();
  });
});
