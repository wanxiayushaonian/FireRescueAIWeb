// 演练对抗·对抗舱 agent 接入层(纯逻辑,可注入 fake postChat 单测)。
// 职责:触发三 agent 并解析 SSE tool-call → 对抗舱数据。契约以
// plan/drill-agent-chat-sse-format.md 实测记录为准,解析失败安全降级 null。
import {
  postAgentChat,
  parseAgentChatSSE,
  type PostAgentChatParams,
  type ToolCallEvent,
} from '@/lib/agent-chat-client';
import { evaluateViaAgent } from '@/lib/agent-evaluate';
import type { ConfrontationSeed } from './confront-store';

export interface AdapterDeps {
  readonly postChat?: (p: PostAgentChatParams) => Promise<ReadableStream<Uint8Array>>;
  readonly logger?: { warn(...a: unknown[]): void; debug(...a: unknown[]): void };
}

export interface AdapterCtx {
  readonly appId: string;
  readonly buildingId: string;
  readonly sceneId: string;
  readonly drillId: string;
  readonly seed: ConfrontationSeed;
}

function narrowObject(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return undefined;
}

function toStr(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function toFinite(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 多路径取值(Task 0 deferred 裁定):先查 nested 对象,再查顶层 args。
 * 兼容 `args.event.payload.xxx` 嵌套结构与 `args.xxx` 顶层平铺结构两种契约形态。
 * 返回 undefined 表示两路径都缺。
 */
function pickStr(args: Record<string, unknown>, nested: Record<string, unknown> | undefined, key: string): string | undefined {
  return toStr(nested?.[key]) ?? toStr(args[key]);
}

function pickFinite(args: Record<string, unknown>, nested: Record<string, unknown> | undefined, key: string): number | undefined {
  return toFinite(nested?.[key]) ?? toFinite(args[key]);
}

/** 从 SSE 流里取首个指定 toolName 的 tool-call(args 已 JSON.parse)。 */
async function firstToolCall(
  stream: ReadableStream<Uint8Array>,
  toolName: string,
): Promise<ToolCallEvent | null> {
  for await (const ev of parseAgentChatSSE(stream)) {
    if (ev.type === 'tool-call' && ev.toolName === toolName) return ev;
  }
  return null;
}

/** 取首个 text 事件并按标点拆成非空短句。 */
async function extractTextLines(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  for await (const ev of parseAgentChatSSE(stream)) {
    if (ev.type === 'text') {
      const content = typeof ev.content === 'string' ? ev.content : '';
      const lines = content
        .split(/[,，。;；]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return lines;
    }
  }
  return [];
}

export class ConfrontAdapter {
  private readonly postChat: (p: PostAgentChatParams) => Promise<ReadableStream<Uint8Array>>;
  private readonly logger: { warn(...a: unknown[]): void; debug(...a: unknown[]): void };

  constructor(deps: AdapterDeps = {}) {
    this.postChat = deps.postChat ?? postAgentChat;
    this.logger = deps.logger ?? { warn: console.warn.bind(console), debug: console.debug.bind(console) };
  }

  private async run(content: string, ctx: AdapterCtx): Promise<ReadableStream<Uint8Array>> {
    this.logger.debug('[confront-adapter] run', { appId: ctx.appId, buildingId: ctx.buildingId, sceneId: ctx.sceneId, drillId: ctx.drillId, contentLength: content.length });
    return this.postChat({
      content,
      app_id: ctx.appId,
      forwardedProps: {
        scene_id: ctx.sceneId,
        building_id: ctx.buildingId,
        drill_id: ctx.drillId,
        status: { fireFloor: ctx.seed.floor, trappedCount: ctx.seed.trapped },
      },
    });
  }

  /** 预案输出 agent:生成初步部署(解析 report_decision 或 text 摘要)。 */
  async generateInitialPlan(ctx: AdapterCtx): Promise<{ deployLines: string[] } | null> {
    try {
      const stream = await this.run(
        `[对抗开局] 演练开始:${ctx.seed.building} ${ctx.seed.floor} ${ctx.seed.material}起火,被困${ctx.seed.trapped}人。` +
          '请调用 report_decision 上报初步部署决策(action=部署方案,rationale=处置要点)。',
        ctx,
      );
      // 优先 report_decision tool-call;没有时回退到 text 内容
      const tc = await firstToolCall(stream, 'report_decision');
      const args = narrowObject(tc?.args);
      if (args) {
        const decision = narrowObject(args.decision);
        // 多路径:decision 嵌套或 args 顶层
        const action = pickStr(args, decision, 'action');
        const rationale = pickStr(args, decision, 'rationale');
        const deployLines: string[] = [];
        if (action) deployLines.push(action);
        if (rationale) deployLines.push(rationale);
        if (deployLines.length > 0) return { deployLines };
      }
      // text 回退:把首个 text 事件按逗号/句号拆成部署行
      const textLines = await extractTextLines(stream);
      if (textLines.length > 0) return { deployLines: textLines };
      return { deployLines: [`${ctx.seed.building} ${ctx.seed.floor} 灭火救援处置`] };
    } catch (err) {
      this.logger.warn('[confront-adapter] generateInitialPlan 失败:', err);
      return null;
    }
  }

  /** 对抗 agent:注入特情(解析 inject_event)。 */
  async injectSpecial(
    ctx: AdapterCtx,
    statusLine: string,
  ): Promise<{ emergency: string; location?: string; delta?: { fireLevelDelta?: number; trappedDelta?: number; damageDelta?: number } } | null> {
    try {
      const stream = await this.run(
        `[导调触发] drill_id=${ctx.drillId}\n当前态势:${statusLine}\n` +
          '请调用 inject_event 注入一个突发特情(event.type/description/payload.location/payload.fireLevelDelta 等)。',
        ctx,
      );
      const tc = await firstToolCall(stream, 'inject_event');
      const args = narrowObject(tc?.args);
      if (!args) return null;
      const event = narrowObject(args.event);
      // 多路径:event 嵌套或 args 顶层
      const type = pickStr(args, event, 'type');
      const description = pickStr(args, event, 'description');
      const payload = narrowObject(event?.payload) ?? narrowObject(args.payload);
      const location = pickStr(args, payload, 'location');
      const emergency = description ?? (type ? `突发特情:${type}` : null);
      if (!emergency) return null;
      const fireLevelDelta = pickFinite(args, payload, 'fireLevelDelta');
      const trappedDelta = pickFinite(args, payload, 'trappedDelta');
      const damageDelta = pickFinite(args, payload, 'damageDelta');
      const delta =
        fireLevelDelta !== undefined || trappedDelta !== undefined || damageDelta !== undefined
          ? { fireLevelDelta, trappedDelta, damageDelta }
          : undefined;
      return { emergency, location, delta };
    } catch (err) {
      this.logger.warn('[confront-adapter] injectSpecial 失败:', err);
      return null;
    }
  }

  /** 预案输出 agent:对特情给动态调整(解析 report_decision action/rationale)。 */
  async generateAdjustment(
    ctx: AdapterCtx,
    injectText: string,
  ): Promise<{ adjustments: string[] } | null> {
    try {
      const stream = await this.run(
        `[特情响应] 突发特情:${injectText}\n请调用 report_decision 给出部署/战法动态调整(action=调整动作,rationale=依据)。`,
        ctx,
      );
      const tc = await firstToolCall(stream, 'report_decision');
      const args = narrowObject(tc?.args);
      if (!args) return null;
      const decision = narrowObject(args.decision);
      const action = pickStr(args, decision, 'action');
      const rationale = pickStr(args, decision, 'rationale');
      const adjustments: string[] = [];
      if (action) adjustments.push(action);
      if (rationale) adjustments.push(rationale);
      if (adjustments.length === 0) return null;
      return { adjustments };
    } catch (err) {
      this.logger.warn('[confront-adapter] generateAdjustment 失败:', err);
      return null;
    }
  }

  /** 评估 agent:复用 lib/agent-evaluate.ts(失败返回 null,调用方降级)。 */
  async evaluateDrill(input: Parameters<typeof evaluateViaAgent>[0]): Promise<ReturnType<typeof evaluateViaAgent>> {
    try {
      return await evaluateViaAgent(input);
    } catch (err) {
      this.logger.warn('[confront-adapter] evaluateDrill 失败:', err);
      return null;
    }
  }
}
