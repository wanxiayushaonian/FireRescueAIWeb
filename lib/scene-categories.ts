/**
 * 可显隐类别定义(基于实例树实测 twins_identifier/type)。
 * 墙/楼栋/楼层(Site/Building/Story/Wall)是主体结构,不在可隐列表(藏掉就看不见楼)。
 * 供内容显隐模态框(按层级 tab 分组)使用;engine 只认 categoryVisibility[level] 的 type key。
 */

export interface CategoryTypeDef {
  type: string;
  label: string;
}

export interface CategoryGroup {
  /** 大类 key */
  key: string;
  label: string;
  /** 该大类下的细分类型 */
  types: CategoryTypeDef[];
  /** 消防系统类:归属「消防设施」大目录(父级总开关统一隐藏);whole/multi 默认隐藏 */
  fireSystem?: boolean;
  /** 语义空间归属:outdoor=室外区(默认显示);缺省=室内 */
  zone?: 'outdoor';
}

/** 分组对齐平台本体分类树 + 语义空间归属(室内/室外)。
 *  注意:草地/道路/周边底模不在语义树内(CPS 环境网格),只能随建筑结构模式整体简化,无独立开关。 */
export const HIDABLE_CATEGORY_GROUPS: CategoryGroup[] = [
  {
    key: 'hydrantSupply',
    label: '消火栓供水系统',
    fireSystem: true,
    types: [
      { type: 'IndoorFireHydrant', label: '室内消火栓' },
      { type: 'PumpAdapter', label: '水泵接合器' },
      { type: 'Shuixiangshuibeng', label: '水箱水泵' },
    ],
  },
  {
    key: 'sprinkler',
    label: '自动喷水灭火',
    fireSystem: true,
    types: [{ type: 'OpenSprinklerHead', label: '喷淋嘴' }],
  },
  {
    key: 'fireAlarm',
    label: '火灾探测报警',
    fireSystem: true,
    types: [
      { type: 'PointSmokeDetector', label: '感烟探测器' },
      { type: 'ManualFireAlarmButton', label: '手动报警按钮' },
    ],
  },
  {
    key: 'smokeControl',
    label: '防排烟系统',
    fireSystem: true,
    types: [
      { type: 'PositivePressureFan', label: '正压送风机' },
      { type: 'SmokeExhaustFan', label: '排烟风机' },
    ],
  },
  {
    key: 'evacuation',
    label: '疏散逃生设施',
    fireSystem: true,
    types: [
      { type: 'EmergencyLightingFixture', label: '应急照明' },
      { type: 'EvacuationSignLight', label: '疏散标志' },
    ],
  },
  {
    key: 'extinguisher',
    label: '灭火器',
    fireSystem: true,
    types: [{ type: 'ExtinguisherCabinet', label: '灭火器箱' }],
  },
  {
    key: 'controlRoom',
    label: '消控室设备',
    fireSystem: true,
    types: [
      { type: 'Kongzhitai', label: '消控室控制台' },
      { type: 'Gongzuozhan', label: '消控室工作站' },
      { type: 'Dianshijiankong', label: '电视监控' },
    ],
  },
  { key: 'doors', label: '门', types: [{ type: 'Door', label: '门' }] },
  { key: 'stairs', label: '楼梯', types: [{ type: 'Stairs', label: '楼梯' }] },
  { key: 'spaces', label: '空间', types: [{ type: 'Space', label: '空间' }] },
  {
    key: 'outdoorHydrant',
    label: '室外消火栓',
    zone: 'outdoor',
    types: [{ type: 'OutdoorFireHydrant', label: '室外消火栓' }],
  },
  {
    key: 'vehicles',
    label: '消防车辆',
    zone: 'outdoor',
    types: [
      { type: 'SmokeExhaustFireTruck', label: '排烟消防车' },
      { type: 'RemoteWaterSupplyFireTruck', label: '远程供水消防车' },
    ],
  },
  {
    key: 'sceneAccess',
    label: '出入口',
    zone: 'outdoor',
    types: [{ type: 'SceneInOut', label: '场景出入口' }],
  },
  {
    key: 'buildingStructure',
    label: '建筑结构',
    types: [
      { type: 'Wall', label: '墙体' },
      { type: 'Story', label: '楼层' },
      { type: 'Building', label: '楼栋' },
      { type: 'Site', label: '场地' },
    ],
  },
];

/** 所有可显隐 type → 中文名(扁平) */
export const HIDABLE_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  HIDABLE_CATEGORY_GROUPS.flatMap((g) => g.types.map((t) => [t.type, t.label])),
);

/** 所有可显隐 type 集合 */
export const HIDABLE_TYPES = new Set(Object.keys(HIDABLE_TYPE_LABELS));

/** 消防系统类 type 集合(大类总开关聚合 + whole/multi 默认隐藏用;消控室设备计入,车辆不计) */
export const FIRE_DEVICE_TYPES = new Set(
  HIDABLE_CATEGORY_GROUPS.filter((g) => g.fireSystem).flatMap((g) => g.types.map((t) => t.type)),
);

/** 默认某层级的 categoryVisibility(全部可见) */
export function defaultCategoryVisibility(): Record<string, boolean> {
  return Object.fromEntries([...HIDABLE_TYPES].map((t) => [t, true]));
}

/**
 * 各层级"未配置时"的默认可见性 —— **白名单语义(2026-08-17 用户定:只显示列出的,不是追加)**:
 *  - single:只显 室外消火栓/消防车辆/出入口(+建筑结构基底,楼体/墙/楼层不可藏)
 *  - multi:只显 消防设施(7 组)/门(+建筑结构基底)
 *  - whole:消防系统类(含消控室设备)/门/空间 OFF,室外装备/楼梯/建筑结构 ON(用户未提,保持)
 * 建筑结构(Wall/Story/Building/Site)作为场景基底始终保留——藏了没有楼体可看。
 */
/** 单层白名单:室外三件(室外消火栓/消防车辆/出入口)。 */
const SINGLE_WHITELIST = new Set(['OutdoorFireHydrant', 'SmokeExhaustFireTruck', 'RemoteWaterSupplyFireTruck', 'SceneInOut']);
/** 多层白名单:消防设施(7 组)+ 门。 */
const MULTI_WHITELIST = new Set<string>([...FIRE_DEVICE_TYPES, 'Door']);
/** 场景基底:建筑结构类型恒显(各白名单共用)。 */
const STRUCTURE_BASE = new Set(['Wall', 'Story', 'Building', 'Site']);

export function defaultVisibleByLevel(level: 'whole' | 'single' | 'multi'): Record<string, boolean> {
  const base = defaultCategoryVisibility(); // 全 true
  if (level === 'whole') {
    // 保持:藏消防系统类(含消控室设备)/门/空间;室外三件/楼梯/结构显
    for (const t of [...FIRE_DEVICE_TYPES, 'Door', 'Space']) base[t] = false;
    return base;
  }
  // 白名单:只显列表项 + 结构基底,其余全部藏
  const keep = level === 'single' ? SINGLE_WHITELIST : MULTI_WHITELIST;
  for (const t of Object.keys(base)) {
    if (!keep.has(t) && !STRUCTURE_BASE.has(t)) base[t] = false;
  }
  return base;
}

/** 三层级默认表(whole/single/multi):App 预设应用、无存档时初始化 categoryVisibility 用。 */
export function defaultCategoryVisibilityByLevel(): Record<'whole' | 'single' | 'multi', Record<string, boolean>> {
  return {
    whole: defaultVisibleByLevel('whole'),
    single: defaultVisibleByLevel('single'),
    multi: defaultVisibleByLevel('multi'),
  };
}
