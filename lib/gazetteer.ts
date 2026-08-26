// 地名簿:客户端持有的可定位实体(重点建筑/重点单位/队站)名称 → GCJ02 坐标。
// 供 location-linkify 把智能体文本里的地点名词链接化(gis:// 点击地图飞行)。
// 模块级懒加载缓存;任一数据源失败静默置空,不影响其他来源与主流程。

import type { KeyBuilding } from '@/lib/key-building-mapper';
import type { KeyUnit } from '@/lib/key-unit-mapper';
import type { Station } from '@/mock/types';

export interface GisEntity {
  readonly name: string;
  readonly lng: number;
  readonly lat: number;
  readonly kind: 'building' | 'unit' | 'station';
}

const ENTITY_MIN_NAME_LEN = 4; // 过短的名称易误命中普通词

const byNormName = new Map<string, GisEntity>();
const originals: string[] = [];
let primed: Promise<void> | null = null;

/** 归一化比较键:去空白/间隔点/括弧差异后小写。 */
export function normalizeEntityName(name: string): string {
  return name.replace(/[\s·・()（）]/g, '').toLowerCase();
}

function put(entity: GisEntity): void {
  if (!entity.name || entity.name.length < ENTITY_MIN_NAME_LEN) return;
  if (entity.lng == null || !Number.isFinite(entity.lng)) return;
  if (entity.lat == null || !Number.isFinite(entity.lat)) return;
  const key = normalizeEntityName(entity.name);
  if (key && !byNormName.has(key)) {
    byNormName.set(key, entity);
    originals.push(entity.name);
  }
}

async function loadOnce(): Promise<void> {
  await Promise.all([
    import('@/api/key-buildings')
      .then((m) => m.fetchKeyBuildings())
      .then((items: KeyBuilding[]) => {
        for (const b of items ?? []) put({ name: b.name, lng: b.lng, lat: b.lat, kind: 'building' });
      })
      .catch(() => {}),
    import('@/api/key-units')
      .then((m) => m.fetchKeyUnits())
      .then((items: KeyUnit[]) => {
        for (const u of items ?? []) put({ name: u.name, lng: u.lng, lat: u.lat, kind: 'unit' });
      })
      .catch(() => {}),
    import('@/api/force')
      .then((m) => m.fetchStations('ok'))
      .then((items: Station[]) => {
        for (const s of items ?? []) put({ name: s.name, lng: s.lng ?? NaN, lat: s.lat ?? NaN, kind: 'station' });
      })
      .catch(() => {}),
  ]);
}

/** 触发后台加载(幂等);立即返回当前已知实体。 */
export function primeGazetteer(): void {
  if (!primed) primed = loadOnce();
}

/** 加载完成 promise(供组件在就绪后刷新一次渲染)。 */
export function gazetteerReady(): Promise<void> {
  if (!primed) primed = loadOnce();
  return primed;
}

/** 当前实体名 → 实体(归一化键)。异步数据到达前后调用返回同一 Map 实例(内容逐步充实)。 */
export function lookupGisEntities(): ReadonlyMap<string, GisEntity> {
  primeGazetteer();
  return byNormName;
}

/** 实体显示名单(原始名称,长度降序——匹配时优先长名)。 */
export function listGisEntityNames(): readonly string[] {
  primeGazetteer();
  return [...originals].sort((a, b) => b.length - a.length);
}

/** 精确查找(归一化)。 */
export function findGisEntity(name: string): GisEntity | undefined {
  return byNormName.get(normalizeEntityName(name));
}
