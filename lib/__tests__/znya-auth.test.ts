import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getServiceToken, __resetZnyaAuthForTest } from '@/lib/znya-auth';

function jwtPayload(payload: object, expOffsetSec = 3600): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64({ ...payload, exp: Math.floor(Date.now() / 1000) + expOffsetSec })}.sig`;
}

beforeEach(() => {
  __resetZnyaAuthForTest();
  process.env.ZNYA_BASE_URL = 'http://localhost:8000';
  process.env.ZNYA_ADMIN_USER = 'admin';
  process.env.ZNYA_ADMIN_PASSWORD = 'admin123';
});

describe('znya service token', () => {
  it('首次调用 → POST /auth/login 拿 token 并缓存(不重复登录)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: jwtPayload({ sub: 'admin', role: 'admin' }) }) });
    vi.stubGlobal('fetch', fetchMock);

    const t1 = await getServiceToken();
    const t2 = await getServiceToken();
    expect(t1).toBeTruthy();
    expect(t2).toBe(t1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // 缓存命中,不二次登录
    const loginCall = fetchMock.mock.calls[0];
    expect(String(loginCall[0])).toContain('/auth/login');
    expect(loginCall[1].method).toBe('POST');
    expect(JSON.parse(loginCall[1].body)).toMatchObject({ username: 'admin', password: 'admin123' });
  });

  it('token 已过期 → 重新登录刷新', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: jwtPayload({}, -10) }) }) // 已过期
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: jwtPayload({}) }) });
    vi.stubGlobal('fetch', fetchMock);

    const t1 = await getServiceToken();
    const t2 = await getServiceToken();
    expect(t2).not.toBe(t1);
    expect(fetchMock).toHaveBeenCalledTimes(2); // 第二次因过期重新登录
  });

  it('并发调用 → 只登录一次(共享 in-flight promise)', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => ({ access_token: jwtPayload({}) }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const [a, b, c] = await Promise.all([getServiceToken(), getServiceToken(), getServiceToken()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('登录失败(非 ok) → 抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(getServiceToken()).rejects.toThrow(/znya.*login|登录/i);
  });
});
