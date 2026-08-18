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
  /** 指挥 agent 周期简报频率(每 N tick;0/缺省=仅启动时一次)。 */
  readonly commanderEveryNTicks?: number;
  readonly logger?: DrillLogger;
  /**
   * 场景身份 key(通常 = 剧本 id)。变化时重建 runner,确保切换剧本后
   * commanderAppId/sceneId/buildingId/drillId 用新值(DrillToolbar 仅 idle 允许
   * 切换剧本,故重建不会 mid-session 中断运行中演练)。
   */
  readonly scenarioKey: string;
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
 * runner 在 scenarioKey 变化时重建(切换剧本用新 appId/sceneId);其余参数经
 * paramsRef 实时读取(bus/state/recorder 等单例 identity 稳定)。
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
      commanderEveryNTicks: p.commanderEveryNTicks,
      logger: p.logger,
    });
    // scenarioKey 变化(切换剧本)时重建 runner;Toolbar 锁定非 idle 选择器,
    // 故重建只在 idle 发生,不中断运行中演练。
  }, [params.scenarioKey]);

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
