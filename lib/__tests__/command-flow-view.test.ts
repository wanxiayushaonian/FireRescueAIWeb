import { describe, it, expect } from 'vitest';
import { ViewDirector, type MapAdapter } from '../command-flow/view-director';

function mockAdapter(): MapAdapter & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    focusIncident: (s) => calls.push(`focus:${s.lat},${s.lng}`),
    fitRoutes: (s) => calls.push(`fitRoutes:${s.points.length}`),
    panTo: (ll) => calls.push(`panTo:${ll[0]}`),
    resetView: () => calls.push('reset'),
  };
}

describe('ViewDirector', () => {
  it('auto-flow 聚焦:空闲时执行', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.requestFocus({ kind: 'focusIncident', lng: 115.99, lat: 29.7 });
    expect(adapter.calls).toEqual(['focus:29.7,115.99']);
  });

  it('用户操作中 auto-focus 被丢弃(用户操作优先)', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.notifyUserInteract();
    v.requestFocus({ kind: 'focusIncident', lng: 115.99, lat: 29.7 });
    expect(adapter.calls).toEqual([]);
  });

  it('跟随中剧本聚焦被丢弃,不打断', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.startFollow({ latLng: () => [29.71, 115.98] });
    v.requestFocus({ kind: 'focusIncident', lng: 115.99, lat: 29.7 });
    expect(adapter.calls).not.toContain('focus:29.7,115.99');
    expect(v.getOwner()).toBe('follow');
  });

  it('跟随每帧 panTo 车辆,停止后不再 panTo', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.startFollow({ latLng: () => [29.72, 116.0] }); // startFollow 内部立即吸附一次
    v.updateFollow();
    v.updateFollow();
    v.stopFollow();
    v.updateFollow();
    expect(adapter.calls.filter((c) => c.startsWith('panTo')).length).toBe(3); // 吸附1 + 每帧2
  });

  it('跟随中用户拖图 → 退出跟随', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.startFollow({ latLng: () => [29.71, 115.98] }); // 初始吸附 1 次 panTo
    v.notifyUserInteract();
    expect(v.getOwner()).toBe('user');
    expect(adapter.calls.filter((c) => c.startsWith('panTo')).length).toBe(1); // 拖图后不再 panTo
  });

  it('settle/reset 分别无动作与复位', () => {
    const adapter = mockAdapter();
    const v = new ViewDirector({ adapter });
    v.requestFocus({ kind: 'settle' });
    v.requestFocus({ kind: 'reset' });
    expect(adapter.calls).toEqual(['reset']);
  });

  it('onFollowChange 回调跟随进出', () => {
    const adapter = mockAdapter();
    const changes: boolean[] = [];
    const v = new ViewDirector({ adapter, onFollowChange: (f) => changes.push(f) });
    v.startFollow({ latLng: () => [29.71, 115.98] });
    v.stopFollow();
    expect(changes).toEqual([true, false]);
  });
});
