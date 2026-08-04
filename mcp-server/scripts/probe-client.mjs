#!/usr/bin/env node
// MCP 连通性探针:模拟 agent 用 SSE 连 mcp-server,完成握手并列出工具。
// 用于排查 "agent 后台看不到工具" 类问题。
//
// 用法(在 mcp-server 目录):
//   连服务器(外网验证):  node --env-file=.env scripts/probe-client.mjs http://111.75.149.221:8787
//   连本地 mcp:          node --env-file=.env scripts/probe-client.mjs http://localhost:8787
//   临时指定 key:        MCP_APP_KEY=xxx node scripts/probe-client.mjs http://host:8787
//
// 退出码:0=成功列出工具;1=缺 appKey;2=连接/握手失败
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const base = process.argv[2] || 'http://localhost:8787';
const appKey = process.env.MCP_APP_KEY;
if (!appKey) {
  console.error('❌ 未设置 MCP_APP_KEY(用 --env-file=.env 加载,或 MCP_APP_KEY=xxx 前置)');
  process.exit(1);
}

const url = new URL(`${base}/sse`);
url.searchParams.set('appKey', appKey);
console.log(`→ 连接 ${url.origin}${url.pathname} (appKey 长度 ${appKey.length})`);

const transport = new SSEClientTransport(url);
const client = new Client({ name: 'probe', version: '0.0.1' }, { capabilities: {} });

try {
  await client.connect(transport);
  console.log('✅ MCP 握手成功');
  const { tools } = await client.listTools();
  console.log(`✅ 工具列表(${tools.length}): ${tools.map((t) => t.name).join(', ') || '(空)'}`);
  await client.close();
  process.exit(0);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('401')) {
    console.error('❌ 401:appKey 与服务器 MCP_APP_KEY 不一致(或服务器 .env 未配)');
  } else if (msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
    console.error('❌ 连接失败:网络不可达 / 端口未开 / 地址错误:', msg);
  } else {
    console.error('❌ 握手失败:', msg);
  }
  process.exit(2);
}
