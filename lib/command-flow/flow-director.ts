import type { FlowStage, IncidentStatus, RecommendType, ScriptAction, TimelineKind, ViewSpec } from './types';

/** 编排器副作用回调(由 React 接线层实现:Toast/时间轴/视角/状态/推荐/面板/车辆动画)。 */
export interface FlowHandlers {
  toast(msg: string): void;
  timeline(entryKind: TimelineKind, label: string, detail?: string): void;
  view(spec: ViewSpec): void;
  setStatus(to: IncidentStatus): void;
  pushRec(type: RecommendType, content: string, basis: string): void;
  panel(id: 'vars' | 'recommend', open: boolean): void;
  convoy(action: 'start' | 'arriveAll'): void;
  stage(stage: FlowStage): void;
}

export interface FlowClock {
  now(): number;
  raf(cb: (now: number) => void): number;
  cancel(id: number): void;
}

/**
 * 剧本编排器:按 ScriptAction.at(相对毫秒)顺序触发,动作时间不可回退。
 * run 前先 cancel 旧演出(单一活跃演示)。时钟注入,便于假时钟单测。
 */
export class FlowDirector {
  private readonly clock: FlowClock;
  private readonly handlers: FlowHandlers;
  private actions: ScriptAction[] = [];
  private rafId: number | null = null;
  private t0 = 0;
  private nextIdx = 0;
  private stage: FlowStage | null = null;

  constructor(clock: FlowClock, handlers: FlowHandlers) {
    this.clock = clock;
    this.handlers = handlers;
  }

  /** 启动新剧本:清旧演出后按 at 排序执行。 */
  run(script: ScriptAction[]): void {
    this.cancel();
    this.actions = script.slice().sort((a, b) => a.at - b.at);
    this.nextIdx = 0;
    this.t0 = this.clock.now();
    this.rafId = this.clock.raf((now) => this.tick(now));
  }

  /** 停止编排,后续动作不再触发。可安全重复调用。 */
  cancel(): void {
    if (this.rafId !== null) this.clock.cancel(this.rafId);
    this.rafId = null;
    this.actions = [];
    this.nextIdx = 0;
  }

  isRunning(): boolean {
    return this.rafId !== null;
  }

  getStage(): FlowStage | null {
    return this.stage;
  }

  private tick(now: number): void {
    if (this.rafId === null) return;
    const elapsed = now - this.t0;
    while (this.nextIdx < this.actions.length && this.actions[this.nextIdx].at <= elapsed) {
      const a = this.actions[this.nextIdx];
      this.nextIdx += 1;
      this.dispatch(a);
    }
    if (this.nextIdx >= this.actions.length) {
      this.cancel();
      return;
    }
    this.rafId = this.clock.raf((n) => this.tick(n));
  }

  private dispatch(a: ScriptAction): void {
    switch (a.kind) {
      case 'stage':
        this.stage = a.stage;
        this.handlers.stage(a.stage);
        break;
      case 'toast':
        this.handlers.toast(a.msg);
        break;
      case 'timeline':
        this.handlers.timeline(a.entryKind, a.label, a.detail);
        break;
      case 'view':
        this.handlers.view(a.spec);
        break;
      case 'status':
        this.handlers.setStatus(a.to);
        break;
      case 'pushRec':
        this.handlers.pushRec(a.type, a.content, a.basis);
        break;
      case 'panel':
        this.handlers.panel(a.id, a.open);
        break;
      case 'convoy':
        this.handlers.convoy(a.action);
        break;
      default: {
        const _exhaustive: never = a.kind;
        throw new Error(`Unknown ScriptAction kind: ${_exhaustive}`);
      }
    }
  }
}
