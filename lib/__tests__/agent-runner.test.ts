// lib/__tests__/agent-runner.test.ts
// 验证 AgentRunner:tool_call 派发(report_decision/inject_event/batchInvokeTwinsFunction)、
// POST 失败容错、串行队列、onTick 对抗触发。
//
// 测试策略:
// - 注入 fake postChat 返回构造的 SSE 字节流(ReadableStream),验 agent-runner 对 SSE 事件的路由
// - 用 spy 监 bus.subscribe + recorder.subscribe 验副作用
// - 验 runAgent 不抛(POST 失败时 logger.warn 被调)
import { describe, it, expect, vi } from 'vitest';
import { AgentRunner, type PostChatFn, type DrillLogger } from '../drill/agent-runner';
import { EventBus } from '../drill/event-bus';
import {
  DisasterState,
  DEFAULT_DISASTER_RULES,
  type DisasterScenario,
} from '../drill/disaster-state';
import { DrillRecorder } from '../drill/drill-recorder';
import type { PostAgentChatParams } from '../agent-chat-client';

// ============================================================
// 测试夹具
// ============================================================

const SCENARIO: DisasterScenario = {
  firePoint: { x: 100, y: 200 },
  material: '办公用品',
  trappedCount: 10,
  windDirection: 90,
  windSpeed: 3,
  buildingStructure: 'mixed',
  initialFireLevel: 1,
};

/** 构造测试用 AgentRunner options。 */
function makeRunnerDeps() {
  const bus = new EventBus();
  const state = new DisasterState(DEFAULT_DISASTER_RULES);
  state.init(SCENARIO);
  const recorder = new DrillRecorder();
  return { bus, state, recorder };
}

/** 构造单个 SSE data 行。 */
function sse(obj: Record<string, unknown>): string {
  return `data:${JSON.stringify(obj)}\n\n`;
}

/** 从字符串构造 ReadableStream(模拟 SSE 字节流)。 */
function streamFrom(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}

/** 构造 fake postChat:返回固定的 SSE 流。 */
function fakePostChatReturning(sseText: string): PostChatFn {
  return async () => streamFrom(sseText);
}

/** 构造 fake postChat:reject(模拟 POST 失败)。 */
function fakePostChatRejecting(errMsg: string): PostChatFn {
  return vi.fn(async () => {
    throw new Error(errMsg);
  });
}

/** 构造 silent logger(收集 warn 调用)。 */
function silentLogger(): DrillLogger & { warns: unknown[][] } {
  const warns: unknown[][] = [];
  return {
    warn: (...args: unknown[]) => warns.push(args),
    debug: () => {},
    info: () => {},
    warns,
  };
}

/** 构造带基础数据的 runner。 */
function buildRunner(
  deps: ReturnType<typeof makeRunnerDeps>,
  overrides: {
    postChat?: PostChatFn;
    adversaryEveryNTicks?: number;
    adversaryAppId?: string;
    logger?: DrillLogger;
  } = {},
) {
  return new AgentRunner({
    commanderAppId: 'cmd-app-001',
    adversaryAppId: overrides.adversaryAppId,
    buildingId: 'b-21',
    sceneId: 'scene-465718852859613184',
    drillId: 'drill-1',
    bus: deps.bus,
    state: deps.state,
    recorder: deps.recorder,
    postChat: overrides.postChat ?? fakePostChatReturning(''),
    adversaryEveryNTicks: overrides.adversaryEveryNTicks,
    logger: overrides.logger,
  });
}

// ============================================================
// report_decision 派发
// ============================================================

