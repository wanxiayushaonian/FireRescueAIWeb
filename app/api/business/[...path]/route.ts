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
