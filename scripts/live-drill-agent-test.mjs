// 演练对抗·三 agent 链路实测脚本(2026-08-24,不使用浏览器)。
// 完全复刻 ConfrontAdapter / evaluateViaAgent 的 prompt、forwardedProps、SSE 解析与
// 多路径取值逻辑,经同源 BFF(localhost:3000/uagent-service → AGENT_GATEWAY)真实调用平台 agent。
// 用法:node scripts/live-drill-agent-test.mjs [--skip-evaluate]
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---- 读 .env.local(与 next dev 同源) ----
const env = {};
for (const line of readFileSync(resolve(WEB_ROOT, '.env.local'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const BFF = process.env.DRILL_TEST_BFF || 'http://localhost:3000';
const APP_KEY = env.NEXT_PUBLIC_X_APP_KEY || '';
const COMMANDER_APP_ID = '2087535122373074946';
const DRILL_COMMANDER = (env.NEXT_PUBLIC_DRILL_COMMANDER_APP_ID || '').trim() || COMMANDER_APP_ID;
const PLANNER = (env.NEXT_PUBLIC_DRILL_PLANNER_APP_ID || '').trim() || DRILL_COMMANDER;
const ADVERSARY = (env.NEXT_PUBLIC_ADVERSARY_APP_ID || '').trim();
const EVALUATE = (env.NEXT_PUBLIC_EVALUATE_APP_ID || '').trim();

const BUILDING_21_SCENE_ID = '478488321394200576';
const BUILDING_21_ID = '1c2d4772-831d-4c77-b88a-f9565ad589c7';
const DRILL_ID = 'drill-building-21-001';
const SEED = { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#T3ST' };

if (!APP_KEY) { console.error('FAIL: NEXT_PUBLIC_X_APP_KEY 未配置'); process.exit(1); }

// ---- postAgentChat 复刻(相对路径换成 BFF 绝对地址) ----
async function postAgentChat({ content, app_id, forwardedProps, signal }) {
  const res = await fetch(`${BFF}/uagent-service/api/agent/v1/apps/agent-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', 'X-App-Key': APP_KEY },
    body: JSON.stringify({ content, app_id, forwarded_props: forwardedProps ?? {}, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '');
    throw new Error(`agent-chat ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.body;
}

// ---- parseAgentChatSSE 复刻 ----
async function* parseSSE(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  const safeJsonParse = (v) => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };
  const parseLine = (line) => {
    const t = line.trim();
    if (!t.startsWith('data:')) return null;
    const p = t.slice(5).trimStart();
    if (!p || p === '[DONE]') return null;
    try { return JSON.parse(p); } catch { return null; }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        const ev = parseLine(line);
        if (!ev || !ev.type) continue;
        if (ev.type === 'tool-call' || ev.type === 'tool-result') {
          const key = ev.type === 'tool-call' ? 'args' : 'result';
          ev[key] = safeJsonParse(ev[key]);
        }
        yield ev;
      }
    }
    buffer += decoder.decode();
    if (buffer) { const ev = parseLine(buffer); if (ev) yield ev; }
  } finally { reader.releaseLock(); }
}

// ---- 复刻 adapter 的多路径取值 ----
const narrowObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : undefined);
const toStr = (v) => (typeof v === 'string' && v !== '' ? v : undefined);
const toFinite = (v) => (v == null ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
const pickStr = (args, nested, key) => toStr(nested?.[key]) ?? toStr(args[key]);
const pickFinite = (args, nested, key) => toFinite(nested?.[key]) ?? toFinite(args[key]);

async function firstToolCall(stream, toolName, stats) {
  for await (const ev of stream) {
    if (stats) {
      stats.events[ev.type] = (stats.events[ev.type] ?? 0) + 1;
      if (ev.type === 'tool-call') stats.toolCalls.push(ev.toolName);
    }
    if (ev.type === 'tool-call' && ev.toolName === toolName) return ev;
  }
  return null;
}
async function extractTextLines(stream, stats) {
  for await (const ev of stream) {
    if (stats) stats.events[ev.type] = (stats.events[ev.type] ?? 0) + 1;
    if (ev.type === 'text') {
      return String(ev.content ?? '').split(/[,，。;；]/).map((s) => s.trim()).filter((s) => s.length > 0);
    }
  }
  return [];
}

const ctx = (appId) => ({
  appId,
  forwardedProps: {
    scene_id: BUILDING_21_SCENE_ID,
    building_id: BUILDING_21_ID,
    drill_id: DRILL_ID,
    status: { fireFloor: SEED.floor, trappedCount: SEED.trapped },
  },
});

async function runAgent(appId, content, timeoutMs = 90_000) {
  const t0 = Date.now();
  const stream = await postAgentChat({ content, app_id: appId, forwardedProps: ctx(appId).forwardedProps, signal: AbortSignal.timeout(timeoutMs) });
  return { stream, t0 };
}
const elapsed = (t0) => ((Date.now() - t0) / 1000).toFixed(1) + 's';

const report = { steps: {}, rawQuality: {} };

// ===== 1. 初步部署(planner) =====
console.log('── 1/4 初步部署 generateInitialPlan → planner', PLANNER.slice(0, 8) + '…');
{
  const stats = { events: {}, toolCalls: [] };
  const { stream, t0 } = await runAgent(PLANNER,
    `[对抗开局] 演练开始:${SEED.building} ${SEED.floor} ${SEED.material}起火,被困${SEED.trapped}人。` +
    '请调用 report_decision 上报初步部署决策(action=部署方案,rationale=处置要点)。');
  const tc = await firstToolCall(parseSSE(stream), 'report_decision', stats);
  const args = narrowObj(tc?.args);
  let deployLines = null, via = null;
  if (args) {
    const decision = narrowObj(args.decision);
    const action = pickStr(args, decision, 'action');
    const rationale = pickStr(args, decision, 'rationale');
    deployLines = [action, rationale].filter(Boolean);
    via = 'tool-call';
    report.rawQuality.initialPlanArgsShape = decision ? 'nested(decision)' : 'flat(args)';
  }
  if (!deployLines?.length) { via = 'fallback(static)'; deployLines = [`${SEED.building} ${SEED.floor} 灭火救援处置`]; }
  report.steps.initialPlan = { ok: via === 'tool-call', via, latency: elapsed(t0), deployLines, stats };
  console.log(`   via=${via} latency=${report.steps.initialPlan.latency} events=${JSON.stringify(stats.events)} tools=${stats.toolCalls.join(',') || '(none)'}`);
  deployLines.forEach((l) => console.log('   ·', l));
}

// ===== 2. 特情注入(adversary) =====
const adversaryApp = ADVERSARY || PLANNER;
console.log('\n── 2/4 特情注入 injectSpecial → adversary', adversaryApp.slice(0, 8) + '…', ADVERSARY ? '' : '(回退 planner!)');
let injected = null;
{
  const stats = { events: {}, toolCalls: [] };
  const statusLine = `火势=1级;${SEED.floor} ${SEED.material}起火;被困${SEED.trapped}人`;
  const { stream, t0 } = await runAgent(adversaryApp,
    `[导调触发] drill_id=${DRILL_ID}\n当前态势:${statusLine}\n` +
    '请调用 inject_event 注入一个突发特情(event.type/description/payload.location/payload.fireLevelDelta 等)。');
  const tc = await firstToolCall(parseSSE(stream), 'inject_event', stats);
  const args = narrowObj(tc?.args);
  if (args) {
    const event = narrowObj(args.event);
    const type = pickStr(args, event, 'type');
    const description = pickStr(args, event, 'description');
    const payload = narrowObj(event?.payload) ?? narrowObj(args.payload);
    const location = pickStr(args, payload, 'location');
    const emergency = description ?? (type ? `突发特情:${type}` : null);
    if (emergency) {
      injected = { emergency, location, type };
      report.rawQuality.injectArgsShape = event ? 'nested(event)' : 'flat(args)';
      report.rawQuality.injectPayload = payload ?? null;
    }
  }
  report.steps.inject = { ok: !!injected, latency: elapsed(t0), injected, stats };
  console.log(`   ok=${!!injected} latency=${report.steps.inject.latency} events=${JSON.stringify(stats.events)} tools=${stats.toolCalls.join(',') || '(none)'}`);
  if (injected) console.log(`   特情=${injected.emergency}\n   location=${injected.location ?? '(无)'} type=${injected.type ?? '(无)'}`);
}

// ===== 3. 动态调整(commander,串联真实特情) =====
console.log('\n── 3/4 动态调整 generateAdjustment → commander(以上一步真实特情为输入)');
{
  const injectText = injected?.emergency ?? '5F 强电井火势沿电缆竖向蔓延至 8F';
  const stats = { events: {}, toolCalls: [] };
  const { stream, t0 } = await runAgent(DRILL_COMMANDER,
    `[指挥调整] 突发特情:${injectText}\n请调用 report_decision 给出部署/战法动态调整(action=调整动作,rationale=依据)。`);
  const tc = await firstToolCall(parseSSE(stream), 'report_decision', stats);
  const args = narrowObj(tc?.args);
  let adjustments = null;
  if (args) {
    const decision = narrowObj(args.decision);
    adjustments = [pickStr(args, decision, 'action'), pickStr(args, decision, 'rationale')].filter(Boolean);
  }
  report.steps.adjustment = { ok: !!adjustments?.length, latency: elapsed(t0), injectText, adjustments, stats };
  console.log(`   ok=${!!adjustments?.length} latency=${report.steps.adjustment.latency} events=${JSON.stringify(stats.events)} tools=${stats.toolCalls.join(',') || '(none)'}`);
  (adjustments ?? []).forEach((l) => console.log('   ·', l));
}

// ===== 4. 评估(evaluate agent,复刻 evaluateViaAgent) =====
if (process.argv.includes('--skip-evaluate')) {
  console.log('\n── 4/4 评估跳过(--skip-evaluate)');
} else {
  console.log('\n── 4/4 结束评估 evaluateDrill → evaluate', EVALUATE ? EVALUATE.slice(0, 8) + '…' : '(未配置→fallback!)');
  if (!EVALUATE) {
    report.steps.evaluate = { ok: false, reason: 'EVALUATE_APP_ID 未配置,生产必然 fallback 降级' };
  } else {
    const process_data = {
      building: SEED.building, floor: SEED.floor, material: SEED.material, trapped: SEED.trapped,
      elapsedSec: 188,
      injectCount: injected ? 1 : 0,
      adjustCount: report.steps.adjustment?.adjustments?.length ? 1 : 0,
      outcomes: ['timely'],
      initialPlan: report.steps.initialPlan?.deployLines ?? [],
      finalSituation: { fireLevel: 2, trappedCount: SEED.trapped, damageLevel: 0 },
      uniqueSpecialTypes: injected?.type ? [injected.type] : [],
      timeline: [
        ...(injected ? [{
          kind: 'inject',
          specialType: injected.type,
          emergency: injected.emergency,
          location: injected.location,
          delta: report.rawQuality.injectPayload ?? {},
          tSec: 61,
        }] : []),
        ...(report.steps.adjustment?.adjustments?.length ? [{
          kind: 'adjust',
          adjustments: report.steps.adjustment.adjustments,
          adopted: true,
          respondedWithinSec: 26,
          tSec: 87,
        }] : []),
      ],
    };
    const prompt = `你是消防救援预案评估专家。请根据给定的过程数据，完成客观、专业的评估。
只输出一个 JSON 对象，不要输出任何其他文字。JSON 结构：
{
  "score": 0-100 的整数（综合得分）,
  "conclusion": "一句话总评",
  "opinions": ["评估要点 1", "评估要点 2", "评估要点 3"],
  "dimensions": [{"name": "维度名", "score": 0-100, "comment": "评语"}],
  "improvements": [{"content": "改进措施", "target": "回流对象（如 某某预案·力量编成节）"}]
}

评估对象：${SEED.building} 对抗演练评估

过程数据：
${JSON.stringify(process_data)}`;
    const stats = { events: {}, toolCalls: [] };
    const t0 = Date.now();
    const stream = await postAgentChat({ content: prompt, app_id: EVALUATE, forwardedProps: {}, signal: AbortSignal.timeout(60_000) });
    const parts = [];
    for await (const ev of parseSSE(stream)) {
      stats.events[ev.type] = (stats.events[ev.type] ?? 0) + 1;
      if (ev.type === 'text' && ev.content) parts.push(ev.content);
      if (ev.type === 'finish') break;
    }
    const text = parts.join('');
    // parseEvaluateJson 复刻(剥 fence / 首尾花括号)
    let parsed = null;
    let body = text.trim();
    const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) body = fence[1].trim();
    else { const s = body.indexOf('{'), e = body.lastIndexOf('}'); if (s >= 0 && e > s) body = body.slice(s, e + 1); }
    try {
      const o = JSON.parse(body);
      const score = Number(o.score);
      if (Number.isFinite(score) && score >= 0 && score <= 100) {
        parsed = { score, conclusion: o.conclusion ?? '', opinions: (o.opinions ?? []).slice(0, 8), dimensions: o.dimensions ?? [], improvements: o.improvements ?? [] };
      }
    } catch { parsed = null; }
    report.steps.evaluate = { ok: !!parsed, latency: elapsed(t0), parsed, rawTextHead: text.slice(0, 400), stats };
    console.log(`   ok=${!!parsed} latency=${report.steps.evaluate.latency} events=${JSON.stringify(stats.events)}`);
    if (parsed) {
      console.log(`   score=${parsed.score} conclusion=${parsed.conclusion}`);
      parsed.opinions.forEach((o) => console.log('   ·', o));
    } else {
      console.log('   原文头部:', text.slice(0, 200));
    }
  }
}

console.log('\n===== 汇总 =====');
console.log(JSON.stringify(report, null, 2));
