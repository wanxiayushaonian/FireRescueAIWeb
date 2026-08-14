// SDK 的 MultiAgentSDK.agentChatSSE 请求 /uagent-service/api/agent/v1/apps/agent-chat。
// 用 Route Handler 手动 fetch 上游，把上游的 ReadableStream 直接作为响应体返回，
// 逐块透传 SSE，避免走 next.config 的 rewrite 代理（rewrites 会把 SSE 整段缓冲）。
//
// 说明：afterFiles rewrites 在文件系统路由之后匹配，所以本 route 优先于 next.config 里
// 的 `/uagent-service/:path*` rewrite 命中 agent-chat。
//
// 注意：body 原样透传（含 forwarded_props / passthrough_props / conversation_id / tool_feedbacks），
// 字段名契约见 lib/agent-chat-client.ts（网关只认 snake_case）。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGENT_GATEWAY = (process.env.AGENT_GATEWAY || 'https://fc.xwbuilders.com').replace(/\/$/, '');

export async function POST(req: Request): Promise<Response> {
  const upstreamUrl = `${AGENT_GATEWAY}/uagent-service/api/agent/v1/apps/agent-chat`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'text/event-stream' };
  const auth = req.headers.get('authorization');
  if (auth) headers.Authorization = auth;
  const appKey = req.headers.get('x-app-key');
  if (appKey) headers['X-App-Key'] = appKey;
  const cookie = req.headers.get('cookie');
  if (cookie) headers.Cookie = cookie;

  const body = await req.text();

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, { method: 'POST', headers, body, cache: 'no-store' });
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: `上游请求失败: ${(e as Error)?.message || e}` } }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
