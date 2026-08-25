// 浏览器与 MCP DrillSession 的同源 BFF：appKey 只存在服务端，绝不下发前端。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MCP_INTERNAL_URL = (process.env.MCP_INTERNAL_URL || 'http://localhost:8787').replace(/\/$/, '');
const MCP_APP_KEY = process.env.MCP_APP_KEY || '';
const BODY_LIMIT = 64 * 1024;
const DRILL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function upstreamUrl(drillId: string): string | null {
  try {
    const decoded = decodeURIComponent(drillId);
    return DRILL_ID_PATTERN.test(decoded)
      ? `${MCP_INTERNAL_URL}/drill-sessions/${encodeURIComponent(decoded)}`
      : null;
  } catch {
    return null;
  }
}

async function forward(drillId: string, init: RequestInit): Promise<Response> {
  if (!MCP_APP_KEY) {
    return Response.json({ message: 'MCP_APP_KEY 未配置：无法同步演练状态' }, { status: 503 });
  }
  const target = upstreamUrl(drillId);
  if (!target) return Response.json({ message: 'drillId 不合法' }, { status: 400 });
  try {
    const upstream = await fetch(target, {
      ...init,
      headers: { 'x-app-key': MCP_APP_KEY, ...(init.headers ?? {}) },
      cache: 'no-store',
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { 'content-type': upstream.headers.get('content-type') ?? 'application/json' },
    });
  } catch (error) {
    return Response.json(
      { message: `mcp 上游连接失败: ${(error as Error)?.message || error}` },
      { status: 502 },
    );
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ drillId: string }> },
): Promise<Response> {
  const { drillId } = await context.params;
  return forward(drillId, { method: 'GET' });
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ drillId: string }> },
): Promise<Response> {
  const { drillId } = await context.params;
  const body = await request.text();
  if (!body || Buffer.byteLength(body, 'utf8') > BODY_LIMIT) {
    return Response.json({ message: 'body 缺失或超长' }, { status: 400 });
  }
  return forward(drillId, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body,
  });
}
