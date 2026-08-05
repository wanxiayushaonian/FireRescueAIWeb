import { NextRequest, NextResponse } from 'next/server';
import { getServiceToken } from '@/lib/znya-auth';
import { buildProxyUrl, buildProxyHeaders } from '@/lib/znya-proxy';

export const dynamic = 'force-dynamic';

/** 转发 znya 业务接口:path/query/method/body 透传 + 注入 service Bearer token。 */
async function proxy(request: NextRequest): Promise<Response> {
  const path = request.nextUrl.pathname.replace(/^\/api\/business\/?/, '');
  const token = await getServiceToken();
  const search = request.nextUrl.search.slice(1);
  // body 只读一次(GET/HEAD 无 body)
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  const doFetch = (p: string) =>
    fetch(buildProxyUrl(p, search), {
      method: request.method,
      headers: buildProxyHeaders(token, request.headers),
      body,
    });
  let res = await doFetch(path);
  // znya 列表接口带尾斜杠(/fire-stations/),Next catch-all 剥离尾斜杠 → 404 补斜杠重试一次
  if (res.status === 404 && !path.endsWith('/')) {
    res = await doFetch(path + '/');
  }
  return new NextResponse(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
