import http from 'node:http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from './server.js';
import { subscribeCommands } from './command-bus.js';
import { checkAppKey } from './auth.js';

export function startHttp(opts: {
  port: number;
  appKey: string;
  corsOrigin: string;
}): http.Server {
  const transports = new Map<string, SSEServerTransport>();
  // CORS_ORIGIN 支持逗号分隔多域名;'*' 或空表示放行所有(ACAO='*',Origin 不校验)。
  const rawList = opts.corsOrigin
    ? opts.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  const allowAll = rawList.length === 0 || rawList.includes('*');
  const allowList = rawList.filter((x) => x !== '*');

  // Access-Control-Allow-Origin:放行所有则 '*';否则回显请求 Origin(若命中白名单),否则回首个白名单。
  function acaFor(req: http.IncomingMessage): string {
    if (allowAll) return '*';
    const origin = req.headers.origin;
    return origin && allowList.includes(origin) ? origin : allowList[0];
  }

  function cors(res: http.ServerResponse, req: http.IncomingMessage): void {
    res.setHeader('Access-Control-Allow-Origin', acaFor(req));
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  // appKey 鉴权:优先 URL query 的 appKey,其次 x-app-key header;常量时间比较。
  function appKeyAuthorized(req: http.IncomingMessage, url: URL): boolean {
    const header = req.headers['x-app-key'];
    const provided = url.searchParams.get('appKey')
      ?? (Array.isArray(header) ? header[0] : header)
      ?? null;
    return checkAppKey(provided, opts.appKey);
  }

  // /scene-events 的消费方是浏览器(不应持有服务端 appKey),
  // 故用 Origin 白名单防跨站订阅命令流,而非 appKey。未配置白名单时放行(开发)。
  function originAuthorized(req: http.IncomingMessage): boolean {
    if (allowAll) return true;
    const origin = req.headers.origin;
    return !!origin && allowList.includes(origin);
  }

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    cors(res, req);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // MCP SSE:agent 在 URL 带 ?appKey=
    if (url.pathname === '/sse') {
      if (!appKeyAuthorized(req, url)) {
        res.writeHead(401); res.end('unauthorized'); return;
      }
      try {
        const transport = new SSEServerTransport('/messages', res);
        transports.set(transport.sessionId, transport);
        res.on('close', () => { transports.delete(transport.sessionId); });
        // SDK v1.30:server.connect() 内部调用 transport.start(),每个连接独立 server 实例以支持并发
        const server = createMcpServer();
        await server.connect(transport);
      } catch (err) {
        console.error('[mcp] /sse connect failed:', err);
        if (!res.headersSent) res.writeHead(500);
        try { res.end('internal error'); } catch { /* response already ended */ }
      }
      return;
    }

    if (url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId') ?? '';
      const transport = transports.get(sessionId);
      if (!transport) { res.writeHead(400); res.end('no session'); return; }
      // 纵深防御:若请求带了 appKey(query/header)则一并校验;
      // 未带则依赖 sessionId(随机、仅 /sse 鉴权后签发)作为凭证。
      const header = req.headers['x-app-key'];
      const hasKey = url.searchParams.get('appKey') ?? (Array.isArray(header) ? header[0] : header);
      if (hasKey && !appKeyAuthorized(req, url)) {
        res.writeHead(401); res.end('unauthorized'); return;
      }
      await transport.handlePostMessage(req, res);
      return;
    }

    if (url.pathname === '/scene-events') {
      if (!originAuthorized(req)) {
        res.writeHead(403); res.end('forbidden'); return;
      }
      // cors() 已设 ACAO;这里补 SSE 专属头
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
      // command-bus 已对 listener 做错误隔离,这里无需再 try/catch
      const unsub = subscribeCommands((c) => res.write(`data: ${JSON.stringify(c)}\n\n`));
      req.on('close', () => { unsub(); res.end(); });
      return;
    }

    res.writeHead(404); res.end('not found');
  });

  httpServer.listen(opts.port, () => {
    console.log(`[mcp] listening on :${opts.port} (SSE=/sse)`);
  });
  return httpServer;
}
