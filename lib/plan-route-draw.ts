// 预案路线 3D 绘制(最小实现):预案输出的 attack/evacuate 步骤文本 → 场景锚点
// → drawVirtualRoute 折线。锚点分词复用 linkifyText(与位置芯片同一套词表,
// 芯片能点的地方路线就能画):设施类型锚点查设备索引(带楼层过滤、贴近上一步
// 楼层防跨楼乱连),裸楼层锚点落 Story 中心;GIS 地名属场外经纬度,暂不画
// (留 navigateFromExternal 场外段增强)。自由文本命中不了的步骤跳过;
// 可定位锚点 < 2 不画线,避免误连。执行挂载见 scene-action-executor 的
// showRoute/hideRoute(2026-09-04 前这两个动作只写日志不执行)。
import type { SceneTreeNode } from './ustudio';
import { linkifyText } from './location-linkify';
import { parseFloorSpec, parseFloorToken, storyIdsForFloorSpec } from './floor-focus';
import { buildDeviceSearchIndex, searchDevices, type DeviceSearchItem } from './scene-pick';

export type PlanRouteKind = 'attack' | 'evacuate';

export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** 虚拟路线固定 id:重画前 clear 同 id 幂等替换(重新生成/分组重放不叠线);与导航(nav-*)互不干扰。 */
export const PLAN_ROUTE_IDS: Readonly<Record<PlanRouteKind, string>> = {
  attack: 'plan-route-attack',
  evacuate: 'plan-route-evacuate',
};

/** 与 PlanOutputPanel 场景动作日志一致的双色(进攻 cyan / 疏散 green)。 */
export const PLAN_ROUTE_COLORS: Readonly<Record<PlanRouteKind, string>> = {
  attack: '#22d3ee',
  evacuate: '#34d399',
};

/** 拆步:一条路线元素常内嵌 "→"/"->" 链(真实 agent 输出形态),拆成单步;去空与纯标点。 */
export function splitRouteSteps(routes: readonly string[]): string[] {
  return routes
    .flatMap((line) => line.split(/\s*(?:→|->|⇒|=>)\s*/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^[→\-.。、,，;；:：\s]+$/.test(s));
}

export interface PlanRouteAnchor {
  readonly step: string;
  readonly outId: string;
  /** 命中展示名(设备名或楼层段),日志/告警用。 */
  readonly label: string;
}

export interface PlanRouteResolution {
  readonly anchors: readonly PlanRouteAnchor[];
  readonly skipped: ReadonlyArray<{ readonly step: string; readonly reason: string }>;
}

/** 中文楼层习惯词 → linkify 可识别的楼层段("首层东门" → "1F东门")。 */
const CN_FLOOR_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/首层|一层/g, '1F'],
  [/负一层/g, 'B1F'],
];

/** 去括注(（距41米）等说明非锚点)、换习惯楼层词。 */
function normalizeStep(step: string): string {
  let t = step;
  for (const [re, to] of CN_FLOOR_WORDS) t = t.replace(re, to);
  return t.replace(/[（(][^（）()]*[）)]/g, '');
}

/** Story 楼层标签 → 楼层号(兼容 "25F"/"25层" 形态)。 */
function floorOfStoryLabel(storyLabel: string | undefined): number | null {
  if (!storyLabel) return null;
  return parseFloorToken(storyLabel.trim().replace(/层$/i, ''));
}

function floorOfItem(item: DeviceSearchItem): number | null {
  return floorOfStoryLabel(item.storyLabel);
}

/**
 * 命中选择:先按步骤楼层过滤(过滤后为空退回全量);再按"贴近上一步所在楼层"
 * 排序——自由文本步骤常不带楼层词("消防电梯"),不就近会跨楼乱连。
 */
function pickHit(hits: DeviceSearchItem[], floorFilter: number | null, prevFloor: number | null): DeviceSearchItem | null {
  if (hits.length === 0) return null;
  const scoped = floorFilter != null ? hits.filter((h) => floorOfItem(h) === floorFilter) : hits;
  const pool = scoped.length > 0 ? scoped : hits;
  if (prevFloor == null) return pool[0];
  const dist = (h: DeviceSearchItem): number => {
    const f = floorOfItem(h);
    return f == null ? Number.MAX_SAFE_INTEGER : Math.abs(f - prevFloor);
  };
  return [...pool].sort((a, b) => dist(a) - dist(b))[0];
}

