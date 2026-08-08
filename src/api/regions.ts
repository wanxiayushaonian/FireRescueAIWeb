// 重点区域数据访问层:web /api/business/regions(BFF 代理 znya)→ Region。
import { mapRegion, type ZnyaRegion, type Region } from '@/lib/region-mapper';
import { fetchAll } from '@/lib/http';

export async function fetchRegions(): Promise<Region[]> {
  const items = await fetchAll<ZnyaRegion>('/api/business/regions');
  return items.map(mapRegion);
}

export async function createRegion(data: {
  name: string;
  region_type?: string;
  color?: string;
  polygon: number[][];
}): Promise<Region> {
  const res = await fetch('/api/business/regions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`创建区域失败 ${res.status}`);
  return mapRegion(await res.json());
}

export async function deleteRegion(id: string): Promise<void> {
  const res = await fetch(`/api/business/regions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除区域失败 ${res.status}`);
}
