import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimelineEngine } from '../timeline-engine';

/**
 * TimelineEngine 单测 — 用 vitest fake timers 验证 tick 调度。
 * 不依赖真实定时器精度,通过 vi.advanceTimersByTime 精确推进。
 */
describe('TimelineEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始状态:idle / clock=0 / speed=0', () => {
    const engine = new TimelineEngine();
    expect(engine.getStatus()).toBe('idle');
    expect(engine.getClock()).toBe(0);
    expect(engine.getSpeed()).toBe(0);
  });

  it('start 后按 interval tick,clock 递增,onTick 回调收到新值', () => {
    const engine = new TimelineEngine({ intervalMs: 1000 });
    const ticks: number[] = [];
    engine.onTick((c) => ticks.push(c));

    engine.start();
    expect(engine.getStatus()).toBe('running');
    expect(engine.getSpeed()).toBe(1);

    // 1s 后第一个 tick(clock 0→1)
    vi.advanceTimersByTime(1000);
    expect(engine.getClock()).toBe(1);
    expect(ticks).toEqual([1]);

    // 再 1s
    vi.advanceTimersByTime(1000);
    expect(engine.getClock()).toBe(2);
    expect(ticks).toEqual([1, 2]);

    // 再 3s = 3 个 tick
    vi.advanceTimersByTime(3000);
    expect(engine.getClock()).toBe(5);
    expect(ticks).toEqual([1, 2, 3, 4, 5]);

    engine.stop();
  });

  it('默认 intervalMs=1000(999ms 不 tick,1000ms tick)', () => {
    const engine = new TimelineEngine();
    engine.start();

    vi.advanceTimersByTime(999);
    expect(engine.getClock()).toBe(0);

    vi.advanceTimersByTime(1);
    expect(engine.getClock()).toBe(1);

    engine.stop();
  });

  it('pause 停 tick(暂停期间 clock 不变),resume 从当前 clock 继续', () => {
    const engine = new TimelineEngine();
    const ticks: number[] = [];
    engine.onTick((c) => ticks.push(c));

    engine.start();
    vi.advanceTimersByTime(3000);
    expect(engine.getClock()).toBe(3);

    engine.pause();
    expect(engine.getStatus()).toBe('paused');
    expect(engine.getSpeed()).toBe(1); // speed 保留

    // 暂停期间推进 5s,clock 不变
    vi.advanceTimersByTime(5000);
    expect(engine.getClock()).toBe(3);
    expect(ticks).toHaveLength(3);

    // 恢复后继续 tick
    engine.resume();
    expect(engine.getStatus()).toBe('running');
    vi.advanceTimersByTime(1000);
    expect(engine.getClock()).toBe(4);
    expect(ticks).toEqual([1, 2, 3, 4]);

    engine.stop();
  });

  it('setSpeed(5) 时间隔变 1/5(同样 wall-time 内 tick 数 ×5)', () => {
    const engine = new TimelineEngine({ intervalMs: 1000 });
    const ticks: number[] = [];
    engine.onTick((c) => ticks.push(c));

    engine.start(); // 1× → 1000ms/tick
    vi.advanceTimersByTime(2000); // 2 个 tick
    expect(engine.getClock()).toBe(2);

    engine.setSpeed(5); // 5× → 200ms/tick
    expect(engine.getSpeed()).toBe(5);

    // 1000ms 内应有 5 个 tick(clock 2→7,间隔 200ms)
    vi.advanceTimersByTime(1000);
    expect(engine.getClock()).toBe(7);
    expect(ticks).toEqual([1, 2, 3, 4, 5, 6, 7]);

    engine.stop();
  });

  it('stop 清零(clock=0 / status=idle / speed=0),之后不再 tick', () => {
    const engine = new TimelineEngine();
    engine.start();
    vi.advanceTimersByTime(5000);
    expect(engine.getClock()).toBe(5);

    engine.stop();
    expect(engine.getStatus()).toBe('idle');
    expect(engine.getClock()).toBe(0);
    expect(engine.getSpeed()).toBe(0);

    // stop 后推进时间不再 tick
    const ticks: number[] = [];
    engine.onTick((c) => ticks.push(c));
    vi.advanceTimersByTime(5000);
    expect(ticks).toHaveLength(0);
  });

  it('stop 后可重新 start(从 clock=0 重新开始)', () => {
    const engine = new TimelineEngine();
    engine.start();
    vi.advanceTimersByTime(3000);
    expect(engine.getClock()).toBe(3);

    engine.stop();
    expect(engine.getClock()).toBe(0);

    engine.start();
    expect(engine.getStatus()).toBe('running');
    expect(engine.getSpeed()).toBe(1); // start 始终 1× 起步
    vi.advanceTimersByTime(1000);
    expect(engine.getClock()).toBe(1);

    engine.stop();
  });

  it('onStatusChange 在 status / speed 变更时触发(传入 status + speed)', () => {
    const engine = new TimelineEngine();
    const changes: Array<{ status: string; speed: number }> = [];
    engine.onStatusChange((status, speed) => changes.push({ status, speed }));

    engine.start(); // → running, speed=1
    engine.setSpeed(5); // → running, speed=5
    engine.pause(); // → paused, speed=5(保留)
    engine.resume(); // → running, speed=5(沿用)
    engine.stop(); // → idle, speed=0

    expect(changes).toEqual([
      { status: 'running', speed: 1 },
      { status: 'running', speed: 5 },
      { status: 'paused', speed: 5 },
      { status: 'running', speed: 5 },
      { status: 'idle', speed: 0 },
    ]);
  });

  it('paused 时 setSpeed 更新 speed,resume 以新 speed 继续', () => {
    const engine = new TimelineEngine({ intervalMs: 1000 });
    engine.start();
    vi.advanceTimersByTime(1000);
    expect(engine.getClock()).toBe(1);

    engine.pause();
    engine.setSpeed(5);
    expect(engine.getSpeed()).toBe(5);

    engine.resume();
    // 5× → 200ms/tick,1000ms = 5 个 tick(clock 1→6)
    vi.advanceTimersByTime(1000);
    expect(engine.getClock()).toBe(6);

    engine.stop();
  });

  it('start 从 paused 启动:1× 起步,不重置 clock', () => {
    const engine = new TimelineEngine({ intervalMs: 1000 });
    engine.start();
    vi.advanceTimersByTime(2000);
    expect(engine.getClock()).toBe(2);

    engine.setSpeed(5);
    expect(engine.getSpeed()).toBe(5);

    engine.pause();
    // start 从 paused:重置为 1×,但 clock 保留
    engine.start();
    expect(engine.getSpeed()).toBe(1);
    expect(engine.getClock()).toBe(2); // 不重置

    vi.advanceTimersByTime(1000); // 1× → 1 tick
    expect(engine.getClock()).toBe(3);

    engine.stop();
  });

  it('幂等保护:running 时 start/pause+resume 幂等,idle 时 pause/resume/setSpeed 为 no-op', () => {
    const engine = new TimelineEngine();

    // idle 时调用控制方法不抛错、不变状态
    engine.pause();
    engine.resume();
    engine.setSpeed(5);
    expect(engine.getStatus()).toBe('idle');
    expect(engine.getSpeed()).toBe(0);

    // running 时重复 start 为 no-op
    engine.start();
    vi.advanceTimersByTime(1000);
    const clockBefore = engine.getClock();
    engine.start(); // no-op
    expect(engine.getClock()).toBe(clockBefore);

    engine.stop();
  });

  it('stop 清 interval 防泄漏(stop 后无残留定时器驱动 tick)', () => {
    const engine = new TimelineEngine();
    engine.start();
    vi.advanceTimersByTime(1000);
    engine.stop();

    // stop 后推进很长时间,clock 始终为 0(无泄漏 interval)
    const ticks: number[] = [];
    engine.onTick((c) => ticks.push(c));
    vi.advanceTimersByTime(60000);
    expect(ticks).toHaveLength(0);
    expect(engine.getClock()).toBe(0);
  });
});