describe('AgentRunner:report_decision tool-call', () => {
  it('causeEventId 同时挂接到 recorder.parentId 与 bus.cause(因果链)', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);
    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'c-cause',
      toolName: 'report_decision',
      args: JSON.stringify({ decision: { action: '派遣', tactic: 'water' } }),
    });
    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('触发文本', 'cause-001');
    expect(recSpy.mock.calls[0][0].parentId).toBe('cause-001');
    expect(busSpy.mock.calls[0][0].cause).toBe('cause-001');
  });

  it('report_decision(含合法 tactic)→ bus.inject decision 事件 + recorder.record decision 节点', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);

    const sseText =
      sse({
        type: 'tool-call',
        toolCallId: 'call_d1',
        toolName: 'report_decision',
        args: JSON.stringify({
          decision: {
            action: '出水压制',
            rationale: '火势升级,需出水',
            tactic: 'water',
          },
        }),
        agent: '指挥Agent',
      }) + sse({ type: 'finish', finishReason: 'stop' });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('场景态势:火势2级');

    // bus.inject 被调(decision 事件)
    expect(busSpy).toHaveBeenCalledTimes(1);
    const busEvt = busSpy.mock.calls[0][0];
    expect(busEvt.type).toBe('decision');
    expect(busEvt.payload.tactic).toBe('water');
    expect(busEvt.payload.decisionText).toBe('火势升级,需出水');

    // recorder.record 被调(decision 节点)
    expect(recSpy).toHaveBeenCalledTimes(1);
    const node = recSpy.mock.calls[0][0];
    expect(node.type).toBe('decision');
    expect(node.label).toBe('出水压制');
    expect(node.detail).toBe('火势升级,需出水');
    expect(node.agentName).toBe('指挥Agent');
    expect(node.toolCallId).toBe('call_d1');
  });

  it('report_decision(无 tactic)→ 仍记事件树 + bus.inject(decision 事件无 tactic,disaster-state 不驱动战术)', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'call_d2',
      toolName: 'report_decision',
      args: JSON.stringify({
        decision: { action: '观察', rationale: '火势可控' },
      }),
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('观察');

    expect(busSpy).toHaveBeenCalledTimes(1);
    const busEvt = busSpy.mock.calls[0][0];
    expect(busEvt.type).toBe('decision');
    expect(busEvt.payload.tactic).toBeUndefined();
    expect(busEvt.payload.decisionText).toBe('火势可控');

    // disaster-state 处理该事件时 asDecision 返回 null(无 tactic),不影响战术
    deps.state.tick(deps.bus.getEvents(0, 0));
    const status = deps.state.getStatus();
    expect(status.suppressionActive).toBe(false);
  });

  it('report_decision(无效 tactic)→ 不驱动战术,但仍记事件', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'call_d3',
      toolName: 'report_decision',
      args: JSON.stringify({
        decision: { action: '测试', tactic: 'invalid_tactic' },
      }),
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    const busEvt = busSpy.mock.calls[0][0];
    expect(busEvt.type).toBe('decision');
    expect(busEvt.payload.tactic).toBeUndefined(); // 无效 tactic 被窄化掉
  });

  it('report_decision(malformed args,缺 decision 字段)→ 安全降级,记 label=决策,空 payload', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'call_bad',
      toolName: 'report_decision',
      args: JSON.stringify({ not_decision: 'oops' }),
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    expect(recSpy).toHaveBeenCalledTimes(1);
    const node = recSpy.mock.calls[0][0];
    expect(node.label).toBe('决策');
    expect(node.detail).toBeUndefined();

    expect(busSpy).toHaveBeenCalledTimes(1);
    expect(busSpy.mock.calls[0][0].payload).toEqual({});
  });
});

// ============================================================
// inject_event 派发
// ============================================================

