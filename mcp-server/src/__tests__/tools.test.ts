import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleToolCall, TOOLS } from '../tools.js';
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
  getFloorList: vi.fn().mockResolvedValue([
    { id: 'f1', name: '一层' },
    { id: 'f2', name: '二层' },
  ]),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tools', () => {
  it('TOOLS 含 list_fire_devices / fly_to / list_floors', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain('list_fire_devices');
    expect(names).toContain('fly_to');
    expect(names).toContain('list_floors');
  });

  it('fly_to 发布命令,文案明确为「已下发」而非暗示确定执行成功', async () => {
    const res = await handleToolCall('fly_to', { target: 'd1' });
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({ tool: 'fly_to', args: { target: 'd1' } }));
    expect(res.content[0].text).toContain('已下发');
    expect(res.content[0].text).not.toMatch(/^ack:/);
  });

  it('fly_to 空 target → 标记错误且不发布命令', async () => {
    const res = await handleToolCall('fly_to', {});
    expect(res.isError).toBe(true);
    expect(publishCommand).not.toHaveBeenCalled();
  });

  it('list_fire_devices 返回设备清单', async () => {
    const res = await handleToolCall('list_fire_devices', {});
    const text = res.content[0].text;
    expect(text).toContain('"total": 2');
    expect(text).toContain('d1');
    expect(text).toContain('喷淋头A');
    expect(text).toContain('ClosedSprinklerHead');
  });

  it('list_floors 返回楼层清单(id/name)', async () => {
    const res = await handleToolCall('list_floors', {});
    const text = res.content[0].text;
    expect(text).toContain('"total": 2');
    expect(text).toContain('f1');
    expect(text).toContain('一层');
  });
});
