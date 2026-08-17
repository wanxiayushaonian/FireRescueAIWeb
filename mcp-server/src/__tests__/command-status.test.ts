import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordCommandStatus, getCommandStatus, pruneExpired, __resetStatusesForTest,
} from '../command-status.js';

beforeEach(() => {
  __resetStatusesForTest();
  vi.useRealTimers();
});

describe('command-status', () => {
  it('record 后 get 返回完整状态', () => {
    recordCommandStatus('cmd_1', 'fly_to', 'ok');
    const st = getCommandStatus('cmd_1');
    expect(st).not.toBeNull();
    expect(st!.tool).toBe('fly_to');
    expect(st!.status).toBe('ok');
  });

  it('error 状态带 message', () => {
    recordCommandStatus('cmd_2', 'focus_floors', 'error', 'handler error: focus_floors');
    const st = getCommandStatus('cmd_2');
    expect(st!.status).toBe('error');
    expect(st!.message).toContain('handler error');
  });

  it('不存在 → null', () => {
    expect(getCommandStatus('nope')).toBeNull();
  });

  it('过期项 → null 且被惰性清理', () => {
    vi.useFakeTimers();
    recordCommandStatus('cmd_old', 'fly_to', 'ok');
    vi.advanceTimersByTime(11 * 60 * 1000);
    expect(getCommandStatus('cmd_old')).toBeNull();
    expect(pruneExpired()).toBe(0); // 惰性已删
  });

  it('record 覆盖同 id(最新状态生效)', () => {
    recordCommandStatus('cmd_3', 'fly_to', 'error', 'first');
    recordCommandStatus('cmd_3', 'fly_to', 'ok');
    expect(getCommandStatus('cmd_3')!.status).toBe('ok');
  });
});
