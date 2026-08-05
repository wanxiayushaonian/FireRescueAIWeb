// 执勤力量数据访问层:web /api/business/*(BFF 代理 znya) → 映射为原型数据形状。
import type { FetchState, ResourceItem, Station } from '@/mock/types';
import { mapResource, mapStation } from '@/lib/force-mapper';
import type { ZnyaForceItem, ZnyaStation } from '@/lib/force-mapper';
import { concatPageItems, remainingPages } from '@/lib/paginate';

const PAGE_SIZE = 100;

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

/**
 * 分页拉取全部数据:先取第 1 页拿 total(znya page 从 1 开始),若未取满
 * 则并行拉取剩余页,合并返回完整数组。znya page_size 上限为 100。
 */
async function fetchAll<T>(path: string, pageSize = PAGE_SIZE): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const pageUrl = (page: number) => `${path}${sep}page=${page}&page_size=${pageSize}`;
  const first = await getJson<{ items: T[]; total: number }>(pageUrl(1));
  const rest = remainingPages(first.total, pageSize, first.items.length);
  if (rest.length === 0) return first.items;
  const pages = await Promise.all(rest.map((p) => getJson<{ items: T[] }>(pageUrl(p))));
  return concatPageItems(first.items, pages.map((r) => r.items ?? []));
}

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
