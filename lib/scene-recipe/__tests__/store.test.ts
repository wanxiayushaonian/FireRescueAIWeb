import { describe, it, expect, vi } from 'vitest';
import { RecipeStore } from '../store';
import { defaultRecipe } from '../types';

describe('RecipeStore', () => {
  it('初始 current = defaultRecipe', () => {
    const s = new RecipeStore();
    expect(s.getCurrent().structural.mode).toBe('3D');
  });

  it('patchStructural 改字段后 listener 收到 changeset(structural touched)', () => {
    const s = new RecipeStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.patchStructural({ mode: '2D' });
    expect(listener).toHaveBeenCalledTimes(1);
    const [, cs] = listener.mock.calls[0];
    expect(cs.structural.__touched).toBe(true);
    expect(cs.structural.mode).toBe('2D');
  });

  it('观察层 patch 不触发结构层 changeset(正交)', () => {
    const s = new RecipeStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.patchObservational({ focus: { objectId: 'X' } });
    const [, cs] = listener.mock.calls[0];
    expect(cs.observational.__touched).toBe(true);
    expect(cs.structural.__touched).toBe(false);
  });

  it('相同 patch(无变更)→ 不通知 listener(幂等)', () => {
    const s = new RecipeStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.patchStructural({ mode: '3D' }); // 默认就是 3D
    expect(listener).not.toHaveBeenCalled();
  });

  it('setStructural 整体替换(preset)', () => {
    const s = new RecipeStore();
    const listener = vi.fn();
    s.subscribe(listener);
    s.setStructural({ ...defaultRecipe().structural, mode: '2D', gisVisible: false });
    expect(s.getCurrent().structural.mode).toBe('2D');
    expect(s.getCurrent().structural.gisVisible).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
