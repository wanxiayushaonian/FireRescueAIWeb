import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getFireDeviceList, getSceneTree, getFloorList, __resetTreeCacheForTest } from '../bff-client.js';

beforeEach(() => {
  vi.unstubAllGlobals();
  __resetTreeCacheForTest();
});

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

describe('getSceneTree 缓存', () => {
  it('TTL 内复用,fetch 只调一次(设备/楼层共享)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'r', name: 'r', type: 'Building', children: [] }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await getSceneTree({ sceneId: '1' });
    await getSceneTree({ sceneId: '1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('getFloorList 拍平楼层', () => {
  it('收集 type 匹配 story/floor 的节点,排除设备', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        id: 'b', name: '楼栋', type: 'Building',
        children: [
          { id: 'f1', name: '一层', type: 'Story', children: [] },
          { id: 'd1', name: '设备', type: 'StandaloneSmokeAlarm', children: [] },
          { id: 'f2', name: '二层', type: 'Floor', children: [] },
        ],
      }), { headers: { 'content-type': 'application/json' } }),
    ));
    const floors = await getFloorList({ sceneId: '1' });
    expect(floors).toEqual([
      { id: 'f1', name: '一层' },
      { id: 'f2', name: '二层' },
    ]);
  });
});
