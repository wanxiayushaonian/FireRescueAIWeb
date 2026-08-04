import { describe, it, expect, vi } from 'vitest';
import { registerDefaultTools } from '../handlers';
import { dispatch, __resetForTest } from '../registry';
import type { SceneSdkLike } from '../types';

describe('fly_to handler', () => {
  it('调用 sdk.fly(target)', async () => {
    __resetForTest();
    const fly = vi.fn().mockResolvedValue(undefined);
    const sdk: SceneSdkLike = { fly };
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'fly_to', args: { target: 'd1' }, ts: 0 }, sdk);
    expect(fly).toHaveBeenCalledWith('d1');
  });
});

describe('focus_objects handler', () => {
  it('空 ids → 调 cancelHeighLight 清除,不高亮', async () => {
    __resetForTest();
    const fly = vi.fn();
    const heighLight = vi.fn();
    const cancelHeighLight = vi.fn();
    const sdk = { fly, heighLight, cancelHeighLight } as never;
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'focus_objects', args: { ids: [] }, ts: 0 }, sdk);
    expect(cancelHeighLight).toHaveBeenCalled();
    expect(heighLight).not.toHaveBeenCalled();
    expect(fly).not.toHaveBeenCalled();
  });

  it('多 ids → 高亮全部 + 飞向第一个', async () => {
    __resetForTest();
    const fly = vi.fn();
    const heighLight = vi.fn();
    const cancelHeighLight = vi.fn();
    const sdk = { fly, heighLight, cancelHeighLight } as never;
    registerDefaultTools(sdk);
    await dispatch({ id: '1', tool: 'focus_objects', args: { ids: ['a', 'b'] }, ts: 0 }, sdk);
    expect(heighLight).toHaveBeenCalledWith('a', expect.anything());
    expect(heighLight).toHaveBeenCalledWith('b', expect.anything());
    expect(fly).toHaveBeenCalledWith('a');
    expect(cancelHeighLight).not.toHaveBeenCalled();
  });
});
