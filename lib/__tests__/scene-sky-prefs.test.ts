import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadSceneSkyPref, saveSceneSkyPref, sceneSkyKey } from '../scene-sky-prefs';

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const storage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  vi.stubGlobal('window', { localStorage: storage });
  return { store, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('scene-sky-prefs 默认开启(2026-08-17 用户定)', () => {
  it('无存档 → 默认开启', () => {
    stubStorage();
    expect(loadSceneSkyPref('s1')).toBe(true);
  });

  it("存档 '0' → 关闭", () => {
    stubStorage({ [sceneSkyKey('s1')]: '0' });
    expect(loadSceneSkyPref('s1')).toBe(false);
  });

  it("存档非 0(旧数据 '1') → 开启", () => {
    stubStorage({ [sceneSkyKey('s1')]: '1' });
    expect(loadSceneSkyPref('s1')).toBe(true);
  });

  it('save 开 → 删除存档回默认态;save 关 → 写 0', () => {
    const { store } = stubStorage({ [sceneSkyKey('s1')]: '0' });
    saveSceneSkyPref('s1', true);
    expect(store.has(sceneSkyKey('s1'))).toBe(false);
    saveSceneSkyPref('s1', false);
    expect(store.get(sceneSkyKey('s1'))).toBe('0');
  });

  it('非浏览器环境 → 默认开(服务端渲染安全)', () => {
    expect(loadSceneSkyPref('s1')).toBe(true);
  });
});
