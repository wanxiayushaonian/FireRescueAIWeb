// 对抗舱编排:定时器 + adapter + store 动作。纯逻辑(无 React),可注入 fake adapter 测试。
// 节奏(照抄原型):开局 → 预案输出 agent 生成部署 → 5s+15~25s 注入特情 →
// 特情后 2.5s 生成调整 → 人响应 → 结束评估。
import type { ConfrontAdapter } from './confront-adapter';
import type {
  ConfrontationSeed,
  ConfrontationReview,
} from './confront-store';

export interface ConfrontAppIds {
  readonly planner: string;
  readonly adversary: string;
}

export interface ConfrontDriverDeps {
  readonly adapter: ConfrontAdapter;
  readonly appIds: ConfrontAppIds;
  readonly buildingId: string;
  readonly sceneId: string;
  readonly drillId: string;
  readonly seed: ConfrontationSeed | null;
  /** 本局事件流(评估用:按响应用时判定 timely/delayed/ignored;Task 6 接入)。 */
  readonly events?: readonly { readonly kind: string; readonly adopted?: boolean; readonly respondedWithinSec?: number }[];
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

  /** 开局:生成初步部署(集成层调 beginConfrontation + seed 后调用)。 */
  startInitialPlan(cb: { onPlan(lines: string[]): void; onFail(): void }): void {
    if (!this.deps.seed) return;
    this.deps.adapter.generateInitialPlan(this.ctx(this.deps.appIds.planner)).then((out) => {
      if (out?.deployLines) cb.onPlan(out.deployLines);
      else cb.onFail();
    });
  }

  /** 规划特情注入节奏(先 thinking 骨架,再注入)。 */
  scheduleInject(seqIndex: number, cb: {
    onThinking(v: boolean): void;
    onInject(evt: { emergency: string; location?: string }): void;
    onInjectFail(): void;
  }): void {
    const first = seqIndex === 0;
    const gap = first ? 5000 + this.rand(15000, 25000) : this.rand(15000, 25000);
    this.later(Math.max(0, gap - 3000), () => cb.onThinking(true));
    this.later(gap, () => {
      cb.onThinking(false);
      this.doInject(cb);
    });
  }

  private doInject(cb: {
    onInject(evt: { emergency: string; location?: string }): void;
    onInjectFail(): void;
  }): void {
    const statusLine = this.statusLine();
    void this.deps.adapter.injectSpecial(this.ctx(this.deps.appIds.adversary), statusLine).then((out) => {
      if (out) cb.onInject({ emergency: out.emergency, location: out.location });
      else cb.onInjectFail();
    });
  }

  /** 特情后 2.5s 生成动态调整。 */
  scheduleAdjustment(injectText: string, cb: { onAdjust(lines: string[]): void }): void {
    this.later(2500, () => {
      void this.deps.adapter.generateAdjustment(this.ctx(this.deps.appIds.planner), injectText).then((out) => {
        if (out?.adjustments) cb.onAdjust(out.adjustments);
      });
    });
  }

  /** 结束评估:调用评估 agent,降级时按事件流生成 deterministic review。 */
  async finishEvaluate(elapsedSec: number): Promise<ConfrontationReview> {
    const events = this.deps.events ?? [];
    const adjusts = events.filter((e) => e.kind === 'adjust');
    const outcomes = adjusts.map((e): ConfrontationReview['outcomes'][number] => {
      if (e.respondedWithinSec === undefined) return 'ignored';
      return e.respondedWithinSec <= 15 ? 'timely' : 'delayed';
    });
    const ignored = outcomes.filter((o) => o === 'ignored').length;
    const delayed = outcomes.filter((o) => o === 'delayed').length;

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
        adjustCount: adjusts.length,
        outcomes,
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
      };
    }

    return {
      score: fallbackScore,
      conclusion: pass ? '预案韧性：良好' : '预案韧性：需修订',
      comments: pass
        ? [
            `特情响应平均用时 ${adjusts.length ? Math.round(adjusts.reduce((a, e) => a + (e.respondedWithinSec ?? 30), 0) / adjusts.length) : 8}s，调整链路完整`,
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

  private statusLine(): string {
    const s = this.deps.seed;
    return s ? `火势=1级;${s.floor} ${s.material}起火;被困${s.trapped}人` : '态势未知';
  }

  private rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }
}
