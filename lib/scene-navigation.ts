// 场内导航(3D 路线图 B 组):大门 → 楼梯链(逐层) → 目标设备的"进攻路线"。
// 路线点取场景对象世界坐标(门/楼梯/设备),经 SDK drawVirtualRoute 绘制(SDK 自带
// 路线动效与起终点 POI);楼梯段按"距上一点最近邻"选楼梯间,视觉上沿同一楼梯间攀升。
// pathMove 到场动画暂缺:演示包无人员/车辆模型可移动对象。
import type { SceneTreeNode } from './ustudio';
import { parseFloorToken } from './floor-focus';
import type { SoonspaceRuntime } from './soonspace-runtime';

export const ATTACK_ROUTE_ID = 'nav-attack';

export interface AttackRoutePlan {
  targetOutId: string;
  targetName: string;
  /** 目标所在楼层号(地下为负;null=未归属楼层,仅大门→目标两点直连) */
  targetFloor: number | null;
  /** 入口大门(最低地上层第一个门;null=未找到,路线从首个楼梯点开始) */
  gateOutId: string | null;
  gateFloor: number | null;
  /** 途经楼层(含两端,升序或降序)各自的楼梯候选 */
  stairCandidates: Array<{ floor: number; outIds: string[] }>;
}

interface WalkCtx {
  floor: number | null;
  building: string;
}

function nodeOutId(n: SceneTreeNode): string {
  return String(n.out_instance_id ?? n.id ?? n.twins_instance_id ?? '');
}

function nodeLabel(n: SceneTreeNode): string {
  return String(n.twins_instance_name ?? n.name ?? n.type ?? '');
}

/**
 * 规划进攻路线(纯函数):目标(任意设备/门/楼梯 outId)→ 归属楼层;
 * 大门 = 最低地上层(通常 1F)第一个门;楼梯候选 = 大门层与目标层之间每层的全部楼梯。
 */
export function planAttackRoute(tree: SceneTreeNode | null, targetOutId: string): AttackRoutePlan | null {
  if (!tree || !targetOutId) return null;
  const doorsByFloor = new Map<number, string[]>();
  const stairsByFloor = new Map<number, string[]>();
  // 对象持有者规避 TS 闭包赋值收窄(walk 内赋值后外部读取)
  const found: { target: { name: string; floor: number | null } | null } = { target: null };

  const walk = (n: SceneTreeNode, ctx: WalkCtx): void => {
    const type = String(n.type ?? '');
    const outId = nodeOutId(n);
    const label = nodeLabel(n);
    let floor = ctx.floor;
    if (type === 'Story') {
      floor = parseFloorToken(String(n.twins_instance_name ?? n.name ?? '')) ?? ctx.floor;
    }
    if (outId && outId === targetOutId) found.target = { name: label, floor };
    if (outId && type === 'Door' && floor !== null) {
      doorsByFloor.set(floor, [...(doorsByFloor.get(floor) ?? []), outId]);
    }
    if (outId && type === 'Stairs' && floor !== null) {
      stairsByFloor.set(floor, [...(stairsByFloor.get(floor) ?? []), outId]);
    }
    const next: WalkCtx = { floor, building: ctx.building };
    for (const c of n.children ?? []) walk(c, next);
  };
  walk(tree, { floor: null, building: '' });
  const target = found.target;
  if (!target) return null;

  // 大门:最低地上层的第一个门
  const aboveGround = [...doorsByFloor.keys()].filter((f) => f > 0).sort((a, b) => a - b);
  const gateFloor = aboveGround[0] ?? null;
  const gateOutId = gateFloor !== null ? doorsByFloor.get(gateFloor)?.[0] ?? null : null;

  // 途经楼层:大门层↔目标层之间(含两端)存在楼梯的楼层,按行进方向排序
  const stairCandidates: Array<{ floor: number; outIds: string[] }> = [];
  if (gateFloor !== null && target.floor !== null && target.floor !== gateFloor) {
    const lo = Math.min(gateFloor, target.floor);
    const hi = Math.max(gateFloor, target.floor);
    const floors = [...stairsByFloor.keys()].filter((f) => f >= lo && f <= hi).sort((a, b) => a - b);
    const ordered = target.floor >= gateFloor ? floors : floors.reverse();
    for (const f of ordered) stairCandidates.push({ floor: f, outIds: stairsByFloor.get(f) ?? [] });
  }

  return {
    targetOutId,
    targetName: target.name,
    targetFloor: target.floor,
    gateOutId,
    gateFloor,
    stairCandidates,
  };
}

/** 已绘制导航路线 id 集(模块态;SceneViewBar「清除路线」用) */
const drawnRoutes = new Set<string>();

export function hasDrawnRoute(): boolean {
  return drawnRoutes.size > 0;
}

/** 清除全部导航路线 */
export function clearSceneRoutes(runtime: SoonspaceRuntime | null): void {
  for (const id of drawnRoutes) runtime?.clearVirtualRoute(id);
  drawnRoutes.clear();
}

/**
 * 绘制进攻路线:解析各点世界坐标(读 three 不改状态),楼梯段最近邻选同一楼梯间,
 * 经 SDK drawVirtualRoute 画线;重复调用同 id 重绘(先清后画)。
 * 返回错误信息(null=成功)。
 */
export async function drawAttackRoute(
  runtime: SoonspaceRuntime,
  plan: AttackRoutePlan,
): Promise<string | null> {
  const pos = (outId: string | null): { x: number; y: number; z: number } | null =>
    outId ? runtime.getObjectWorldPosition(outId) : null;

  const targetPos = pos(plan.targetOutId);
  if (!targetPos) return '无法定位目标对象';

  const path: Array<{ position: { x: number; y: number; z: number } }> = [];
  let prev = pos(plan.gateOutId);
  if (prev) path.push({ position: prev });

  for (const { outIds } of plan.stairCandidates) {
    let best: { outId: string; p: { x: number; y: number; z: number } } | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const outId of outIds) {
      const p = pos(outId);
      if (!p) continue;
      // 距上一点(水平距离优先,楼梯层间 y 差大但不作选择依据)
      const d = prev ? Math.hypot(p.x - prev.x, p.z - prev.z) : Number.POSITIVE_INFINITY;
      if (!best || d < bestD) {
        best = { outId, p };
        bestD = d;
      }
    }
    if (best) {
      path.push({ position: best.p });
      prev = best.p;
    }
  }
  path.push({ position: targetPos });

  clearSceneRoutes(runtime);
  try {
    await runtime.drawVirtualRoute(
      {
        route_id: ATTACK_ROUTE_ID,
        route_name: `进攻路线 → ${plan.targetName}`,
        route_color: '#f97316',
        path,
        start_coordinate: path[0]?.position ?? null,
        end_coordinate: targetPos,
      } as Parameters<SoonspaceRuntime['drawVirtualRoute']>[0],
      { id: ATTACK_ROUTE_ID },
    );
  } catch {
    return '路线绘制失败(SDK 不支持)';
  }
  drawnRoutes.add(ATTACK_ROUTE_ID);
  return null;
}