describe('AgentRunner:inject_event tool-call', () => {
  it('inject_event(含完整 payload)→ bus.inject special 事件 + recorder.record special 节点', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'call_s1',
      toolName: 'inject_event',
      args: JSON.stringify({
        event: {
          type: '爆炸',
          description: '二层油罐爆炸',
          payload: { fireLevelDelta: 1, trappedDelta: 5, damageDelta: 0.1 },
        },
      }),
      agent: '对抗Agent',
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    expect(busSpy).toHaveBeenCalledTimes(1);
    const busEvt = busSpy.mock.calls[0][0];
    expect(busEvt.type).toBe('special');
    expect(busEvt.payload).toEqual({
      description: '二层油罐爆炸',
      fireLevelDelta: 1,
      trappedDelta: 5,
      damageDelta: 0.1,
    });

    expect(recSpy).toHaveBeenCalledTimes(1);
    const node = recSpy.mock.calls[0][0];
    expect(node.type).toBe('special');
    expect(node.label).toBe('爆炸');
    expect(node.detail).toBe('二层油罐爆炸');
    expect(node.agentName).toBe('对抗Agent');
  });

  it('inject_event(缺 payload 字段)→ 安全降级,仅 description', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'call_s2',
      toolName: 'inject_event',
      args: JSON.stringify({
        event: { description: '一般特情' },
      }),
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    const busEvt = busSpy.mock.calls[0][0];
    expect(busEvt.type).toBe('special');
    expect(busEvt.payload).toEqual({ description: '一般特情' });
  });

  it('inject_event(无 type/无 description)→ label=特情,description=空串', async () => {
    const deps = makeRunnerDeps();
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'call_s3',
      toolName: 'inject_event',
      args: JSON.stringify({ event: {} }),
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    const node = recSpy.mock.calls[0][0];
    expect(node.label).toBe('特情');
    expect(node.detail).toBeUndefined();
  });

  it('inject_event 驱动 DisasterState:爆炸 fireLevelDelta=1 后火势跳升', async () => {
    const deps = makeRunnerDeps();
    const initialFireLevel = deps.state.getStatus().fireLevel;

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'call_s4',
      toolName: 'inject_event',
      args: JSON.stringify({
        event: { description: '爆炸', payload: { fireLevelDelta: 1 } },
      }),
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    // 消费事件后火势应 +1(applySpecial 即时生效)
    const events = deps.bus.getEvents();
    deps.state.tick(events);
    expect(deps.state.getStatus().fireLevel).toBe(initialFireLevel + 1);
  });
});

// ============================================================
// batchInvokeTwinsFunction 派发
// ============================================================

describe('AgentRunner:batchInvokeTwinsFunction tool-call', () => {
  it('batchInvokeTwinsFunction → recorder.record execution 节点,bus 无 inject', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'call_e1',
      toolName: 'batchInvokeTwinsFunction',
      args: JSON.stringify({
        function_identifier: 'flyto',
        input_params: [],
        twins_instance_ids: ['465718888976764928'],
      }),
      agent: '空间Agent',
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('飞向21号楼');

    // bus 无 inject(3D 执行不经 EventBus)
    expect(busSpy).not.toHaveBeenCalled();

    // recorder 记 execution 节点
    expect(recSpy).toHaveBeenCalledTimes(1);
    const node = recSpy.mock.calls[0][0];
    expect(node.type).toBe('execution');
    expect(node.label).toBe('flyto');
    expect(node.functionIdentifier).toBe('flyto');
    expect(node.agentName).toBe('空间Agent');
    expect(node.toolCallId).toBe('call_e1');
    expect(node.meta).toEqual({
      input_params: [],
      twins_instance_ids: ['465718888976764928'],
    });
  });

  it('batchInvokeTwinsFunction(malformed args)→ 安全降级 label=batchInvoke', async () => {
    const deps = makeRunnerDeps();
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'call_e2',
      toolName: 'batchInvokeTwinsFunction',
      args: 'not an object',
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    const node = recSpy.mock.calls[0][0];
    expect(node.label).toBe('batchInvoke');
    expect(node.functionIdentifier).toBeUndefined();
  });
});

// ============================================================
// POST 失败容错
// ============================================================

describe('AgentRunner:POST 失败容错', () => {
  it('postChat reject → runAgent 不抛(logger.warn 被调)', async () => {
    const deps = makeRunnerDeps();
    const logger = silentLogger();
    const runner = buildRunner(deps, {
      postChat: fakePostChatRejecting('网络错误 502'),
      logger,
    });

    await expect(runner.triggerCommander('x')).resolves.toBeUndefined();
    expect(logger.warns.length).toBe(1);
    expect(String(logger.warns[0])).toContain('commander');
  });

  it('postChat reject 后串行队列不阻塞后续触发', async () => {
    const deps = makeRunnerDeps();
    let callCount = 0;
    const postChat: PostChatFn = async () => {
      callCount += 1;
      if (callCount === 1) throw new Error('first fails');
      return streamFrom(sse({ type: 'finish', finishReason: 'stop' }));
    };

    const runner = buildRunner(deps, { postChat });
    await runner.triggerCommander('first');
    await runner.triggerCommander('second');

    // 第二次正常执行(callCount=2),不因首次失败而阻塞
    expect(callCount).toBe(2);
  });
});

