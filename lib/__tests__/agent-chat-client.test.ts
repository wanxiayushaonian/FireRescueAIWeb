// lib/__tests__/agent-chat-client.test.ts
// 验证 agent-chat-client:postAgentChat(请求契约)+ parseAgentChatSSE(流式解析 + args 二次 parse)。
// vitest node 环境;固定 SSE 字节流仿 SSE 格式文档 §3/§6 实例。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { postAgentChat, parseAgentChatSSE } from '../agent-chat-client';
import type { AgentChatEvent, ToolCallEvent } from '../agent-chat-client';

// ----- 工具:构造 SSE 流 -----

/** 构造单个 SSE data 行(data:{json}\n\n),JSON.stringify 自动处理内层 args 字符串转义 */
function makeSSE(obj: Record<string, unknown>): string {
  return `data:${JSON.stringify(obj)}\n\n`;
}

/** 从字符串 chunk 数组构造 ReadableStream(模拟 SSE 分块到达) */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

/** 收集 async iterable 到数组 */
async function collect(iter: AsyncIterable<AgentChatEvent>): Promise<AgentChatEvent[]> {
  const out: AgentChatEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

// ----- mock fetch 响应助手 -----
function okResponse(body: ReadableStream<Uint8Array>): Response {
  return { ok: true, status: 200, body } as Response;
}

function errResponse(status: number, text: string): Response {
  return { ok: false, status, body: null, text: () => Promise.resolve(text) } as Response;
}

function okNoBodyResponse(): Response {
  return { ok: true, status: 200, body: null, text: () => Promise.resolve('') } as Response;
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({ start: (c) => c.close() });
}

// ==================== parseAgentChatSSE ====================

describe('parseAgentChatSSE', () => {
  it('解析全部 7 种事件类型(conversation_id/reasoning/tool-call/tool-result/text/finish/timing)', async () => {
    const fixture =
      makeSSE({ type: 'conversation_id', conversation_id: 'conv-abc' }) +
      makeSSE({ type: 'reasoning', content: '让我查询', agent: 'MultiAgent' }) +
      makeSSE({
        type: 'tool-call',
        toolCallId: 'call_x1',
        toolName: 'spacequery',
        args: JSON.stringify({ query: '有哪些建筑', scene_id: '465718852859613184' }),
        agent: '空间信息查询或推理及本体功能调用',
        parentToolCallId: 'call_y1',
      }) +
      makeSSE({
        type: 'tool-result',
        toolCallId: 'call_x1',
        toolName: 'spacequery',
        result: JSON.stringify({ rows: [] }),
        agent: '空间信息查询或推理及本体功能调用',
      }) +
      makeSSE({ type: 'text', content: '查询完成', agent: 'MultiAgent', parentToolCallId: 'call_y1' }) +
      makeSSE({
        type: 'finish',
        finishReason: 'stop',
        usage: { prompt_tokens: 10, completion_tokens: 20 },
        parentToolCallId: 'call_y1',
      }) +
      makeSSE({ type: 'timing', phase: 'total', name: 'agent-chat', elapsedMs: 5234 });

    const events = await collect(parseAgentChatSSE(streamFromChunks([fixture])));

    expect(events.map((e) => e.type)).toEqual([
      'conversation_id',
      'reasoning',
      'tool-call',
      'tool-result',
      'text',
      'finish',
      'timing',
    ]);
    expect(events[0]).toEqual({ type: 'conversation_id', conversation_id: 'conv-abc' });
    expect(events[1]).toEqual({ type: 'reasoning', content: '让我查询', agent: 'MultiAgent' });
    expect(events[4]).toEqual({
      type: 'text',
      content: '查询完成',
      agent: 'MultiAgent',
      parentToolCallId: 'call_y1',
    });
    expect(events[5]).toEqual({
      type: 'finish',
      finishReason: 'stop',
      usage: { prompt_tokens: 10, completion_tokens: 20 },
      parentToolCallId: 'call_y1',
    });
    expect(events[6]).toEqual({
      type: 'timing',
      phase: 'total',
      name: 'agent-chat',
      elapsedMs: 5234,
    });
  });

  it('tool-call.args 被二次 parse 成对象(§3 spacequery 实例)', async () => {
    const fixture = makeSSE({
      type: 'tool-call',
      toolCallId: 'call_xxx',
      toolName: 'spacequery',
      args: JSON.stringify({ query: '有哪些建筑', scene_id: '465718852859613184' }),
      agent: '空间信息查询或推理及本体功能调用',
      parentToolCallId: 'call_yyy',
    });
    const events = await collect(parseAgentChatSSE(streamFromChunks([fixture])));
    const tc = events[0] as ToolCallEvent;
    expect(tc.type).toBe('tool-call');
    expect(tc.toolName).toBe('spacequery');
    expect(tc.args).toEqual({ query: '有哪些建筑', scene_id: '465718852859613184' });
  });

  it('tool-call.args 二次 parse(§6 batchInvokeTwinsFunction flyto 实例)', async () => {
    const fixture = makeSSE({
      type: 'tool-call',
      toolCallId: 'call_fly',
      toolName: 'batchInvokeTwinsFunction',
      args: JSON.stringify({
        function_identifier: 'flyto',
        input_params: [],
        twins_instance_ids: ['465718888976764928'],
      }),
      agent: '空间信息查询或推理及本体功能调用',
    });
    const events = await collect(parseAgentChatSSE(streamFromChunks([fixture])));
    const tc = events[0] as ToolCallEvent;
    expect(tc.args).toEqual({
      function_identifier: 'flyto',
      input_params: [],
      twins_instance_ids: ['465718888976764928'],
    });
  });

  it('tool-result.result 被二次 parse(§6 PROCESSING 异步返回)', async () => {
    const fixture = makeSSE({
      type: 'tool-result',
      toolCallId: 'call_r1',
      toolName: 'batchInvokeTwinsFunction',
      result: JSON.stringify({ message_id: 'm-1', status: 'PROCESSING' }),
      agent: '空间信息查询或推理及本体功能调用',
    });
    const events = await collect(parseAgentChatSSE(streamFromChunks([fixture])));
    expect(events[0]).toEqual({
      type: 'tool-result',
      toolCallId: 'call_r1',
      toolName: 'batchInvokeTwinsFunction',
      result: { message_id: 'm-1', status: 'PROCESSING' },
      agent: '空间信息查询或推理及本体功能调用',
    });
  });

  it('args 为畸形 JSON 字符串时保留原始字符串', async () => {
    const fixture = makeSSE({
      type: 'tool-call',
      toolCallId: 'c1',
      toolName: 'badTool',
      args: '{not valid json',
    });
    const events = await collect(parseAgentChatSSE(streamFromChunks([fixture])));
    const tc = events[0] as ToolCallEvent;
    expect(tc.args).toBe('{not valid json');
  });

  it('result 为普通字符串(非 JSON)时保留原值', async () => {
    const fixture = makeSSE({
      type: 'tool-result',
      toolCallId: 'c2',
      toolName: 'plain',
      result: 'plain text result',
    });
    const events = await collect(parseAgentChatSSE(streamFromChunks([fixture])));
    expect((events[0] as { result: unknown }).result).toBe('plain text result');
  });

  it('分块到达(行被截断在中间)仍能正确拼接解析', async () => {
    const full =
      makeSSE({ type: 'conversation_id', conversation_id: 'c1' }) +
      makeSSE({ type: 'text', content: 'hello world' });
    // 截成 3 段,断点在行中间(首尾非 \n 对齐)
    const mid = Math.floor(full.length / 2);
    const chunks = [full.slice(0, mid), full.slice(mid, mid + 7), full.slice(mid + 7)];
    const events = await collect(parseAgentChatSSE(streamFromChunks(chunks)));
    expect(events.map((e) => e.type)).toEqual(['conversation_id', 'text']);
    expect((events[1] as { content: string }).content).toBe('hello world');
  });

  it('兼容 data: 带空格与不带空格两种行格式', async () => {
    const stream = streamFromChunks([
      'data:{"type":"text","content":"a"}\n\n',
      'data: {"type":"text","content":"b"}\n\n',
    ]);
    const events = await collect(parseAgentChatSSE(stream));
    expect(events.map((e) => (e as { content: string }).content)).toEqual(['a', 'b']);
  });

  it('跳过非 data 行 / [DONE] / 畸形 JSON / 未知 type', async () => {
    const stream = streamFromChunks([
      ':comment line\n',
      'event:ping\n',
      'id:1\n',
      'retry:5000\n',
      'data:[DONE]\n\n',
      'data:{not json}\n\n',
      'data:{"type":"unknown-type","x":1}\n\n',
      'data:{"type":"text","content":"ok"}\n\n',
    ]);
    const events = await collect(parseAgentChatSSE(stream));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('text');
  });

  it('空流不产出事件(不抛错)', async () => {
    const events = await collect(parseAgentChatSSE(streamFromChunks([''])));
    expect(events).toEqual([]);
  });

  it('无 trailing \\n 的最后一行也能被 flush 解析', async () => {
    // 整段无尾随 \n\n
    const stream = streamFromChunks(['data:{"type":"text","content":"tail"}']);
    const events = await collect(parseAgentChatSSE(stream));
    expect(events).toHaveLength(1);
    expect((events[0] as { content: string }).content).toBe('tail');
  });

  it('逐事件流式产出(async for await 顺序等于 SSE 顺序)', async () => {
    const fixture =
      makeSSE({ type: 'text', content: '1' }) +
      makeSSE({ type: 'text', content: '2' }) +
      makeSSE({ type: 'text', content: '3' });
    const order: string[] = [];
    for await (const e of parseAgentChatSSE(streamFromChunks([fixture]))) {
      order.push((e as { content: string }).content);
    }
    expect(order).toEqual(['1', '2', '3']);
  });
});

// ==================== postAgentChat ====================

describe('postAgentChat', () => {
  let prevKey: string | undefined;

  beforeEach(() => {
    prevKey = process.env.NEXT_PUBLIC_X_APP_KEY;
    process.env.NEXT_PUBLIC_X_APP_KEY = 'test-app-key';
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_X_APP_KEY;
    else process.env.NEXT_PUBLIC_X_APP_KEY = prevKey;
    vi.unstubAllGlobals();
  });

  it('POST 正确 URL / headers(X-App-Key + Accept + Content-Type)/ body(含 forwardedProps + stream:true)', async () => {
    const f = vi.fn().mockResolvedValue(okResponse(emptyStream()));
    vi.stubGlobal('fetch', f);

    await postAgentChat({
      content: '飞向21号楼',
      app_id: '2084563280205111297',
      forwardedProps: { scene_id: '465718852859613184' },
    });

    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/uagent-service/api/agent/v1/apps/agent-chat');
    const opts = init as RequestInit;
    expect(opts.method).toBe('POST');
    const headers = opts.headers as Record<string, string>;
    expect(headers['X-App-Key']).toBe('test-app-key');
    expect(headers['Accept']).toBe('text/event-stream');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({
      content: '飞向21号楼',
      app_id: '2084563280205111297',
      forwardedProps: { scene_id: '465718852859613184' },
      stream: true,
    });
    expect(body.passthrough_props).toBeUndefined();
  });

  it('passthroughProps 存在时透传为 passthrough_props', async () => {
    const f = vi.fn().mockResolvedValue(okResponse(emptyStream()));
    vi.stubGlobal('fetch', f);

    await postAgentChat({
      content: 'x',
      app_id: 'app1',
      passthroughProps: { drill_id: 'd1' },
    });

    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.passthrough_props).toEqual({ drill_id: 'd1' });
  });

  it('forwardedProps 缺省为 {}', async () => {
    const f = vi.fn().mockResolvedValue(okResponse(emptyStream()));
    vi.stubGlobal('fetch', f);

    await postAgentChat({ content: 'x', app_id: 'app1' });
    const body = JSON.parse((f.mock.calls[0][1] as RequestInit).body as string);
    expect(body.forwardedProps).toEqual({});
    expect(body.stream).toBe(true);
  });

  it('signal 透传给 fetch', async () => {
    const f = vi.fn().mockResolvedValue(okResponse(emptyStream()));
    vi.stubGlobal('fetch', f);
    const ac = new AbortController();

    await postAgentChat({ content: 'x', app_id: 'a', signal: ac.signal });

    expect((f.mock.calls[0][1] as RequestInit).signal).toBe(ac.signal);
  });

  it('X-App-Key 缺失(空 env)时发空串', async () => {
    delete process.env.NEXT_PUBLIC_X_APP_KEY;
    const f = vi.fn().mockResolvedValue(okResponse(emptyStream()));
    vi.stubGlobal('fetch', f);

    await postAgentChat({ content: 'x', app_id: 'a' });
    const headers = (f.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-App-Key']).toBe('');
  });

  it('非 ok 响应抛带状态码与响应体的错误', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errResponse(502, 'upstream down')));
    await expect(postAgentChat({ content: 'x', app_id: 'a' })).rejects.toThrow(/502/);
  });

  it('res.body 为 null 时抛错', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okNoBodyResponse()));
    await expect(postAgentChat({ content: 'x', app_id: 'a' })).rejects.toThrow(/agent-chat/);
  });

  it('成功时返回 res.body 流', async () => {
    const stream = emptyStream();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(stream)));
    const result = await postAgentChat({ content: 'x', app_id: 'a' });
    expect(result).toBe(stream);
  });
});

