// 重点单位数据访问层:web /api/business/key-units(BFF 代理 znya)→ KeyUnit 点位。
// 与 src/api/force.ts 同模式(znya page 从 1 开始,page_size 上限 100)。
import { mapKeyUnit, type ZnyaKeyUnit, type KeyUnit } from '@/lib/key-unit-mapper';
import { concatPageItems, remainingPages } from '@/lib/paginate';

const PAGE_SIZE = 100;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function fetchKeyUnits(): Promise<KeyUnit[]> {
  const path = '/api/business/key-units';
  const sep = path.includes('?') ? '&' : '?';
  const pageUrl = (page: number) => `${path}${sep}page=${page}&page_size=${PAGE_SIZE}`;
  const first = await getJson<{ items: ZnyaKeyUnit[]; total: number }>(pageUrl(1));
  const rest = remainingPages(first.total, PAGE_SIZE, first.items.length);
  if (rest.length === 0) return first.items.map(mapKeyUnit).filter((x): x is KeyUnit => x !== null);
  const pages = await Promise.all(rest.map((p) => getJson<{ items: ZnyaKeyUnit[] }>(pageUrl(p))));
  return concatPageItems(first.items, pages.map((r) => r.items ?? []))
    .map(mapKeyUnit)
    .filter((x): x is KeyUnit => x !== null);
}
