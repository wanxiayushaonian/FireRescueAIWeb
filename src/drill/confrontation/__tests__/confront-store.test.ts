import { describe, it, expect, beforeEach } from 'vitest';
import {
  resetConfrontation,
  getConfrontationState,
  beginConfrontation,
  appendInject,
  appendAdjust,
  respondAdjustment,
  setThinking,
  setDeployLines,
  startAgentActivity,
  updateAgentActivity,
  finishAgentActivity,
  setEvaluating,
  finishConfrontationLocal,
  exitConfrontation,
} from '../confront-store';

describe('confront-store', () => {
  beforeEach(() => resetConfrontation());

  it('初始为空闲态', () => {
    const s = getConfrontationState();
    expect(s.active).toBe(false);
    expect(s.status).toBe('idle');
    expect(s.events).toEqual([]);
  });

  it('beginConfrontation 进入 running 并置 seedScenario', () => {
    beginConfrontation({ seedScenario: { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#ABCD' } });
    const s = getConfrontationState();
    expect(s.active).toBe(true);
    expect(s.status).toBe('running');
    expect(s.seedScenario?.floor).toBe('5F');
    expect(s.situation).toEqual({ fireLevel: 1, trappedCount: 5, damageLevel: 0 });
  });

  it('appendInject 保存类型/delta 并演化火势、被困、损伤和风向', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: '5F', material: '电气', trapped: 2, seed: 's' } });
    appendInject({
      specialType: 'wind_shift',
      emergency: '风向突变且新增被困',
      location: '6F',
      delta: { fireLevelDelta: 1, trappedDelta: 2, damageDelta: 1, wind: '西北' },
      tSec: 12,
    });
    const s = getConfrontationState();
    const event = s.events[0];
    expect(event.specialType).toBe('wind_shift');
    expect(event.delta).toEqual({ fireLevelDelta: 1, trappedDelta: 2, damageDelta: 1, wind: '西北' });
    expect(s.situation).toEqual({ fireLevel: 2, trappedCount: 4, damageLevel: 1, wind: '西北' });
  });

  it('appendInject 追加特情且 seq 自增', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    appendInject({ emergency: '风向突变', tSec: 12 });
    appendInject({ emergency: '电气复燃', tSec: 35 });
    const evts = getConfrontationState().events.filter((e) => e.kind === 'inject');
    expect(evts.map((e) => e.seq)).toEqual([1, 2]);
    expect(evts[0].emergency).toBe('风向突变');
  });

  it('appendAdjust 挂到指定 seq 成对', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    appendInject({ emergency: '特情', tSec: 10 });
    appendAdjust({ seq: 1, adjustments: ['改道'], tSec: 13 });
    const s = getConfrontationState();
    expect(s.events.filter((e) => e.kind === 'adjust')).toHaveLength(1);
    expect(s.events.filter((e) => e.kind === 'adjust')[0].adjustments).toEqual(['改道']);
  });

  it('respondAdjustment 记录 adopted 与响应用时', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    appendInject({ emergency: '特情', tSec: 10 });
    const adj = getConfrontationState().events.find((e) => e.kind === 'adjust') as never;
    expect(adj).toBeUndefined();
    // 先补 adjust
    appendAdjust({ seq: 1, adjustments: ['a'], tSec: 12 });
    const adjId = getConfrontationState().events.find((e) => e.kind === 'adjust')!.id;
    respondAdjustment(adjId, true, 20);
    const updated = getConfrontationState().events.find((e) => e.id === adjId)!;
    expect(updated.adopted).toBe(true);
    expect(updated.respondedWithinSec).toBe(8);
  });

  it('setThinking 切换研判态', () => {
    setThinking(true);
    expect(getConfrontationState().thinking).toBe(true);
  });

  it('记录安全的智能体执行轨迹与真实工具状态', () => {
    startAgentActivity('adversary', '2089649115801305090', '正在读取当前态势');
    updateAgentActivity({ phase: '正在查询重点部位', toolName: 'query_key_parts', toolStatus: 'calling' });
    updateAgentActivity({ phase: '重点部位已返回', toolName: 'query_key_parts', toolStatus: 'done' });
    finishAgentActivity('success', '特情已通过多样性校验');
    const activity = getConfrontationState().agentActivity;
    expect(activity).toMatchObject({
      role: 'adversary', appIdSuffix: '305090', status: 'success',
      phase: '特情已通过多样性校验',
      tools: [{ name: 'query_key_parts', status: 'done' }],
    });
    expect(getConfrontationState().thinking).toBe(false);
  });

  it('setEvaluating 控制真实评估等待态', () => {
    setEvaluating(true);
    expect(getConfrontationState().evaluating).toBe(true);
  });

  it('finishConfrontationLocal 写评估并置 finished', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    const review = { score: 90, conclusion: '良好', comments: ['ok'], outcomes: ['timely' as const], archived: true, source: 'agent' as const };
    finishConfrontationLocal(review, 3, 100);
    const s = getConfrontationState();
    expect(s.status).toBe('finished');
    expect(s.review?.score).toBe(90);
    expect(s.lastRound?.archived).toBe(true);
  });

  it('exitConfrontation 关闭对抗舱', () => {
    beginConfrontation({ seedScenario: { building: 'b', floor: 'f', material: 'm', trapped: 1, seed: 's' } });
    exitConfrontation();
    expect(getConfrontationState().active).toBe(false);
  });
});

describe('deploy(初步部署 agent 真实输出)', () => {
  beforeEach(() => resetConfrontation());

  it('setDeployLines 写入;beginConfrontation 开局重置为 null', () => {
    expect(getConfrontationState().deploy).toBeNull();
    beginConfrontation({ seedScenario: { building: 'b', floor: '5F', material: '电气', trapped: 3, seed: 's' } });
    setDeployLines(['首调:城东站 5 车', '主战:5F 内攻一组']);
    expect(getConfrontationState().deploy).toEqual(['首调:城东站 5 车', '主战:5F 内攻一组']);
    // 重新开局(重新随机)→ 旧部署清空
    beginConfrontation({ seedScenario: { building: 'b', floor: '6F', material: '油气', trapped: 2, seed: 's2' } });
    expect(getConfrontationState().deploy).toBeNull();
  });
});
