import { describe, it, expect, afterEach } from 'vitest';
import type { Server } from 'node:http';
import { startHttp } from '../http.js';

const APP_KEY = 'test-key-123';
const openServers: Server[] = [];

function start(corsOrigin = '', heartbeatMs?: number): Promise<{ port: number }> {
  return new Promise((resolve, reject) => {
    const server = startHttp({ port: 0, appKey: APP_KEY, corsOrigin, heartbeatMs });
    openServers.push(server);
    server.on('listening', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      if (port) resolve({ port });
      else reject(new Error('no port'));
    });
    server.on('error', reject);
  });
}

afterEach(async () => {
  while (openServers.length) {
    const s = openServers.pop()!;
    await new Promise<void>((r) => s.close(() => r()));
  }
});

async function statusOf(url: string, init?: RequestInit): Promise<number> {
  const res = await fetch(url, init);
  const status = res.status;
  // SSE / 流式响应主动取消,避免连接挂起
  await res.body?.cancel().catch(() => {});
  return status;
}

describe('http 鉴权与路由', () => {
  it('/sse 无 appKey → 401', async () => {
    const { port } = await start();
    expect(await statusOf(`http://localhost:${port}/sse`)).toBe(401);
  });

  it('/sse 错误 appKey → 401', async () => {
    const { port } = await start();
    expect(await statusOf(`http://localhost:${port}/sse?appKey=wrong`)).toBe(401);
  });

  it('/sse 正确 appKey → 非 401(建立 SSE)', async () => {
    const { port } = await start();
    const s = await statusOf(`http://localhost:${port}/sse?appKey=${APP_KEY}`);
    expect(s).not.toBe(401);
  });

  it('/scene-events 未配白名单 → 放行 200', async () => {
    const { port } = await start('');
    expect(await statusOf(`http://localhost:${port}/scene-events`)).toBe(200);
  });

  it('/scene-events CORS_ORIGIN=* 视为放行所有(不挡任意 Origin)', async () => {
    const { port } = await start('*');
    expect(await statusOf(`http://localhost:${port}/scene-events`, {
      headers: { Origin: 'https://evil.example.com' },
    })).toBe(200);
  });

  it('/scene-events 配白名单且 Origin 不匹配 → 403', async () => {
    const { port } = await start('https://app.example.com');
    expect(await statusOf(`http://localhost:${port}/scene-events`, {
      headers: { Origin: 'https://evil.example.com' },
    })).toBe(403);
  });

  it('/scene-events 配白名单且 Origin 匹配 → 200', async () => {
    const { port } = await start('https://app.example.com');
    expect(await statusOf(`http://localhost:${port}/scene-events`, {
      headers: { Origin: 'https://app.example.com' },
    })).toBe(200);
  });

  it('未知路径 → 404', async () => {
    const { port } = await start();
    expect(await statusOf(`http://localhost:${port}/nope`)).toBe(404);
  });

  it('/scene-events 空闲时按 heartbeatMs 发送心跳(防代理空闲断开)', async () => {
    const { port } = await start('', 30);
    const ac = new AbortController();
    const res = await fetch(`http://localhost:${port}/scene-events`, { signal: ac.signal });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let gotPing = false;
    const readLoop = (async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        if (buf.includes(': ping')) { gotPing = true; break; }
      }
    })();
    await Promise.race([readLoop, new Promise((r) => setTimeout(r, 1500))]);
    ac.abort();
    await readLoop.catch(() => {});
    expect(gotPing).toBe(true);
  });
});
