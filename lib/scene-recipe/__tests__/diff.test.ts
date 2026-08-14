import { describe, it, expect } from 'vitest';
import { diffRecipe } from '../diff';
import { defaultRecipe } from '../types';

describe('diffRecipe', () => {
  it('相同 recipe → 两层都不 touched', () => {
    const r = defaultRecipe();
    const c = diffRecipe(r, r);
    expect(c.structural.__touched).toBe(false);
    expect(c.observational.__touched).toBe(false);
  });

  it('visibleStories 集合相等(顺序无关)→ 不 touched', () => {
    const base = defaultRecipe();
    const a = { ...base, structural: { ...base.structural, visibleStories: ['a', 'b'] } };
    const b = { ...base, structural: { ...base.structural, visibleStories: ['b', 'a'] } };
    const c = diffRecipe(a, b);
    expect(c.structural.__touched).toBe(false);
  });

  it('mode 变更 → structural touched 且含 mode', () => {
    const prev = defaultRecipe();
    const next = { ...prev, structural: { ...prev.structural, mode: '2D' as const } };
    const c = diffRecipe(prev, next);
    expect(c.structural.__touched).toBe(true);
    expect(c.structural.mode).toBe('2D');
  });

  it('detailLevel 变更 → structural touched 且含 detailLevel', () => {
    const prev = defaultRecipe();
    const next = { ...prev, structural: { ...prev.structural, detailLevel: 'structure' as const } };
    const c = diffRecipe(prev, next);
    expect(c.structural.__touched).toBe(true);
    expect(c.structural.detailLevel).toBe('structure');
  });

  it('focus 变更 → observational touched,structural 不 touched(正交)', () => {
    const prev = defaultRecipe();
    const next = { ...prev, observational: { ...prev.observational, focus: { objectId: 'X' } } };
    const c = diffRecipe(prev, next);
    expect(c.observational.__touched).toBe(true);
    expect(c.observational.focus).toEqual({ objectId: 'X' });
    expect(c.structural.__touched).toBe(false);
  });

  it('reachable 从 undefined → 有值 视为变更', () => {
    const prev = defaultRecipe();
    const next = { ...prev, structural: { ...prev.structural, reachable: { nodeId: 'N1' } } };
    const c = diffRecipe(prev, next);
    expect(c.structural.__touched).toBe(true);
    expect(c.structural.reachable).toEqual({ nodeId: 'N1' });
  });

  it('routes 仅 visible 变化的 id 进 changeset', () => {
    const prev = { ...defaultRecipe(), observational: { routes: [{ id: 'r1', visible: true }, { id: 'r2', visible: false }], polygons: [] } };
    const next = { ...prev, observational: { routes: [{ id: 'r1', visible: false }, { id: 'r2', visible: false }], polygons: [] } };
    const c = diffRecipe(prev, next);
    expect(c.observational.__touched).toBe(true);
    expect(c.observational.routes).toEqual([{ id: 'r1', visible: false }]);
  });
});
