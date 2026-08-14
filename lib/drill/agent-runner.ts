/**
 * AgentRunner — 演练推演的 agent 编排闭环(纯逻辑,无 React/DOM 依赖)。
 *
 * 6.3 核心:事件/tick → 程序化 postAgentChat(5A)→ 流式收 SSE → 按 toolName 派发:
 * - report_decision/inject_event:本地镜像执行(写 EventBus + 记 DrillRecorder),驱动推演引擎
 * - batchInvokeTwinsFunction:仅记事件树(3D 由平台 WS 自动,spec §6.1)
 * - query_xxx / 编排 / 元数据类:忽略(态势已在 forwardedProps / 经 MCP→znya)
 *
 * MVP 架构决策(见 spec):
 * 1. 推演引擎 source of truth 在浏览器:EventBus/DisasterState/DrillRecorder 由调用方注入
 * 2. AgentRunner 本地镜像执行推演控制 tool_call(不依赖云端 MCP drill-control)
 * 3. 3D 执行平台 WS 自动,AgentRunner 不桥接,只记事件树
 * 4. forwardedProps = 当前态势(state.getStatus())
 * 5. 异步不阻塞 tick:agent 决策慢(30-100s),fire-and-forget
 * 6. 决策到达时用当前 clock 作 ts(非触发时 clock)
 * 7. postChat 可注入(默认 postAgentChat),支持测试
 * 8. 串行:同一 agent 的多次触发排队(promise 链),避免并发会话冲突
 */

import {
  postAgentChat,
  parseAgentChatSSE,
  type PostAgentChatParams,
  type ToolCallEvent,
  type AgentChatEvent,
} from '../agent-chat-client';
import { EventBus, genEventId } from './event-bus';
import type { DisasterState, Tactic } from './disaster-state';
import type { DrillRecorder } from './drill-recorder';

// ============================================================
// 类型定义
// ============================================================

/** 可注入的 postChat 函数(签名同 postAgentChat,便于测试替换)。 */
export type PostChatFn = (params: PostAgentChatParams) => Promise<ReadableStream<Uint8Array>>;

/** 日志接口(默认 console;测试可注入 spy)。 */
export interface DrillLogger {
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
}

/** AgentRunner 构造参数(依赖注入,调用方传入 bus/state/recorder)。 */
export interface AgentRunnerOptions {
  /** 指挥 agent 的 app_id(必填)。 */
  readonly commanderAppId: string;
  /** 对抗 agent 的 app_id(可选;缺省禁用对抗触发)。 */
  readonly adversaryAppId?: string;
  /** 建筑 id(forwardedProps)。 */
  readonly buildingId: string;
  /** 场景 id(forwardedProps)。 */
  readonly sceneId: string;
  /** 演练 id(forwardedProps + drillId 对齐)。 */
  readonly drillId: string;
  /** 事件池(注入 decision/special 事件)。 */
  readonly bus: EventBus;
  /** 灾情状态机(读 getStatus() 构造 forwardedProps + 取当前 clock)。 */
  readonly state: DisasterState;
  /** 事件树记录器(追加 decision/special/execution 节点)。 */
  readonly recorder: DrillRecorder;
  /** postChat 函数(默认 postAgentChat,测试可注入 fake)。 */
  readonly postChat?: PostChatFn;
  /** 对抗 agent 触发频率(每 N tick;0=禁用,默认 0)。 */
  readonly adversaryEveryNTicks?: number;
  /** 日志器(默认 console)。 */
  readonly logger?: DrillLogger;
}

/** agent 角色(区分指挥/对抗的串行队列)。 */
type AgentRole = 'commander' | 'adversary';

// ============================================================
// 安全窄化助手(防 NaN/throw,参考 disaster-state.ts 的 toOptFinite 风格)
// ============================================================

/** null/undefined/空串 → undefined,其余 String()。 */
function toOptStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v);
  return s === '' ? undefined : s;
}

