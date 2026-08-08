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
  // znya 列表路由带尾斜杠(/fire-stations/),Next catch-all 会剥掉客户端传来的尾斜杠。
  // 单段 GET(如 fire-stations、fire-force-items?...)必为列表接口 → 直接补斜杠,避免 404+重试的双倍请求;
  // 预判失败则换另一种形态兜底重试一次(防御未来出现无斜杠单段路由)。
  const preferSlash = request.method === 'GET' && path !== '' && !path.includes('/');
  let res = await doFetch(preferSlash ? `${path}/` : path);
  if (res.status === 404) {
    res = await doFetch(preferSlash ? path : `${path}/`);
  }
  return new NextResponse(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE, proxy as PATCH };
