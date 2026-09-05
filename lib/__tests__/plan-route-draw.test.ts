import { describe, expect, it } from 'vitest';
import type { SceneTreeNode } from '../ustudio';
import {
  clearPlanRoutes,
  drawPlanRoute,
  resolvePlanRouteAnchors,
  splitRouteSteps,
  PLAN_ROUTE_COLORS,
  PLAN_ROUTE_IDS,
  type PlanRouteDrawRuntime,
  type XYZ,
} from '../plan-route-draw';

function node(partial: Partial<SceneTreeNode> & { id: string; name: string; type: string }): SceneTreeNode {
  return {
    children: [],
    twins_instance_id: `tw-${partial.id}`,
    twins_instance_name: partial.name,
    twins_identifier: partial.type,
    out_instance_id: partial.id,
    ...partial,
  } as SceneTreeNode;
}

/** 三层演示树:1F(大堂/防烟楼梯间A/东门) / 13F(消防电梯) / 25F(避难层/防烟楼梯间A/消防电梯)。 */
function testTree(): SceneTreeNode {
  return node({
    id: 'out-bld', name: '测试楼', type: 'Building',
    children: [
      node({
        id: 'out-1f', name: '1F', type: 'Story',
        children: [
          node({ id: 'out-lobby', name: '大堂', type: 'Space' }),
          node({ id: 'out-stair-1', name: '防烟楼梯间A', type: 'Stairs' }),
          node({ id: 'out-door-1', name: '东门', type: 'Door' }),
        ],
      }),
      node({
        id: 'out-13f', name: '13F', type: 'Story',
        children: [node({ id: 'out-lift-13', name: '消防电梯', type: 'FireLift' })],
      }),
      node({
        id: 'out-25f', name: '25F', type: 'Story',
        children: [
          node({ id: 'out-refuge-25', name: '避难层', type: 'Space' }),
          node({ id: 'out-stair-25', name: '防烟楼梯间A', type: 'Stairs' }),
          node({ id: 'out-lift-25', name: '消防电梯', type: 'FireLift' }),
        ],
      }),
    ],
  });
}

describe('splitRouteSteps', () => {
  it('拆内嵌箭头链(→ 与 -> 混用)', () => {
    expect(splitRouteSteps(['康泰路专职队→南侧主入口', '1F 大堂 -> 25F 避难层⇒供水干线'])).toEqual([
      '康泰路专职队', '南侧主入口', '1F 大堂', '25F 避难层', '供水干线',
    ]);
  });

  it('去空与纯标点残片', () => {
    expect(splitRouteSteps(['→', 'a→→b', '。'])).toEqual(['a', 'b']);
  });
});

describe('resolvePlanRouteAnchors', () => {
  it('楼层+空间名(剩余文本兜底) → 命中该层空间', () => {
    const r = resolvePlanRouteAnchors(['1F 大堂'], testTree());
    expect(r.anchors).toEqual([{ step: '1F 大堂', outId: 'out-lobby', label: '大堂' }]);
  });

  it('楼层+设施类型 → 按楼层过滤命中', () => {
    const r = resolvePlanRouteAnchors(['25F 避难层'], testTree());
    expect(r.anchors[0]?.outId).toBe('out-refuge-25');
  });

  it('裸楼层 → 落 Story 中心', () => {
    const r = resolvePlanRouteAnchors(['25F'], testTree());
    expect(r.anchors).toEqual([{ step: '25F', outId: 'out-25f', label: '楼层 25F' }]);
  });

  it('类型词无楼层时先命中索引序首个;有上一步楼层时就近', () => {
    const r1 = resolvePlanRouteAnchors(['防烟楼梯间A'], testTree());
    expect(r1.anchors[0]?.outId).toBe('out-stair-1');
    // 上一步在 25F → 楼梯就近取 25F 的
    const r2 = resolvePlanRouteAnchors(['25F 避难层', '防烟楼梯间A'], testTree());
    expect(r2.anchors.map((a) => a.outId)).toEqual(['out-refuge-25', 'out-stair-25']);
  });

  it('中文习惯楼层词(首层)可解析', () => {
    const r = resolvePlanRouteAnchors(['首层东门'], testTree());
    expect(r.anchors[0]?.outId).toBe('out-door-1');
  });

  it('楼层区间(人员范围)与无场景指代步骤跳过', () => {
    const r = resolvePlanRouteAnchors(['高区人员（26-40F）', '南侧消火栓（距41米）'], testTree());
    expect(r.anchors).toEqual([]);
    expect(r.skipped.map((s) => s.reason)).toEqual(['无可定位指代', '无可定位指代']);
  });

  it('相邻同点去重', () => {
    const r = resolvePlanRouteAnchors(['25F', '25F'], testTree());
    expect(r.anchors).toHaveLength(1);
  });
});

