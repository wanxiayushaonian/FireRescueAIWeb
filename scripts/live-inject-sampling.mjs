// 特情 location 格式采样:连续 N 次调 adversary inject_event,统计 location 能否被
// 楼层聚焦解析器(parseFloorSpec 同款正则)命中。用法:node scripts/live-inject-sampling.mjs [N]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(resolve(WEB_ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BFF = process.env.DRILL_TEST_BFF || 'http://localhost:3000';
const APP_KEY = env.NEXT_PUBLIC_X_APP_KEY || '';
const ADVERSARY = (env.NEXT_PUBLIC_ADVERSARY_APP_ID || '').trim();
const N = Number(process.argv[2] ?? 3);

// parseFloorSpec 同款楼层 token 判定(锚定整串)
const parseFloorToken = (token) => {
  const m = /^(B)?F?(\d+)F?$/.exec(token.trim().toUpperCase());
  return m ? (m[1] ? -Number(m[2]) : Number(m[2])) : null;
};
const specHits = (spec) => {
  if (!spec) return false;
  const items = String(spec).split(/[,，、;；/]+/).map((x) => x.trim()).filter(Boolean);
  if (!items.length) return false;
  return items.every((it) => {
    const parts = it.split(/\s*[-–—~～至]\s*/);
    return parts.length <= 2 && parts.every((p) => parseFloorToken(p) !== null);
  });
};

let hit = 0, miss = 0;
for (let i = 0; i < N; i++) {
  const res = await fetch(`${BFF}/uagent-service/api/agent/v1/apps/agent-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-App-Key': APP_KEY },
    body: JSON.stringify({
      content: `[导调触发] drill_id=sampling-${i}\n当前态势:火势=1级;5F 电气起火;被困5人\n请调用 inject_event 注入一个突发特情(event.type/description/payload.location/payload.fireLevelDelta 等)。`,
      app_id: ADVERSARY,
      forwarded_props: { scene_id: '478488321394200576', building_id: '1c2d4772-831d-4c77-b88a-f9565ad589c7', drill_id: `sampling-${i}` },
      stream: true,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  // 找 inject_event tool-call 行
  let location = null, desc = null;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    try {
      const ev = JSON.parse(t.slice(5).trimStart());
      if (ev.type === 'tool-call' && ev.toolName === 'inject_event') {
        const args = typeof ev.args === 'string' ? JSON.parse(ev.args) : ev.args;
        location = args?.event?.payload?.location ?? args?.payload?.location ?? args?.location ?? null;
        desc = args?.event?.description ?? args?.description ?? null;
        break;
      }
    } catch { /* skip */ }
  }
  const ok = specHits(location);
  ok ? hit++ : miss++;
  console.log(`#${i + 1} location=${JSON.stringify(location)} → 楼层解析${ok ? '命中✓' : 'MISS✗'}  特情=${desc ?? '(无)'}`);
}
console.log(`\n采样 ${N} 次:楼层解析命中 ${hit},miss ${miss}(miss=3D 联动静默跳过)`);
