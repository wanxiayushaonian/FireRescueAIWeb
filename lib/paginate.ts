/**
 * 分页拉取计划纯函数:给定 total / pageSize 与已取到的第 1 页条数,
 * 计算还需拉取的页码数组(page 从 1 开始,第 1 页已取,故从 2 起)。
 * 单页可容纳全部或第 1 页已取满 total 时返回空数组。
 */
export function remainingPages(total: number, pageSize: number, fetchedCount: number): number[] {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (pageCount <= 1 || fetchedCount >= total) return [];
  return Array.from({ length: pageCount - 1 }, (_, i) => i + 2);
}

/** 合并第 1 页与其余各页 items,返回完整数组。 */
export function concatPageItems<T>(first: T[], rest: T[][]): T[] {
  return [...first, ...rest.flat()];
}
