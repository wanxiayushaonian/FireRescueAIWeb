import { describe, expect, it } from 'vitest';
import {
  planAttackRoute,
  extractPathPoints,
  navigateBetween,
  navigateFromOutside,
  clearSceneRoutes,
  getCustomNavStart,
  setCustomNavStart,
  type NavPoint,
} from '../scene-navigation';
import type { SceneTreeNode } from '../ustudio';
import type { SoonspaceRuntime } from '../soonspace-runtime';

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
        node('space-3', '房间', 'Space', [
          node('dev-3', '室内消火栓3F', 'IndoorFireHydrant'),
        ]),
      ]),
    ]),
    node('oh-out', '室外消火栓', 'OutdoorFireHydrant'),
  ]);
}

describe('planAttackRoute', () => {
  it('地上目标:大门候选=最低地上层全部门(周边门绘制时选);途经楼层含两端且升序;图节点 twins id 收集', () => {
    const plan = planAttackRoute(fakeTree(), 'dev-3');
    expect(plan).not.toBeNull();
    expect(plan!.targetFloor).toBe(3);
    expect(plan!.targetName).toBe('室内消火栓3F');
    expect(plan!.gateFloor).toBe(1);
    expect(plan!.gateOutIds).toEqual(['door-1-a', 'door-1-b']);
    expect(plan!.stairCandidates.map((s) => s.floor)).toEqual([1, 2, 3]);
    expect(plan!.stairCandidates[0]?.outIds).toEqual(['stair-1-a', 'stair-1-b']);
    // kgraph 图节点:大门层/目标层 Story 与目标最近 Space 祖先的 twins id
    expect(plan!.gateStoryNodeId).toBe('tw-st-1');
    expect(plan!.targetStoryNodeId).toBe('tw-st-3');
    expect(plan!.targetSpaceNodeId).toBe('tw-space-3');
  });

  it('地下目标:途经楼层降序(1F→B1F);目标楼层为负', () => {
    const plan = planAttackRoute(fakeTree(), 'dev-b1');
    expect(plan!.targetFloor).toBe(-1);
    expect(plan!.stairCandidates.map((s) => s.floor)).toEqual([1, -1]);
  });

  it('大门层目标(无爬升)与无楼层归属目标(室外):无楼梯段,大门候选仍可用', () => {
    const same = planAttackRoute(fakeTree(), 'stair-1-a');
    expect(same!.targetFloor).toBe(1);
    expect(same!.stairCandidates).toEqual([]);
    const outdoor = planAttackRoute(fakeTree(), 'oh-out');
    expect(outdoor!.targetFloor).toBeNull();
    expect(outdoor!.stairCandidates).toEqual([]);
    expect(outdoor!.gateOutIds).toEqual(['door-1-a', 'door-1-b']);
  });

  it('目标不在树中 → null;空入参安全', () => {
    expect(planAttackRoute(fakeTree(), 'nope')).toBeNull();
    expect(planAttackRoute(null, 'dev-3')).toBeNull();
    expect(planAttackRoute(fakeTree(), '')).toBeNull();
  });
});

