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
  isDuplicateEvent,
  appendManualDecision,
  selectEffectiveDeploy,
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

describe('双通道入库去重(2026-08-25 验收:同一 tool-call 经 adapter 与场景总线各送达一次)', () => {
  beforeEach(() => resetConfrontation());
  const seed = { building: 'b', floor: '5F', material: '电气', trapped: 2, seed: 's' };

  it('相同特情在窗口内只落一条,且态势增量不重复应用', () => {
    beginConfrontation({ seedScenario: seed });
    const evt = { specialType: 'explosion', emergency: '5F 配电间爆炸', location: '5F', delta: { fireLevelDelta: 1 }, tSec: 12 };
    appendInject(evt);
    appendInject(evt); // 总线第二份
    const s = getConfrontationState();
    expect(s.events.filter((e) => e.kind === 'inject')).toHaveLength(1);
    expect(s.situation.fireLevel).toBe(2); // 初始 1 + 仅一次 delta
  });

  it('相同调整只落一条;adapter 两行形态与总线合并行形态视为同一调整', () => {
    beginConfrontation({ seedScenario: seed });
    appendInject({ emergency: '特情', tSec: 10 });
    appendAdjust({ seq: 1, adjustments: ['出水压制', '控制5层火势'], tSec: 13 }); // adapter 形态
    appendAdjust({ seq: 1, adjustments: ['出水压制：控制5层火势'], tSec: 14 }); // 总线形态(合并行)
    expect(getConfrontationState().events.filter((e) => e.kind === 'adjust')).toHaveLength(1);
  });

  it('特情原始别名与 canonical 形态视为同一特情', () => {
    beginConfrontation({ seedScenario: seed });
    appendInject({ specialType: 'explosion', emergency: '5F 配电间爆炸起火', tSec: 10 });
    appendInject({ specialType: '爆炸', emergency: '5F 配电间爆炸起火', tSec: 11 });
    expect(getConfrontationState().events.filter((e) => e.kind === 'inject')).toHaveLength(1);
  });

  it('新一局清空去重窗口,相同内容可再次入库', () => {
    beginConfrontation({ seedScenario: seed });
    appendInject({ specialType: 'explosion', emergency: '5F 配电间爆炸', tSec: 10 });
    beginConfrontation({ seedScenario: seed });
    appendInject({ specialType: 'explosion', emergency: '5F 配电间爆炸', tSec: 10 });
    expect(getConfrontationState().events.filter((e) => e.kind === 'inject')).toHaveLength(1);
  });

  it('isDuplicateEvent 只读查询不登记', () => {
    beginConfrontation({ seedScenario: seed });
    expect(isDuplicateEvent({ kind: 'inject', specialType: 'explosion', emergency: 'x' })).toBe(false);
    expect(isDuplicateEvent({ kind: 'inject', specialType: 'explosion', emergency: 'x' })).toBe(false);
    appendInject({ specialType: 'explosion', emergency: 'x', tSec: 1 });
    expect(isDuplicateEvent({ kind: 'inject', specialType: 'explosion', emergency: 'x' })).toBe(true);
  });
});

describe('P0 人工决策闭环', () => {
  beforeEach(() => resetConfrontation());
  const seed = { building: 'b', floor: '5F', material: '电气', trapped: 2, seed: 's' };

  it('appendManualDecision 落独立 manual 事件(含 note/supersedes,摘要取首行)', () => {
    beginConfrontation({ seedScenario: seed });
    appendInject({ emergency: '特情', tSec: 10 });
    appendAdjust({ seq: 1, adjustments: ['agent 建议'], tSec: 15 });
    const adjId = getConfrontationState().events.find((e) => e.kind === 'adjust')!.id;
    appendManualDecision({ seq: 1, lines: ['人工方案 A', '人工方案 B'], note: '现场水源不足', supersedes: adjId, tSec: 60 });
    const manual = getConfrontationState().events.find((e) => e.kind === 'manual');
    expect(manual).toMatchObject({
      seq: 1,
      adjustments: ['人工方案 A', '人工方案 B'],
      note: '现场水源不足',
      supersedes: adjId,
      emergency: '人工方案 A',
    });
  });

  it('selectEffectiveDeploy:无人工决策用 planner 部署,有人工决策以最近一条为准', () => {
    beginConfrontation({ seedScenario: seed });
    expect(selectEffectiveDeploy(getConfrontationState())).toBeNull();
    setDeployLines(['planner 部署']);
    expect(selectEffectiveDeploy(getConfrontationState())).toMatchObject({ source: 'planner', lines: ['planner 部署'] });
    appendInject({ emergency: '特情', tSec: 10 });
    appendManualDecision({ seq: 1, lines: ['人工方案'], tSec: 60 });
    expect(selectEffectiveDeploy(getConfrontationState())).toMatchObject({ source: 'manual', lines: ['人工方案'] });
    appendManualDecision({ seq: 2, lines: ['人工方案 v2'], tSec: 90 });
    expect(selectEffectiveDeploy(getConfrontationState())?.lines).toEqual(['人工方案 v2']);
  });

  it('manual 事件不影响特情↔调整配对(不参与 outcomes 行)', () => {
    beginConfrontation({ seedScenario: seed });
    appendInject({ specialType: 'explosion', emergency: '爆炸', delta: { fireLevelDelta: 1 }, tSec: 10 });
    appendAdjust({ seq: 1, adjustments: ['agent 建议'], tSec: 15 });
    appendManualDecision({ seq: 1, lines: ['人工方案'], tSec: 60 });
    const s = getConfrontationState();
    expect(s.events.filter((e) => e.kind === 'inject')).toHaveLength(1);
    expect(s.events.filter((e) => e.kind === 'adjust')).toHaveLength(1);
    expect(s.situation.fireLevel).toBe(2); // manual 不带 delta,态势不变
  });
});
