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

  it('未知 tool 不抛,返回 no-handler', async () => {
    __resetForTest();
    await expect(
      dispatch({ id: '2', tool: 'nope', args: {}, ts: 0 }, fakeSdk),
    ).resolves.toEqual({ status: 'no-handler' });
  });

  it('handler 成功返回 ok,失败返回 error(供 transport ack)', async () => {
    __resetForTest();
    const err = vi.fn().mockRejectedValue(new Error('boom'));
    const ok = vi.fn().mockResolvedValue(undefined);
    registerSceneTool('a', err);
    registerSceneTool('b', ok);
    await expect(dispatch({ id: '3', tool: 'a', args: {}, ts: 0 }, fakeSdk)).resolves.toEqual({ status: 'error' });
    await expect(dispatch({ id: '4', tool: 'b', args: {}, ts: 0 }, fakeSdk)).resolves.toEqual({ status: 'ok' });
  });

  it('handler 返回值随 result 返回(查询类工具 ack 数据源)', async () => {
    __resetForTest();
    registerSceneTool('q', async () => ({ total: 3, fireByTypeLabel: { 室内消火栓: 2 } }));
    const out = await dispatch({ id: '5', tool: 'q', args: {}, ts: 0 }, fakeSdk);
    expect(out.status).toBe('ok');
    expect(out.result).toEqual({ total: 3, fireByTypeLabel: { 室内消火栓: 2 } });
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
