/**
 * DisasterState — 灾情状态机(纯逻辑,无 React/DOM 依赖)。
 *
 * 维护四维态势:火势等级 × 到场力量 × 被困人数 × 建筑损伤。
 * 每次 tick(events) 按规则表推进状态;确定性演化(相同 scenario + events → 相同输出)。
 *
 * 规则(MVP,简化):
 * - 火势:无压制时每 N tick 升一级(N 经建筑结构修正);有压制时每 M tick 降一级
 * - 到场:arrival 事件注册力量(ETA);每 tick ETA 递减→0 转 arrived;ETA=K 表示 K tick 后到场
 * - 战术:decision 事件携带 tactic(water/foam/rescue/ventilation);
 *   压制生效 = (water|foam) 且有到场消防车;救援生效 = rescue 且有到场人员
 * - 被困:rescue 激活后每 tick 救出 rescuePerTick 人(不低于 0)
 * - 建筑损伤:每 tick 按 fireLevel 线性增长(封顶 1.0)
 * - 风向:记录蔓延方向(可视化用,不影响数值规则)
 * - 战术持续性:MVP 决策(tactic)一旦下达持续生效,无超时/撤销(锁定现行行为;
 *   待版本2 加衰减/撤销/超时)
 *
 * 特情(special):对抗 agent 注入的即时灾情变化(爆炸 +fireLevel / 坍塌 +trapped)。
 * 不变量:fireLevel 始终为整数(0-4 映射);力量 stations/vehicles/personnel/eta 非负有限。
 */

import type { DrillEvent } from './event-bus';

// ============================================================
// 规则配置(可调常量,非 magic number)
// ============================================================

/** 建筑结构类型 */
export type BuildingStructure = 'steel' | 'concrete' | 'wood' | 'mixed';

/** 战术动作 */
export type Tactic = 'water' | 'foam' | 'rescue' | 'ventilation';

/** 火势规则表(可通过构造函数覆盖,实现调参/难度控制) */
export interface DisasterRules {
  /** 无压制时升一级所需 tick(基础值,经建筑结构修正后生效)。 */
  readonly fireEscalateTicks: number;
  /** 压制下降一级所需 tick。 */
  readonly fireSuppressTicks: number;
  /** 火势最高等级。 */
  readonly fireMaxLevel: number;
  /** 火势最低等级(通常 0=熄灭)。 */
  readonly fireMinLevel: number;
  /** 救援激活时每 tick 救出人数。 */
  readonly rescuePerTick: number;
  /** 建筑损伤每 tick 基础增量(即使火势=0 也有微小劣化)。 */
  readonly damageGrowthBase: number;
  /** 建筑损伤每 tick 按 fireLevel 的增量系数。 */
  readonly damageGrowthPerLevel: number;
}

/** 默认规则(MVP 调参基线,所有规则集中于此,便于调整)。 */
export const DEFAULT_DISASTER_RULES: DisasterRules = {
  fireEscalateTicks: 5,
  fireSuppressTicks: 3,
  fireMaxLevel: 4,
  fireMinLevel: 0,
  rescuePerTick: 2,
  damageGrowthBase: 0.001,
  damageGrowthPerLevel: 0.003,
};

/**
 * 建筑结构对火势蔓延速度的修正系数(乘到 fireEscalateTicks 上)。
 * 越小 = 蔓延越快(升一级所需 tick 越少);越大 = 越耐燃。
 */
export const STRUCTURE_FIRE_MODIFIER: Readonly<Record<BuildingStructure, number>> = {
  wood: 0.6, // 木质:蔓延最快
  steel: 0.8, // 钢结构:较快
  mixed: 1.0, // 混合:基准
  concrete: 1.5, // 钢混:最耐燃
};

// ============================================================
// 状态类型
// ============================================================

