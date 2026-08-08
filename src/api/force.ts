// 执勤力量数据访问层:web /api/business/*(BFF 代理 znya) → 映射为原型数据形状。
import type { FetchState, ResourceItem, Station } from '@/mock/types';
import { mapResource, mapStation } from '@/lib/force-mapper';
import type { ZnyaForceItem, ZnyaStation } from '@/lib/force-mapper';
import { fetchAll } from '@/lib/http';

// znya page 从 1 开始,page_size 上限为 100(lib/http fetchAll 默认 100)。

export async function fetchStations(state?: FetchState): Promise<Station[]> {
  if (state === 'error') throw new Error('执勤力量加载失败');
  if (state === 'empty') return [];
  const items = await fetchAll<ZnyaStation>('/api/business/fire-stations');
  return items.map(mapStation);
}

export async function fetchResources(state?: FetchState): Promise<ResourceItem[]> {
  if (state === 'error') throw new Error('执勤力量明细加载失败');
  if (state === 'empty') return [];
  const items = await fetchAll<ZnyaForceItem>('/api/business/fire-force-items?ref_type=fire_station');
  return items.map(mapResource);
}

/** 按站 + 类型拉取执勤明细(只读查看):GET /fire-force-items?ref_id=&force_type=。 */
export async function fetchStationForce(stationId: string, forceType: string): Promise<ResourceItem[]> {
  const params = new URLSearchParams({ ref_type: 'fire_station', ref_id: stationId, force_type: forceType });
  const items = await fetchAll<ZnyaForceItem>(`/api/business/fire-force-items?${params}`);
  return items.map(mapResource);
}
