import http from 'node:http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createMcpServer } from './server.js';
import { subscribeCommands } from './command-bus.js';

export function startHttp(opts: {
  port: number;
  appKey: string;
  corsOrigin: string;
}): http.Server {
  const transports = new Map<string, SSEServerTransport>();
  const allowOrigin = opts.corsOrigin || '*';

  function cors(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-App-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    cors(res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // MCP SSE:agent 在 URL 带 ?appKey=
    if (url.pathname === '/sse') {
      if (url.searchParams.get('appKey') !== opts.appKey) {
        res.writeHead(401); res.end('unauthorized'); return;
      }
      const transport = new SSEServerTransport('/messages', res);
      transports.set(transport.sessionId, transport);
      res.on('close', () => { transports.delete(transport.sessionId); });
      // SDK v1.30:server.connect() 内部调用 transport.start(),每个连接独立 server 实例以支持并发
      const server = createMcpServer();
      await server.connect(transport);
      return;
    }
    if (url.pathname === '/messages') {
      const sessionId = url.searchParams.get('sessionId') ?? '';
      const transport = transports.get(sessionId);
      if (!transport) { res.writeHead(400); res.end('no session'); return; }
      await transport.handlePostMessage(req, res);
      return;
    }
    if (url.pathname === '/scene-events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': allowOrigin,
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
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
