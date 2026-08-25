import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  querySceneState,
  injectEvent,
  reportDecision,
  __getDrillLogForTest,
  __resetDrillLogForTest,
} from '../drill-control.js';
import { publishCommand } from '../command-bus.js';
import { recordCommandStatus, __resetStatusesForTest } from '../command-status.js';

vi.mock('../command-bus.js', () => ({
  publishCommand: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  __resetDrillLogForTest();
  __resetStatusesForTest();
});

describe('querySceneState(链路状态)', () => {
  it('无浏览器通道时明确降级 online=false', async () => {
    const s = await querySceneState('d1');
    expect(s.wired).toBe(true);
    expect(s.drillId).toBe('d1');
    expect(s.online).toBe(false);
    expect(s.loggedEvents).toBe(0);
    expect(s.loggedDecisions).toBe(0);
    expect(s.lastEntryTs).toBeNull();
    expect(s.message).toMatch(/不是浏览器实时态势/);
  });

  it('inject + report 后降级计数 + lastEntryTs 更新', async () => {
    injectEvent('d1', { type: 'wind_shift' });
    reportDecision('d1', { action: 'dispatch' });
    const s = await querySceneState('d1');
    expect(s.loggedEvents).toBe(1);
    expect(s.loggedDecisions).toBe(1);
    expect(s.lastEntryTs).toBeTypeOf('number');
  });

  it('不同 drill_id 互不影响', async () => {
    injectEvent('d1', { type: 'wind_shift' });
    const s2 = await querySceneState('d2');
    expect(s2.loggedEvents).toBe(0);
  });

  it('在线浏览器 ack/result → 返回真实快照', async () => {
    const sink = (cmd: Parameters<typeof publishCommand>[0]) => {
      expect(cmd.tool).toBe('drill_query_state');
      expect(cmd.args).toEqual({ drill_id: 'd-live' });
      recordCommandStatus(cmd.id, cmd.tool, 'ok', undefined, {
        active: true,
        status: 'running',
        seed: { floor: '5F', trapped: 5 },
        events: [{ kind: 'inject', emergency: '风向突变' }],
      });
    };
    const s = await querySceneState('d-live', sink, 100);
    expect(s.online).toBe(true);
    expect(s.queryCommandId).toMatch(/^cmd_/);
    expect(s.snapshot).toMatchObject({ status: 'running', seed: { floor: '5F' } });
  });

  it('浏览器无 ack → 超时降级且保留 queryCommandId', async () => {
    const s = await querySceneState('d-timeout', vi.fn(), 0);
    expect(s.online).toBe(false);
    expect(s.queryCommandId).toMatch(/^cmd_/);
    expect(s.message).toMatch(/超时/);
  });
});

describe('injectEvent(转发对抗舱)', () => {
  it('记日志 + 返回 wired=true ack + 透传场景命令', () => {
    const ack = injectEvent('d1', { type: 'explosion', payload: { floor: 'B1' } }, publishCommand);
    expect(ack.accepted).toBe(true);
    expect(ack.wired).toBe(true);
    expect(ack.drillId).toBe('d1');
    expect(ack.note).toMatch(/对抗舱/);
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'drill_inject_event',
      args: { drill_id: 'd1', event: { type: 'explosion', payload: { floor: 'B1' } } },
    }));
    // 日志可观测
    const log = __getDrillLogForTest('d1');
    expect(log).toHaveLength(1);
    expect(log[0].kind).toBe('event');
  });

  it('无 sink 时不发送场景命令,但仍记日志', () => {
    const ack = injectEvent('d2', { type: 'wind_shift' });
    expect(ack.accepted).toBe(true);
    expect(__getDrillLogForTest('d2')).toHaveLength(1);
  });
});

describe('reportDecision(转发对抗舱)', () => {
  it('记日志 + 返回 wired=true ack + 透传场景命令', () => {
    const ack = reportDecision('d1', { action: 'dispatch', targets: ['station-a'] }, publishCommand);
    expect(ack.accepted).toBe(true);
    expect(ack.wired).toBe(true);
    expect(ack.note).toMatch(/对抗舱/);
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'drill_report_decision',
      args: { drill_id: 'd1', decision: { action: 'dispatch', targets: ['station-a'] } },
    }));
    expect(__getDrillLogForTest('d1')).toHaveLength(1);
  });
});