// ==================== 端到端:postAgentChat → parseAgentChatSSE ====================

describe('端到端(postAgentChat 返回流 → parseAgentChatSSE 解析)', () => {
  let prevKey: string | undefined;
  beforeEach(() => {
    prevKey = process.env.NEXT_PUBLIC_X_APP_KEY;
    process.env.NEXT_PUBLIC_X_APP_KEY = 'e2e-key';
  });
  afterEach(() => {
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_X_APP_KEY;
    else process.env.NEXT_PUBLIC_X_APP_KEY = prevKey;
    vi.unstubAllGlobals();
  });

  it('fetch mock 返回真实 SSE 字节流 → 解析出 tool-call + args 二次 parse', async () => {
    const sseBytes = new TextEncoder().encode(
      makeSSE({ type: 'conversation_id', conversation_id: 'conv-e2e' }) +
        makeSSE({
          type: 'tool-call',
          toolCallId: 'c_e2e',
          toolName: 'batchInvokeTwinsFunction',
          args: JSON.stringify({ function_identifier: 'flyto', twins_instance_ids: ['465718888976764928'] }),
          agent: '空间信息查询或推理及本体功能调用',
        }) +
        makeSSE({ type: 'text', content: '正在飞向目标' }),
    );
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(sseBytes);
        c.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(stream)));

    const body = await postAgentChat({ content: '飞向21号楼', app_id: '2084563280205111297' });
    const events = await collect(parseAgentChatSSE(body));

    expect(events.map((e) => e.type)).toEqual(['conversation_id', 'tool-call', 'text']);
    const tc = events[1] as ToolCallEvent;
    expect(tc.args).toEqual({
      function_identifier: 'flyto',
      twins_instance_ids: ['465718888976764928'],
    });
  });
});