/** 逐步解析:类型锚点 > 剩余中文名兜底(空间/门名) > 裸楼层落 Story 中心。 */
export function resolvePlanRouteAnchors(steps: readonly string[], tree: SceneTreeNode | null): PlanRouteResolution {
  const anchors: PlanRouteAnchor[] = [];
  const skipped: Array<{ step: string; reason: string }> = [];
  if (!tree) return { anchors, skipped: steps.map((step) => ({ step, reason: '场景树未就绪' })) };
  const index = buildDeviceSearchIndex(tree);
  let prevFloor: number | null = null;

  /** 同一查询:先带楼层过滤,空则退全量。 */
  const resolveHit = (query: string, floorFilter: number | null): DeviceSearchItem | null => {
    const hits = searchDevices(index, query, 50);
    if (hits.length === 0) return null;
    return pickHit(hits, floorFilter, prevFloor);
  };

  for (const step of steps) {
    const norm = normalizeStep(step);
    if (!norm.trim()) {
      skipped.push({ step, reason: '空步骤' });
      continue;
    }
    const segments = linkifyText(norm);
    const floorSpecs = segments.flatMap((s) => (s.anchor?.kind === 'floor' ? [s.anchor.spec] : []));
    const floorNums = [...new Set(floorSpecs.flatMap((spec) => parseFloorSpec(spec) ?? []))];
    const types = segments.flatMap((s) => (s.anchor?.kind === 'type' ? [s.anchor.label] : []));
    // 楼层区间(如"26-40F"人员范围)不作过滤,只留类型/文本匹配
    const floorFilter = floorNums.length === 1 ? floorNums[0] : null;

    let hit: DeviceSearchItem | null = null;
    for (const label of types) {
      hit = resolveHit(label, floorFilter) ?? (floorFilter != null ? resolveHit(label, null) : null);
      if (hit) break;
    }
    if (!hit) {
      const leftover = segments
        .filter((s) => !s.anchor)
        .map((s) => s.text)
        .join('')
        .replace(/[\s。、,，;；:：·]+/g, '');
      // 至少两个字符且含中文,避免英文残片("A/B")误命中
      if (leftover.length >= 2 && /[\u4e00-\u9fff]/.test(leftover)) {
        hit = resolveHit(leftover, floorFilter) ?? (floorFilter != null ? resolveHit(leftover, null) : null);
      }
    }

    if (hit) {
      anchors.push({ step, outId: hit.outId, label: hit.name });
      const f = floorOfItem(hit);
      if (f != null) prevFloor = f;
      continue;
    }
    // 裸楼层步骤(如疏散起点"25F"):落该层 Story 中心
    if (floorNums.length === 1) {
      const spec = floorSpecs[0];
      const storyIds = storyIdsForFloorSpec(tree, spec);
      if (storyIds.length > 0) {
        anchors.push({ step, outId: storyIds[0], label: `楼层 ${spec}` });
        prevFloor = floorNums[0];
        continue;
      }
      skipped.push({ step, reason: `场景中无楼层 ${spec}` });
      continue;
    }
    skipped.push({ step, reason: types.length > 0 ? `场景中未找到 ${types.join('/')}` : '无可定位指代' });
  }

  // 相邻同点去重(同一步骤文本复现/同层连续步骤)
  const deduped: PlanRouteAnchor[] = [];
  for (const a of anchors) {
    if (deduped.length > 0 && deduped[deduped.length - 1].outId === a.outId) continue;
    deduped.push(a);
  }
  return { anchors: deduped, skipped };
}

/** 画线所需 runtime 能力(SoonspaceRuntime 均已具备)。 */
export interface PlanRouteDrawRuntime {
  getObjectWorldPosition(id: string): XYZ | null;
  drawVirtualRoute(detail: Record<string, unknown>, options?: Record<string, unknown>): unknown;
  clearVirtualRoute(routeId: string): void;
}

export interface PlanRouteDrawResult {
  readonly drawn: boolean;
  readonly pointCount: number;
  readonly reason?: string;
}

function samePoint(a: XYZ, b: XYZ): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.01;
}

/**
 * 解析并画一条预案路线。同步入参校验 + 触发绘制;drawVirtualRoute 的
 * Promise 拒绝(SDK 画线失败)兜底 catch,不产生未处理拒绝。
 */
export function drawPlanRoute(
  kind: PlanRouteKind,
  steps: readonly string[],
  tree: SceneTreeNode | null,
  runtime: PlanRouteDrawRuntime,
): PlanRouteDrawResult {
  const { anchors, skipped } = resolvePlanRouteAnchors(steps, tree);
  const firstSkip = skipped[0]?.reason;
  const points: XYZ[] = [];
  for (const a of anchors) {
    const p = runtime.getObjectWorldPosition(a.outId);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    if (points.length > 0 && samePoint(points[points.length - 1], p)) continue;
    points.push(p);
  }
  if (points.length < 2) {
    return {
      drawn: false,
      pointCount: points.length,
      reason: `可定位锚点不足(命中 ${points.length} 个${firstSkip ? `;如「${skipped[0].step}」${firstSkip}` : ''})`,
    };
  }
  const routeId = PLAN_ROUTE_IDS[kind];
  // 先清同 id 再画:重新生成/分组重放时幂等替换,不与导航路线(nav-*)混线
  runtime.clearVirtualRoute(routeId);
  const detail: Record<string, unknown> = {
    route_id: routeId,
    route_name: kind === 'attack' ? '预案进攻路线' : '预案疏散路线',
    route_color: PLAN_ROUTE_COLORS[kind],
    path: points.map((p) => ({ position: p })),
    start_coordinate: points[0],
    end_coordinate: points[points.length - 1],
  };
  try {
    const r = runtime.drawVirtualRoute(detail) as Promise<unknown> | void;
    if (r && typeof (r as Promise<unknown>).catch === 'function') {
      (r as Promise<unknown>).catch((err) => {
        console.warn('[plan-route] drawVirtualRoute 失败:', routeId, err);
      });
    }
  } catch (err) {
    return { drawn: false, pointCount: points.length, reason: `画线异常:${String(err)}` };
  }
  return { drawn: true, pointCount: points.length };
}

/** 清除预案路线;kind 缺省清进攻+疏散两条(handleRegenerate/复位语义)。 */
export function clearPlanRoutes(runtime: Pick<PlanRouteDrawRuntime, 'clearVirtualRoute'>, kind?: PlanRouteKind): void {
  const ids = kind ? [PLAN_ROUTE_IDS[kind]] : Object.values(PLAN_ROUTE_IDS);
  for (const id of ids) {
    try {
      runtime.clearVirtualRoute(id);
    } catch {
      /* 未画过时 SDK 可能报未找到,清除语义下忽略 */
    }
  }
}
