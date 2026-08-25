// 演练对抗·云端 MCP 链路实测(2026-08-24,假浏览器模式,不用真实浏览器)。
// 验证:mcp tools 注册 → drill_inject_event/drill_report_decision 下发
//   → /scene-events SSE(BFF 代理)送达"浏览器" → 假执行 → ack 回传
//   → get_scene_command_status 查询回执 → query_scene_state 观测计数。
// 前置:mcp-server 已在 :8787 运行(tsx src/index.ts),web dev 已在 :3000 运行。
// 用法:node scripts/live-mcp-chain-test.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(resolve(HERE, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const APP_KEY = env.MCP_APP_KEY;
const BFF = process.env.DRILL_TEST_BFF || 'http://localhost:3000';
const MCP = process.env.DRILL_TEST_MCP || 'http://localhost:8787';
const DRILL_ID = `live-chain-${Date.now().toString(36)}`;

const results = { checks: [], commands: [] };
const check = (name, ok, detail = '') => {
  results.checks.push({ name, ok, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`);
};

// ===== 1. 假浏览器:订阅 BFF /api/scene-events SSE =====
console.log('── 1. 假浏览器订阅 %s/api/scene-events', BFF);
const sseRes = await fetch(`${BFF}/api/scene-events`, { headers: { Accept: 'text/event-stream' } });
if (!sseRes.ok || !sseRes.body) {
  console.error('FAIL: SSE 订阅失败', sseRes.status);
  process.exit(1);
}
const sseReader = sseRes.body.getReader();
const sseDecoder = new TextDecoder();
let sseBuf = '';
const received = [];
let sseResolve = null;
(async () => {
  while (true) {
    const { value, done } = await sseReader.read();
    if (done) break;
    sseBuf += sseDecoder.decode(value, { stream: true });
    const lines = sseBuf.split('\n');
    sseBuf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      try {
        const cmd = JSON.parse(t.slice(5).trimStart());
        if (cmd && cmd.id && cmd.tool) {
          received.push(cmd);
          console.log('  ← SSE 收到命令:', cmd.tool, cmd.id);
          sseResolve?.(cmd);
        }
      } catch { /* 心跳/非 JSON 行跳过 */ }
    }
  }
})();
const nextCommand = (timeoutMs = 6000) =>
  new Promise((resolveP) => {
    const timer = setTimeout(() => { sseResolve = null; resolveP(null); }, timeoutMs);
    sseResolve = (cmd) => { clearTimeout(timer); sseResolve = null; resolveP(cmd); };
  });
check('SSE 订阅建立', true, 'BFF 代理已连上 mcp /scene-events');

// ===== 2. MCP client 连接 + tools/list =====
console.log('── 2. MCP client 连接 %s/mcp', MCP);
const transport = new StreamableHTTPClientTransport(new URL(`${MCP}/mcp`), {
  requestInit: { headers: { 'x-app-key': APP_KEY } },
});
const client = new Client({ name: 'live-chain-test', version: '0.0.1' });
await client.connect(transport);
const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
check('MCP 连接 + tools/list', true, `${tools.length} 个工具`);
for (const t of ['inject_event', 'report_decision', 'query_scene_state', 'get_scene_command_status']) {
  check(`工具已注册: ${t}`, names.includes(t));
}
const textOf = (res) => (res.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');

// ===== 3. drill_inject_event → SSE 送达 → ack → status =====
console.log('── 3. drill_inject_event 全链路');
let res = await client.callTool({
  name: 'inject_event',
  arguments: {
    drill_id: DRILL_ID,
    event: { type: 'explosion', description: '链路实测:配电间冒烟', payload: { location: '5F', fireLevelDelta: 1 } },
  },
});
const injectAck = textOf(res);
check('inject_event 返回 accepted', injectAck.includes('"accepted":true') || injectAck.includes('accepted'), injectAck.slice(0, 120).replace(/\n/g, ' '));

const cmd1 = await nextCommand();
check('SSE 送达 drill_inject_event 命令', !!cmd1 && cmd1.tool === 'drill_inject_event', cmd1 ? `id=${cmd1.id}` : '超时未收到');

if (cmd1) {
  const ackRes = await fetch(`${BFF}/api/scene-events/ack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd_id: cmd1.id, tool: cmd1.tool, status: 'ok', message: '假浏览器已执行 appendInject' }),
  });
  check('ack 上报(BFF→mcp)', ackRes.status === 204, `HTTP ${ackRes.status}`);

  res = await client.callTool({ name: 'get_scene_command_status', arguments: { cmd_id: cmd1.id } });
  const statusText = textOf(res);
  check('get_scene_command_status = ok', statusText.includes('"ok"') || statusText.includes(': ok'), statusText.slice(0, 160).replace(/\n/g, ' '));
}

// ===== 4. drill_report_decision 链路 =====
console.log('── 4. drill_report_decision 全链路');
res = await client.callTool({
  name: 'report_decision',
  arguments: { drill_id: DRILL_ID, decision: { action: '链路实测:增派排烟组', rationale: '配电间烟雾浓度上升' } },
});
check('report_decision 返回 accepted', textOf(res).includes('accepted'));
const cmd2 = await nextCommand();
check('SSE 送达 drill_report_decision 命令', !!cmd2 && cmd2.tool === 'drill_report_decision', cmd2 ? `id=${cmd2.id}` : '超时未收到');
if (cmd2) {
  await fetch(`${BFF}/api/scene-events/ack`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd_id: cmd2.id, tool: cmd2.tool, status: 'ok' }),
  });
  res = await client.callTool({ name: 'get_scene_command_status', arguments: { cmd_id: cmd2.id } });
  check('decision ack 可查', textOf(res).includes('ok'));
}

// ===== 5. query_scene_state 观测计数 =====
console.log('── 5. query_scene_state 观测');
res = await client.callTool({ name: 'query_scene_state', arguments: { drill_id: DRILL_ID } });
const stateText = textOf(res);
check('loggedEvents=1', stateText.includes('"loggedEvents":1') || stateText.includes('"loggedEvents": 1'), '');
check('loggedDecisions=1', stateText.includes('"loggedDecisions":1') || stateText.includes('"loggedDecisions": 1'), '');

// ===== 6. 负向:未知 cmd_id / 缺 drill_id =====
console.log('── 6. 负向校验');
res = await client.callTool({ name: 'get_scene_command_status', arguments: { cmd_id: 'cmd_not_exist_000' } });
check('未知 cmd → not_found', textOf(res).includes('not_found'));
res = await client.callTool({ name: 'inject_event', arguments: { event: {} } });
check('缺 drill_id 被拒', textOf(res).includes('缺少 drill_id'));

// ===== 7. 未授权负向(无 appKey 直连 mcp) =====
const unauth = await fetch(`${MCP}/scene-events`, { headers: { Accept: 'text/event-stream' } }).catch(() => null);
check('无 appKey 订阅被拒(401)', unauth?.status === 401, `HTTP ${unauth?.status}`);

await client.close();
sseReader.cancel().catch(() => {});

const failed = results.checks.filter((c) => !c.ok);
console.log('\n===== 汇总: %d/%d 通过 =====', results.checks.length - failed.length, results.checks.length);
process.exit(failed.length ? 1 : 0);
