import { describe, it, expect, vi } from 'vitest';
import { manageSceneBridge } from '../bridge';
import type { SceneSdkLike } from '../types';

/**
 * 最小事件目标 mock:记录监听器,可手动派发事件,可查监听器数量。
 * 模拟 window 上 ustudio:scene 事件的订阅/退订。
 */
function makeEventTarget() {
  const listeners = new Map<string, Set<(e: { detail?: unknown }) => void>>();
  return {
    addEventListener(type: string, fn: (e: { detail?: unknown }) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (e: { detail?: unknown }) => void) {
      listeners.get(type)?.delete(fn);
    },
    dispatch(type: string, detail?: unknown) {
      listeners.get(type)?.forEach((fn) => fn({ detail }));
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

function makeFixture() {
  const disconnect = vi.fn();
  const connect = vi.fn().mockReturnValue(disconnect);
  const register = vi.fn();
  const sdk: SceneSdkLike = { fly: vi.fn() };
  const eventTarget = makeEventTarget();
  return {
    deps: {
      getSdk: vi.fn().mockReturnValue(sdk),
      register,
      connect,
      eventTarget,
    },
    mocks: { disconnect, connect, register, sdk },
  };
}

describe('manageSceneBridge', () => {
  it('mount 时 sdk 未就绪(getSdk 抛错)→ 不建连,等待就绪事件', () => {
    const { deps, mocks } = makeFixture();
    deps.getSdk.mockImplementation(() => {
      throw new Error('场景 SDK 未就绪');
    });

    manageSceneBridge('http://mcp/scene-events', deps);

    expect(mocks.connect).not.toHaveBeenCalled();
    expect(deps.eventTarget.listenerCount('ustudio:scene')).toBe(1);
  });

  it('mount 时 sdk 已就绪 → 立即 register + connect(覆盖组件晚挂载的边界)', () => {
    const { deps, mocks } = makeFixture();

    manageSceneBridge('http://mcp/scene-events', deps);

    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledWith('http://mcp/scene-events', mocks.sdk);
  });

  it('sdk 未就绪时收到就绪事件(sceneId 非空)→ 首次建连,无需断开', () => {
    const { deps, mocks } = makeFixture();
    deps.getSdk.mockImplementation(() => {
      throw new Error('未就绪');
    });
    manageSceneBridge('http://mcp/scene-events', deps);

    deps.getSdk.mockReturnValue(mocks.sdk);
    deps.eventTarget.dispatch('ustudio:scene', { sceneId: 'scene-1' });

    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });

  it('已连接时收到就绪事件(切换场景,sdk 变了)→ 先断开旧连接再重建', () => {
    const { deps, mocks } = makeFixture();
    manageSceneBridge('http://mcp/scene-events', deps);
    mocks.connect.mockClear();
    mocks.register.mockClear();

    deps.eventTarget.dispatch('ustudio:scene', { sceneId: 'scene-2' });

    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.register).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it('收到退出事件(sceneId 为空)→ 断开当前连接,不再建连', () => {
    const { deps, mocks } = makeFixture();
    manageSceneBridge('http://mcp/scene-events', deps);
    mocks.connect.mockClear();

    deps.eventTarget.dispatch('ustudio:scene', { sceneId: '' });

    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('卸载 → 移除事件监听并断开当前连接', () => {
    const { deps, mocks } = makeFixture();
    const uninstall = manageSceneBridge('http://mcp/scene-events', deps);
    expect(deps.eventTarget.listenerCount('ustudio:scene')).toBe(1);

    uninstall();

    expect(deps.eventTarget.listenerCount('ustudio:scene')).toBe(0);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
  });
});
