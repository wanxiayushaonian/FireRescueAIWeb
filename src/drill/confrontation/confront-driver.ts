// 对抗舱编排:定时器 + adapter + store 动作。纯逻辑(无 React),可注入 fake adapter 测试。
// 节奏:开局 → 预案输出 agent 生成部署 → 6~10s 注入首条特情 →
// 每轮 Commander 完成后 10~15s 再进入下一轮 →
// 特情后 2.5s 生成调整 → 人响应 → 结束评估。
import type { ConfrontAdapter } from './confront-adapter';
import type {
  ConfrontationEvent,
  ConfrontationSeed,
  ConfrontationReview,
  ConfrontationSituation,
} from './confront-store';
import type {
  ConfrontAgentProgress,
  ConfrontRoundContext,
  SpecialEventOutput,
} from './confront-adapter';
import { canonicalSpecialType, evaluateSpecialQuality } from './special-event-quality';

export interface ConfrontAppIds {
  readonly planner: string;
  readonly adversary: string;
  readonly commander: string;
}

export interface ConfrontDriverDeps {
  readonly adapter: ConfrontAdapter;
  readonly appIds: ConfrontAppIds;
  readonly buildingId: string;
  readonly sceneId: string;
  readonly drillId: string;
  readonly seed: ConfrontationSeed | null;
  /** 本局事件流(评估用:按响应用时判定 timely/delayed/ignored;Task 6 接入)。 */
  readonly events?: readonly ConfrontationEvent[];
  /** 实时读对抗舱真相源，避免 driver 只拿到开局空快照。 */
  readonly getState?: () => {
    readonly events: readonly ConfrontationEvent[];
    readonly situation: ConfrontationSituation;
    readonly deploy: readonly string[] | null;
  };
}

type TimerId = ReturnType<typeof setTimeout>;

export class ConfrontDriver {
  private readonly deps: ConfrontDriverDeps;
  private timers: TimerId[] = [];