// ============================================================
// 串行队列
// ============================================================

describe('AgentRunner:串行队列', () => {
  it('两次 triggerCommander 排队执行(postChat 计数 2,不并发)', async () => {
    const deps = makeRunnerDeps();
    let callCount = 0;
    const postChat: PostChatFn = async () => {
      callCount += 1;
      return streamFrom(sse({ type: 'finish', finishReason: 'stop' }));
    };

    const runner = buildRunner(deps, { postChat });
    // 不 await 第一次,立即触发第二次(验证排队)
    const p1 = runner.triggerCommander('first');
    const p2 = runner.triggerCommander('second');
    await Promise.all([p1, p2]);

    expect(callCount).toBe(2);
  });

  it('commander 与 adversary 各自独立队列(可并行)', async () => {
    const deps = makeRunnerDeps();
    let cmdCalls = 0;
    let advCalls = 0;
    const postChat: PostChatFn = async (params: PostAgentChatParams) => {
      if (params.app_id === 'cmd-app-001') {
        cmdCalls += 1;
      } else {
        advCalls += 1;
      }
      return streamFrom(sse({ type: 'finish', finishReason: 'stop' }));
    };

    const runner = buildRunner(deps, {
      postChat,
      adversaryAppId: 'adv-app',
    });
    await Promise.all([runner.triggerCommander('c'), runner.triggerAdversary()]);

    expect(cmdCalls).toBe(1);
    expect(advCalls).toBe(1);
  });
});

// ============================================================
// onTick 对抗触发
// ============================================================

describe('AgentRunner:onTick 对抗触发', () => {
  it('clock%N===0 时触发对抗 agent(互斥:连续同步 onTick 只跑第一个,建议-3)', async () => {
    const deps = makeRunnerDeps();
    let advCalls = 0;
    const postChat: PostChatFn = async (params: PostAgentChatParams) => {
      if (params.app_id === 'adv-app') advCalls += 1;
      return streamFrom(sse({ type: 'finish', finishReason: 'stop' }));
    };

    const runner = buildRunner(deps, {
      postChat,
      adversaryAppId: 'adv-app',
      adversaryEveryNTicks: 3,
    });

    runner.onTick(1); // 不触发
    runner.onTick(2); // 不触发
    runner.onTick(3); // 触发(adversaryInFlight=true)
    runner.onTick(6); // 互斥跳过(前一个对抗 promise 链未完成,finally 未执行)

    // fire-and-forget,等微任务/异步完成
    await new Promise((r) => setTimeout(r, 50));

    // 互斥:连续同步 onTick 只触发一次(防 adversaryChain 无界堆积)
    expect(advCalls).toBe(1);
  });

  it('前一个对抗完成后,后续 onTick 能再次触发(互斥释放)', async () => {
    const deps = makeRunnerDeps();
    let advCalls = 0;
    const postChat: PostChatFn = async (params: PostAgentChatParams) => {
      if (params.app_id === 'adv-app') advCalls += 1;
      return streamFrom(sse({ type: 'finish', finishReason: 'stop' }));
    };

    const runner = buildRunner(deps, {
      postChat,
      adversaryAppId: 'adv-app',
      adversaryEveryNTicks: 3,
    });

    runner.onTick(3); // 触发
    await new Promise((r) => setTimeout(r, 50)); // 等第一个完成(adversaryInFlight 释放)

    runner.onTick(6); // 互斥已释放,再次触发
    await new Promise((r) => setTimeout(r, 50));

    expect(advCalls).toBe(2);
  });

  it('clock<=0 或 adversaryEveryNTicks=0 时不触发', async () => {
    const deps = makeRunnerDeps();
    const postChat: PostChatFn = async () => {
      throw new Error('should not be called');
    };

    const runner = buildRunner(deps, {
      postChat,
      adversaryAppId: 'adv-app',
      adversaryEveryNTicks: 0, // 禁用
    });

    runner.onTick(0);
    runner.onTick(5);
    runner.onTick(10);
    await new Promise((r) => setTimeout(r, 50));
  });

  it('adversaryAppId 未配置时 triggerAdversary no-op', async () => {
    const deps = makeRunnerDeps();
    const runner = buildRunner(deps, { adversaryAppId: undefined });
    await expect(runner.triggerAdversary()).resolves.toBeUndefined();
  });
});

