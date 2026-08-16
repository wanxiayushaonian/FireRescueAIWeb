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
  /** 入口大门候选(最低地上层全部门;绘制时取离门群质心最远者=周边出入口,而非树序首个内门) */
  gateOutIds: string[];
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

  // 大门候选:最低地上层的全部门(绘制时按"离门群质心最远"选周边出入口)
  const aboveGround = [...doorsByFloor.keys()].filter((f) => f > 0).sort((a, b) => a - b);
  const gateFloor = aboveGround[0] ?? null;
  const gateOutIds = gateFloor !== null ? doorsByFloor.get(gateFloor) ?? [] : [];

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
    gateOutIds,
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
 * 容错解析路径点:kgraph path/path_nodes 与场景路线 detail.path 共用。
 * 支持形态:扁平数字数组([x,y,z,x,y,z…]——平台实测 detail.path 即此形态) |
 * [{x,y,z}] | [{position:{x,y,z}}] | ["x&y&z"] | [{coordinate:"x&y&z"}]。
 * 至少 2 个有效点才算路径。
 */
export function extractPathPoints(value: unknown): Array<{ x: number; y: number; z: number }> | null {
  if (Array.isArray(value) && value.length >= 6 && value.every((item) => typeof item === 'number')) {
    const flat: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i + 2 < value.length; i += 3) {
      if ([value[i], value[i + 1], value[i + 2]].every(Number.isFinite)) {
        flat.push({ x: value[i], y: value[i + 1], z: value[i + 2] });
      }
    }
    return flat.length >= 2 ? flat : null;
  }
  const parseOne = (item: unknown): { x: number; y: number; z: number } | null => {
    if (typeof item === 'string') {
      const parts = item.split('&').map(Number);
      return parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)
        ? { x: parts[0], y: parts[1], z: parts[2] }
        : null;
    }
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    const raw = typeof obj.position === 'object' && obj.position !== null
      ? (obj.position as Record<string, unknown>)
      : typeof obj.coordinate === 'string' ? obj.coordinate
        : obj;
    if (typeof raw === 'string') return parseOne(raw);
    const x = Number(raw.x);
    const y = Number(raw.y);
    const z = Number(raw.z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  };
  if (!Array.isArray(value)) return null;
  const pts: Array<{ x: number; y: number; z: number }> = [];
  for (const item of value) {
    const p = parseOne(item);
    if (p) pts.push(p);
  }
  return pts.length >= 2 ? pts : null;
}

/** 调 kgraph 最短路(BFF);不可达/未建图/请求失败 → null */
async function fetchShortestPath(
  sceneId: string,
  source: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
): Promise<Array<{ x: number; y: number; z: number }> | null> {
  try {
    const res = await fetch('/api/ustudio/shortest-path', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sceneId, source, target }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reachable?: boolean; path?: unknown; path_nodes?: unknown };
    if (data?.reachable === false) return null;
    return extractPathPoints(data?.path ?? data?.path_nodes);
  } catch {
    return null;
  }
}

export interface DrawRouteResult {
  /** 失败原因(null 表示成功) */
  error?: string;
  /** true=kgraph 真实路径;false=启发式示意折线(场景未建连通图) */
  real?: boolean;
}

/** 场景路线摘要(listSceneRoutes 条目) */
export interface SceneRouteSummary {
  route_id: string;
  route_name?: string;
}

/** 最近绘制的场景路线(车辆巡线用):路线 id + 解析后的路径点 */
let lastSceneRoute: { routeId: string; points: Array<{ x: number; y: number; z: number }> } = { routeId: '', points: [] };

export function getLastSceneRoute(): { routeId: string; points: Array<{ x: number; y: number; z: number }> } | null {
  return lastSceneRoute && lastSceneRoute.points.length >= 2 ? lastSceneRoute : null;
}

