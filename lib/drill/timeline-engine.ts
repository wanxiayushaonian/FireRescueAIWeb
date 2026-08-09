/**
 * TimelineEngine — 演练推演的 tick 调度引擎(纯逻辑,无 React/DOM 依赖)。
 *
 * 维护演练时钟(clock = 已经过的 tick 数,从 0 起),按 speed 倍率驱动 setInterval。
 * 状态机:idle ⇄ running ⇄ paused;变速/暂停/恢复/停止均防 interval 泄漏。
 *
 * 速度模型:
 * - speed=0:idle(停机,clock 已清零)
 * - speed=1:1×(每 intervalMs 一 tick,默认每秒一 tick)
 * - speed=5:5×(intervalMs/5 一 tick,加速推演)
 *
 * 变速/暂停处理要点:
 * - setSpeed(running):清旧 interval → 按新 speed 重设(clock 不变,下一 tick 用新间隔)
 * - pause:清 interval,保留 clock + speed(恢复时沿用)
 * - resume:以 pause 时保留的 speed 重开 interval
 * - stop:清 interval,clock 归零,speed 归零
 */

/** 引擎状态:idle=未开始/已停止 | running=运行中 | paused=暂停 */
export type EngineStatus = 'idle' | 'running' | 'paused';

/** 倍率:0=idle | 1=1× | 5=5× */
export type Speed = 0 | 1 | 5;

/** 可用倍率(排除 idle 的 0) */
export type ActiveSpeed = 1 | 5;

export interface TimelineEngineOptions {
  /** 1× 时单个 tick 的毫秒间隔,默认 1000(每秒一 tick)。 */
  intervalMs?: number;
}

type TickCallback = (clock: number) => void;
type StatusChangeCallback = (status: EngineStatus, speed: Speed) => void;

const DEFAULT_INTERVAL_MS = 1000;

export class TimelineEngine {
  private readonly intervalMs: number;
  private status: EngineStatus = 'idle';
  private clock: number = 0;
  private speed: Speed = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private tickCb: TickCallback | null = null;
  private statusCb: StatusChangeCallback | null = null;

  constructor(options: TimelineEngineOptions = {}) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  }

  /** 当前引擎状态。 */
  getStatus(): EngineStatus {
    return this.status;
  }

  /** 已经过的 tick 数(演练时钟,从 0 起;stop 清零)。 */
  getClock(): number {
    return this.clock;
  }

  /** 当前倍率:idle 时为 0,running/paused 时为上次的 1 或 5。 */
  getSpeed(): Speed {
    return this.speed;
  }

  /**
   * 注册 tick 回调:每个 tick 触发(clock 自增后调用,传入新 clock 值)。
   * 单回调模式:后注册覆盖先注册。
   */
  onTick(cb: TickCallback): void {
    this.tickCb = cb;
  }

  /**
   * 注册状态变更回调:status 或 speed 变化时触发,传入当前 status 与 speed。
   * 单回调模式。
   */
  onStatusChange(cb: StatusChangeCallback): void {
    this.statusCb = cb;
  }

  /**
   * 启动引擎(idle/paused → running),始终以 1× 起步。
   * 不重置 clock(从当前位置继续);仅 stop 会清零 clock。
   * running 时调用为 no-op。
   */
  start(): void {
    if (this.status === 'running') return;
    this.speed = 1;
    this.beginInterval();
    this.setStatus('running');
  }

  /**
   * 暂停(running → paused):清 interval,保留 clock 与 speed。
   * 非 running 时调用为 no-op。
   */
  pause(): void {
    if (this.status !== 'running') return;
    this.clearTimer();
    this.setStatus('paused');
  }

  /**
   * 恢复(paused → running):以 pause 时保留的 speed 继续。
   * 非 paused 时调用为 no-op。
   */
  resume(): void {
    if (this.status !== 'paused') return;
    this.beginInterval();
    this.setStatus('running');
  }

  /**
   * 变速(仅 running/paused 有效):更新 speed;
   * running 时清旧 interval 并按新 speed 重设(clock 不变,下一 tick 用新间隔)。
   * paused 时仅更新 speed 供 resume 使用。
   * idle 时为 no-op(start 始终 1× 起步)。
   */
  setSpeed(speed: ActiveSpeed): void {
    if (this.status === 'idle') return;
    this.speed = speed;
    if (this.status === 'running') {
      this.beginInterval();
    }
    this.notifyStatusChange();
  }

  /**
   * 停止(任意 → idle):清 interval,clock 清零,speed 归 0。
   * 可安全反复调用。
   */
  stop(): void {
    this.clearTimer();
    this.clock = 0;
    this.speed = 0;
    this.setStatus('idle');
  }

  // ---- 内部方法 ----

  /** 以当前 speed 开 interval(有效间隔 = intervalMs / speed)。先清旧再开新。 */
  private beginInterval(): void {
    this.clearTimer();
    if (this.speed === 0) {
      throw new Error('beginInterval called with speed=0 (invariant violation)');
    }
    const ms = this.intervalMs / this.speed;
    this.timerId = setInterval(() => {
      this.clock += 1;
      this.tickCb?.(this.clock);
    }, ms);
  }

  /** 清当前 interval(如有),置 null。 */
  private clearTimer(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.notifyStatusChange();
  }

  private notifyStatusChange(): void {
    if (this.statusCb) this.statusCb(this.status, this.speed);
  }
}
