// 执勤力量数据访问层:web /api/business/*(BFF 代理 znya) → 映射为原型数据形状。
import type { FetchState, ResourceItem, Station } from '@/mock/types';
import { buildResourceTree, buildForceStats, mapResource, mapStation } from '@/lib/force-mapper';
import type { ResourceTreeGroup, ZnyaForceItem, ZnyaStation } from '@/lib/force-mapper';

const PAGE_SIZE = 100;

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchStations(state?: FetchState): Promise<Station[]> {
  if (state === 'error') throw new Error('执勤力量加载失败');
  if (state === 'empty') return [];
  const data = await getJson<{ items: ZnyaStation[] }>(
    `/api/business/fire-stations?page_size=${PAGE_SIZE}`,
  );
  return (data.items ?? []).map(mapStation);
}

export async function fetchResources(state?: FetchState): Promise<ResourceItem[]> {
  if (state === 'error') throw new Error('执勤力量明细加载失败');
  if (state === 'empty') return [];
  const data = await getJson<{ items: ZnyaForceItem[] }>(
    `/api/business/fire-force-items?ref_type=fire_station&page_size=${PAGE_SIZE}`,
  );
  return (data.items ?? []).map(mapResource);
}

export async function fetchForceStats(state?: FetchState): Promise<{ value: number; delta?: string }[]> {
  const [stations, resources] = await Promise.all([fetchStations(state), fetchResources(state)]);
  return buildForceStats(stations, resources);
}

export async function fetchResourceTree(state?: FetchState): Promise<ResourceTreeGroup[]> {
  const [stations, resources] = await Promise.all([fetchStations(state), fetchResources(state)]);
  return buildResourceTree(stations, resources);
}
