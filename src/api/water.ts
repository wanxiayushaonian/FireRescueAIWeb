// 水源数据访问层:web /api/business/*(BFF 代理 znya)→ 映射为 WaterSource。
// fetchAll 与 src/api/force.ts 同模式(znya page 从 1 开始,page_size 上限 100)。
import type { FetchState, WaterSource } from '@/mock/types';
import { mapWaterSource, type ZnyaWaterSource } from '@/lib/water-mapper';
import { concatPageItems, remainingPages } from '@/lib/paginate';

const PAGE_SIZE = 100;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

async function fetchAll<T>(path: string, pageSize = PAGE_SIZE): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const pageUrl = (page: number) => `${path}${sep}page=${page}&page_size=${pageSize}`;
  const first = await getJson<{ items: T[]; total: number }>(pageUrl(1));
  const rest = remainingPages(first.total, pageSize, first.items.length);
  if (rest.length === 0) return first.items;
  const pages = await Promise.all(rest.map((p) => getJson<{ items: T[] }>(pageUrl(p))));
  return concatPageItems(first.items, pages.map((r) => r.items ?? []));
}

export async function fetchWaterSources(state?: FetchState): Promise<WaterSource[]> {
  if (state === 'error') throw new Error('水源加载失败');
  if (state === 'empty') return [];
  const items = await fetchAll<ZnyaWaterSource>('/api/business/water-sources');
  return items.map(mapWaterSource);
}