describe('extractPathPoints(kgraph 返回容错解析)', () => {
  it('多形态点位:{x,y,z} / {position:{}} / "x&y&z" 串 / {coordinate:"x&y&z"}', () => {
    expect(extractPathPoints([{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 }])).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
    ]);
    expect(extractPathPoints([{ position: { x: 1, y: 2, z: 3 } }, { position: { x: 2, y: 3, z: 4 } }])).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 2, y: 3, z: 4 },
    ]);
    expect(extractPathPoints(['1&2&3', '4&5&6'])).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
    ]);
    expect(extractPathPoints([{ coordinate: '1&2&3' }, { coordinate: '2&3&4' }])).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 2, y: 3, z: 4 },
    ]);
  });

  it('混入无效元素跳过;少于 2 个有效点/非数组 → null', () => {
    expect(extractPathPoints([{ x: 1, y: 2, z: 3 }, null, 'x&y', { x: 4, y: 5, z: 6 }])).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
    ]);
    expect(extractPathPoints([{ x: 1, y: 2, z: 3 }])).toBeNull();
    expect(extractPathPoints('not-array')).toBeNull();
    expect(extractPathPoints(null)).toBeNull();
  });

  it('扁平数字数组([x,y,z,…])按三元组解析——平台场景路线 detail.path 实测形态', () => {
    expect(extractPathPoints([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
      { x: 7, y: 8, z: 9 },
    ]);
    expect(extractPathPoints([1, 2, 3])).toBeNull(); // 单点不算路径
    expect(extractPathPoints([1, 2])).toBeNull();
  });

  it('扁平数字字符串数组按三元组解析——线上路线 detail.path 形态', () => {
    expect(extractPathPoints(['30.48', '16.513107', '-63.63', '29.1', '15.2', '-62.4'])).toEqual([
      { x: 30.48, y: 16.513107, z: -63.63 },
      { x: 29.1, y: 15.2, z: -62.4 },
    ]);
  });

  it('kgraph path_nodes 形态:{coordinate:{x,y,z}} 对象与 "x&y&z" 串', () => {
    expect(extractPathPoints([{ coordinate: { x: 1, y: 2, z: 3 }, node_name: 'a' }, { coordinate: '4&5&6' }])).toEqual([
      { x: 1, y: 2, z: 3 },
      { x: 4, y: 5, z: 6 },
    ]);
  });
});

// ─── 两点导航(3D 打点连通)合规化:走 SDK navigateWithinScene + path_id 精确清理 ───
interface FakeCall {
  op: string;
  args?: unknown;
}

function makeRuntime(overrides?: {
  navigateResult?: unknown;
  /** 按调用次序出队(先于 navigateResult;耗尽回落 navigateResult/默认)——回退重试用 */
  navigateResults?: unknown[];
  externalResult?: unknown;
  position?: { x: number; y: number; z: number } | null;
}) {
  const calls: FakeCall[] = [];
  const runtime = {
    getSceneId: () => 'scene-1',
    getObjectWorldPosition: (id: string) =>
      overrides?.position === null ? null : overrides?.position ?? { x: 1, y: 2, z: 3 },
    navigateWithinScene: async (p: unknown) => {
      calls.push({ op: 'navigateWithinScene', args: p });
      if (overrides?.navigateResults?.length) return overrides.navigateResults.shift();
      return overrides?.navigateResult ?? { reachable: true, path_id: 'path-9', message: 'ok', total_distance: 42 };
    },
    navigateFromExternal: async (p: unknown) => {
      calls.push({ op: 'navigateFromExternal', args: p });
      return overrides?.externalResult ?? { reachable: true, path_id: 'path-ext-7', message: 'ok', total_distance: 1285.3 };
    },
    drawVirtualRoute: async (detail: unknown) => {
      calls.push({ op: 'drawVirtualRoute', args: detail });
      return {};
    },
    clearVirtualRoute: (id: string) => calls.push({ op: 'clearVirtualRoute', args: id }),
    deleteNavigationRoute: (id: string) => calls.push({ op: 'deleteNavigationRoute', args: id }),
  };
  return { runtime: runtime as unknown as SoonspaceRuntime, calls };
}

