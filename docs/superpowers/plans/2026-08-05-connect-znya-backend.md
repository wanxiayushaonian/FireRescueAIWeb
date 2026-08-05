# 增量第 2 步实施计划:web 对接 znya(执勤力量链路打通)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task(inline,带 checkpoint)。Steps use checkbox (`- [ ]`)。

**Goal:** web 加 `/api/business/*` 代理到 znya server,打通第一条业务链路(`/api/business/fire-stations` → znya `/fire-stations/`,带 service JWT)。

**Architecture:** web BFF 侧 `znya-auth` 模块(登录 znya + 缓存/刷新 service JWT)→ `znya-proxy`(转发构建)→ `app/api/business/[...path]/route.ts`(catch-all 代理,透传 path/query/method/body + 注入 Bearer)。

**Tech Stack:** Next 16(API routes)/ TypeScript 6 / vitest / znya FastAPI(本地 8000)

## Global Constraints

- **不动 znya**(只消费其 API);`znya_jjxf119/` 是只读依赖
- **前端不持 znya token**:service JWT 只在 BFF(znya-auth 模块),前端调 `/api/business/*` 无感
- **认证用 `Authorization: Bearer {token}`**(znya 约定,非外部 API 文档的 Access-Token)
- **env**:`ZNYA_BASE_URL`(默认 `http://localhost:8000`)、`ZNYA_ADMIN_USER`/`ZNYA_ADMIN_PASSWORD`(service 凭证)
- **TDD 范围**:`znya-auth`(token 缓存/过期/并发)与 `znya-proxy`(转发构建)为纯逻辑,vitest(`lib/__tests__/`);route.ts 薄壳靠 dev curl 验证
- **路径透传**:保留原始 path(不 normalize),znya 部分接口带尾斜杠(`/fire-stations/`)
- **master 直接做,每 task 独立 commit,不 push**
- 命令:`cd /home/ljb/program/FireRescueAI/web && source ~/.nvm/nvm.sh`;znya 在 `/home/ljb/program/FireRescueAI/znya_jjxf119/server`

## File Structure

```
web/
├── lib/
│   ├── znya-auth.ts              ← 新建:service JWT(登录 znya + 缓存/刷新)
│   ├── znya-auth.test.ts         ← 新建:vitet(放 lib/__tests__/)
│   ├── znya-proxy.ts             ← 新建:代理转发构建(纯函数)
│   └── __tests__/znya-proxy.test.ts ← 新建:vitet
└── app/api/business/
    └── [...path]/route.ts        ← 新建:catch-all 代理(薄壳)
```

---

## Task 1: znya-auth service JWT 模块(TDD)

**Files:**
- Create: `lib/znya-auth.ts`
- Test: `lib/__tests__/znya-auth.test.ts`

**Interfaces:**
- Consumes: env `ZNYA_BASE_URL`/`ZNYA_ADMIN_USER`/`ZNYA_ADMIN_PASSWORD`
- Produces: `getServiceToken(): Promise<string>`(有效 Bearer token)

**背景**:BFF 代理 znya 要带 service JWT。模块级缓存 + 过期自动刷新 + 并发单次登录。

- [ ] **Step 1: 写失败测试**

`lib/__tests__/znya-auth.test.ts`:

```typescript
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run znya-auth`
预期:FAIL(`getServiceToken` 未定义)。

- [ ] **Step 3: 实现最小版**

`lib/znya-auth.ts`:

```typescript
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
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run znya-auth`
预期:PASS(4 tests)。

- [ ] **Step 5: Commit**

```bash
git add lib/znya-auth.ts lib/__tests__/znya-auth.test.ts
git commit -m "feat(business): znya service JWT 模块(缓存/过期刷新/并发单次,TDD)"
```

---

## Task 2: 代理转发构建(TDD)+ route 薄壳

**Files:**
- Create: `lib/znya-proxy.ts`
- Test: `lib/__tests__/znya-proxy.test.ts`
- Create: `app/api/business/[...path]/route.ts`

**Interfaces:**
- Consumes: `getServiceToken`(Task 1)
- Produces: `buildProxyUrl` / `buildProxyRequest`(纯函数)+ `/api/business/*` route

**背景**:catch-all 代理转发到 znya,透传 path/query/method/body + 注入 Bearer。转发构建抽纯函数便于 TDD。

- [ ] **Step 1: 写失败测试**

`lib/__tests__/znya-proxy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildProxyUrl, buildProxyHeaders } from '@/lib/znya-proxy';

describe('znya proxy', () => {
  it('buildProxyUrl: path + query 拼到 ZNYA_BASE_URL,保留尾斜杠', () => {
    expect(buildProxyUrl('fire-stations/', 'page=1&size=10')).toBe(
      'http://localhost:8000/fire-stations/?page=1&size=10',
    );
    expect(buildProxyUrl('key-buildings', '')).toBe('http://localhost:8000/key-buildings');
  });

  it('buildProxyHeaders: 注入 Bearer + 保留原始 content-type', () => {
    const h = buildProxyHeaders('tok123', { 'content-type': 'application/json' });
    expect(h.authorization).toBe('Bearer tok123');
    expect(h['content-type']).toBe('application/json');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run znya-proxy`
