// 共享 Planner 调用：一级预案输出和后续作战会话使用同一个 preflight 契约。

import {
  ConfrontAdapter,
  type ConfrontAgentProgress,
} from '../drill/confrontation/confront-adapter';
import type { OperationPlanProposal, OperationSession } from './operation-session';

export async function generateInitialPlanForSession(opts: {
  readonly session: OperationSession;
  readonly appId: string;
  readonly adapter?: ConfrontAdapter;
  readonly onProgress?: ConfrontAgentProgress;
}): Promise<OperationPlanProposal | null> {
  const adapter = opts.adapter ?? new ConfrontAdapter();
  const { scenario } = opts.session;
  const output = await adapter.generatePreflightPlan({
    appId: opts.appId,
    buildingId: scenario.buildingId,
    sceneId: scenario.sceneId ?? '',
    drillId: opts.session.id,
    seed: {
      building: scenario.buildingName,
      floor: scenario.floor,
      material: scenario.material,
      trapped: scenario.trapped,
      seed: `#${opts.session.id.slice(-6).toUpperCase()}`,
    },
  }, opts.onProgress);
  if (!output) return null;
  return { ...output, source: 'agent', generatedAt: Date.now() };
}
