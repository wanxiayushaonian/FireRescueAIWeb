// lib/agent-chat-client.ts
// agent-chat SSE 接入层(子项目5 Task 5A)。
// 程序化 POST ustudio agent-chat BFF route + 解析 SSE 流,供推演引擎(AgentRunner)
// 与 AgentChat 复用。纯逻辑,无 React/DOM 依赖,仅用 Web 标准 API(fetch / ReadableStream /
// TextDecoder,Node 18+ 原生支持)。
//
// SSE 格式见 plan/drill-agent-chat-sse-format.md:
// - 每行 data:{json}(无空格)或 data: {json}(带空格),按 type 派发
// - tool-call.args / tool-result.result 是 JSON 字符串,需二次 JSON.parse
// - 事件类型:conversation_id / reasoning / tool-call / tool-result / text / finish / timing
//
// 关键设计:
// 1. postAgentChat 读 NEXT_PUBLIC_X_APP_KEY 在调用时(非模块加载),便于测试注入 env
// 2. parseAgentChatSSE 是 async generator,逐事件 yield,按 \n 分行 + 跨块缓冲拼接
// 3. args/result 用 safeJsonParse 二次 parse,失败保留原字符串(契约稳健)
// 4. 流看门狗:响应头超时 + 流空闲(chunk 到达即续期)双层兜底,挂起以 AgentStreamStalledError
//    暴露给消费端降级;长任务(2-3min)不受影响,不设总时长上限

// ===== 事件类型 =====

export interface ConversationIdEvent {
  type: 'conversation_id';
  conversation_id: string;
}

export interface ReasoningEvent {
  type: 'reasoning';
  content: string;
  agent?: string;
}

export interface ToolCallEvent {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  /** 二次 JSON.parse 后的对象;parse 失败保留原始字符串 */
  args: unknown;
  agent?: string;
  parentToolCallId?: string;
}

/**
 * 工具调用审批请求(平台配置工具需人工审批时下发)。
 * 客户端应展示审批卡,通过 tool_feedbacks(APPROVED/REJECTED/EDITED)在下一请求回传,
 * 或经 stopAgentChat 中止。当前 web 自研通道不启用审批 UI(平台实测未触发),仅解析不丢弃。
 */
export interface ToolApprovalRequestEvent {
  type: 'tool-approval-request';
  toolCallId: string;
  toolName: string;
  /** 二次 JSON.parse 后的对象;parse 失败保留原始字符串 */
  args: unknown;
  description?: string;
  agent?: string;
}

export interface ToolResultEvent {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  /** 二次 JSON.parse 后的对象;parse 失败保留原始字符串 */
  result: unknown;
  agent?: string;
}

export interface TextEvent {
  type: 'text';
  content: string;
  agent?: string;
  parentToolCallId?: string;
}

export interface FinishEvent {
  type: 'finish';
  finishReason: string;
  usage?: unknown;
  parentToolCallId?: string;
}

export interface TimingEvent {
  type: 'timing';
  phase: string;
  name: string;
  elapsedMs: number;
}

/** agent-chat SSE 事件联合,按 type 区分字段 */
export type AgentChatEvent =
  | ConversationIdEvent
  | ReasoningEvent
  | ToolCallEvent
  | ToolApprovalRequestEvent
  | ToolResultEvent
  | TextEvent
  | FinishEvent
  | TimingEvent;

// ===== 流看门狗 =====

/**
 * 智能体流看门狗窗口:响应头等待与流空闲共用。
 * 正常链路上 reasoning/工具事件持续到达(实测数秒一条),90s 零数据几乎必然是网关/网络挂起;
 * 不设总时长上限——预案推演等长任务 2-3 分钟也靠 chunk 续期放行。
 */
export const AGENT_STREAM_WATCHDOG_MS = 90_000;

/** 流空闲看门狗触发;消费端 catch 后走各自降级路径(adapter 返回 null → 规则打分/onFail)。 */
export class AgentStreamStalledError extends Error {
  constructor(idleMs: number) {
    super(`agent-chat 流超时中断:${idleMs}ms 内无任何数据(网关或网络挂起)`);
    this.name = 'AgentStreamStalledError';
  }
}

/**
 * 包装 SSE 流:每个 chunk 到达即重置计时,连续 idleMs 无数据判为挂起,
 * cancel 上游并以 AgentStreamStalledError error 掉消费端。
 * 只断本地流;服务端 run 的终止仍依赖平台侧超时(stopAgentChat 场景由调用方自行决定)。
 */
export function withStreamWatchdog(
  stream: ReadableStream<Uint8Array>,
  idleMs: number,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const result = await Promise.race([
          reader.read(),
          new Promise<'stalled'>((resolve) => {
            timer = setTimeout(() => resolve('stalled'), idleMs);
          }),
        ]);
        clearTimeout(timer);
        if (result === 'stalled') {
          await reader.cancel(new AgentStreamStalledError(idleMs)).catch(() => {});
          controller.error(new AgentStreamStalledError(idleMs));
          return;
        }
        if (result.done) { controller.close(); return; }
        controller.enqueue(result.value);
      } catch (err) {
        controller.error(err);
      }
    },
    cancel(reason) { void reader.cancel(reason).catch(() => {}); },
  });
}

