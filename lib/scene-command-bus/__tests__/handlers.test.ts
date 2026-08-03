import { describe, it, expect, vi } from 'vitest';
import { registerDefaultTools } from '../handlers.js';
import { dispatch, __resetForTest } from '../registry.js';

describe('fly_to handler', () => {
  it('调用 sdk.fly(target)', async () => {
    __resetForTest();
    const fly = vi.fn().mockResolvedValue(undefined);
    const sdk = { fly } as unknown as Record<string, unknown>;
    registerDefaultTools(sdk as never);
    await dispatch({ id: '1', tool: 'fly_to', args: { target: 'd1' }, ts: 0 }, sdk as never);
    expect(fly).toHaveBeenCalledWith('d1');
  });
});
