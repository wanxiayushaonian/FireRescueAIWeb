/**
 * 应急预案模拟数据。
 * 数据格式按真实后端接口设计，便于后续替换为真实 API 调用。
 * 所有 ID 均为贴近真实的示例值，不调用任何 ustudio 接口。
 */

export type PlanStatus = 'enabled' | 'draft' | 'disabled';

export type PlanStep = {
  /** 步骤序号，从 1 开始 */
  step: number;
  /** 步骤说明 */
  description: string;
  /** 本步骤要切换到的楼层 twins_instance_id 列表，空表示不切换 */
  storyIds?: string[];
  /** 本步骤要显示的路线 ID 列表，空表示不操作路线 */
  routeIds?: string[];
  /** 本步骤要定位/高亮的设备 twins_instance_id 列表 */
  deviceIds?: string[];
};

export type EmergencyPlan = {
  /** 预案业务 ID */
  id: string;
  /** 预案名称 */
  name: string;
  /** 预案类型 */
  type: string;
  /** 状态 */
  status: PlanStatus;
  /** 适用楼层名称，用于展示 */
  applicableStories: string;
  /** 适用楼层的 twins_instance_id 列表，执行 setScene 用 */
  storyIds: string[];
  /** 描述 */
  description: string;
  /** 执行步骤 */
  steps: PlanStep[];
  /** 关联路线 ID 列表 */
  routeIds: string[];
  /** 关联设备 twins_instance_id 列表 */
  deviceIds: string[];
};

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  enabled: '已启用',
  draft: '草稿',
  disabled: '已停用',
};

export const PLAN_STATUS_THEME: Record<PlanStatus, { color: string; bg: string }> = {
  enabled: { color: '#34d399', bg: 'rgba(52, 211, 153, 0.12)' },
  draft: { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' },
  disabled: { color: '#f87171', bg: 'rgba(248, 113, 113, 0.12)' },
};

/** 模拟预案列表 */
export const MOCK_PLANS: EmergencyPlan[] = [
  {
    id: 'plan-fire-evacuation-001',
    name: '火灾疏散预案',
    type: '消防疏散',
    status: 'enabled',
    applicableStories: '2F–21F',
    storyIds: ['465162468450934785', '465162468450934786', '465162468450934787'],
    description: '发生火灾时，自动切换至疏散视角，高亮消防设备并显示最近疏散路线。',
    routeIds: ['route-evacuation-a', 'route-evacuation-b'],
    deviceIds: [
      '465162468450934901',
      '465162468450934902',
      '465162468450934903',
      '465162468450934904',
    ],
    steps: [
      {
        step: 1,
        description: '切换至 3D 全局视角，聚焦起火楼层',
        storyIds: ['465162468450934785'],
      },
      {
        step: 2,
        description: '显示疏散路线 route-evacuation-a、route-evacuation-b',
        routeIds: ['route-evacuation-a', 'route-evacuation-b'],
      },
      {
        step: 3,
        description: '高亮最近消火栓与感烟报警器',
        deviceIds: ['465162468450934901', '465162468450934902'],
      },
      {
        step: 4,
        description: '定位到安全出口',
        deviceIds: ['465162468450934903'],
      },
      {
        step: 5,
        description: '复位视角，结束演练',
      },
    ],
  },
  {
    id: 'plan-fire-patrol-002',
    name: '消防巡检预案',
    type: '日常巡检',
    status: 'enabled',
    applicableStories: '全楼',
    storyIds: [],
    description: '按楼层巡检消防设备，依次定位并检查灭火器、消火栓、烟感报警器状态。',
    routeIds: ['route-patrol-1', 'route-patrol-2'],
    deviceIds: [
      '465162468450934911',
      '465162468450934912',
      '465162468450934913',
      '465162468450934914',
      '465162468450934915',
      '465162468450934916',
      '465162468450934917',
      '465162468450934918',
    ],
    steps: [
      {
        step: 1,
        description: '切换至 2F，开始巡检',
        storyIds: ['465162468450934785'],
        deviceIds: ['465162468450934911', '465162468450934912'],
      },
      {
        step: 2,
        description: '检查 5F 灭火器与消火栓',
        storyIds: ['465162468450934788'],
        deviceIds: ['465162468450934913', '465162468450934914'],
      },
      {
        step: 3,
        description: '检查 10F 烟感报警器',
        storyIds: ['465162468450934793'],
        deviceIds: ['465162468450934915', '465162468450934916'],
      },
      {
        step: 4,
        description: '检查 21F 顶部设备并结束',
        storyIds: ['465162468450934804'],
        deviceIds: ['465162468450934917', '465162468450934918'],
      },
    ],
  },
  {
    id: 'plan-elevator-rescue-003',
    name: '电梯困人救援',
    type: '应急救援',
    status: 'draft',
    applicableStories: '电梯厅',
    storyIds: ['465162468450934785'],
    description: '电梯发生困人时，定位被困电梯轿厢，高亮救援通道与最近的消火栓。',
    routeIds: ['route-elevator-rescue'],
    deviceIds: [
      '465162468450934921',
      '465162468450934922',
      '465162468450934923',
      '465162468450934924',
    ],
    steps: [
      {
        step: 1,
        description: '切换至电梯厅所在楼层',
        storyIds: ['465162468450934785'],
      },
      {
        step: 2,
        description: '定位被困电梯轿厢',
        deviceIds: ['465162468450934921'],
      },
      {
        step: 3,
        description: '显示救援路线并高亮消火栓',
        routeIds: ['route-elevator-rescue'],
        deviceIds: ['465162468450934922'],
      },
    ],
  },
];
