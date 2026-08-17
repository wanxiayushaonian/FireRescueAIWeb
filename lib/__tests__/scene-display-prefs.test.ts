import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadSceneDisplayPrefs,
  saveSceneDisplayPrefs,
  sceneDisplayKey,
} from '../scene-display-prefs';
import { defaultVisibleByLevel, FIRE_DEVICE_TYPES } from '../scene-categories';

/** node 环境无 localStorage:装一个内存版(window + localStorage) */
function installMemoryStorage() {
  const store = new Map<string, string>();
  const ls = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal('window', { localStorage: ls });
  return store;
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scene-display-prefs 持久化', () => {
  it('保存 → 读取往返一致', () => {
    const prefs = { whole: { OpenSprinklerHead: false, Door: false }, single: { Stairs: true } };
    saveSceneDisplayPrefs('scene-1', prefs);
    expect(loadSceneDisplayPrefs('scene-1')).toEqual(prefs);
  });

  it('key 与场景 id 绑定:不同场景互不串档', () => {
    saveSceneDisplayPrefs('scene-A', { whole: { Door: false } });
    expect(loadSceneDisplayPrefs('scene-B')).toBeNull();
    expect(sceneDisplayKey('scene-A')).not.toBe(sceneDisplayKey('scene-B'));
  });

  it('损坏 JSON / 非对象 → null(调用方回落默认)', () => {
    window.localStorage.setItem(sceneDisplayKey('s'), 'not-json{');
    expect(loadSceneDisplayPrefs('s')).toBeNull();
    window.localStorage.setItem(sceneDisplayKey('s'), '[1,2]');
    expect(loadSceneDisplayPrefs('s')).toBeNull();
  });

  it('脏数据过滤:非 boolean 值与非层级键被剔除', () => {
    window.localStorage.setItem(
      sceneDisplayKey('s'),
      JSON.stringify({ whole: { Door: false, junk: 'x', Wall: 1 }, hack: { Door: false } }),
    );
    expect(loadSceneDisplayPrefs('s')).toEqual({ whole: { Door: false } });
  });

  it('空层级表(重置后)不产出空对象层级', () => {
    window.localStorage.setItem(sceneDisplayKey('s'), JSON.stringify({ whole: {}, single: { Door: true } }));
    expect(loadSceneDisplayPrefs('s')).toEqual({ single: { Door: true } });
  });

  it('无 window/空 sceneId 安全 no-op', () => {
    vi.unstubAllGlobals();
    expect(loadSceneDisplayPrefs('s')).toBeNull();
    expect(() => saveSceneDisplayPrefs('', { whole: {} })).not.toThrow();
  });
});

describe('defaultVisibleByLevel 层级默认(与 level-policy 渲染实际对齐)', () => {
  it('single:全显', () => {
    const d = defaultVisibleByLevel('single');
    expect(Object.values(d).every(Boolean)).toBe(true);
  });

  it('whole/multi:消防系统类(含消控室设备)/门/空间默认藏,室外区(消火栓/车辆/出入口)/楼梯/结构保留', () => {
    for (const lvl of ['whole', 'multi'] as const) {
      const d = defaultVisibleByLevel(lvl);
      for (const t of FIRE_DEVICE_TYPES) expect(d[t]).toBe(false);
      expect(d.Kongzhitai).toBe(false); // 消控室设备随消防系统默认藏
      expect(d.Door).toBe(false);
      expect(d.Space).toBe(false);
      expect(d.Stairs).toBe(true);
      expect(d.Wall).toBe(true);
      expect(d.Story).toBe(true);
      // 室外区:室外装备默认显
      expect(d.OutdoorFireHydrant).toBe(true);
      expect(d.SmokeExhaustFireTruck).toBe(true);
      expect(d.RemoteWaterSupplyFireTruck).toBe(true);
      expect(d.SceneInOut).toBe(true);
    }
  });
});
