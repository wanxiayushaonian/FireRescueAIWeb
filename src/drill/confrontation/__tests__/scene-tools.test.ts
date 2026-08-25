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
  beginConfrontation,
  getConfrontationState,
  resetConfrontation,
} from '../confront-store';

const SDK = {} as SceneSdkLike;

function cmd(tool: string, args: Record<string, unknown>) {
  return { id: `cmd-test-${tool}`, tool, args, ts: Date.now() };
}

beforeEach(() => {
  __resetForTest();
  resetConfrontation();
  registerConfrontSceneTools();
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
    beginConfrontation({ plannedTotal: 3 });
    const r = await dispatch(
      cmd('drill_inject_event', {
        drill_id: 'd1',
        event: { type: 'explosion', description: '5层配电间爆炸' },
      }),
      SDK,
    );
    expect(r).toEqual({ status: 'ok' });
    const events = getConfrontationState().events;
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('inject');
    expect(events[0].emergency).toBe('5层配电间爆炸');
  });

  it('event 缺 description 时回退 type,再回退占位文案', async () => {
    beginConfrontation({ plannedTotal: 3 });
    await dispatch(cmd('drill_inject_event', { drill_id: 'd1', event: { type: 'wind_shift' } }), SDK);
    expect(getConfrontationState().events[0].emergency).toBe('wind_shift');
    await dispatch(cmd('drill_inject_event', { drill_id: 'd1', event: {} }), SDK);
    expect(getConfrontationState().events[1].emergency).toBe('外部注入特情');
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
});
