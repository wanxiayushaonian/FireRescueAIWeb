// lib/http.ts
// web /api/business/*(BFF 代理 znya)共用 fetch 助手:getJson / mutate / fetchAll(分页拼齐)。
// 语义与 src/api 各文件原私有实现逐字一致(错误消息格式不变)。
import { concatPageItems, remainingPages } from './paginate';

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`请求失败 ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export async function mutate(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`操作失败 ${res.status}: ${path}`);
}

/** 分页拉取全部:先取第 1 页拿 total(znya page 从 1 开始),未取满则并行拉余页合并。 */
export async function fetchAll<T>(path: string, pageSize = 100): Promise<T[]> {
  const sep = path.includes('?') ? '&' : '?';
  const pageUrl = (page: number) => `${path}${sep}page=${page}&page_size=${pageSize}`;
  const first = await getJson<{ items: T[]; total: number }>(pageUrl(1));
  const rest = remainingPages(first.total, pageSize, first.items.length);
  if (rest.length === 0) return first.items;
  const pages = await Promise.all(rest.map((p) => getJson<{ items: T[] }>(pageUrl(p))));
  return concatPageItems(first.items, pages.map((r) => r.items ?? []));
}
