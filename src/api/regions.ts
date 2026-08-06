// 重点区域数据访问层:web /api/business/regions(BFF 代理 znya)→ Region。
import { mapRegion, type ZnyaRegion, type Region } from '@/lib/region-mapper';
import { concatPageItems, remainingPages } from '@/lib/paginate';

const PAGE_SIZE = 100;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchRegions(): Promise<Region[]> {
  const path = '/api/business/regions';
  const sep = path.includes('?') ? '&' : '?';
  const pageUrl = (page: number) => `${path}${sep}page=${page}&page_size=${PAGE_SIZE}`;
  const first = await getJson<{ items: ZnyaRegion[]; total: number }>(pageUrl(1));
  const rest = remainingPages(first.total, PAGE_SIZE, first.items.length);
  if (rest.length === 0) return first.items.map(mapRegion);
  const pages = await Promise.all(rest.map((p) => getJson<{ items: ZnyaRegion[] }>(pageUrl(p))));
  return concatPageItems(first.items, pages.map((r) => r.items ?? [])).map(mapRegion);
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