/** 拉取场景包自带路线(平台编辑器规划并保存的) */
export async function fetchSceneRoutes(sceneId: string): Promise<SceneRouteSummary[]> {
  try {
    const res = await fetch(`/api/ustudio/routes?sceneId=${encodeURIComponent(sceneId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data) ? data : [])
      .filter((r): r is SceneRouteSummary => !!r && typeof r.route_id === 'string')
      .map((r) => ({ route_id: r.route_id, route_name: r.route_name }));
  } catch {
    return [];
  }
}

/**
 * 绘制场景包自带路线(list → detail → 扁平/多形态 path 解析 → drawVirtualRoute)。
 * 已显示同 id 路线时再点 = 清除(toggle 语义)。返回 null=成功;'cleared'=已清除;其余=错误。
 */
export async function drawSceneRoute(
  runtime: SoonspaceRuntime,
  sceneId: string,
  routeId: string,
  routeName: string,
): Promise<string | null> {
  if (lastSceneRoute?.routeId === routeId && drawnRoutes.has(routeId)) {
    clearSceneRoutes(runtime);
    lastSceneRoute.routeId = '';
    lastSceneRoute.points = [];
    return 'cleared';
  }
  try {
    const res = await fetch(
      `/api/ustudio/routes/detail?sceneId=${encodeURIComponent(sceneId)}&routeId=${encodeURIComponent(routeId)}`,
    );
    if (!res.ok) return '路线详情加载失败';
    const detail = (await res.json()) as Record<string, unknown>;
    const points = extractPathPoints(detail.path);
    if (!points) return '路线无有效路径点';
    clearSceneRoutes(runtime);
    await runtime.drawVirtualRoute(
      {
        route_id: routeId,
        route_name: routeName || String(detail.route_name ?? routeId),
        route_color: typeof detail.route_color === 'string' && detail.route_color ? detail.route_color : '#22d3ee',
        path: points.map((p) => ({ position: p })),
        start_coordinate: detail.start_coordinate ?? null,
        end_coordinate: detail.end_coordinate ?? null,
      } as Parameters<SoonspaceRuntime['drawVirtualRoute']>[0],
      { id: routeId },
    );
    drawnRoutes.add(routeId);
    lastSceneRoute.routeId = routeId;
    lastSceneRoute.points = points;
    return null;
  } catch {
    return '路线绘制失败';
  }
}

/**
 * 车辆巡线:消防车沿最近绘制的场景路线移动(SDK pathMove;先 pathRestore 复位保证可重放)。
 * truckOutId 为空(场景无车辆)返回错误信息。
 */
export function animateTruckAlongRoute(
  runtime: SoonspaceRuntime,
  truckOutId: string | null,
): string | null {
  const route = getLastSceneRoute();
  if (!truckOutId) return '场景中未找到消防车';
  if (!route) return '请先显示一条场景路线';
  runtime.pathRestore(truckOutId);
  const anim = runtime.pathMove(truckOutId, route.points) as { play?: () => void } | null;
  if (!anim) return '引擎不支持路径动画';
  anim.play?.();
  return null;
}

/**
 * 绘制进攻路线(双路径策略):
 * 1. 优先 kgraph 最短路(平台空间图,含门/楼梯连通)——场景包建图后自动生效;
 * 2. 图不可达时回退启发式折线:大门→逐层最近楼梯→目标(段间直线,示意用)。
 * 大门均取"1F 门群质心最远门",起点沿外向延伸 6m 呈现"从场外进入"。
 */
export async function drawAttackRoute(
  runtime: SoonspaceRuntime,
  plan: AttackRoutePlan,
): Promise<DrawRouteResult> {
  const pos = (outId: string | null): { x: number; y: number; z: number } | null =>
    outId ? runtime.getObjectWorldPosition(outId) : null;

  const targetPos = pos(plan.targetOutId);
  if (!targetPos) return { error: '无法定位目标对象' };

  const path: Array<{ position: { x: number; y: number; z: number } }> = [];
  // 近重去重(0.4m):同点重复会让拓扑线在原点打结
  const pushPoint = (p: { x: number; y: number; z: number }): void => {
    const last = path[path.length - 1]?.position;
    if (last && Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) < 0.4) return;
    path.push({ position: p });
  };

  // 大门 = 离 1F 门群质心最远的门(周边出入口;树序首个往往是内门)
  const gatePts = plan.gateOutIds
    .map((outId) => ({ outId, p: pos(outId) }))
    .filter((g): g is { outId: string; p: { x: number; y: number; z: number } } => g.p !== null);
  let gatePos: { x: number; y: number; z: number } | null = null;
  if (gatePts.length > 0) {
    const centroid = gatePts.reduce(
      (acc, g) => ({ x: acc.x + g.p.x / gatePts.length, y: acc.y + g.p.y / gatePts.length, z: acc.z + g.p.z / gatePts.length }),
      { x: 0, y: 0, z: 0 },
    );
    const gate = gatePts.reduce((best, g) => {
      const d = (q: { x: number; z: number }): number => Math.hypot(q.x - centroid.x, q.z - centroid.z);
      return !best || d(g.p) > d(best.p) ? g : best;
    }, gatePts[0]);
    gatePos = gate.p;
    // 场外起点:沿"质心→门"外向延伸 6m
    const dx = gate.p.x - centroid.x;
    const dz = gate.p.z - centroid.z;
    const len = Math.hypot(dx, dz);
    const ENTRY_EXTEND_M = 6;
    if (len > 0.01) {
      pushPoint({ x: gate.p.x + (dx / len) * ENTRY_EXTEND_M, y: gate.p.y, z: gate.p.z + (dz / len) * ENTRY_EXTEND_M });
    }
    pushPoint(gate.p);
  }

  // 策略 1:kgraph 真实路径(大门→目标整体寻路,图内含门/楼梯连通)
  let real = false;
  if (gatePos) {
    const pts = await fetchShortestPath(runtime.getSceneId(), gatePos, targetPos);
    if (pts) {
      real = true;
      for (const p of pts) pushPoint(p);
    }
  }

  // 策略 2:启发式折线(逐层最近邻楼梯链;水平距离选同一楼梯间)
  if (!real) {
    let prev = gatePos;
    for (const { outIds } of plan.stairCandidates) {
      let best: { outId: string; p: { x: number; y: number; z: number } } | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const outId of outIds) {
        const p = pos(outId);
        if (!p) continue;
        const d = prev ? Math.hypot(p.x - prev.x, p.z - prev.z) : Number.POSITIVE_INFINITY;
        if (!best || d < bestD) {
          best = { outId, p };
          bestD = d;
        }
      }
      if (best) {
        pushPoint(best.p);
        prev = best.p;
      }
    }
  }
  pushPoint(targetPos);
  if (path.length < 2) return { error: '路径点不足,无法绘制' };

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
    return { error: '路线绘制失败(SDK 不支持)' };
  }
  drawnRoutes.add(ATTACK_ROUTE_ID);
  return { real };
}