/** 力量单元(一支救援力量)。eta/status 可变(每 tick 推进),其余只读。 */
export interface ForceUnit {
  readonly forceId: string;
  readonly stations: number;
  readonly vehicles: number;
  readonly personnel: number;
  /** 到场倒计时(tick);每 tick 递减,0=已到场。 */
  eta: number;
  status: 'en_route' | 'arrived';
}

/** 演练剧本初始化参数(init 的入参)。 */
export interface DisasterScenario {
  /** 着火点坐标(场景坐标系,传给 3D 可视化用)。 */
  readonly firePoint: { readonly x: number; readonly y: number };
  /** 燃烧物质(影响战术选择,信息性)。 */
  readonly material: string;
  /** 初始被困人数。 */
  readonly trappedCount: number;
  /** 风向(度,0-359;0=北,顺时针)。 */
  readonly windDirection: number;
  /** 风速(m/s)。 */
  readonly windSpeed: number;
  /** 建筑结构类型(影响火势蔓延速率)。 */
  readonly buildingStructure: BuildingStructure;
  /** 初始火势等级(默认 1;0=未起火)。 */
  readonly initialFireLevel?: number;
  /** 着火楼层(信息性/briefing;如 "5F"/"B1";由灾情参数面板或按建筑生成填充)。 */
  readonly fireFloor?: string;
  /** 着火部位名(信息性/briefing;如 "3F 后厨")。 */
  readonly fireLocation?: string;
}

/** 态势快照(给 query_scene_state MCP + agent forwardedProps;只读视图)。 */
export interface DisasterStatus {
  /** 演练时钟(已 tick 次数)。 */
  readonly clock: number;
  /** 火势等级(fireMinLevel ~ fireMaxLevel)。 */
  readonly fireLevel: number;
  /** 蔓延方向(度;等于风向,可视化用)。 */
  readonly fireSpreadDirection: number;
  /** 全部力量列表(en_route + arrived)。 */
  readonly forces: readonly ForceUnit[];
  /** 到场力量汇总(可用于 agent 决策依据)。 */
  readonly availableForces: {
    readonly stations: number;
    readonly vehicles: number;
    readonly personnel: number;
  };
  /** 当前被困人数。 */
  readonly trappedCount: number;
  /** 已救出人数(累计)。 */
  readonly rescuedCount: number;
  /** 建筑损伤(0-1)。 */
  readonly buildingDamage: number;
  /** 压制是否生效(出水/泡沫 + 到场消防车)。 */
  readonly suppressionActive: boolean;
  /** 救援是否生效(rescue + 到场人员)。 */
  readonly rescueActive: boolean;
  /** 风向(度)。 */
  readonly windDirection: number;
  /** 风速(m/s)。 */
  readonly windSpeed: number;
}

// ============================================================
// Payload 契约(disaster-state 如何解读 event.payload)
// ============================================================

/** arrival 事件 payload:派遣一支力量,ETA 后到场。 */
export interface ArrivalPayload {
  readonly forceId: string;
  readonly stations: number;
  readonly vehicles: number;
  readonly personnel: number;
  /** 到场所需 tick 数(0=已在现场)。 */
  readonly eta: number;
}

/** decision 事件 payload:指挥 agent 下达战术决策。 */
export interface DecisionPayload {
  readonly tactic: Tactic;
  /** 显式指定本次救援人数(覆盖 rescuePerTick;可选,用于一次性救援行动)。 */
  readonly rescueCount?: number;
  /** 决策文本(agent 输出的自然语言理由,供事件树展示)。 */
  readonly decisionText?: string;
}

/** special 事件 payload:对抗 agent 注入即时灾情变化。 */
export interface SpecialPayload {
  readonly description: string;
  /** 直接火势等级增量(如爆炸 +1,可正可负)。 */
  readonly fireLevelDelta?: number;
  /** 被困增量(如坍塌新增被困,正值)。 */
  readonly trappedDelta?: number;
  /** 损伤增量(0-1)。 */
  readonly damageDelta?: number;
}

// ============================================================
// 状态机
// ============================================================

type FireMode = 'escalate' | 'suppress' | 'hold';

