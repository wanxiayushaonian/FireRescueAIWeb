// 警情数据访问层:web /api/business/incidents(BFF 代理 znya)→ Incident 点位。
import { mapIncident, type ZnyaIncident, type Incident } from '@/lib/incident-mapper';
import { concatPageItems, remainingPages } from '@/lib/paginate';

const PAGE_SIZE = 100;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchIncidents(): Promise<Incident[]> {
  const path = '/api/business/incidents';
  const pageUrl = (page: number) => `${path}?page=${page}&page_size=${PAGE_SIZE}`;
  const first = await getJson<{ items: ZnyaIncident[]; total: number }>(pageUrl(1));
  const rest = remainingPages(first.total, PAGE_SIZE, first.items.length);
  if (rest.length === 0) return first.items.map(mapIncident).filter((x): x is Incident => x !== null);
  const pages = await Promise.all(rest.map((p) => getJson<{ items: ZnyaIncident[] }>(pageUrl(p))));
  return concatPageItems(first.items, pages.map((r) => r.items ?? []))
    .map(mapIncident)
    .filter((x): x is Incident => x !== null);
}
