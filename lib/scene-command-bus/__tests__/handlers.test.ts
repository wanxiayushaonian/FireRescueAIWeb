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
