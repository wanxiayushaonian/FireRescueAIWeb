import { describe, it, expect, vi } from 'vitest';
import { mapSceneAction } from '@/lib/scene-action-executor';
import type { SceneAction } from '@/mock/sceneLog';

function makeRuntime() {
  return {
    flyToObject: vi.fn(),
    highlightObject: vi.fn(),
    clearObjectHighlight: vi.fn(),
    setViewMode: vi.fn(),
    switchFloor: vi.fn(),
    resetCamera: vi.fn(),
  };
}

describe('mapSceneAction', () => {
  it('flyTo + id target → runtime.flyToObject(id)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '460054423520694453', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(true);
    expect(r.flyToObject).toHaveBeenCalledWith('460054423520694453');
  });

  it('flyTo + 中文建筑名 target → 不执行(记日志,待 id 对齐)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '金茂大厦', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/id/i);
    expect(r.flyToObject).not.toHaveBeenCalled();
  });

  it('highlight → runtime.highlightObject(id, color)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'highlight', target: 'obj-123', source: '面板' };
    mapSceneAction(a, r);
    expect(r.highlightObject).toHaveBeenCalledWith('obj-123', expect.anything());
  });

  it('switchFloor → runtime.setViewMode(按 params.storyIds)', () => {
    const r = makeRuntime();
    const a: SceneAction = {
      ts: '00:00:00', action: 'switchFloor', target: '5F', source: '面板',
      params: { storyIds: ['story-5'] },
    };
    mapSceneAction(a, r);
    expect(r.switchFloor).toHaveBeenCalledWith(['story-5']);
  });

  it('resetView → runtime.resetCamera()', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'resetView', target: '', source: '面板' };
    mapSceneAction(a, r);
    expect(r.resetCamera).toHaveBeenCalled();
  });

  it('showRoute/drawZone/addMarker/updatePlan → 忽略(留架构第4步)', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'showRoute', target: 'r1', source: '面板' };
    const res = mapSceneAction(a, r);
    expect(res.executed).toBe(false);
    expect(res.reason).toMatch(/忽略|未实现/);
  });

  it('空 target → 不执行', () => {
    const r = makeRuntime();
    const a: SceneAction = { ts: '00:00:00', action: 'flyTo', target: '', source: '面板' };
    expect(mapSceneAction(a, r).executed).toBe(false);
  });
});
