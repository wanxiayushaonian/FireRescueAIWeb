import { describe, it, expect } from 'vitest';
import { defaultStructural, defaultObservational, defaultRecipe } from '../types';

describe('default factories', () => {
  it('defaultStructural 不裁剪(null)且引擎默认 3D/GIS 开', () => {
    const s = defaultStructural();
    expect(s.visibleStories).toBeNull();
    expect(s.visibleBuildings).toBeNull();
    expect(s.mode).toBe('3D');
    expect(s.yExtend).toBe(false);
    expect(s.gisVisible).toBe(true);
    expect(s.labels.visible).toBe(false);
    expect(s.reachable).toBeUndefined();
    expect(s.connectivity).toBeUndefined();
  });

  it('defaultObservational 不触碰 focus/viewpoint', () => {
    const o = defaultObservational();
    expect(o.focus).toBeUndefined();
    expect(o.viewpoint).toBeUndefined();
    expect(o.routes).toEqual([]);
    expect(o.polygons).toEqual([]);
  });

  it('defaultRecipe 组合两者', () => {
    const r = defaultRecipe();
    expect(r.structural.mode).toBe('3D');
    expect(r.observational.routes).toEqual([]);
  });
});
