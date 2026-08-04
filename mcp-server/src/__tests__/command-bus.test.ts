import { describe, it, expect, vi } from 'vitest';
import { publishCommand, subscribeCommands } from '../command-bus.js';
import type { SceneCommand } from '../types.js';

const cmd = (tool: string): SceneCommand => ({ id: 'c1', tool, args: {}, ts: 1 });

describe('command-bus', () => {
  it('订阅者收到 publish 的命令', () => {
    const fn = vi.fn();
    subscribeCommands(fn);
    publishCommand(cmd('fly_to'));
    expect(fn).toHaveBeenCalledWith(expect.objectContaining({ tool: 'fly_to' }));
  });

  it('取消订阅后不再收到', () => {
    const fn = vi.fn();
    const unsub = subscribeCommands(fn);
    unsub();
    publishCommand(cmd('fly_to'));
    expect(fn).not.toHaveBeenCalled();
  });

  it('多个订阅者都收到', () => {
    const a = vi.fn(), b = vi.fn();
    subscribeCommands(a); subscribeCommands(b);
    publishCommand(cmd('fly_to'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('一个订阅者抛错不影响其他订阅者收到命令', () => {
    const throwing = vi.fn(() => { throw new Error('boom'); });
    const ok = vi.fn();
    subscribeCommands(throwing);
    subscribeCommands(ok);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    publishCommand(cmd('fly_to'));
    spy.mockRestore();
    expect(throwing).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
  });
});
