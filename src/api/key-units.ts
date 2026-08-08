// 重点单位数据访问层:web /api/business/key-units(BFF 代理 znya)→ KeyUnit 点位。
// 与 src/api/force.ts 同模式(znya page 从 1 开始,page_size 上限 100)。
import { mapKeyUnit, type ZnyaKeyUnit, type KeyUnit } from '@/lib/key-unit-mapper';
import { mutate, fetchAll } from '@/lib/http';

export async function fetchKeyUnits(): Promise<KeyUnit[]> {
  const items = await fetchAll<ZnyaKeyUnit>('/api/business/key-units');
  return items.map(mapKeyUnit).filter((x): x is KeyUnit => x !== null);
}

/** 更新重点单位坐标(GCJ02;只传经纬度,znya PUT 用 exclude_unset 不碰其他字段)。 */
export async function updateKeyUnitCoords(id: string, lng: number, lat: number): Promise<void> {
  const res = await fetch(`/api/business/key-units/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ longitude: lng, latitude: lat }),
  });
  if (!res.ok) throw new Error(`更新单位坐标失败 ${res.status}`);
}

/** 批量给无坐标的重点单位地理编码补全(GCJ02)。返回补全数量。 */
export async function geocodeMissingKeyUnits(): Promise<number> {
  const res = await fetch('/api/business/key-units/geocode-missing', { method: 'POST' });
  if (!res.ok) throw new Error(`批量补全失败 ${res.status}`);
  const data = (await res.json()) as { updated: number };
  return data.updated;
}

// ---- 增删改(地图点位表单) ----

export async function createKeyUnit(body: unknown): Promise<void> {
  await mutate('/api/business/key-units/', 'POST', body);
}

export async function updateKeyUnit(id: string, body: unknown): Promise<void> {
  await mutate(`/api/business/key-units/${id}`, 'PUT', body);
}

export async function deleteKeyUnit(id: string): Promise<void> {
  await mutate(`/api/business/key-units/${id}`, 'DELETE');
}
