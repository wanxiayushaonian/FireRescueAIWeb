import { describe, it, expect } from 'vitest';
import { VehicleConvoy, type ConvoyClock } from '../command-flow/vehicle-convoy';

/** 假时钟:手动推进。 */
function fakeClock(): ConvoyClock & { advance(ms: number): void } {
  let now = 0;
  let rafId = 1;
  const queue = new Map<number, (now: number) => void>();
  const clock: ConvoyClock & { advance: (ms: number) => void } = {
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

const POLY: [number, number][] = [[29.71, 115.98], [29.7068, 115.9895]];

describe('VehicleConvoy', () => {
  it('start 后逐帧推进 progress 并按插值更新位置', () => {
    const clock = fakeClock();
    const seen: number[] = [];
    const convoy = new VehicleConvoy(
      [{ stationName: '城东救援站', polyline: POLY, durationMs: 1000 }],
      clock,
      { onProgress: (vs) => seen.push(vs[0].progress) },
    );
    convoy.start();
    clock.advance(500);
    expect(seen[seen.length - 1]).toBeCloseTo(0.5, 3);
    expect(convoy.getVehicles()[0].latLng?.[1]).toBeGreaterThan(POLY[0][1]);
  });

  it('到达后 onArrive + onDone,isRunning 归 false', () => {
    const clock = fakeClock();
    const arrived: string[] = [];
    let done = false;
    const convoy = new VehicleConvoy(
      [{ stationName: '城东救援站', polyline: POLY, durationMs: 1000 }],
      clock,
      { onArrive: (v) => arrived.push(v.stationName), onDone: () => { done = true; } },
    );
    convoy.start();
    clock.advance(1000);
    clock.advance(10);
    expect(arrived).toEqual(['城东救援站']);
    expect(done).toBe(true);
    expect(convoy.isRunning()).toBe(false);
  });

  it('cancel 停止推进,不再触发回调', () => {
    const clock = fakeClock();
    let calls = 0;
    const convoy = new VehicleConvoy(
      [{ stationName: '城东救援站', polyline: POLY, durationMs: 1000 }],
      clock,
      { onProgress: () => { calls += 1; } },
    );
    convoy.start();
    clock.advance(200);
    convoy.cancel();
    clock.advance(2000);
    expect(calls).toBe(1); // 仅取消前那一次
  });

  it('空车队 start 为 no-op', () => {
    const clock = fakeClock();
    const convoy = new VehicleConvoy([], clock, {});
    convoy.start();
    expect(convoy.isRunning()).toBe(false);
  });
});
