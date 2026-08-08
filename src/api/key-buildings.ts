// 重点建筑数据访问层:web /api/business/key-buildings(BFF 代理 znya)→ KeyBuilding 点位。
import { mapKeyBuilding, type ZnyaKeyBuilding, type KeyBuilding } from '@/lib/key-building-mapper';
import { getJson, mutate, fetchAll } from '@/lib/http';

export async function fetchKeyBuildings(): Promise<KeyBuilding[]> {
  const items = await fetchAll<ZnyaKeyBuilding>('/api/business/key-buildings');
  return items.map(mapKeyBuilding).filter((x): x is KeyBuilding => x !== null);
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

export async function createKeyBuilding(body: unknown): Promise<void> {
  await mutate('/api/business/key-buildings/', 'POST', body);
}

export async function updateKeyBuilding(id: string, body: unknown): Promise<void> {
  await mutate(`/api/business/key-buildings/${id}`, 'PUT', body);
}

export async function deleteKeyBuilding(id: string): Promise<void> {
  await mutate(`/api/business/key-buildings/${id}`, 'DELETE');
}