/** 缺字段→undefined,非有限→undefined。special/decision 增量用。 */
function toOptFinite(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 安全窄化为只读对象(非 plain object → undefined)。 */
function narrowObject(v: unknown): Readonly<Record<string, unknown>> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

/**
 * 严格字符串窄化:仅 typeof === 'string' 且非空 → string,否则 undefined。
 * 用于 description 等需严格 string 的字段(对对象/数组 String() 会产生 [object Object]/逗号串,
 * 与 disaster-state.asSpecial 的 typeof===string 检查对齐,避免不对称)。
 */
function toOptStrictStr(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** tactic 合法值集合(与 disaster-state.VALID_TACTICS 一致,用于 agent 输出窄化)。 */
const VALID_TACTICS: ReadonlySet<string> = new Set<Tactic>([
  'water',
  'foam',
  'rescue',
  'ventilation',
]);

// ============================================================
// AgentRunner
// ============================================================

export class AgentRunner {
  private readonly options: AgentRunnerOptions;
  private readonly logger: DrillLogger;
  private readonly postChat: PostChatFn;
  /** 指挥 agent 串行队列(避免并发会话冲突)。 */
  private commanderChain: Promise<void> = Promise.resolve();
  /** 对抗 agent 串行队列。 */
  private adversaryChain: Promise<void> = Promise.resolve();
  /**
   * 按 app_id 缓存的 conversation_id(会话按 app 隔离,见 @dt-uagent/multi-agent-sdk "会话按 app_id 隔离")。
   * 串行队列保证同一 app 依次触发:首次触发流里收到 conversation_id 后缓存,
   * 后续触发经 postAgentChat({ conversationId }) 回传,维持推演多轮上下文。
   */
  private conversationIds = new Map<string, string>();

  /** 对抗 agent 互斥标记:onTick 触发时若上一个对抗未完成则跳过,防队列无界堆积(建议-3)。 */
  private adversaryInFlight = false;

  constructor(options: AgentRunnerOptions) {
    this.options = options;
    this.logger = options.logger ?? console;
    this.postChat = options.postChat ?? postAgentChat;
  }

  /**
   * TimelineEngine.onTick 回调:每 tick 检查是否触发对抗 agent。
   * clock>0 且 adversaryEveryNTicks>0 且 clock%N===0 时,fire-and-forget 触发(不 await)。
   */
  onTick(clock: number): void {
    if (clock <= 0) return;
    const n = this.options.adversaryEveryNTicks ?? 0;
    if (n <= 0) return;
    if (clock % n !== 0) return;
    // 互斥:上一个对抗 agent 未完成则跳过本 tick 触发(对抗 POST 30-100s,
    // 若每 tick 都 fire-and-forget 会导致 adversaryChain 无界堆积)。
    if (this.adversaryInFlight) return;
    this.adversaryInFlight = true;
    void this.triggerAdversary().finally(() => {
      this.adversaryInFlight = false;
    });
  }

  /**
   * 触发指挥 agent:POST 指挥 agent,流式收 SSE,派发 tool_call。
   * 串行:同一指挥 agent 的多次触发排队执行(promise 链)。
   *
   * @param causeEventId 上游逻辑 id(由调用方传入),同时挂接到 recorder 节点 parentId
   *   与 EventBus event.cause。注意:两者 id 空间独立(TreeNode id 与 DrillEvent id 不同前缀),
   *   调用方需自行保证因果链检索逻辑(6.4 EventTree 设计时统一)。
   */
  triggerCommander(triggerText: string, causeEventId?: string): Promise<void> {
    const run = this.commanderChain.then(() =>
      this.runAgent(this.options.commanderAppId, triggerText, 'commander', causeEventId),
    );
    // chain 存储吞错防断裂(runAgent 内部已 try/catch,此处 defense-in-depth)
    this.commanderChain = run.catch(() => {});
    return run;
  }

  /**
   * 触发对抗 agent:固定 content "根据当前态势,注入一个特情"。
   * adversaryAppId 未配置时 no-op。串行排队。
   *
   * @param causeEventId 同 triggerCommander,上游逻辑 id,挂接 parentId 与 event.cause。
   */
  triggerAdversary(causeEventId?: string): Promise<void> {
    const appId = this.options.adversaryAppId;
    if (!appId) {
      this.logger.debug('[agent-runner] adversaryAppId 未配置,跳过对抗触发');
      return Promise.resolve();
    }
    const run = this.adversaryChain.then(() =>
      this.runAgent(appId, '根据当前态势,注入一个特情', 'adversary', causeEventId),
    );
    this.adversaryChain = run.catch(() => {});
    return run;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 执行单次 agent POST + 流式收 SSE + 逐事件派发。
   * 顶层 try/catch:异常 logger.warn 不抛(单次失败不影响后续 tick/queue)。
   */
  private async runAgent(
    appId: string,
    content: string,
    role: AgentRole,
    causeEventId?: string,
  ): Promise<void> {
    try {
      const conversationId = this.conversationIds.get(appId);
      const stream = await this.postChat({
        content,
        app_id: appId,
        forwardedProps: this.buildForwardedProps(),
        ...(conversationId ? { conversationId } : {}),
      });
      for await (const ev of parseAgentChatSSE(stream)) {
        this.handleEvent(ev, role, causeEventId, appId);
      }
    } catch (err) {
      this.logger.warn(`[agent-runner] ${role} agent 执行失败(appId=${appId}):`, err);
    }
  }

  /** 构造 forwardedProps:场景/建筑/演练 id + 当前态势快照。 */
  private buildForwardedProps(): Record<string, unknown> {
    return {
      scene_id: this.options.sceneId,
      building_id: this.options.buildingId,
      drill_id: this.options.drillId,
      status: this.options.state.getStatus(),
    };
  }

  /** 逐事件分派:tool-call → dispatchToolCall;text/conversation_id → 简略处理;其余 debug。 */
  private handleEvent(ev: AgentChatEvent, role: AgentRole, causeEventId?: string, appId?: string): void {
    const clock = this.options.state.getStatus().clock;
    switch (ev.type) {
      case 'tool-call':
        this.dispatchToolCall(ev, clock, causeEventId);
        break;
      case 'conversation_id':
        // 按 app 缓存首个会话 id;已缓存则忽略(会话在服务端持续,无需覆盖)
        if (appId && !this.conversationIds.has(appId)) {
          this.conversationIds.set(appId, ev.conversation_id);
          this.logger.info(`[agent-runner] ${role} 会话 conversation_id=${ev.conversation_id} (app=${appId})`);
        }
        break;
      case 'text':
        // MVP:不强制挂到 decision/special 节点,仅 debug(避免噪声)
        this.logger.debug(`[agent-runner] ${role} text: ${ev.content}`);
        break;
      default:
        // reasoning/finish/timing/tool-result:MVP 不处理
        this.logger.debug(`[agent-runner] ${role} ${ev.type} 事件跳过`);
        break;
    }
  }

  /** tool-call 按 toolName 路由(见 6.3 spec 派发表)。 */
  private dispatchToolCall(ev: ToolCallEvent, clock: number, causeEventId?: string): void {
    switch (ev.toolName) {
      case 'report_decision':
        this.handleReportDecision(ev, clock, causeEventId);
        break;
      case 'inject_event':
        this.handleInjectEvent(ev, clock, causeEventId);
        break;
      case 'batchInvokeTwinsFunction':
        this.handleBatchInvoke(ev, clock, causeEventId);
        break;
      case 'query_scene_state':
      case 'query_building_profile':
      case 'query_facilities':
      case 'query_key_parts':
        // 态势已在 forwardedProps / 经 MCP→znya,忽略
        break;
      case 'task':
      case 'spacequery':
      case 'gisListTwinsInstances':
      case 'getAllTwinsDefinition':
      case 'getTwinsDefinitionDetailByIdentifier':
      case 'getTwinsFunctionByIdentifier':
      case 'getTwinsInstanceDetail':
      case 'siteInstance':
      case 'queryFunctionResult':
      case 'mcp_result_grep':
      case 'mcp_result_view':
        // 编排/查询/元数据:默认不记(避免噪声)
        break;
      default:
        this.logger.debug(`[agent-runner] 未知 toolName: ${ev.toolName},不记事件树`);
        break;
    }
  }

  /** report_decision:记 decision 节点 + inject decision 事件(有合法 tactic 才驱动战术)。 */
  private handleReportDecision(ev: ToolCallEvent, clock: number, causeEventId?: string): void {
    const args = narrowObject(ev.args);
    const decision = narrowObject(args?.decision);
    const action = toOptStr(decision?.action);
    const rationale = toOptStr(decision?.rationale);
    const tacticRaw = toOptStr(decision?.tactic);
    const tactic = tacticRaw && VALID_TACTICS.has(tacticRaw) ? (tacticRaw as Tactic) : undefined;

    // 记事件树(无 tactic 也记——展示用)
    this.options.recorder.record({
      ts: clock,
      type: 'decision',
      label: action ?? '决策',
      detail: rationale,
      parentId: causeEventId,
      agentName: ev.agent,
      toolCallId: ev.toolCallId,
    });

    // inject EventBus decision 事件(无 tactic 时 disaster-state.asDecision 返回 null,不驱动战术)
    const payload: Record<string, unknown> = {};
    if (tactic) payload.tactic = tactic;
    if (rationale) payload.decisionText = rationale;
    this.options.bus.inject({
      id: genEventId('dec'),
      ts: clock,
      type: 'decision',
      payload,
      cause: causeEventId,
    });
  }

  /** inject_event:记 special 节点 + inject special 事件(即时灾情变化)。 */
  private handleInjectEvent(ev: ToolCallEvent, clock: number, causeEventId?: string): void {
    const args = narrowObject(ev.args);
    const event = narrowObject(args?.event);
    const typeStr = toOptStr(event?.type);
    const description = toOptStrictStr(event?.description);
    const eventPayload = narrowObject(event?.payload);
    const fireLevelDelta = toOptFinite(eventPayload?.fireLevelDelta);
    const trappedDelta = toOptFinite(eventPayload?.trappedDelta);
    const damageDelta = toOptFinite(eventPayload?.damageDelta);

    // 记事件树
    this.options.recorder.record({
      ts: clock,
      type: 'special',
      label: typeStr ?? '特情',
      detail: description,
      parentId: causeEventId,
      agentName: ev.agent,
      toolCallId: ev.toolCallId,
    });

    // inject EventBus special 事件(payload 契约见 disaster-state SpecialPayload)
    const payload: Record<string, unknown> = { description: description ?? '' };
    if (fireLevelDelta !== undefined) payload.fireLevelDelta = fireLevelDelta;
    if (trappedDelta !== undefined) payload.trappedDelta = trappedDelta;
    if (damageDelta !== undefined) payload.damageDelta = damageDelta;
    this.options.bus.inject({
      id: genEventId('spec'),
      ts: clock,
      type: 'special',
      payload,
      cause: causeEventId,
    });
  }

  /** batchInvokeTwinsFunction:仅记 execution 节点(3D 由平台 WS 自动,不桥接)。 */
  private handleBatchInvoke(ev: ToolCallEvent, clock: number, causeEventId?: string): void {
    const args = narrowObject(ev.args);
    const functionIdentifier = toOptStr(args?.function_identifier);

    this.options.recorder.record({
      ts: clock,
      type: 'execution',
      label: functionIdentifier ?? 'batchInvoke',
      parentId: causeEventId,
      agentName: ev.agent,
      toolCallId: ev.toolCallId,
      functionIdentifier,
      meta: {
        input_params: args?.input_params,
        twins_instance_ids: args?.twins_instance_ids,
      },
    });
  }
}