// ============================================================
// forwardedProps 构造
// ============================================================

describe('AgentRunner:forwardedProps', () => {
  it('postChat 收到 forwardedProps(scene_id/building_id/drill_id/status)', async () => {
    const deps = makeRunnerDeps();
    let receivedProps: Record<string, unknown> = {};
    const postChat: PostChatFn = async (params: PostAgentChatParams) => {
      receivedProps = params.forwardedProps ?? {};
      return streamFrom(sse({ type: 'finish', finishReason: 'stop' }));
    };

    const runner = buildRunner(deps, { postChat });
    await runner.triggerCommander('x');

    expect(receivedProps.scene_id).toBe('scene-465718852859613184');
    expect(receivedProps.building_id).toBe('b-21');
    expect(receivedProps.drill_id).toBe('drill-1');
    expect(receivedProps.status).toBeDefined();
    // status 是 DisasterStatus 快照
    const status = receivedProps.status as { clock: number; fireLevel: number };
    expect(status.clock).toBe(0);
    expect(status.fireLevel).toBe(1);
  });
});

// ============================================================
// conversation_id 缓存(信息性)
// ============================================================

describe('AgentRunner:conversation_id', () => {
  it('首次 SSE 收 conversation_id 后缓存(不抛,不影响后续)', async () => {
    const deps = makeRunnerDeps();
    const logger = silentLogger();
    const sseText =
      sse({ type: 'conversation_id', conversation_id: 'conv-test-123' }) +
      sse({ type: 'finish', finishReason: 'stop' });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText), logger });
    await runner.triggerCommander('x');

    // logger.info 被调(记录 conversation_id)—— warns 为空,验证不报错
    expect(logger.warns.length).toBe(0);
  });
});

// ============================================================
// 未知 toolName / 忽略类工具
// ============================================================

describe('AgentRunner:忽略类与未知 toolName', () => {
  it('query_scene_state / query_building_profile → 忽略(bus/recorder 无副作用)', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);

    const sseText =
      sse({ type: 'tool-call', toolCallId: 'q1', toolName: 'query_scene_state', args: '{}' }) +
      sse({ type: 'tool-call', toolCallId: 'q2', toolName: 'query_building_profile', args: '{}' });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    expect(busSpy).not.toHaveBeenCalled();
    expect(recSpy).not.toHaveBeenCalled();
  });

  it('未知 toolName → 不记事件树,不 inject', async () => {
    const deps = makeRunnerDeps();
    const busSpy = vi.fn();
    deps.bus.subscribe(busSpy);
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);

    const sseText = sse({
      type: 'tool-call',
      toolCallId: 'unk1',
      toolName: 'some_unknown_tool',
      args: '{}',
    });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    expect(busSpy).not.toHaveBeenCalled();
    expect(recSpy).not.toHaveBeenCalled();
  });

  it('task/spacequery/getTwins* 等编排/查询工具 → 不记事件树', async () => {
    const deps = makeRunnerDeps();
    const recSpy = vi.fn();
    deps.recorder.subscribe(recSpy);

    const sseText =
      sse({ type: 'tool-call', toolCallId: 't1', toolName: 'task', args: '{}' }) +
      sse({ type: 'tool-call', toolCallId: 't2', toolName: 'spacequery', args: '{}' }) +
      sse({
        type: 'tool-call',
        toolCallId: 't3',
        toolName: 'getTwinsFunctionByIdentifier',
        args: '{}',
      });

    const runner = buildRunner(deps, { postChat: fakePostChatReturning(sseText) });
    await runner.triggerCommander('x');

    expect(recSpy).not.toHaveBeenCalled();
  });
});
