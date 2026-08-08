// lib/__tests__/http.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getJson, mutate, fetchAll } from '../http';

function jsonRes(ok: boolean, status: number, data: unknown) {
  return { ok, status, json: () => Promise.resolve(data) } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe('getJson', () => {
  it('ok 时返回解析后的 JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(true, 200, { a: 1 })));
    await expect(getJson<{ a: number }>('/x')).resolves.toEqual({ a: 1 });
  });
  it('非 ok 抛带状态码与路径的错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(false, 500, null)));
    await expect(getJson('/x')).rejects.toThrow('请求失败 500: /x');
  });
});

describe('mutate', () => {
  it('带 body 时发 JSON content-type', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes(true, 200, {}));
    vi.stubGlobal('fetch', f);
    await mutate('/x', 'POST', { n: 1 });
    expect(f).toHaveBeenCalledWith('/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"n":1}',
    });
  });
  it('无 body 时不带 headers/body', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes(true, 200, {}));
    vi.stubGlobal('fetch', f);
    await mutate('/x/1', 'DELETE');
    expect(f).toHaveBeenCalledWith('/x/1', { method: 'DELETE', headers: undefined, body: undefined });
  });
  it('非 ok 抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes(false, 403, null)));
    await expect(mutate('/x', 'PUT', {})).rejects.toThrow('操作失败 403: /x');
  });
});

describe('fetchAll', () => {
  it('total=211/pageSize=100 时并行补拉第 2、3 页并合并', async () => {
    const mk = (n: number, offset: number) => Array.from({ length: n }, (_, i) => offset + i);
    const f = vi.fn().mockImplementation((url: string) => {
      if (url.includes('page=1')) return Promise.resolve(jsonRes(true, 200, { items: mk(100, 0), total: 211 }));
      if (url.includes('page=2')) return Promise.resolve(jsonRes(true, 200, { items: mk(100, 100), total: 211 }));
      return Promise.resolve(jsonRes(true, 200, { items: mk(11, 200), total: 211 }));
    });
    vi.stubGlobal('fetch', f);
    const all = await fetchAll<number>('/api/business/things');
    expect(all.length).toBe(211);
    expect(all[0]).toBe(0);
    expect(all[210]).toBe(210);
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('单页装得下时只请求 1 次', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes(true, 200, { items: [1, 2], total: 2 }));
    vi.stubGlobal('fetch', f);
    await expect(fetchAll<number>('/x?foo=1')).resolves.toEqual([1, 2]);
    expect(f).toHaveBeenCalledTimes(1);
    // 已有 query 时用 & 拼 page 参数
    expect(f.mock.calls[0][0]).toContain('/x?foo=1&page=1&page_size=100');
  });
});
