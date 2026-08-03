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
}));

beforeEach(() => { vi.clearAllMocks(); });

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

  it('list_fire_devices 返回 BFF 数据', async () => {
    const res = await handleToolCall('list_fire_devices', {});
    const text = res.content[0].text;
    expect(text).toContain('s1');
    expect(text).toContain('fireDeviceCount');
  });
});
