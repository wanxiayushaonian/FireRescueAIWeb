'use client';

/**
 * useAgentRunner — AgentRunner 的 React hook 包装。
 *
 * 封装 AgentRunner 生命周期:持有引用(hook 调用方通过 options 传入 bus/state/recorder),
 * 暴露 {runner, recorder, bus, state} 供组件使用,并提供 onTick 方法注册到 TimelineEngine。
 *
 * 不自建 bus/state/recorder(由上层统一管理,确保与 useTimeline/useDisasterState 共享实例)。
 * hook 测试推迟(无 RTL)—— 纯逻辑由 agent-runner.test.ts 覆盖。
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  AgentRunner,
  type AgentRunnerOptions,
  type DrillLogger,
} from '@/lib/drill/agent-runner';
import type { EventBus } from '@/lib/drill/event-bus';
import type { DisasterState } from '@/lib/drill/disaster-state';
import type { DrillRecorder } from '@/lib/drill/drill-recorder';

/** useAgentRunner 入参(不含 bus/state/recorder——由上层传入)。 */
export interface UseAgentRunnerParams {
  readonly bus: EventBus;
  readonly state: DisasterState;
  readonly recorder: DrillRecorder;
  readonly commanderAppId: string;
  readonly adversaryAppId?: string;
  readonly buildingId: string;
  readonly sceneId: string;
  readonly drillId: string;
  readonly postChat?: AgentRunnerOptions['postChat'];
  readonly adversaryEveryNTicks?: number;
  readonly logger?: DrillLogger;
}

export interface UseAgentRunnerResult {
  /** 底层 AgentRunner 实例(triggerCommander/triggerAdversary/onTick)。 */
  readonly runner: AgentRunner;
  readonly recorder: DrillRecorder;
  readonly bus: EventBus;
  readonly state: DisasterState;
}

/**
 * 持有 AgentRunner + 引用 bus/state/recorder。
 * runner 实例在参数 identity 稳定时复用(避免每 render 重建)。
 */
export function useAgentRunner(params: UseAgentRunnerParams): UseAgentRunnerResult {
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const runner = useMemo(() => {
    const p = paramsRef.current;
    return new AgentRunner({
      commanderAppId: p.commanderAppId,
      adversaryAppId: p.adversaryAppId,
      buildingId: p.buildingId,
      sceneId: p.sceneId,
      drillId: p.drillId,
      bus: p.bus,
      state: p.state,
      recorder: p.recorder,
      postChat: p.postChat,
      adversaryEveryNTicks: p.adversaryEveryNTicks,
      logger: p.logger,
    });
    // 仅在首次构建 runner;参数变更不重建(避免会话中断)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // unmount 时无需显式清理(AgentRunner 无 timer/监听器);保留 effect 位置以便后续扩展
  useEffect(() => {
    return () => {
      // 预留:未来若 runner 持有资源(abort controller 等),在此清理
    };
  }, []);

  return {
    runner,
    recorder: params.recorder,
    bus: params.bus,
    state: params.state,
  };
}