describe('navigateBetween / clearSceneRoutes(SDK 导航通道)', () => {

  const start: NavPoint = { name: '起点', nodeId: 'tw-space-a', outId: 'out-a' };
  const end: NavPoint = { name: '终点', nodeId: 'tw-space-b', outId: 'out-b' };

  it('走 SDK navigateWithinScene(source/target node_id),不再直请求导航接口;POI 用 drawVirtualRoute 叠加', async () => {
    const { runtime, calls } = makeRuntime();
    const r = await navigateBetween(runtime, start, end);

    expect(r).toEqual({ real: true, mode: 'full', distanceM: 42 });
    expect(calls.some((c) => c.op === 'navigateWithinScene')).toBe(true);
    expect(calls.find((c) => c.op === 'navigateWithinScene')?.args).toEqual({
      source: { node_id: 'tw-space-a' },
      target: { node_id: 'tw-space-b' },
    }); // scene_id 由 runtime 包装层注入(fake 直接替换方法故不含)
    // POI 叠加:drawVirtualRoute 只传起终点坐标(path 空数组,不重复画线)
    const poiCall = calls.find((c) => c.op === 'drawVirtualRoute')?.args as Record<string, unknown>;
    expect(poiCall).toBeDefined();
    expect(poiCall.path).toEqual([]);
    expect(poiCall.route_id).toBe('nav-attack');
    expect(poiCall.start_coordinate).toEqual({ x: 1, y: 2, z: 3 });
    expect(poiCall.end_coordinate).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('打点不带 outId(如 2D 通道)时跳过 POI 叠加,导航线照常', async () => {
    const { runtime, calls } = makeRuntime();
    const r = await navigateBetween(runtime, { name: 'A', nodeId: 'n-a' }, { name: 'B', nodeId: 'n-b' });
    expect(r?.real).toBe(true);
    expect(calls.some((c) => c.op === 'drawVirtualRoute')).toBe(false);
    expect(calls.some((c) => c.op === 'navigateWithinScene')).toBe(true);
  });

  it('打点带世界坐标时仍优先 node_id，避免对象包围盒中心落到图外', async () => {
    const { runtime, calls } = makeRuntime();
    const r = await navigateBetween(
      runtime,
      { name: 'A', nodeId: 'tw-space-a', outId: 'out-a', position: { x: 10, y: 0.5, z: 20 } },
      { name: 'B', nodeId: 'tw-space-b', outId: 'out-b', position: { x: 30, y: 1.2, z: 40 } },
    );
    expect(r?.real).toBe(true);
    expect(calls.find((c) => c.op === 'navigateWithinScene')?.args).toEqual({
      source: { node_id: 'tw-space-a' },
      target: { node_id: 'tw-space-b' },
    });
    // POI 依旧在点击对象位置
    const poiCall = calls.find((c) => c.op === 'drawVirtualRoute')?.args as Record<string, unknown>;
    expect(poiCall?.start_coordinate).toEqual({ x: 1, y: 2, z: 3 }); // fake getObjectWorldPosition 返回
    expect(poiCall?.end_coordinate).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('打点 position 为 null(对象定位失败) → 回退 node_id', async () => {
    const { runtime, calls } = makeRuntime({ position: null });
    const r = await navigateBetween(
      runtime,
      { name: 'A', nodeId: 'tw-space-a', outId: 'out-a', position: null },
      { name: 'B', nodeId: 'tw-space-b', outId: 'out-b', position: null },
    );
    expect(r?.real).toBe(true);
    expect(calls.find((c) => c.op === 'navigateWithinScene')?.args).toEqual({
      source: { node_id: 'tw-space-a' },
      target: { node_id: 'tw-space-b' },
    });
  });

  it('SDK 不可达 → navigateBetween 返回错误信息(不画任何东西)', async () => {
    const { runtime, calls } = makeRuntime({
      navigateResult: { reachable: false, path_id: null, message: '不可达' },
    });
    const r = await navigateBetween(runtime, start, end);
    expect(r.error).toContain('不可达');
    expect(calls.some((c) => c.op === 'drawVirtualRoute')).toBe(false);
  });

  it('图节点不可达 → 自动回退点击坐标重试', async () => {
    const { runtime, calls } = makeRuntime({
      navigateResults: [
        { reachable: false, path_id: null, message: '图节点不可达' },
        { reachable: true, path_id: 'path-10', message: 'ok', total_distance: 88 },
      ],
    });
    const r = await navigateBetween(
      runtime,
      { name: 'A', nodeId: 'tw-space-a', position: { x: 9, y: 1, z: 9 } },
      { name: 'B', nodeId: 'tw-space-b', position: { x: 5, y: 1, z: 5 } },
    );
    expect(r).toEqual({ real: true, mode: 'full', distanceM: 88 });
    const navCalls = calls.filter((c) => c.op === 'navigateWithinScene');
    expect(navCalls).toHaveLength(2); // 第一次图节点,第二次回退点击坐标
    expect(navCalls[0]?.args).toEqual({ source: { node_id: 'tw-space-a' }, target: { node_id: 'tw-space-b' } });
    expect(navCalls[1]?.args).toEqual({ source: { x: 9, y: 1, z: 9 }, target: { x: 5, y: 1, z: 5 } });
  });

  it('双次均不可达 → 错误信息透传 SDK message(不再只有写死的覆盖范围文案)', async () => {
    const { runtime, calls } = makeRuntime({
      navigateResult: { reachable: false, path_id: null, message: '目标楼层未建图' },
    });
    const r = await navigateBetween(runtime, start, end);
    expect(r.error).toContain('两点间不可达');
    expect(r.error).toContain('目标楼层未建图');
    expect(calls.filter((c) => c.op === 'navigateWithinScene')).toHaveLength(2);
  });

  it('customNavStart 自定义起点:设置/读取/取消(独立于两点导航拾取的 navStart)', () => {
    expect(getCustomNavStart()).toBeNull();
    const pt: NavPoint = { name: '大堂消火栓', nodeId: 'tw-space-x', outId: 'out-x' };
    setCustomNavStart(pt);
    expect(getCustomNavStart()).toEqual(pt);
    setCustomNavStart(null);
    expect(getCustomNavStart()).toBeNull();
  });

  it('clearSceneRoutes 按 path_id 精确清理 SDK 导航线(非无参 delete 全部)', async () => {
    const { runtime, calls } = makeRuntime();
    await navigateBetween(runtime, start, end); // 登记 path-9 + POI 虚拟路线
    calls.length = 0;
    clearSceneRoutes(runtime);
    expect(calls).toContainEqual({ op: 'deleteNavigationRoute', args: 'path-9' });
    expect(calls).toContainEqual({ op: 'clearVirtualRoute', args: 'nav-attack' });
    // 绝不调用无参删除(会误伤平台 agent 的导航线)
    expect(calls.some((c) => c.op === 'deleteNavigationRoute' && c.args === undefined)).toBe(false);
  });
});

// ─── 场外到场内导航:navigateFromOutside(SDK navigateFromExternal + path_id 统一注册) ───
describe('navigateFromOutside(场外进场)', () => {
  const src = { lon: 116.39, lat: 39.91, name: '广场21D' };

  it('走 SDK navigateFromExternal(source WGS84 + target node_id),返回 mode=external 与距离', async () => {
    const { runtime, calls } = makeRuntime();
    const r = await navigateFromOutside(runtime, src, { nodeId: 'tw-space-b' }, '场外进场 → 设备');

    expect(r).toEqual({ real: true, mode: 'external', distanceM: 1285.3 });
    expect(calls.find((c) => c.op === 'navigateFromExternal')?.args).toEqual({
      source: { lon: 116.39, lat: 39.91 },
      target: { node_id: 'tw-space-b' },
    }); // scene_id 由 runtime 包装层注入
    expect(calls.some((c) => c.op === 'navigateWithinScene')).toBe(false);
  });

  it('场外不可达 → 返回错误信息(不画线)', async () => {
    const { runtime, calls } = makeRuntime({
      externalResult: { reachable: false, path_id: null, message: '不可达' },
    });
    const r = await navigateFromOutside(runtime, src, { nodeId: 'tw-space-b' }, 'x');
    expect(r.error).toContain('不可达');
    expect(calls.some((c) => c.op === 'drawVirtualRoute')).toBe(false);
  });

  it('path_id 进统一注册表,clearSceneRoutes 一并精确清理(与室内导航互不误伤)', async () => {
    const { runtime, calls } = makeRuntime();
    await navigateFromOutside(runtime, src, { nodeId: 'tw-space-b' }, 'x'); // 登记 path-ext-7
    calls.length = 0;
    clearSceneRoutes(runtime);
    expect(calls).toContainEqual({ op: 'deleteNavigationRoute', args: 'path-ext-7' });
    expect(calls.some((c) => c.op === 'deleteNavigationRoute' && c.args === undefined)).toBe(false);
  });
});
