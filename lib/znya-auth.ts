/**
 * znya 后端 service JWT:BFF 侧登录获取 token,模块级缓存 + 过期刷新 + 并发单次。
 * 前端不持 znya token;web 代理 /api/business/* 用它带 Authorization: Bearer。
 */

type Cached = { token: string; expiresAt: number };

let cache: Cached | null = null;
let inflight: Promise<string> | null = null;

export function __resetZnyaAuthForTest(): void {
  cache = null;
  inflight = null;
}

function parseExp(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function isFresh(c: Cached): boolean {
  // 提前 60s 视为过期,避免边界
  return c.expiresAt > Date.now() + 60_000;
}

async function login(): Promise<string> {
  const base = process.env.ZNYA_BASE_URL || 'http://localhost:8000';
  const username = process.env.ZNYA_ADMIN_USER || 'admin';
  const password = process.env.ZNYA_ADMIN_PASSWORD || 'admin123';
  const res = await fetch(`${base.replace(/\/+$/, '')}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`znya 登录失败:${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('znya 登录响应缺 access_token');
  cache = { token: data.access_token, expiresAt: parseExp(data.access_token) };
  return data.access_token;
}

/** 返回有效 Bearer token(缓存命中 / 过期刷新 / 并发共享)。 */
export function getServiceToken(): Promise<string> {
  if (cache && isFresh(cache)) return Promise.resolve(cache.token);
  if (inflight) return inflight;
  inflight = login().finally(() => {
    inflight = null;
  });
  return inflight;
}
