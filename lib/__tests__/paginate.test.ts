import { describe, it, expect } from 'vitest';
import { concatPageItems, remainingPages } from '../paginate';

describe('paginate', () => {
  it('total=211/pageSize=100 → 需 3 页,额外拉取第 2、3 页', () => {
    expect(remainingPages(211, 100, 100)).toEqual([2, 3]);
  });

  it('total<=pageSize 时单页即可(返回空,不发多余请求)', () => {
    expect(remainingPages(14, 100, 14)).toEqual([]);
    expect(remainingPages(100, 100, 100)).toEqual([]);
  });

  it('边界:恰好整除 total=200/pageSize=100 → 仅需第 2 页', () => {
    expect(remainingPages(200, 100, 100)).toEqual([2]);
  });

  it('边界:total=0 时单页为空(返回空,不发多余请求)', () => {
    expect(remainingPages(0, 100, 0)).toEqual([]);
  });

  it('拼接完整:第 1 页 100 条 + 第 2 页 100 条 + 第 3 页 11 条 → 211 条', () => {
    const first = Array.from({ length: 100 }, (_, i) => `a${i}`);
    const rest = [
      Array.from({ length: 100 }, (_, i) => `b${i}`),
      Array.from({ length: 11 }, (_, i) => `c${i}`),
    ];
    const all = concatPageItems(first, rest);
    expect(all).toHaveLength(211);
    expect(all[0]).toBe('a0');
    expect(all[99]).toBe('a99');
    expect(all[100]).toBe('b0');
    expect(all[199]).toBe('b99');
    expect(all[200]).toBe('c0');
    expect(all[210]).toBe('c10');
  });
});