interface DrawCalls {
  cleared: string[];
  drawn: Array<Record<string, unknown>>;
}

function fakeRuntime(positions: Record<string, XYZ | null>): { rt: PlanRouteDrawRuntime; calls: DrawCalls } {
  const calls: DrawCalls = { cleared: [], drawn: [] };
  return {
    calls,
    rt: {
      getObjectWorldPosition: (id) => positions[id] ?? null,
      drawVirtualRoute: (detail) => {
        calls.drawn.push(detail);
        return Promise.resolve({ routeId: detail.route_id });
      },
      clearVirtualRoute: (id) => {
        calls.cleared.push(id);
      },
    },
  };
}

const POSITIONS: Record<string, XYZ> = {
  'out-lobby': { x: 0, y: 5, z: 0 },
  'out-door-1': { x: 0.5, y: 5, z: 1 },
  'out-refuge-25': { x: 10, y: 100, z: 5 },
  'out-25f': { x: 2, y: 100, z: 2 },
};

describe('drawPlanRoute', () => {
  it('进攻路线:先清同 id 再画折线(cyan)', () => {
    const { rt, calls } = fakeRuntime(POSITIONS);
    const r = drawPlanRoute('attack', ['1F 大堂', '25F 避难层'], testTree(), rt);
    expect(r).toEqual({ drawn: true, pointCount: 2 });
    expect(calls.cleared).toEqual([PLAN_ROUTE_IDS.attack]);
    expect(calls.drawn).toHaveLength(1);
    const detail = calls.drawn[0];
    expect(detail.route_id).toBe('plan-route-attack');
    expect(detail.route_color).toBe(PLAN_ROUTE_COLORS.attack);
    expect((detail.path as Array<{ position: XYZ }>).map((p) => p.position.x)).toEqual([0, 10]);
    expect(detail.start_coordinate).toEqual({ x: 0, y: 5, z: 0 });
    expect(detail.end_coordinate).toEqual({ x: 10, y: 100, z: 5 });
  });

  it('疏散路线用固定 id 与绿色', () => {
    const { rt, calls } = fakeRuntime(POSITIONS);
    drawPlanRoute('evacuate', ['25F', '1F 大堂'], testTree(), rt);
    expect(calls.drawn[0]?.route_id).toBe('plan-route-evacuate');
    expect(calls.drawn[0]?.route_color).toBe('#34d399');
  });

  it('多于两个可定位点时只连首尾(最远两点直连)', () => {
    const { rt, calls } = fakeRuntime(POSITIONS);
    // 大堂(0,5,0) → 避难层25F(10,100,5) → 25F Story(2,100,2):中点不参与
    const r = drawPlanRoute('attack', ['1F 大堂', '25F 避难层', '25F'], testTree(), rt);
    expect(r).toEqual({ drawn: true, pointCount: 2 });
    expect((calls.drawn[0]?.path as Array<{ position: XYZ }>).map((p) => p.position.x)).toEqual([0, 2]);
  });

  it('锚点不足 2 个不画线并给出原因', () => {
    const { rt, calls } = fakeRuntime(POSITIONS);
    const r = drawPlanRoute('attack', ['供水干线'], testTree(), rt);
    expect(r.drawn).toBe(false);
    expect(r.pointCount).toBe(0);
    expect(r.reason).toContain('可定位锚点不足');
    expect(calls.drawn).toHaveLength(0);
  });

  it('树未就绪时不画线', () => {
    const { rt, calls } = fakeRuntime(POSITIONS);
    const r = drawPlanRoute('attack', ['1F 大堂', '25F'], null, rt);
    expect(r.drawn).toBe(false);
    expect(calls.drawn).toHaveLength(0);
  });
});

describe('clearPlanRoutes', () => {
  it('缺省清两条;指定 kind 只清一条', () => {
    const { rt, calls } = fakeRuntime({});
    clearPlanRoutes(rt);
    expect(calls.cleared).toEqual([PLAN_ROUTE_IDS.attack, PLAN_ROUTE_IDS.evacuate]);
    const second = fakeRuntime({});
    clearPlanRoutes(second.rt, 'attack');
    expect(second.calls.cleared).toEqual([PLAN_ROUTE_IDS.attack]);
  });
});
