import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadSceneDisplayPrefs,
  saveSceneDisplayPrefs,
  sceneDisplayKey,
} from '../scene-display-prefs';
import { defaultVisibleByLevel, defaultCategoryVisibilityByLevel, FIRE_DEVICE_TYPES } from '../scene-categories';

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
  it('whole:白名单只显室外三件,结构/设施/门/楼梯/空间全藏(用户第三版定稿)', () => {
    const d = defaultVisibleByLevel('whole');
    for (const t of ['OutdoorFireHydrant', 'SmokeExhaustFireTruck', 'RemoteWaterSupplyFireTruck', 'SceneInOut']) {
      expect(d[t]).toBe(true);
    }
    for (const t of [...FIRE_DEVICE_TYPES, 'Door', 'Wall', 'Story', 'Building', 'Site', 'Stairs', 'Space']) {
      expect(d[t]).toBe(false);
    }
  });

  it('single:白名单只显消防设施+门,结构不显(用户第三版定稿)', () => {
    const d = defaultVisibleByLevel('single');
    for (const t of FIRE_DEVICE_TYPES) expect(d[t]).toBe(true);
    expect(d.Door).toBe(true);
    for (const t of ['OutdoorFireHydrant', 'SmokeExhaustFireTruck', 'RemoteWaterSupplyFireTruck', 'SceneInOut', 'Wall', 'Story', 'Building', 'Site', 'Stairs', 'Space']) {
      expect(d[t]).toBe(false);
    }
  });

  it('multi:白名单只显消防设施(无门),结构不显(用户第三版定稿)', () => {
    const d = defaultVisibleByLevel('multi');
    for (const t of FIRE_DEVICE_TYPES) expect(d[t]).toBe(true);
    for (const t of ['Door', 'OutdoorFireHydrant', 'SmokeExhaustFireTruck', 'RemoteWaterSupplyFireTruck', 'SceneInOut', 'Wall', 'Story', 'Building', 'Site', 'Stairs', 'Space']) {
      expect(d[t]).toBe(false);
    }
  });

  it('defaultCategoryVisibilityByLevel:三层级完整表(whole 室外三件/single 设施+门/multi 设施)', () => {
    const all = defaultCategoryVisibilityByLevel();
    expect(all.whole.OutdoorFireHydrant).toBe(true);
    expect(all.whole.IndoorFireHydrant).toBe(false);
    expect(all.single.IndoorFireHydrant).toBe(true);
    expect(all.single.Door).toBe(true);
    expect(all.single.OutdoorFireHydrant).toBe(false);
    expect(all.multi.IndoorFireHydrant).toBe(true);
    expect(all.multi.Door).toBe(false);
    expect(all.multi.OutdoorFireHydrant).toBe(false);
    for (const lvl of ['whole', 'single', 'multi'] as const) {
      expect(all[lvl].Wall).toBe(false); // 结构默认不开启
    }
  });
});