// ===== postAgentChat =====

export interface PostAgentChatParams {
  content: string;
  app_id: string;
  forwardedProps?: Record<string, unknown>;
  passthroughProps?: Record<string, unknown>;
  /** 上一轮 SSE 返回的 conversation_id;传了则保持多轮上下文 */
  conversationId?: string;
  /** 图片 path 列表(经 uploadAgentImage 上传后获取);发给多模态 agent 理解 */
  images?: string[];
  signal?: AbortSignal;
}

/** BFF route(app/uagent-service/.../agent-chat/route.ts)透传至上游 ustudio 网关 */
const AGENT_CHAT_PATH = '/uagent-service/api/agent/v1/apps/agent-chat';

/**
 * POST agent-chat BFF route,返回 SSE ReadableStream。
 *
 * header:
 * - X-App-Key:读 NEXT_PUBLIC_X_APP_KEY(BFF 透传至上游做应用级鉴权)
 * - Content-Type: application/json
 * - Accept: text/event-stream
 *
 * body:{ content, app_id, forwardedProps(默认 {}), stream:true,
 *        ...(passthroughProps ? { passthrough_props } : {}) }
 */
export async function postAgentChat(
  params: PostAgentChatParams,
  opts?: { readonly streamIdleTimeoutMs?: number },
): Promise<ReadableStream<Uint8Array>> {
  const { content, app_id, forwardedProps, passthroughProps, conversationId, images, signal } = params;
  const appKey = process.env.NEXT_PUBLIC_X_APP_KEY || '';

  // 字段名契约:网关只认 snake_case 的 forwarded_props / passthrough_props(实测:snake_case 注入 SystemMessage 成功,
  // camelCase 的 forwardedProps 被静默忽略)。SDK(@dt-uagent/multi-agent-sdk)内部同样发 forwarded_props。
  const body: Record<string, unknown> = {
    content,
    app_id,
    forwarded_props: forwardedProps ?? {},
    stream: true,
  };
  if (conversationId) {
    body.conversation_id = conversationId;
  }
  if (images && images.length > 0) {
    body.image_list = images;
  }
  if (passthroughProps) {
    body.passthrough_props = passthroughProps;
  }

  // 看门狗①响应头超时:BFF/网关接受请求但不回 200 时 fetch 默认可无限等待;
  // 与调用方 signal 合并(调用方 abort 或超时先到都会中止)。
  const watchdogSignal = AbortSignal.timeout(opts?.streamIdleTimeoutMs ?? AGENT_STREAM_WATCHDOG_MS);
  const res = await fetch(AGENT_CHAT_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-App-Key': appKey,
    },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, watchdogSignal]) : watchdogSignal,
  });

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    throw new Error(`agent-chat 请求失败 ${res.status}: ${errText}`);
  }

  // 看门狗②流空闲:chunk 到达即续期,连续无数据判为挂起;消费端收到 AgentStreamStalledError
  return withStreamWatchdog(res.body as ReadableStream<Uint8Array>, opts?.streamIdleTimeoutMs ?? AGENT_STREAM_WATCHDOG_MS);
}

/**
 * 停止当前 agent run(STOP 协议):POST 同端点 body `{app_id, conversation_id, tool_feedbacks:[{result:'STOP'}]}`。
 * 网关收到 STOP 后终止服务端执行(否则 abort 只断浏览器流,服务端 run 继续消耗)。
 * 尽力而为:失败不影响已 abort 的本地流;conversationId 缺失时仅本地断流(无法定位服务端 run)。
 */
export async function stopAgentChat(params: { appId: string; conversationId?: string }): Promise<void> {
  const { appId, conversationId } = params;
  const appKey = process.env.NEXT_PUBLIC_X_APP_KEY || '';
  const body: Record<string, unknown> = {
    app_id: appId,
    tool_feedbacks: [{ result: 'STOP' }],
  };
  if (conversationId) body.conversation_id = conversationId;
  try {
    await fetch(AGENT_CHAT_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'X-App-Key': appKey,
      },
      body: JSON.stringify(body),
      // STOP 回包也是 SSE 流,我们不消费;超时兜底避免连接泄漏
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // 尽力而为:忽略失败
  }
}

// ===== parseAgentChatSSE =====

/**
 * 解析 agent-chat SSE 流,逐事件 yield 结构化 AgentChatEvent。
 *
 * 实现要点:
 * - reader 逐 chunk 读,TextDecoder 解码,按 \n 分行
 * - 最后一段不含 \n 的留在 buffer,与下一 chunk 拼接(跨块行缓冲)
 * - 兼容 `data:{json}`(无空格)与 `data: {json}`(带空格)
 * - tool-call.args / tool-result.result 为 JSON 字符串时二次 parse
 * - 非 data 行(注释/event:/id:)、[DONE]、畸形 JSON、未知 type 一律跳过
 */
