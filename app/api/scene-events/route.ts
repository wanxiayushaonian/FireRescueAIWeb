// BFF 同源代理:浏览器订阅 /api/scene-events,BFF 带 appKey 连 mcp 内网
// /scene-events,把上游 SSE 流原样透传。这样浏览器无需(也不应)持有 mcp appKey,
// 且 mcp 的命令流端点不暴露给公网匿名访问(公网只能到达同源 BFF)。
//
// 与 app/uagent-service/.../agent-chat/route.ts 同为 SSE 透传模式。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MCP_INTERNAL_URL = (process.env.MCP_INTERNAL_URL || 'http://localhost:8787').replace(/\/$/, '');
// 服务端密钥(无 NEXT_PUBLIC_ 前缀,不会进前端 bundle),与 mcp 的 MCP_APP_KEY 同值。
const MCP_APP_KEY = process.env.MCP_APP_KEY || '';

export async function GET(): Promise<Response> {
  if (!MCP_APP_KEY) {
    return new Response(JSON.stringify({ message: 'MCP_APP_KEY 未配置:无法代理订阅命令流' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${MCP_INTERNAL_URL}/scene-events`, {
      headers: { 'x-app-key': MCP_APP_KEY, Accept: 'text/event-stream' },
      cache: 'no-store',
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ message: `mcp 上游连接失败: ${(e as Error)?.message || e}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const status = upstream.status;
    let detail = '';
    try {
      detail = (await upstream.text()).slice(0, 200);
    } catch {
      // ignore
    }
    return new Response(
      JSON.stringify({ message: `mcp /scene-events 返回 ${status}${detail ? `: ${detail}` : ''}` }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
