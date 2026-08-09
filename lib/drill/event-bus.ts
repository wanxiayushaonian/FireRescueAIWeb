/**
 * EventBus — 演练推演的事件池(纯逻辑,无 React/DOM 依赖)。
 *
 * 三类事件来源汇入统一时间线:
 * - seed: 剧本预置事件(演练开始前批量注入,不通知订阅者)
 * - inject: 运行时注入(对抗 agent / 指挥决策 / MCP tool_call,通知订阅者)
 * - 内部产生: 状态机衍生事件(到场/状态变更)
 *
 * 事件按 ts(演练时钟 tick)有序存储;支持区间查询与订阅通知。
 * 因果链: event.cause 记录父事件 id,供事件树(6.4)追溯。
 *
 * 纯逻辑:不依赖 React/DOM,可被 TimelineEngine 的 onTick 驱动,
 * 也可被 vitest 直接单测(见 __tests__/event-bus.test.ts)。
 */

/** 演练事件类型 */
export type DrillEventType = 'disaster' | 'decision' | 'special' | 'arrival' | 'status';

/**
 * 演练事件 —— 推演引擎的最小信息单元。
 * 所有字段在注入后只读(内部存储拷贝,外部 mutation 不影响内部)。
 */
export interface DrillEvent {
  /** 事件唯一标识(场景事件用稳定 id;注入事件可用 genEventId())。 */
  readonly id: string;
  /** 演练时钟 tick(事件发生的逻辑时刻,从 0 起)。 */
  readonly ts: number;
  /** 事件类型。 */
  readonly type: DrillEventType;
  /** 事件载荷(类型相关,见 disaster-state.ts 的 payload 契约接口)。 */
  readonly payload: Readonly<Record<string, unknown>>;
  /** 父事件 id(因果链,用于事件树追溯;可选)。 */
  readonly cause?: string;
}

type EventCallback = (event: DrillEvent) => void;

/**
 * 生成运行时事件 id(非确定性,用于 inject;场景 seed 应用稳定 id)。
 * 组成:prefix-timestamp(base36)-random6。状态演化不依赖 id 值,仅依赖 type+payload。
 */
export function genEventId(prefix = 'evt'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

/**
 * EventBus —— 事件池,按 ts 有序存储 + 区间查询 + 订阅通知。
 *
 * 使用模式:
 * 1. 演练开始前: bus.seed(scenarioEvents) 注入剧本
 * 2. TimelineEngine.onTick(clock): 取 bus.getEvents(clock, clock) 喂给 DisasterState.tick()
 * 3. 运行时: bus.inject(对抗/决策事件) → 订阅者(AgentRunner/事件树)收到通知
 */
export class EventBus {
  private readonly events: DrillEvent[] = [];
  private readonly subscribers: Set<EventCallback> = new Set();

  /**
   * 批量注入剧本事件(初始化用;不清空已有事件,不通知订阅者)。
   * 注入后全局按 ts 升序排列(ts 相同时保持注入顺序——稳定排序)。
   */
  seed(scenarioEvents: readonly DrillEvent[]): void {
    for (const e of scenarioEvents) {
      this.events.push(this.clone(e));
    }
    this.events.sort((a, b) => a.ts - b.ts);
  }

  /**
   * 运行时注入单个事件(对抗/决策/MCP),保持 ts 有序,通知订阅者。
   * 事件以浅拷贝存储(防止外部 mutation 影响内部状态)。
   */
  inject(event: DrillEvent): void {
    const stored = this.clone(event);
    this.insertSorted(stored);
    this.notify(stored);
  }

  /**
   * 按 ts 区间查询事件([fromTs, toTs] 闭区间),按 ts 有序返回。
   * 省略参数表示不限制:
   * - getEvents() → 全量
   * - getEvents(5) → ts >= 5
   * - getEvents(0, 10) → 0 <= ts <= 10
   * 返回拷贝(调用方可安全 mutation)。
   */
  getEvents(fromTs?: number, toTs?: number): DrillEvent[] {
    return this.events
      .filter((e) => {
        if (fromTs !== undefined && e.ts < fromTs) return false;
        if (toTs !== undefined && e.ts > toTs) return false;
        return true;
      })
      .map((e) => this.clone(e));
  }

  /** 全量事件(按 ts 有序),返回拷贝。等价于 getEvents()。 */
  getAll(): DrillEvent[] {
    return this.getEvents();
  }

  /**
   * 订阅新事件通知(仅 inject 触发;seed 不触发)。
   * 返回取消订阅函数(幂等,多次调用安全)。
   */
  subscribe(cb: EventCallback): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** 清空所有事件(重置/测试用)。不清订阅者。 */
  clear(): void {
    this.events.length = 0;
  }

  /** 当前事件总数。 */
  size(): number {
    return this.events.length;
  }

  // ---- 内部方法 ----

  /** 按 ts 插入到有序位置(插入到首个 ts 大于本事件的元素之前,保持稳定)。 */
  private insertSorted(event: DrillEvent): void {
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].ts > event.ts) {
      i -= 1;
    }
    this.events.splice(i, 0, event);
  }

  private notify(event: DrillEvent): void {
    for (const cb of this.subscribers) {
      cb(event);
    }
  }

  /** 浅拷贝事件(含 payload 一层),隔离内外 mutation。 */
  private clone(e: DrillEvent): DrillEvent {
    return { ...e, payload: { ...e.payload } };
  }
}
