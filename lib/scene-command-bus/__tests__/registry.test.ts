import { describe, it, expect, vi } from 'vitest';
import { registerSceneTool, dispatch, __resetForTest } from '../registry';
import type { SceneSdkLike } from '../types';

const fakeSdk = { fly: vi.fn() } as unknown as SceneSdkLike;

describe('scene-command-bus registry', () => {
  it('注册的 handler 被 dispatch 调用', async () => {
    __resetForTest();
    const h = vi.fn().mockResolvedValue(undefined);
    registerSceneTool('fly_to', h);
    await dispatch({ id: '1', tool: 'fly_to', args: { target: 'd1' }, ts: 0 }, fakeSdk);
    expect(h).toHaveBeenCalledWith({ target: 'd1' }, fakeSdk);
  });

  it('未知 tool 不抛,只记录', async () => {
    __resetForTest();
    await expect(
      dispatch({ id: '2', tool: 'nope', args: {}, ts: 0 }, fakeSdk),
    ).resolves.toBeUndefined();
  });

  it('handler 抛错被吞掉,不卡死后续命令', async () => {
    __resetForTest();
    const err = vi.fn().mockRejectedValue(new Error('boom'));
    const ok = vi.fn().mockResolvedValue(undefined);
    registerSceneTool('a', err);
    registerSceneTool('b', ok);
    await dispatch({ id: '3', tool: 'a', args: {}, ts: 0 }, fakeSdk).catch(() => {});
    await dispatch({ id: '4', tool: 'b', args: {}, ts: 0 }, fakeSdk);
    expect(ok).toHaveBeenCalled();
  });
});
