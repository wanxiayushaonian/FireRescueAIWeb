// 重点建筑数据访问层:web /api/business/key-buildings(BFF 代理 znya)→ KeyBuilding 点位。
import { mapKeyBuilding, type ZnyaKeyBuilding, type KeyBuilding } from '@/lib/key-building-mapper';
import { concatPageItems, remainingPages } from '@/lib/paginate';

const PAGE_SIZE = 100;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchKeyBuildings(): Promise<KeyBuilding[]> {
  const path = '/api/business/key-buildings';
  const sep = path.includes('?') ? '&' : '?';
  const pageUrl = (page: number) => `${path}${sep}page=${page}&page_size=${PAGE_SIZE}`;
  const first = await getJson<{ items: ZnyaKeyBuilding[]; total: number }>(pageUrl(1));
  const rest = remainingPages(first.total, PAGE_SIZE, first.items.length);
  if (rest.length === 0) return first.items.map(mapKeyBuilding).filter((x): x is KeyBuilding => x !== null);
  const pages = await Promise.all(rest.map((p) => getJson<{ items: ZnyaKeyBuilding[] }>(pageUrl(p))));
  return concatPageItems(first.items, pages.map((r) => r.items ?? []))
    .map(mapKeyBuilding)
    .filter((x): x is KeyBuilding => x !== null);
}

/** 更新重点建筑坐标(GCJ02;只传经纬度,znya PUT 用 exclude_unset 不碰其他字段)。 */
export async function updateKeyBuildingCoords(id: string, lng: number, lat: number): Promise<void> {
  const res = await fetch(`/api/business/key-buildings/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ longitude: lng, latitude: lat }),
  });
  if (!res.ok) throw new Error(`更新建筑坐标失败 ${res.status}`);
}

/** 单条建筑详情(含高度/面积/层数,编辑表单预填用;列表响应没有这些字段)。 */
export interface ZnyaKeyBuildingDetail extends ZnyaKeyBuilding {
  address?: string | null;
  building_height?: number | null;
  floor_area?: number | null;
  ground_floors?: number | null;
  underground_floors?: number | null;
}

export async function fetchKeyBuildingDetail(id: string): Promise<ZnyaKeyBuildingDetail> {
  return getJson<ZnyaKeyBuildingDetail>(`/api/business/key-buildings/${id}`);
}

// ---- 增删改(地图点位表单) ----

async function mutate(path: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`操作失败 ${res.status}: ${path}`);
}

export async function createKeyBuilding(body: unknown): Promise<void> {
  await mutate('/api/business/key-buildings/', 'POST', body);
}

export async function updateKeyBuilding(id: string, body: unknown): Promise<void> {
  await mutate(`/api/business/key-buildings/${id}`, 'PUT', body);
}

export async function deleteKeyBuilding(id: string): Promise<void> {
  await mutate(`/api/business/key-buildings/${id}`, 'DELETE');
}