预期:FAIL。

- [ ] **Step 3: 实现最小版**

`lib/znya-proxy.ts`:

```typescript
export function buildProxyUrl(path: string, search: string, base = process.env.ZNYA_BASE_URL || 'http://localhost:8000'): string {
  const clean = base.replace(/\/+$/, '');
  const q = search ? `?${search}` : '';
  return `${clean}/${path}${q}`;
}

export function buildProxyHeaders(token: string, incoming: Headers): Record<string, string> {
  const h: Record<string, string> = {
    authorization: `Bearer ${token}`,
    'content-type': incoming.get('content-type') ?? 'application/json',
  };
  return h;
}
```

> 测试里 base 走默认(process.env.ZNYA_BASE_URL 或默认 localhost:8000);buildProxyUrl 的 path 参数不带前导斜杠(route 里截掉)。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run znya-proxy`
预期:PASS(2 tests)。

- [ ] **Step 5: 创建 route 薄壳**

`app/api/business/[...path]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServiceToken } from '@/lib/znya-auth';
import { buildProxyUrl, buildProxyHeaders } from '@/lib/znya-proxy';

export const dynamic = 'force-dynamic';

/** 转发 znya 业务接口:path/query/method/body 透传 + 注入 service Bearer token。 */
async function proxy(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.pathname.replace(/^\/api\/business\/?/, '');
  const token = await getServiceToken();
  const url = buildProxyUrl(path, request.nextUrl.search.slice(1));
  const res = await fetch(url, {
    method: request.method,
    headers: buildProxyHeaders(token, request.headers),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
  });
  return new NextResponse(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
```

- [ ] **Step 6: typecheck 验证**

Run: `npx tsc --noEmit`
预期:绿。

- [ ] **Step 7: Commit**

```bash
git add lib/znya-proxy.ts lib/__tests__/znya-proxy.test.ts app/api/business/[...path]/route.ts
git commit -m "feat(business): /api/business/* catch-all 代理到 znya(Bearer 注入,TDD)"
```

---

## Task 3: 验证(链路打通 + 三绿)

**Files:** 无改动(纯验证 + env)

- [ ] **Step 1: 确认 znya 在跑(8000)**

```bash
curl -s -o /dev/null -w 'znya-health:%{http_code}\n' --max-time 3 http://localhost:8000/health
```
> 若 000:起 znya——`cd /home/ljb/program/FireRescueAI/znya_jjxf119/server && setsid .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 > /tmp/znya.log 2>&1 < /dev/null &`(依赖 docker PG/Redis,见 spec 风险 1)。

- [ ] **Step 2: web .env.local 加 znya env**

```
ZNYA_BASE_URL=http://localhost:8000
ZNYA_ADMIN_USER=admin
ZNYA_ADMIN_PASSWORD=admin123
```

- [ ] **Step 3: typecheck + build + vitest 全绿**

```bash
npx tsc --noEmit && echo "TC OK"
npm run build && echo "BUILD OK"
npx vitest run && echo "TEST OK"   # 预期含新增 znya-auth(4)+znya-proxy(2)
```

- [ ] **Step 4: dev 起来,curl 链路**

```bash
npm run dev   # 若 3000 已占用,Next 自动换端口(看输出)
curl -s -o /dev/null -w 'biz-fire-stations:%{http_code}\n' --max-time 10 http://localhost:3000/api/business/fire-stations
```
预期:**200** + JSON 数据(znya fire-stations 列表,当前 1 条)。前端未持 token 也能通(BFF service JWT 兜底)。

- [ ] **Step 5: 数据形状核对**

```bash
curl -s --max-time 10 http://localhost:3000/api/business/fire-stations | head -c 300
```
预期:`{total, page, page_size, items:[{id,name,station_type,longitude,latitude,...}]}`。

- [ ] **Step 6: 收尾 + 报告**

停 dev(如必要)。硬指标:znya 200 + `/api/business/fire-stations` 200 + 三绿。**不 push**(等用户)。报告完成 + 下一步(第 3 步:建筑档案/或先接原型 ForceResourcePanel 的 mock 替换)。

---

## Self-Review

- **Spec 覆盖**:spec 设计 4 节 → Task 1(znya-auth service JWT)、Task 2(代理 route + znya-proxy)、Task 3(验证 + env 配置 + 链路)。边界(不动 znya/不替换 mock)在 Global Constraints + Task 3 明确。✓
- **Placeholder 扫描**:route.ts 用 `await request.arrayBuffer()`(Next 15+ body 读取),无占位;env 默认值明确。✓
- **类型一致**:`getServiceToken`(Task 1)→ `buildProxyHeaders`(Task 2)签名衔接;route 用 `NextRequest`/`NextResponse`(Next 16)。✓
- **TDD**:Task 1(znya-auth 4 测试)+ Task 2(znya-proxy 2 测试)先测后实现;route 靠 dev curl。✓
- **风险对齐**:spec 风险(JWT 并发→Task 1 测 in-flight;尾斜杠→znya-proxy 保留;环境→Task 3 Step 1;路径透传→buildProxyUrl 不 normalize)。✓
