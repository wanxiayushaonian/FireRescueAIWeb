import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleToolCall, TOOLS, __resetDeviceCacheForTest } from '../tools.js';
import { getFireDeviceList } from '../bff-client.js';
import { publishCommand } from '../command-bus.js';

vi.mock('../command-bus.js', () => ({
  publishCommand: vi.fn(),
}));

vi.mock('../bff-client.js', () => ({
  getSceneOverview: vi.fn().mockResolvedValue({
    sceneId: 's1',
    storyCount: 2,
    deviceCount: 5,
    fireDeviceCount: 1,
    ok: true,
  }),
  getFireDeviceList: vi.fn().mockResolvedValue([
    { id: 'd1', name: '喷淋头A', type: 'ClosedSprinklerHead' },
    { id: 'd2', name: '烟感B', type: 'StandaloneSmokeAlarm' },
  ]),
}));

beforeEach(() => {
  vi.clearAllMocks();
  __resetDeviceCacheForTest();
});

describe('tools', () => {
  it('TOOLS 含 list_fire_devices 与 fly_to', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain('list_fire_devices');
    expect(names).toContain('fly_to');
  });

  it('fly_to 发布 SceneCommand 并返回 ack', async () => {
    const res = await handleToolCall('fly_to', { target: 'd1' });
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({ tool: 'fly_to', args: { target: 'd1' } }));
    expect(res.content[0].text).toContain('fly_to');
  });

  it('list_fire_devices 返回设备清单', async () => {
    const res = await handleToolCall('list_fire_devices', {});
    const text = res.content[0].text;
    expect(text).toContain('"total": 2');
    expect(text).toContain('d1');
    expect(text).toContain('喷淋头A');
    expect(text).toContain('ClosedSprinklerHead');
  });

  it('list_fire_devices TTL 内复用缓存,不重复拉 BFF tree', async () => {
    await handleToolCall('list_fire_devices', {});
    await handleToolCall('list_fire_devices', {});
    // 第二次命中内存缓存,fetch 仅触发一次
    expect(getFireDeviceList).toHaveBeenCalledTimes(1);
  });
});