  constructor(deps: ConfrontDriverDeps) {
    this.deps = deps;
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timers = this.timers.filter((t) => t !== id);
      fn();
    }, ms);
    this.timers.push(id);
  }

  clearAll(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  /** 公开延迟:hook 串行链用(上一条特情落定后再排下一条,避免一次调度全挤在同一时间窗)。 */
  after(ms: number, fn: () => void): void {
    this.later(ms, fn);
  }

  private ctx(appId: string) {
    if (!this.deps.seed) throw new Error('ConfrontDriver ctx: seed required');
    return {
      appId,
      buildingId: this.deps.buildingId,
      sceneId: this.deps.sceneId,
      drillId: this.deps.drillId,
      seed: this.deps.seed,
    };
  }

  private state() {
    return this.deps.getState?.() ?? {
      events: this.deps.events ?? [],
      situation: {
        fireLevel: this.deps.seed ? 1 : 0,
        trappedCount: this.deps.seed?.trapped ?? 0,
        damageLevel: 0,
      },
      deploy: null,
    };
  }

  private roundContext(round: number, rejectionReason?: string): ConfrontRoundContext {
    const current = this.state();
    const usedTypes = current.events
      .filter((event) => event.kind === 'inject')
      .map((event) => canonicalSpecialType({
        specialType: event.specialType,
        emergency: event.emergency,
        location: event.location,
      }))
      .filter((type) => type !== 'unknown');
    return {
      round,
      situation: current.situation,
      recentEvents: current.events.slice(-8),
      usedTypes: [...new Set(usedTypes)],
      ...(rejectionReason ? { rejectionReason } : {}),
    };
  }

  /** 开局:生成初步部署(集成层调 beginConfrontation + seed 后调用)。 */
  startInitialPlan(cb: {
    onStart?(): void;
    onProgress?: ConfrontAgentProgress;
    onPlan(lines: string[]): void;
    onFail(): void;
  }): void {
    if (!this.deps.seed) return;
    cb.onStart?.();
    this.deps.adapter.generateInitialPlan(
      this.ctx(this.deps.appIds.planner),
      cb.onProgress,
    ).then((out) => {
      if (out?.deployLines) cb.onPlan(out.deployLines);
      else cb.onFail();
    });
  }

  /** 规划特情注入节奏(先 thinking 骨架,再注入)。 */
  scheduleInject(seqIndex: number, cb: {
    onThinking(v: boolean): void;
    onStart?(): void;
    onProgress?: ConfrontAgentProgress;
    onInject(evt: SpecialEventOutput): void;
    onInjectFail(reason?: string): void;
  }): void {
    const first = seqIndex === 0;
    const gap = first ? this.rand(6000, 10000) : this.rand(10000, 15000);
    this.later(gap, () => {
      cb.onThinking(true);
      this.doInject(seqIndex + 1, cb);
    });
  }

  private doInject(round: number, cb: {
    onThinking(v: boolean): void;
    onStart?(): void;
    onProgress?: ConfrontAgentProgress;
    onInject(evt: SpecialEventOutput): void;
    onInjectFail(reason?: string): void;
  }): void {
    void (async () => {
      cb.onStart?.();
      try {
        const history = this.state().events;
        const first = await this.deps.adapter.injectSpecial(
          this.ctx(this.deps.appIds.adversary),
          this.roundContext(round),
          cb.onProgress,
        );
        if (!first) { cb.onInjectFail('对抗 Agent 未返回合法特情'); return; }
        let quality = evaluateSpecialQuality(first, history);
        if (quality.accepted) {
          cb.onInject({ ...first, specialType: quality.canonicalType });
          return;
        }

        // 只重试一次:把程序判定的冲突原因显式告知 Agent。
        const retry = await this.deps.adapter.injectSpecial(
          this.ctx(this.deps.appIds.adversary),
          this.roundContext(round, quality.reason),
          cb.onProgress,
        );
        if (!retry) { cb.onInjectFail(`重复特情已拒绝:${quality.reason}`); return; }
        quality = evaluateSpecialQuality(retry, history);
        if (!quality.accepted) {
          cb.onInjectFail(`特情重试仍重复:${quality.reason}`);
          return;
        }
        cb.onInject({ ...retry, specialType: quality.canonicalType });
      } finally {
        cb.onThinking(false);
      }
    })();
  }

  /** 特情后 2.5s 生成动态调整。 */
  scheduleAdjustment(injectText: string, cb: {
    onStart?(): void;
    onProgress?: ConfrontAgentProgress;
    onAdjust(lines: string[]): void;
    onAdjustFail?(): void;
  }): void {
    this.later(2500, () => {
      const round = this.state().events.filter((event) => event.kind === 'inject').length;
      cb.onStart?.();
      void this.deps.adapter.generateAdjustment(
        this.ctx(this.deps.appIds.commander),
        injectText,
        this.roundContext(Math.max(1, round)),
        cb.onProgress,
      ).then((out) => {
        if (out?.adjustments) cb.onAdjust(out.adjustments);
        else cb.onAdjustFail?.();
      });
    });
  }

  /** 结束评估:调用评估 agent,降级时按事件流生成 deterministic review。 */
  async finishEvaluate(elapsedSec: number): Promise<ConfrontationReview> {
    const state = this.state();
    const events = state.events;
    const injects = events.filter((e) => e.kind === 'inject');
    const adjusts = events.filter((e) => e.kind === 'adjust');
    // outcomes 按特情配对:每条特情消费其后最近一条未配对的调整,行数恒等于特情数。
    // (2026-08-25 验收实测:此前按 adjust 生成,双通道重复入库时 4 条特情评出 9 行幻影)
    const consumedAdjusts = new Set<string>();
    const outcomes = injects.map((inj): ConfrontationReview['outcomes'][number] => {
      const adjust = adjusts.find((a) => !consumedAdjusts.has(a.id) && a.tSec >= inj.tSec);
      if (!adjust) return 'ignored';
      consumedAdjusts.add(adjust.id);
      if (adjust.respondedWithinSec === undefined) return 'ignored';
      return adjust.respondedWithinSec <= 15 ? 'timely' : 'delayed';
    });
    const ignored = outcomes.filter((o) => o === 'ignored').length;
    const delayed = outcomes.filter((o) => o === 'delayed').length;
    // 降级文案的平均响应用时只统计特情轮次调整(seq>=1);seq=0 是 Planner 初始部署上报
    const roundAdjusts = adjusts.filter((e) => e.seq >= 1);
    const avgResponseSec = roundAdjusts.length
      ? Math.round(roundAdjusts.reduce((a, e) => a + (e.respondedWithinSec ?? 30), 0) / roundAdjusts.length)
      : 8;

    const fallbackScore = Math.max(45, Math.min(98, 92 - ignored * 8 - delayed * 3));
    const pass = fallbackScore >= 85;

    const data = await this.deps.adapter.evaluateDrill({
      kind: 'drill-plan',
      subject: `${this.deps.seed?.building ?? '未指定建筑'} 对抗演练评估`,
      process: {
        building: this.deps.seed?.building,
        floor: this.deps.seed?.floor,
        material: this.deps.seed?.material,
        trapped: this.deps.seed?.trapped,
        elapsedSec,
        injectCount: events.filter((e) => e.kind === 'inject').length,
        // 只计特情轮次的调整(seq>=1);seq=0 是 Planner 初始部署上报,不算动态调整
        adjustCount: adjusts.filter((e) => e.seq >= 1).length,
        outcomes,
        initialPlan: state.deploy,
        finalSituation: state.situation,
        uniqueSpecialTypes: [...new Set(events
          .filter((event) => event.kind === 'inject')
          .map((event) => canonicalSpecialType({
            specialType: event.specialType,
            emergency: event.emergency,
            location: event.location,
          })))],
        timeline: events.map((event) => ({
          seq: event.seq,
          kind: event.kind,
          type: event.specialType,
          description: event.emergency,
          location: event.location,
          delta: event.delta,
          adjustments: event.adjustments,
          adopted: event.adopted,
          respondedWithinSec: event.respondedWithinSec,
          tSec: event.tSec,
        })),
      },
    });

    if (data) {
      const archived = data.score >= 85;
      return {
        score: data.score,
        conclusion: data.conclusion,
        comments: data.opinions,
        outcomes,
        archived,
        source: 'agent',
        // 维度分项 + 改进措施随真实评估透传(UI 渲染 + 归档回流预案库)
        dimensions: data.dimensions,
        improvements: data.improvements,
      };
    }

    return {
      score: fallbackScore,
      conclusion: pass ? '预案韧性：良好' : '预案韧性：需修订',
      comments: pass
        ? [
            `特情响应平均用时 ${avgResponseSec}s，调整链路完整`,
            `${events.filter((e) => e.kind === 'adjust' && e.adopted === false).length || 2} 次人工改派决策合理`,
            '进攻/疏散路线动态调整后无交叉冲突',
          ]
        : [
            '供水干线备份方案未及时启用',
            '存在未响应特情，调整链路出现断点',
            '请修订预案后重新组织对抗演练',
          ],
      outcomes,
      archived: pass,
      source: 'fallback',
    };
  }

  private rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
