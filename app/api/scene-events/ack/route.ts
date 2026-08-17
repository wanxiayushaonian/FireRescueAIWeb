// BFF 同源代理:浏览器 POST /api/scene-events/ack,BFF 带 appKey 转发 mcp 内网
// /scene-events/ack 记录场景命令执行回执(与 /api/scene-events 订阅同模式:
// 浏览器不持 appKey,公网不暴露 mcp 端点)。尽力而为通道,失败返回 502 由前端静默。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MCP_INTERNAL_URL = (process.env.MCP_INTERNAL_URL || 'http://localhost:8787').replace(/\/$/, '');
const MCP_APP_KEY = process.env.MCP_APP_KEY || '';

export async function POST(req: Request): Promise<Response> {
  if (!MCP_APP_KEY) {
    return new Response(JSON.stringify({ message: 'MCP_APP_KEY 未配置:无法转发 ack' }), { status: 503 });
  }
  let bodyText = '';
  try {
    bodyText = await req.text();
  } catch {
    return new Response(JSON.stringify({ message: 'body 读取失败' }), { status: 400 });
  }
  if (!bodyText || bodyText.length > 4096) {
    return new Response(JSON.stringify({ message: 'body 缺失或超长' }), { status: 400 });
  }
  try {
    const upstream = await fetch(`${MCP_INTERNAL_URL}/scene-events/ack`, {
      method: 'POST',
      headers: { 'x-app-key': MCP_APP_KEY, 'Content-Type': 'application/json' },
      body: bodyText,
      cache: 'no-store',
    });
    return new Response(upstream.body, { status: upstream.status });
  } catch (e) {
    return new Response(
      JSON.stringify({ message: `mcp 上游连接失败: ${(e as Error)?.message || e}` }),
      { status: 502 },
    );
  }
}
