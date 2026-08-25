import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server.js';
import { subscribeCommands } from './command-bus.js';
import { recordCommandStatus } from './command-status.js';
import { checkAppKey } from './auth.js';

export function startHttp(opts: {
  port: number;
  appKey: string;
  corsOrigin: string;
  /** /scene-events 心跳间隔(ms);0 表示关闭。默认 15s,防中间代理空闲断开。 */
  heartbeatMs?: number;
}): http.Server {
  const transports = new Map<string, SSEServerTransport>();
  // Streamable HTTP(/mcp)session 管理:initialize 建 session,后续请求复用同 transport
  const mcpSessions = new Map<string, StreamableHTTPServerTransport>();

  function getMcpSessionId(req: http.IncomingMessage): string | undefined {
    const h = req.headers['mcp-session-id'];
    return Array.isArray(h) ? h[0] : h;
  }
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

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    cors(res, req);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    // 容器/部署健康检查:不暴露密钥、session 或业务数据。
    if (url.pathname === '/healthz' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'ok', service: 'firerescue-mcp' }));
      return;
    }

    // MCP Streamable HTTP(/mcp):平台 uagent 兼容协议;initialize 建 session,后续复用
    if (url.pathname === '/mcp') {
      if (!appKeyAuthorized(req, url)) {
        res.writeHead(401); res.end('unauthorized'); return;
      }
      if (req.method === 'POST') {
        try {
          const sid = getMcpSessionId(req);
          if (sid && mcpSessions.has(sid)) {
            // 已有 session:复用 transport
            await mcpSessions.get(sid)!.handleRequest(req, res);
          } else {
            // 新 session(initialize):每 session 独立 server 实例以支持并发,与 /sse 一致
            const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: randomUUID });
            transport.onclose = () => {
              if (transport.sessionId) mcpSessions.delete(transport.sessionId);
            };
            const server = createMcpServer();
            await server.connect(transport);
            await transport.handleRequest(req, res);
            // sessionId 由 handleRequest(initialize) 内部经 sessionIdGenerator 生成(line 530),
            // 必须在 handleRequest 后存 mcpSessions,否则用 undefined key 没存进去 →
            // 后续请求复用查找失败,走 else 建新 transport → "Server not initialized"
            if (transport.sessionId) mcpSessions.set(transport.sessionId, transport);
          }
        } catch (err) {
          console.error('[mcp] /mcp POST failed:', err);
          if (!res.headersSent) res.writeHead(500);
          try { res.end('internal error'); } catch { /* response already ended */ }
        }
        return;
      }
      if (req.method === 'GET' || req.method === 'DELETE') {
        const sid = getMcpSessionId(req);
        const transport = sid ? mcpSessions.get(sid) : undefined;
        if (!transport) { res.writeHead(400); res.end('no valid session'); return; }
        await transport.handleRequest(req, res);
        if (req.method === 'DELETE' && sid) mcpSessions.delete(sid);
        return;
      }
      res.writeHead(405); res.end('method not allowed');
      return;
    }

    // MCP SSE(老协议,保留向后兼容):agent 在 URL 带 ?appKey=
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

    if (url.pathname === '/scene-events/ack' && req.method === 'POST') {
      // 浏览器执行场景命令后的回执上报(经 BFF 同源代理,带 appKey)。
      // 只接受合法载荷;记录失败静默(ack 是尽力而为通道)。
      if (!appKeyAuthorized(req, url)) {
        res.writeHead(401); res.end('unauthorized'); return;
      }
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 4096) req.destroy(); // 防超长载荷
      });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}') as {
            cmd_id?: unknown; tool?: unknown; status?: unknown; message?: unknown; result?: unknown;
          };
          if (typeof parsed.cmd_id === 'string' && parsed.cmd_id
              && (parsed.status === 'ok' || parsed.status === 'error')) {
            recordCommandStatus(
              parsed.cmd_id,
              typeof parsed.tool === 'string' ? parsed.tool : '',
              parsed.status,
              typeof parsed.message === 'string' ? parsed.message.slice(0, 200) : undefined,
              parsed.result,
            );
          }
          res.writeHead(204); res.end();
        } catch (err) {
          console.error('[mcp] /scene-events/ack parse failed:', err);
          res.writeHead(400); res.end('bad json');
        }
      });
      return;
    }

    if (url.pathname === '/scene-events') {
      // 订阅命令流需 appKey(与 /sse 一致)。浏览器经 BFF /api/scene-events
      // 带 appKey 代理订阅,避免公网匿名监听操作命令流。
      if (!appKeyAuthorized(req, url)) {
        res.writeHead(401); res.end('unauthorized'); return;
      }
      // cors() 已设 ACAO;这里补 SSE 专属头
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
      // 心跳:空闲时定期发 SSE 注释行(': ping'),客户端忽略,但能刷新中间代理
      // (如 nginx 默认 proxy_read_timeout 60s)的空闲计时,避免长连接被静默断开。
      const hbMs = opts.heartbeatMs && opts.heartbeatMs > 0 ? opts.heartbeatMs : 15000;
      const heartbeat = setInterval(() => res.write(': ping\n\n'), hbMs);
      // command-bus 已对 listener 做错误隔离,这里无需再 try/catch
      const unsub = subscribeCommands((c) => res.write(`data: ${JSON.stringify(c)}\n\n`));
      req.on('close', () => { clearInterval(heartbeat); unsub(); res.end(); });
      return;
    }

    res.writeHead(404); res.end('not found');
  });

  httpServer.listen(opts.port, () => {
    console.log(`[mcp] listening on :${opts.port} (SSE=/sse)`);
  });
  return httpServer;
}
