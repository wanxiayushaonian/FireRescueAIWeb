import { describe, it, expect, vi, afterEach } from 'vitest';
import { connectSceneEvents } from '../transport';
import { dispatch, registerSceneTool, __resetForTest } from '../registry';
import type { SceneSdkLike } from '../types';

/**
 * EventSource stub:记录实例以便测试手动派发 onmessage。
 * connectSceneEvents 只用 onmessage/onerror/close 三个成员。
 */
function stubEventSource() {
  const instances: Array<{
    url: string;
    onmessage: ((ev: { data: string }) => void) | null;
    onerror: ((e: unknown) => void) | null;
    closed: boolean;
    close: () => void;
  }> = [];
  class FakeES {
    url: string;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    closed = false;
    constructor(url: string) {
      this.url = url;
      instances.push(this as never);
    }
    close() {
      this.closed = true;
    }
  }
  vi.stubGlobal('EventSource', FakeES);
  return instances;
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetForTest();
  vi.restoreAllMocks();
});

describe('connectSceneEvents', () => {
  it('命令到达 → getSdk 成功时以当前 sdk 派发', async () => {
    const instances = stubEventSource();
    const sdk = { fly: vi.fn() } as unknown as SceneSdkLike;
    const seen: string[] = [];
    __resetForTest();
    registerSceneTool('t_probe', async (_args, s) => {
      seen.push(String(s === sdk));
    });

    const disconnect = connectSceneEvents('/api/scene-events', () => sdk);
    instances[0].onmessage?.({ data: JSON.stringify({ id: '1', tool: 't_probe', args: {}, ts: 0 }) });
    await vi.waitFor(() => expect(seen).toEqual(['true']));
    disconnect();
    expect(instances[0].closed).toBe(true);
  });

  it('getSdk 抛错(3D 未就绪)→ 仍派发:GIS 类 handler 可执行,不因缺 sdk 中断命令流', async () => {
    const instances = stubEventSource();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seen: string[] = [];
    __resetForTest();
    registerSceneTool('t_gis', async () => {
      seen.push('ok');
    });

    const disconnect = connectSceneEvents('/api/scene-events', () => {
      throw new Error('3D 未就绪');
    });
    instances[0].onmessage?.({ data: JSON.stringify({ id: '1', tool: 't_gis', args: {}, ts: 0 }) });
    await vi.waitFor(() => expect(seen).toEqual(['ok']));
    disconnect();
    expect(errSpy).not.toHaveBeenCalled();
  });

  it('坏 JSON → console.error,不抛出、不断流', () => {
    const instances = stubEventSource();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const disconnect = connectSceneEvents('/api/scene-events', () => ({}) as SceneSdkLike);
    expect(() => instances[0].onmessage?.({ data: '{bad json' })).not.toThrow();
    expect(errSpy).toHaveBeenCalledTimes(1);
    disconnect();
  });
});
