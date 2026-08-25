/**
 * 对抗舱场景命令 handler 单测（scene-tools.ts）。
 *
 * 链路：mcp-server inject_event/report_decision → /scene-events →
 * scene-command-bus dispatch → drill_inject_event/drill_report_decision handler
 * → confront-store.appendInject/appendAdjust。
 *
 * 前置条件契约：对抗舱未在 running 时 handler 抛错 → dispatch 返回 'error'
 * （transport 据此回 error ack，agent 经 get_scene_command_status 可见）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch, __resetForTest } from '@/lib/scene-command-bus/registry';
import type { SceneSdkLike } from '@/lib/scene-command-bus/types';
import { registerConfrontSceneTools } from '../scene-tools';
import {
  appendAdjust,
  beginConfrontation,
  getConfrontationState,
  resetConfrontation,
} from '../confront-store';

const SDK = {} as SceneSdkLike;

function cmd(tool: string, args: Record<string, unknown>, id?: string) {
  return { id: id ?? `cmd-test-${tool}-${Math.random().toString(36).slice(2, 8)}`, tool, args, ts: Date.now() };
}

beforeEach(() => {
  __resetForTest();
  resetConfrontation();
  registerConfrontSceneTools(undefined, { drillId: 'd1' });
});

describe('drill_query_state handler', () => {
  it('未开始时也返回当前 idle 快照', async () => {
    const r = await dispatch(cmd('drill_query_state', { drill_id: 'd1' }), SDK);
    expect(r.status).toBe('ok');
    expect(r.result).toMatchObject({ active: false, status: 'idle', elapsedSec: 0, events: [] });
  });

  it('运行时返回灾情种子与对抗事件', async () => {
    beginConfrontation({
      plannedTotal: 3,
      seedScenario: { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#TEST' },
    });
    await dispatch(cmd('drill_inject_event', {
      drill_id: 'd1', event: { type: 'wind_shift', description: '风向突变', payload: { location: '5F', wind: '西北' } },
    }), SDK);
    const r = await dispatch(cmd('drill_query_state', { drill_id: 'd1' }), SDK);
    expect(r.result).toMatchObject({
      active: true,
      status: 'running',
      seed: { floor: '5F', trapped: 5 },
      situation: { fireLevel: 1, trappedCount: 5, damageLevel: 0, wind: '西北' },
      events: [{ kind: 'inject', type: 'wind_shift', emergency: '风向突变', location: '5F' }],
    });
  });

  it('drill_id 不匹配 → error，避免串局', async () => {
    const r = await dispatch(cmd('drill_query_state', { drill_id: 'other' }), SDK);
    expect(r).toEqual({ status: 'error' });
  });
});

describe('drill_inject_event handler', () => {
  it('对抗舱未开启 → error（拒绝执行）', async () => {
    const r = await dispatch(
      cmd('drill_inject_event', { drill_id: 'd1', event: { description: '电梯故障' } }),
      SDK,
    );
    expect(r).toEqual({ status: 'error' });
    expect(getConfrontationState().events).toHaveLength(0);
  });

  it('对抗舱 running → appendInject 写入特情', async () => {
    beginConfrontation({
      plannedTotal: 3,
      seedScenario: { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#TEST' },
    });
    const r = await dispatch(
      cmd('drill_inject_event', {
        drill_id: 'd1',
        event: { type: 'explosion', description: '5层配电间爆炸', payload: { fireLevelDelta: 1 } },
      }),
      SDK,
    );
    expect(r).toEqual({ status: 'ok' });
    const events = getConfrontationState().events;
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('inject');
    expect(events[0].specialType).toBe('explosion');
    expect(events[0].emergency).toBe('5层配电间爆炸');
    expect(getConfrontationState().situation.fireLevel).toBe(2);
  });

  it('event 缺 description 时回退 type,再回退占位文案', async () => {
    beginConfrontation({ plannedTotal: 3 });
    await dispatch(cmd('drill_inject_event', { drill_id: 'd1', event: { type: 'wind_shift', payload: { wind: '西北' } } }), SDK);
    expect(getConfrontationState().events[0].emergency).toBe('wind_shift');
    await dispatch(cmd('drill_inject_event', { drill_id: 'd1', event: { payload: { trappedDelta: 1 } } }), SDK);
    expect(getConfrontationState().events[1].emergency).toBe('外部注入特情');
  });

  it('同类型第二次注入 → error 且不写入 store', async () => {
    beginConfrontation({ plannedTotal: 3 });
    await dispatch(cmd('drill_inject_event', {
      drill_id: 'd1', event: { type: 'explosion', description: '第一次爆炸', payload: { fireLevelDelta: 1 } },
    }), SDK);
    const r = await dispatch(cmd('drill_inject_event', {
      drill_id: 'd1', event: { type: 'explosion', description: '另一处爆炸', payload: { damageDelta: 1 } },
    }), SDK);
    expect(r).toEqual({ status: 'error' });
    expect(getConfrontationState().events.filter((event) => event.kind === 'inject')).toHaveLength(1);
  });

  it('同一特情经双通道重复下发 → 幂等 ok 且不重复入库', async () => {
    beginConfrontation({
      plannedTotal: 3,
      seedScenario: { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#T' },
    });
    const args = {
      drill_id: 'd1',
      event: { type: 'explosion', description: '5层配电间爆炸', payload: { fireLevelDelta: 1 } },
    };
    const r1 = await dispatch(cmd('drill_inject_event', args), SDK);
    const r2 = await dispatch(cmd('drill_inject_event', args), SDK);
    expect(r1).toEqual({ status: 'ok' });
    expect(r2).toEqual({ status: 'ok' });
    expect(getConfrontationState().events.filter((e) => e.kind === 'inject')).toHaveLength(1);
    expect(getConfrontationState().situation.fireLevel).toBe(2); // 增量不重复应用
  });
});

describe('drill_report_decision handler', () => {
  it('对抗舱未开启 → error（拒绝执行）', async () => {
    const r = await dispatch(
      cmd('drill_report_decision', { drill_id: 'd1', decision: { action: 'dispatch' } }),
      SDK,
    );
    expect(r).toEqual({ status: 'error' });
  });

  it('对抗舱 running → appendAdjust 写入动态调整(action + rationale)', async () => {
    beginConfrontation({ plannedTotal: 3 });
    const r = await dispatch(
      cmd('drill_report_decision', {
        drill_id: 'd1',
        decision: { action: '出水压制', rationale: '控制5层火势蔓延' },
      }),
      SDK,
    );
    expect(r).toEqual({ status: 'ok' });
    const events = getConfrontationState().events;
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('adjust');
    expect(events[0].adjustments).toEqual(['出水压制：控制5层火势蔓延']);
  });

  it('decision 缺 rationale → 仅 action', async () => {
    beginConfrontation({ plannedTotal: 3 });
    await dispatch(
      cmd('drill_report_decision', { drill_id: 'd1', decision: { action: '搜救' } }),
      SDK,
    );
    expect(getConfrontationState().events[0].adjustments).toEqual(['搜救']);
  });

  it('开局阶段(无特情)的 report_decision 记为 seq=0 初始部署上报', async () => {
    beginConfrontation({ plannedTotal: 3 });
    await dispatch(
      cmd('drill_report_decision', { drill_id: 'd1', decision: { action: '首调2站5车', rationale: '按预案' } }),
      SDK,
    );
    expect(getConfrontationState().events[0]).toMatchObject({ kind: 'adjust', seq: 0 });
  });

  it('特情后的 report_decision seq 对齐特情轮次', async () => {
    beginConfrontation({ plannedTotal: 3 });
    await dispatch(cmd('drill_inject_event', {
      drill_id: 'd1', event: { type: 'explosion', description: '5层爆炸', payload: { fireLevelDelta: 1 } },
    }), SDK);
    await dispatch(
      cmd('drill_report_decision', { drill_id: 'd1', decision: { action: '撤退', rationale: '安全优先' } }),
      SDK,
    );
    expect(getConfrontationState().events.find((e) => e.kind === 'adjust')?.seq).toBe(1);
  });

  it('driver 两行形态与总线合并行形态的同一调整只落一条', async () => {
    beginConfrontation({ plannedTotal: 3 });
    await dispatch(cmd('drill_inject_event', {
      drill_id: 'd1', event: { type: 'explosion', description: '5层爆炸', payload: { fireLevelDelta: 1 } },
    }), SDK);
    // adapter 通道(聊天流解析,两行)
    appendAdjust({ seq: 1, adjustments: ['出水压制', '控制5层火势'], tSec: 20 });
    // 总线通道(平台执行 MCP 工具,合并行)
    await dispatch(
      cmd('drill_report_decision', { drill_id: 'd1', decision: { action: '出水压制', rationale: '控制5层火势' } }),
      SDK,
    );
    expect(getConfrontationState().events.filter((e) => e.kind === 'adjust')).toHaveLength(1);
  });
});
