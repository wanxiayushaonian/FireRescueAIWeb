import { describe, it, expect } from 'vitest';
import { detectDesync, type SdkLayerState } from '../desync';
import { defaultStructural, type StructuralRecipe } from '../types';

function recipe(over: Partial<StructuralRecipe> = {}): StructuralRecipe {
  return { ...defaultStructural(), ...over };
}

describe('detectDesync', () => {
  it('一致(null 全集 == SDK 空数组)→ 不脱节', () => {
    const sdk: SdkLayerState = { stories: [], mode: '3D', yExtend: false, gis: { visible: true } };
    const r = recipe({ visibleStories: null, mode: '3D', yExtend: false, gisVisible: true });
    expect(detectDesync(sdk, r)).toEqual({ desynced: false, fields: [] });
  });

  it('楼层不一致(顺序无关)→ stories 脱节', () => {
    const sdk: SdkLayerState = { stories: ['b', 'a'] };
    const r = recipe({ visibleStories: ['a'] });
    const res = detectDesync(sdk, r);
    expect(res.desynced).toBe(true);
    expect(res.fields).toContain('stories');
  });

  it('相同楼层集合顺序不同 → 不脱节', () => {
    const sdk: SdkLayerState = { stories: ['a', 'b'] };
    const r = recipe({ visibleStories: ['b', 'a'] });
    expect(detectDesync(sdk, r).desynced).toBe(false);
  });

  it('mode 不同 → 脱节', () => {
    const sdk: SdkLayerState = { mode: '2D' };
    const r = recipe({ mode: '3D' });
    expect(detectDesync(sdk, r).desynced).toBe(true);
    expect(detectDesync(sdk, r).fields).toContain('mode');
  });

  it('yExtend 不同 → 脱节', () => {
    const sdk: SdkLayerState = { yExtend: true };
    const r = recipe({ yExtend: false });
    expect(detectDesync(sdk, r).desynced).toBe(true);
    expect(detectDesync(sdk, r).fields).toContain('yExtend');
  });

  it('gis 不同 → 脱节', () => {
    const sdk: SdkLayerState = { gis: { visible: false } };
    const r = recipe({ gisVisible: true });
    expect(detectDesync(sdk, r).desynced).toBe(true);
    expect(detectDesync(sdk, r).fields).toContain('gis');
  });

  it('缺 sdk 或 recipe → 不脱节(静默)', () => {
    expect(detectDesync(null, recipe()).desynced).toBe(false);
    expect(detectDesync({}, null).desynced).toBe(false);
  });
});
