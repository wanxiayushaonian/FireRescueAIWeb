import { describe, it, expect, vi } from 'vitest';
import { EventBus, genEventId, type DrillEvent } from '../event-bus';

/**
 * EventBus 单测 —— 验证 seed/inject/查/订阅 的行为契约。
 * 纯逻辑,不需要 fake timers(无定时器/异步)。
 */

/** 构造测试事件(减少样板;必填 id/ts/type,payload 默认空)。 */
function makeEvent(
  overrides: Partial<DrillEvent> & Pick<DrillEvent, 'id' | 'ts' | 'type'>,
): DrillEvent {
  return { payload: {}, ...overrides };
}

describe('EventBus', () => {
  it('初始状态:size=0,getEvents 返回空数组', () => {
    const bus = new EventBus();
    expect(bus.size()).toBe(0);
    expect(bus.getEvents()).toEqual([]);
  });

  it('seed 注入事件后按 ts 升序排列(乱序输入 → 有序输出)', () => {
    const bus = new EventBus();
    bus.seed([
      makeEvent({ id: 'e3', ts: 30, type: 'status' }),
      makeEvent({ id: 'e1', ts: 10, type: 'disaster' }),
      makeEvent({ id: 'e2', ts: 20, type: 'arrival' }),
    ]);
    const all = bus.getEvents();
    expect(all.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
    expect(all.map((e) => e.ts)).toEqual([10, 20, 30]);
  });

  it('seed 稳定排序:ts 相同时保持注入顺序', () => {
    const bus = new EventBus();
    bus.seed([
      makeEvent({ id: 'a', ts: 5, type: 'disaster' }),
      makeEvent({ id: 'b', ts: 5, type: 'decision' }),
      makeEvent({ id: 'c', ts: 5, type: 'arrival' }),
    ]);
    expect(bus.getEvents().map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('seed 不清空已有事件(追加语义,可多次 seed)', () => {
    const bus = new EventBus();
    bus.seed([makeEvent({ id: 'e1', ts: 10, type: 'disaster' })]);
    bus.seed([makeEvent({ id: 'e2', ts: 5, type: 'arrival' })]);
    expect(bus.size()).toBe(2);
    expect(bus.getEvents().map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('seed 不通知订阅者(初始化语义,非运行时事件)', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.subscribe(cb);
    bus.seed([makeEvent({ id: 'e1', ts: 1, type: 'disaster' })]);
    expect(cb).not.toHaveBeenCalled();
  });

  it('inject 保持 ts 有序(注入到正确位置)', () => {
    const bus = new EventBus();
    bus.seed([
      makeEvent({ id: 'a', ts: 10, type: 'disaster' }),
      makeEvent({ id: 'c', ts: 30, type: 'status' }),
    ]);
    bus.inject(makeEvent({ id: 'b', ts: 20, type: 'decision' }));
    bus.inject(makeEvent({ id: 'd', ts: 40, type: 'arrival' }));
    bus.inject(makeEvent({ id: 'z', ts: 5, type: 'special' }));

    expect(bus.getEvents().map((e) => e.id)).toEqual(['z', 'a', 'b', 'c', 'd']);
  });

  it('inject 同 ts 排在已有事件之后(稳定)', () => {
    const bus = new EventBus();
    bus.seed([makeEvent({ id: 'a', ts: 10, type: 'disaster' })]);
    bus.inject(makeEvent({ id: 'b', ts: 10, type: 'decision' }));
    expect(bus.getEvents().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('inject 通知订阅者(传入注入的事件)', () => {
    const bus = new EventBus();
    const received: DrillEvent[] = [];
    bus.subscribe((e) => received.push(e));

    const evt = makeEvent({ id: 'x', ts: 5, type: 'special', payload: { fireLevelDelta: 1 } });
    bus.inject(evt);

    expect(received).toHaveLength(1);
    expect(received[0].id).toBe('x');
    expect(received[0].type).toBe('special');
    expect(received[0].payload).toEqual({ fireLevelDelta: 1 });
  });

  it('inject 通知多个订阅者(广播)', () => {
    const bus = new EventBus();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    bus.subscribe(cb1);
    bus.subscribe(cb2);
    bus.inject(makeEvent({ id: 'x', ts: 1, type: 'disaster' }));
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('subscribe 返回取消订阅函数,调用后不再收到通知', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    const unsub = bus.subscribe(cb);

    bus.inject(makeEvent({ id: 'a', ts: 1, type: 'disaster' }));
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    bus.inject(makeEvent({ id: 'b', ts: 2, type: 'disaster' }));
    expect(cb).toHaveBeenCalledTimes(1); // 不再增加
  });

  it('取消订阅幂等(多次调用安全)', () => {
    const bus = new EventBus();
    const unsub = bus.subscribe(() => {});
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
  });

  it('getEvents(fromTs, toTs) 区间查询(闭区间)', () => {
    const bus = new EventBus();
    bus.seed([
      makeEvent({ id: 'a', ts: 1, type: 'disaster' }),
      makeEvent({ id: 'b', ts: 5, type: 'decision' }),
      makeEvent({ id: 'c', ts: 10, type: 'arrival' }),
      makeEvent({ id: 'd', ts: 15, type: 'status' }),
      makeEvent({ id: 'e', ts: 20, type: 'special' }),
    ]);

    expect(bus.getEvents(5, 15).map((e) => e.id)).toEqual(['b', 'c', 'd']);
    expect(bus.getEvents(5).map((e) => e.id)).toEqual(['b', 'c', 'd', 'e']); // fromTs 起
    expect(bus.getEvents(undefined, 10).map((e) => e.id)).toEqual(['a', 'b', 'c']); // 到 toTs
    expect(bus.getEvents(0, 0)).toEqual([]); // 空区间
  });

  it('getEvents 返回拷贝(mutation 不影响内部状态)', () => {
    const bus = new EventBus();
    bus.seed([makeEvent({ id: 'a', ts: 1, type: 'disaster', payload: { x: 1 } })]);

    const first = bus.getEvents();
    // 绕过 readonly 类型约束,验证运行时拷贝隔离
    (first[0] as { id: string }).id = 'mutated';
    (first[0].payload as Record<string, unknown>).x = 999;

    // 内部不受影响
    const again = bus.getEvents();
    expect(again[0].id).toBe('a');
    expect(again[0].payload).toEqual({ x: 1 });
  });

  it('getAll 等价于 getEvents()(全量有序拷贝)', () => {
    const bus = new EventBus();
    bus.seed([
      makeEvent({ id: 'b', ts: 2, type: 'disaster' }),
      makeEvent({ id: 'a', ts: 1, type: 'disaster' }),
    ]);
    expect(bus.getAll().map((e) => e.id)).toEqual(['a', 'b']);
    expect(bus.getAll()).toEqual(bus.getEvents());
  });

  it('clear 清空事件但不清订阅者', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    bus.subscribe(cb);
    bus.seed([makeEvent({ id: 'a', ts: 1, type: 'disaster' })]);

    bus.clear();
    expect(bus.size()).toBe(0);
    expect(bus.getEvents()).toEqual([]);

    // 订阅者仍在
    bus.inject(makeEvent({ id: 'b', ts: 1, type: 'disaster' }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('cause 字段(因果链)保留:seed + inject 均透传', () => {
    const bus = new EventBus();
    bus.seed([
      makeEvent({ id: 'root', ts: 1, type: 'disaster', cause: undefined }),
    ]);
    bus.inject(makeEvent({ id: 'child', ts: 2, type: 'decision', cause: 'root' }));

    const events = bus.getEvents();
    expect(events[0].cause).toBeUndefined();
    expect(events[1].cause).toBe('root');
  });

  it('genEventId 生成唯一性(连续调用不重复)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(genEventId());
    }
    expect(ids.size).toBe(100);
  });

  it('genEventId 支持 prefix 参数', () => {
    const id = genEventId('decision');
    expect(id.startsWith('decision-')).toBe(true);
  });
});
