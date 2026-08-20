import { describe, it, expect } from 'vitest';
import { FlowDirector, type FlowClock, type FlowHandlers } from '../command-flow/flow-director';
import type { ScriptAction } from '../command-flow/types';

function fakeClock(): FlowClock & { advance(ms: number): void } {
  let now = 0;
  let rafId = 1;
  const queue = new Map<number, (now: number) => void>();
  const clock: FlowClock & { advance: (ms: number) => void } = {
    now: () => now,
    raf: (cb) => { const id = rafId++; queue.set(id, cb); return id; },
    cancel: (id) => { queue.delete(id); },
    advance: (ms) => {
      now += ms;
      for (const [id, cb] of [...queue]) { queue.delete(id); cb(now); }
    },
  };
  return clock;
}

function mockHandlers(): FlowHandlers & { log: string[] } {
  const log: string[] = [];
  return {
    log,
    toast: (m) => log.push(`toast:${m}`),
    timeline: (_k, label) => log.push(`timeline:${label}`),
    view: (spec) => log.push(`view:${spec.kind}`),
    setStatus: (to) => log.push(`status:${to}`),
    pushRec: (t) => log.push(`rec:${t}`),
    panel: (id, open) => log.push(`panel:${id}:${open}`),
    convoy: (a) => log.push(`convoy:${a}`),
    stage: (s) => log.push(`stage:${s}`),
  };
}

const SCRIPT: ScriptAction[] = [
  { at: 0, kind: 'stage', stage: '接警' },
  { at: 200, kind: 'view', spec: { kind: 'focusIncident', lng: 1, lat: 1 } },
  { at: 500, kind: 'convoy', action: 'start' },
  { at: 500, kind: 'toast', msg: 'same-tick' },
];

describe('FlowDirector', () => {
  it('按 at 排序触发,同一时刻多个动作按输入顺序全部触发', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    clock.advance(0);
    expect(h.log).toEqual(['stage:接警']);
    clock.advance(500);
    expect(h.log).toContain('convoy:start');
    expect(h.log).toContain('toast:same-tick');
    expect(h.log).toContain('view:focusIncident');
  });

  it('全部触发后自动停止', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    clock.advance(1000);
    expect(d.isRunning()).toBe(false);
  });

  it('cancel 立即停止且后续不触发', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    clock.advance(200);
    d.cancel();
    const count = h.log.length;
    clock.advance(5000);
    expect(h.log.length).toBe(count);
  });

  it('run 替换旧剧本(先 cancel 再开新)', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    d.run([{ at: 0, kind: 'toast', msg: 'new' }]);
    clock.advance(0);
    expect(h.log[h.log.length - 1]).toBe('toast:new');
  });

  it('getStage 随 stage 动作更新', () => {
    const clock = fakeClock();
    const h = mockHandlers();
    const d = new FlowDirector(clock, h);
    d.run(SCRIPT);
    clock.advance(0);
    expect(d.getStage()).toBe('接警');
  });
});
