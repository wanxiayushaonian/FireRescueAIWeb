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
  /** 大类 key(消防设施可展开细分;其余大类单 type) */
  key: string;
  label: string;
  /** 该大类下的细分类型(消防设施含多个,门/楼梯/空间各一个) */
  types: CategoryTypeDef[];
}

export const HIDABLE_CATEGORY_GROUPS: CategoryGroup[] = [
  {
    key: 'fireDevices',
    label: '消防设施',
    types: [
      { type: 'OpenSprinklerHead', label: '喷淋嘴' },
      { type: 'PointSmokeDetector', label: '感烟探测器' },
      { type: 'EmergencyLightingFixture', label: '应急照明' },
      { type: 'EvacuationSignLight', label: '疏散标志' },
      { type: 'ManualFireAlarmButton', label: '手动报警按钮' },
      { type: 'ExtinguisherCabinet', label: '灭火器箱' },
      { type: 'IndoorFireHydrant', label: '室内消火栓' },
      { type: 'PositivePressureFan', label: '正压送风机' },
      { type: 'SmokeExhaustFan', label: '排烟风机' },
      { type: 'OutdoorFireHydrant', label: '室外消火栓' },
      { type: 'PumpAdapter', label: '水泵接合器' },
      { type: 'Shuixiangshuibeng', label: '水箱水泵' },
      { type: 'Kongzhitai', label: '消控室控制台' },
      { type: 'Gongzuozhan', label: '消控室工作站' },
      { type: 'Dianshijiankong', label: '电视监控' },
    ],
  },
  { key: 'doors', label: '门', types: [{ type: 'Door', label: '门' }] },
  { key: 'stairs', label: '楼梯', types: [{ type: 'Stairs', label: '楼梯' }] },
  { key: 'spaces', label: '空间', types: [{ type: 'Space', label: '空间' }] },
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

/** 消防设施 type 集合(大类总开关聚合用) */
export const FIRE_DEVICE_TYPES = new Set(
  HIDABLE_CATEGORY_GROUPS.find((g) => g.key === 'fireDevices')!.types.map((t) => t.type),
);

/** 默认某层级的 categoryVisibility(全部可见) */
export function defaultCategoryVisibility(): Record<string, boolean> {
  return Object.fromEntries([...HIDABLE_TYPES].map((t) => [t, true]));
}

/**
 * 各层级"未配置时"的默认可见性 —— 与 level-policy 推导的渲染实际对齐,
 * 供模态框 UI 兜底(开关显示值 = 实际渲染值,避免 UI 全 ON 而实际全藏的错觉):
 *  - single:完整细节 + 显设备 → 全显
 *  - whole/multi:hideDevices 基线藏非主体 → 消防设施/门/空间默认 OFF,楼梯/建筑结构保留 ON
 */
export function defaultVisibleByLevel(level: 'whole' | 'single' | 'multi'): Record<string, boolean> {
  const base = defaultCategoryVisibility();
  if (level === 'single') return base;
  const hidden = new Set<string>([...FIRE_DEVICE_TYPES, 'Door', 'Space']);
  for (const t of hidden) base[t] = false;
  return base;
}
