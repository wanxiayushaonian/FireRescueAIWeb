import { beforeEach, describe, expect, it } from 'vitest';
import {
  __resetOperationSessionForTest,
  getOperationSession,
  setOperationEffectivePlan,
  setOperationInitialPlan,
  startOperationSession,
} from '../operation-session';

const scenario = {
  buildingId: 'b-21', buildingName: '21号楼', floor: '5F', material: '电气', trapped: 5,
};

beforeEach(() => __resetOperationSessionForTest());

describe('operation-session', () => {
  it('同一会话承载演练初始方案和人工有效部署', () => {
    const session = startOperationSession('drill', scenario);
    setOperationInitialPlan(session.id, {
      source: 'agent', responseLevel: 'Ⅱ级响应', forces: ['康泰路专职队'], tactics: ['内攻控火'],
      keyPoints: ['先搜救'], routes: { attack: ['1F', '5F'], evacuate: ['5F', '13F'] },
      safetyControls: ['空呼监测'], reinforcementTriggers: ['火势升级'], evidence: [], warnings: [], generatedAt: 1,
    });
    setOperationEffectivePlan(session.id, ['人工改派：改由A楼梯间进攻']);
    const current = getOperationSession();
    expect(current).toMatchObject({ source: 'drill', status: 'planned' });
    expect(current?.initialPlan?.source).toBe('agent');
    expect(current?.effectivePlan).toEqual(['人工改派：改由A楼梯间进攻']);
  });

  it('旧会话不能覆盖新会话', () => {
    const oldSession = startOperationSession('drill', scenario);
    const newSession = startOperationSession('live', { ...scenario, buildingId: 'b-live' });
    setOperationEffectivePlan(oldSession.id, ['过期写入']);
    expect(getOperationSession()?.id).toBe(newSession.id);
    expect(getOperationSession()?.effectivePlan).toBeNull();
  });
});
