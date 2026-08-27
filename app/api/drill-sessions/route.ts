// 云端演练记录索引（BFF 只读代理 mcp-server /drill-sessions 索引；appKey 服务端持有）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MCP_INTERNAL_URL = (process.env.MCP_INTERNAL_URL || 'http://localhost:8787').replace(/\/$/, '');
const MCP_APP_KEY = process.env.MCP_APP_KEY || '';

export async function GET() {
  if (!MCP_APP_KEY) {
    return Response.json({ message: 'MCP_APP_KEY 未配置' }, { status: 503 });
  }
  try {
    const res = await fetch(`${MCP_INTERNAL_URL}/drill-sessions`, {
      headers: { 'x-app-key': MCP_APP_KEY },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  } catch {
    return Response.json({ message: '演练快照服务不可达' }, { status: 502 });
  }
}
