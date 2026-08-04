import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFireDeviceList } from '../bff-client.js';

beforeEach(() => { vi.unstubAllGlobals(); });

describe('bff-client 错误处理', () => {
  it('BFF 返回非 200 时,错误信息带上响应 body(uStudio 具体报错)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{"message":"scene not found"}', {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    ));
    await expect(getFireDeviceList({ sceneId: '123' })).rejects.toThrow(/scene not found/);
  });

  it('BFF 网络错误时抛出可读信息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));
    await expect(getFireDeviceList({ sceneId: '123' })).rejects.toThrow(/网络错误或超时/);
  });
});
