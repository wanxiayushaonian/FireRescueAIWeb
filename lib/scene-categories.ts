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
 * 各层级"未配置时"的默认可见性 —— 与 level-policy 推导的渲染实际对齐,
 * 供模态框 UI 兜底(开关显示值 = 实际渲染值,避免 UI 全 ON 而实际全藏的错觉):
 *  - single:完整细节 + 显设备 → 全显
 *  - whole/multi:hideDevices 基线藏非主体 → 消防系统类(含消控室设备)/门/空间默认 OFF,
 *    车辆(室外装备)/楼梯/建筑结构保留 ON
 */
export function defaultVisibleByLevel(level: 'whole' | 'single' | 'multi'): Record<string, boolean> {
  const base = defaultCategoryVisibility();
  if (level === 'single') return base;
  const hidden = new Set<string>([...FIRE_DEVICE_TYPES, 'Door', 'Space']);
  for (const t of hidden) base[t] = false;
  return base;
}
