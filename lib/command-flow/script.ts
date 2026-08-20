import { compressDuration } from '@/lib/gis/vehicle-anim';
import type { RecommendType, ScriptAction, TimelineKind } from './types';

/** 派遣路线信息(与 RouteRenderItem 字段同构,避免 lib 依赖 src)。 */
export interface ScriptRouteInfo {
  stationName: string;
  polyline: [number, number][];
  distance?: number;
  duration?: number;
}

/** 剧本推荐模板(源自 statusRecommendation 的 type/content/basis)。 */
export interface ScriptRecTemplate {
  type: RecommendType;
  content: string;
  basis: string;
}

export interface ScriptContext {
  incidentId: string;
  address: string;
  lng: number;
  lat: number;
  /** 派遣路线(空数组 = 派遣失败降级)。 */
  routes: ScriptRouteInfo[];
  /** 到场/控制两阶段的推荐模板。 */
  statusRecs: Partial<Record<'到场' | '控制', ScriptRecTemplate>>;
}

/**
 * 生成一次「新警情」处置演示的相对时间轴(毫秒)。
 * 车辆行进时长依真实 ETA 压缩(compressDuration,1min 真实=6s 演示,夹 20-50s),
 * 到车时刻 == forceStatus(到场) 时刻——消除双时间线错位。
 */
export function buildScript(ctx: ScriptContext): ScriptAction[] {
  const { incidentId, address, lng, lat, routes } = ctx;
  const t: ScriptAction[] = [];
  let cursor = 0;
  /** Overload: each kind literal narrows to a single ScriptAction member minus `at`. */
  function at(ms: number, a: Omit<ScriptAction & { kind: 'stage' }, 'at'>): void;
  function at(ms: number, a: Omit<ScriptAction & { kind: 'toast' }, 'at'>): void;
  function at(ms: number, a: Omit<ScriptAction & { kind: 'timeline' }, 'at'>): void;
  function at(ms: number, a: Omit<ScriptAction & { kind: 'view' }, 'at'>): void;
  function at(ms: number, a: Omit<ScriptAction & { kind: 'status' }, 'at'>): void;
  function at(ms: number, a: Omit<ScriptAction & { kind: 'pushRec' }, 'at'>): void;
  function at(ms: number, a: Omit<ScriptAction & { kind: 'panel' }, 'at'>): void;
  function at(ms: number, a: Omit<ScriptAction & { kind: 'convoy' }, 'at'>): void;
  // eslint-disable-next-line func-name-matching
  function at(ms: number, a: Record<string, unknown>): void {
    cursor += ms;
    t.push(Object.assign(a, { at: cursor }) as ScriptAction);
  }

  // ── 接警 ──
  at(0, { kind: 'stage', stage: '接警' });
  at(200, { kind: 'view', spec: { kind: 'focusIncident', lng, lat, ringM: 1500, maxZoom: 15, paddingTL: [480, 60], paddingBR: [440, 60] } });
  at(250, { kind: 'toast', msg: `110 联动接入新警情 ${incidentId} · 演示数据` });
  at(300, { kind: 'timeline', entryKind: 'manual', label: '110 报警接入', detail: address });
  at(300, { kind: 'panel', id: 'vars', open: true });

  // ── 出动 ──
  at(900, { kind: 'status', to: '出动' });
  at(500, { kind: 'stage', stage: '出动' });
  if (routes.length) {
    const allPoints = routes.flatMap((r) => r.polyline);
    at(250, { kind: 'view', spec: { kind: 'fitRoutes', points: allPoints } });
    at(250, { kind: 'toast', msg: `AI 智能派遣 ${routes.length} 站联动 · 演示数据` });
    at(200, {
      kind: 'timeline', entryKind: 'dispatch',
      label: `AI 派遣 ${routes.length} 站联动`,
      detail: routes.map((r) => `${r.stationName} ${r.duration ? Math.round(r.duration / 60) + 'min' : '?'}`).join(' · '),
    });
    for (const r of routes) {
      at(120, {
        kind: 'pushRec', type: 'force',
        content: `${r.stationName} · ${r.duration ? Math.round(r.duration / 60) + '分钟到场' : '?分钟'}${r.distance ? ' / ' + (r.distance / 1000).toFixed(1) + 'km' : ''}`,
        basis: 'AI 智能派遣(plan_dispatch · 真实多站路线)',
      });
    }
    at(400, { kind: 'convoy', action: 'start' });
    const maxEtaSec = Math.max(...routes.map((r) => r.duration ?? 0), 1);
    const convoyMs = compressDuration(maxEtaSec);
    at(convoyMs, { kind: 'convoy', action: 'arriveAll' });
    at(200, { kind: 'toast', msg: `${routes.length} 站车组全部到场 · 演示数据` });
    at(200, { kind: 'timeline', entryKind: 'arrival', label: `${routes.length} 站车组到场` });
    at(0, { kind: 'status', to: '到场' });
  } else {
    // 派遣失败降级:跳过车辆动画,直接推进到场(演示不中断)
    at(1500, { kind: 'status', to: '到场' });
  }

  // ── 到场 ──
  at(500, { kind: 'stage', stage: '到场' });
  at(200, { kind: 'view', spec: { kind: 'settle' } });
  const arriveRec = ctx.statusRecs['到场'];
  if (arriveRec) at(600, { kind: 'pushRec', ...arriveRec });

  // 控制/熄灭阶段驻留 ~3s (≈真实5分钟压缩到演示节奏,保持现状节奏)
  at(3000, { kind: 'status', to: '控制' });
  at(500, { kind: 'stage', stage: '控制' });
  at(250, { kind: 'toast', msg: '火势已控制 · 演示数据' });
  const controlRec = ctx.statusRecs['控制'];
  if (controlRec) at(500, { kind: 'pushRec', ...controlRec });

  // ── 熄灭 ──
  // ~3s dwell ≈ 真实5分钟压缩到演示节奏 (保持现状节奏)
  at(3000, { kind: 'status', to: '熄灭' });
  at(500, { kind: 'stage', stage: '熄灭' });
  at(250, { kind: 'toast', msg: '明火已扑灭 · 处置完毕 · 演示数据' });
  at(250, { kind: 'timeline', entryKind: 'status', label: '处置完毕' });
  at(300, { kind: 'view', spec: { kind: 'reset' } });

  return t;
}