// ============================================================
// Payload 运行时窄化(对抗 malformed:缺字段/类型错/负值/NaN → 安全默认)
// 5C.2 inject_event + 6.3 SSE tool_call 喂 unknown payload,需显式窄化防 NaN/throw。
// ============================================================

/** 非负整数化:非有限值→0,负值→0,小数→截断。arrival 力量/ETA 下界保护(I-3)。 */
function toNonNegInt(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n | 0) : 0;
}

/** 可选有限数:缺字段→undefined(调用方跳过),非有限→undefined。special 增量用。 */
function toOptFinite(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** tactic 合法值集合(窄化时校验)。 */
const VALID_TACTICS: ReadonlySet<string> = new Set<Tactic>([
  'water',
  'foam',
  'rescue',
  'ventilation',
]);

export class DisasterState {
  private readonly rules: DisasterRules;
  private clock = 0;
  private fireLevel = 0;
  private readonly forces: ForceUnit[] = [];
  private trappedCount = 0;
  private rescuedCount = 0;
  private buildingDamage = 0;
  private scenario: DisasterScenario | null = null;
  private readonly tacticsActive: Set<Tactic> = new Set();
  private fireMode: FireMode = 'hold';
  private fireCounter = 0;

  constructor(rules: DisasterRules = DEFAULT_DISASTER_RULES) {
    this.rules = rules;
  }

  /**
   * 从剧本初始化(重置所有状态到 t=0)。
   * 设置火势初始等级/被困/风向/建筑结构;损伤归零;无力量;战术清空。
   */
  init(scenario: DisasterScenario): void {
    this.clock = 0;
    this.fireLevel = scenario.initialFireLevel ?? 1;
    this.forces.length = 0;
    this.trappedCount = scenario.trappedCount;
    this.rescuedCount = 0;
    this.buildingDamage = 0;
    this.scenario = { ...scenario, firePoint: { ...scenario.firePoint } };
    this.tacticsActive.clear();
    this.fireMode = 'hold';
    this.fireCounter = 0;
  }

  /**
   * 推进一个 tick:
   * 1. 先推进已有力量 ETA(到场倒计时)—— 新注册的力量从下个 tick 开始递减
   * 2. 处理本 tick 事件(注册力量 / 激活战术 / 特情即时变化)
   * 3. 判定压制/救援是否生效 → 更新火势 → 被困救援 → 建筑损伤
   * 4. clock 自增
   *
   * 确定性:相同 (init 参数, 每 tick 的 events 序列) → 相同 getStatus()。
   */
  tick(events: readonly DrillEvent[]): void {
    // 1. 推进已有力量(先于事件处理,保证新力量从下 tick 起开始 ETA 递减)
    this.advanceForces();

    // 2. 处理事件
    for (const e of events) {
      this.handleEvent(e);
    }

    // 3. 判定战术生效条件(需到场力量支撑)
    const arrived = this.sumArrived();
    const suppressionActive =
      (this.tacticsActive.has('water') || this.tacticsActive.has('foam')) && arrived.vehicles > 0;
    const rescueActive = this.tacticsActive.has('rescue') && arrived.personnel > 0;

    // 4. 火势规则(压制/蔓延/保持)
    this.advanceFire(suppressionActive);

    // 5. 被困救援(每 tick 持续减员)
    if (rescueActive && this.trappedCount > 0) {
      const n = Math.min(this.trappedCount, this.rules.rescuePerTick);
      this.trappedCount -= n;
      this.rescuedCount += n;
    }

    // 6. 建筑损伤(火势越高劣化越快)
    const dmg = this.rules.damageGrowthBase + this.rules.damageGrowthPerLevel * this.fireLevel;
    this.buildingDamage = Math.min(1, this.buildingDamage + dmg);

    this.clock += 1;
  }

  /** 当前态势快照(不可变视图;每次返回新对象,调用方可安全持有)。 */
  getStatus(): DisasterStatus {
    const arrived = this.sumArrived();
    const suppressionActive =
      (this.tacticsActive.has('water') || this.tacticsActive.has('foam')) && arrived.vehicles > 0;
    const rescueActive = this.tacticsActive.has('rescue') && arrived.personnel > 0;
    return {
      clock: this.clock,
      fireLevel: this.fireLevel,
      fireSpreadDirection: this.scenario?.windDirection ?? 0,
      forces: this.forces.map((f) => ({ ...f })),
      availableForces: arrived,
      trappedCount: this.trappedCount,
      rescuedCount: this.rescuedCount,
      buildingDamage: this.buildingDamage,
      suppressionActive,
      rescueActive,
      windDirection: this.scenario?.windDirection ?? 0,
      windSpeed: this.scenario?.windSpeed ?? 0,
    };
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 按事件类型分派处理。
   * 单事件 malformed 不崩整个 tick:顶层 try/catch 记 warn 跳过该事件(I-2)。
   */
  private handleEvent(e: DrillEvent): void {
    try {
      switch (e.type) {
        case 'arrival':
          this.registerArrival(this.asArrival(e.payload));
          break;
        case 'decision': {
          const dp = this.asDecision(e.payload);
          if (dp) this.tacticsActive.add(dp.tactic);
          break;
        }
        case 'special':
          this.applySpecial(this.asSpecial(e.payload));
          break;
        case 'disaster':
        case 'status':
          // 灾情/状态事件为信息性(展示用),无即时状态副作用
          break;
        default:
          break;
      }
    } catch (err) {
      console.warn(
        `[disaster-state] handleEvent 跳过 malformed 事件(id=${e.id} type=${e.type}):`,
        err,
      );
    }
  }

  /**
   * 注册到场力量(同 forceId 不重复注册)。eta=0 立即到场。
   * 力量/ETA 下界保护(I-3):asArrival 已窄化,此处 Math.max(0, ...|0) 兜底(defense-in-depth)。
   */
  private registerArrival(p: ArrivalPayload): void {
    if (this.forces.some((f) => f.forceId === p.forceId)) return;
    const stations = Math.max(0, p.stations | 0);
    const vehicles = Math.max(0, p.vehicles | 0);
    const personnel = Math.max(0, p.personnel | 0);
    const eta = Math.max(0, p.eta | 0);
    this.forces.push({
      forceId: p.forceId,
      stations,
      vehicles,
      personnel,
      eta,
      status: eta <= 0 ? 'arrived' : 'en_route',
    });
  }

  /**
   * 应用特情即时变化(爆炸/坍塌等)。
   * fireLevelDelta 取整后 clampFire(I-4):保 fireLevel 整数不变量(防 0.5 破坏 0-4 映射)。
   * asSpecial 已将非有限增量→undefined,此处 toOptFinite 兜底 + 安全跳过。
   */
  private applySpecial(p: SpecialPayload): void {
    if (p.fireLevelDelta) {
      this.fireLevel = this.clampFire(Math.round(this.fireLevel + p.fireLevelDelta));
    }
    if (p.trappedDelta) {
      this.trappedCount = Math.max(0, this.trappedCount + p.trappedDelta);
    }
    if (p.damageDelta) {
      this.buildingDamage = Math.min(1, Math.max(0, this.buildingDamage + p.damageDelta));
    }
  }

  /** 推进所有 en_route 力量:ETA 递减,到 0 转 arrived。 */
  private advanceForces(): void {
    for (const f of this.forces) {
      if (f.status === 'en_route') {
        f.eta = Math.max(0, f.eta - 1);
        if (f.eta <= 0) {
          f.status = 'arrived';
        }
      }
    }
  }

  /**
   * 火势规则:
   * - 压制生效且火未熄:每 fireSuppressTicks tick 降一级(切到 suppress 模式,重置计数器)
   * - 无压制且火未到顶:每 effectiveEscalateTicks tick 升一级(切到 escalate 模式)
   * - 其余(火已熄灭 / 已到顶且无压制):hold,火势不变
   * 模式切换时重置计数器(避免跨模式累加)。
   */
  private advanceFire(suppressionActive: boolean): void {
    if (suppressionActive && this.fireLevel > this.rules.fireMinLevel) {
      if (this.fireMode !== 'suppress') {
        this.fireMode = 'suppress';
        this.fireCounter = 0;
      }
      this.fireCounter += 1;
      if (this.fireCounter >= this.rules.fireSuppressTicks) {
        this.fireLevel = this.clampFire(this.fireLevel - 1);
        this.fireCounter = 0;
      }
    } else if (
      this.fireLevel > this.rules.fireMinLevel &&
      this.fireLevel < this.rules.fireMaxLevel
    ) {
      if (this.fireMode !== 'escalate') {
        this.fireMode = 'escalate';
        this.fireCounter = 0;
      }
      this.fireCounter += 1;
      if (this.fireCounter >= this.effectiveEscalateTicks()) {
        this.fireLevel = this.clampFire(this.fireLevel + 1);
        this.fireCounter = 0;
      }
    } else {
      this.fireMode = 'hold';
    }
  }

  /** 建筑结构修正后的升一级 tick 数(向上取整,至少 1)。 */
  private effectiveEscalateTicks(): number {
    const modifier = this.scenario
      ? STRUCTURE_FIRE_MODIFIER[this.scenario.buildingStructure]
      : 1.0;
    return Math.max(1, Math.ceil(this.rules.fireEscalateTicks * modifier));
  }

  private clampFire(level: number): number {
    return Math.max(this.rules.fireMinLevel, Math.min(this.rules.fireMaxLevel, level));
  }

  /** 汇总到场力量(车辆/人员/站)。 */
  private sumArrived(): { stations: number; vehicles: number; personnel: number } {
    return this.forces
      .filter((f) => f.status === 'arrived')
      .reduce(
        (acc, f) => ({
          stations: acc.stations + f.stations,
          vehicles: acc.vehicles + f.vehicles,
          personnel: acc.personnel + f.personnel,
        }),
        { stations: 0, vehicles: 0, personnel: 0 },
      );
  }

  // ============================================================
  // Payload 显式窄化(I-2:删 asPayload 双重断言,改逐字段提取 + 类型校验)
  // ============================================================

  /** 窄化 arrival payload:forceId 字符串化,力量/ETA 非负整数下界(I-3)。 */
  private asArrival(p: Readonly<Record<string, unknown>>): ArrivalPayload {
    return {
      forceId: String(p.forceId ?? ''),
      stations: toNonNegInt(p.stations),
      vehicles: toNonNegInt(p.vehicles),
      personnel: toNonNegInt(p.personnel),
      eta: toNonNegInt(p.eta),
    };
  }

  /**
   * 窄化 decision payload:tactic 严格校验(VALID_TACTICS),非法/缺字段→null。
   * 调用方(handleEvent)收到 null 时跳过该决策(不污染 tacticsActive)。
   */
  private asDecision(p: Readonly<Record<string, unknown>>): DecisionPayload | null {
    const raw = p.tactic;
    if (typeof raw !== 'string' || !VALID_TACTICS.has(raw)) return null;
    return {
      tactic: raw as Tactic,
      rescueCount: p.rescueCount != null ? toNonNegInt(p.rescueCount) : undefined,
      decisionText: typeof p.decisionText === 'string' ? p.decisionText : undefined,
    };
  }

  /** 窄化 special payload:增量非有限→undefined(applySpecial 跳过),description 安全字符串。 */
  private asSpecial(p: Readonly<Record<string, unknown>>): SpecialPayload {
    return {
      description: typeof p.description === 'string' ? p.description : '',
      fireLevelDelta: toOptFinite(p.fireLevelDelta),
      trappedDelta: toOptFinite(p.trappedDelta),
      damageDelta: toOptFinite(p.damageDelta),
    };
  }
}