export async function* parseAgentChatSSE(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<AgentChatEvent, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // 按 \n 切行,最后一段(可能不完整)留在 buffer
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const line of parts) {
        const event = parseSSELine(line);
        if (event) yield event;
      }
    }
    // flush 尾部剩余(最后一行可能无 trailing \n)
    buffer += decoder.decode();
    if (buffer) {
      const event = parseSSELine(buffer);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

/** 解析单行 SSE:data 前缀去掉 + JSON.parse + normalize;非 data 行 / 解析失败返回 null */
function parseSSELine(line: string): AgentChatEvent | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  // slice(5) 去掉 'data:',trimStart 去掉可选空格(兼容 data: 与 data: 两种)
  const payload = trimmed.slice(5).trimStart();
  if (!payload || payload === '[DONE]') return null;

  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  return normalizeEvent(raw);
}

/** 将原始 JSON 对象规范化为 AgentChatEvent;未知 type / 缺关键字段返回 null(跳过) */
function normalizeEvent(raw: unknown): AgentChatEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const type = obj.type;

  switch (type) {
    case 'conversation_id':
      return { type: 'conversation_id', conversation_id: String(obj.conversation_id ?? '') };

    case 'reasoning':
      return { type: 'reasoning', content: String(obj.content ?? ''), agent: optStr(obj.agent) };

    case 'tool-call':
      return {
        type: 'tool-call',
        toolCallId: String(obj.toolCallId ?? ''),
        toolName: String(obj.toolName ?? ''),
        args: safeJsonParse(obj.args),
        agent: optStr(obj.agent),
        parentToolCallId: optStr(obj.parentToolCallId),
      };

    case 'tool-approval-request':
      return {
        type: 'tool-approval-request',
        toolCallId: String(obj.toolCallId ?? ''),
        toolName: String(obj.toolName ?? ''),
        args: safeJsonParse(obj.args),
        description: optStr(obj.description),
        agent: optStr(obj.agent),
      };

    case 'tool-result':
      return {
        type: 'tool-result',
        toolCallId: String(obj.toolCallId ?? ''),
        toolName: String(obj.toolName ?? ''),
        result: safeJsonParse(obj.result),
        agent: optStr(obj.agent),
      };

    case 'text':
      return {
        type: 'text',
        content: String(obj.content ?? ''),
        agent: optStr(obj.agent),
        parentToolCallId: optStr(obj.parentToolCallId),
      };

    case 'finish':
      return {
        type: 'finish',
        finishReason: String(obj.finishReason ?? ''),
        usage: obj.usage,
        parentToolCallId: optStr(obj.parentToolCallId),
      };

    case 'timing':
      return {
        type: 'timing',
        phase: String(obj.phase ?? ''),
        name: String(obj.name ?? ''),
        elapsedMs: Number(obj.elapsedMs ?? 0),
      };

    default:
      return null;
  }
}

/** null/undefined/空串 → undefined,其余 String() */
function optStr(v: unknown): string | undefined {
  return v == null || v === '' ? undefined : String(v);
}

/**
 * 二次 JSON.parse:值为 JSON 字符串时 parse 成对象,parse 失败保留原字符串;
 * 值非字符串(已是对象 / null)时原样返回。
 */
function safeJsonParse(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

// ===== 图片上传 =====

/** 上传接口返回结构:{ data: [{ path }] }。 */
interface UploadResponse {
  data?: Array<{ path?: string }>;
}

/**
 * 上传图片到 agent 平台,返回 path(后续作为 image_list 传给 agent-chat)。
 * 走 BFF rewrite(/uagent-service/* → AGENT_GATEWAY),同 agent-chat 鉴权(X-App-Key)。
 */
export async function uploadAgentImage(file: File): Promise<string> {
  const appKey = process.env.NEXT_PUBLIC_X_APP_KEY || '';
  const formData = new FormData();
  formData.append('category', 'image');
  formData.append('files', file);
  const res = await fetch('/uagent-service/api/agent/v1/files/upload', {
    method: 'POST',
    headers: { 'X-App-Key': appKey },
    body: formData,
  });
  if (!res.ok) throw new Error(`图片上传失败 ${res.status}`);
  const json = (await res.json()) as UploadResponse;
  const path = json.data?.[0]?.path;
  if (!path) throw new Error('图片上传失败:未返回 path');
  return path;
}

/** 图片 path → 预览 URL(带鉴权参数,浏览器直接 <img src>)。 */
export function agentImageUrl(path: string): string {
  const params = new URLSearchParams({ path, preview: 'true' });
  return `/uagent-service/api/agent/v1/files/download?${params.toString()}`;
}
