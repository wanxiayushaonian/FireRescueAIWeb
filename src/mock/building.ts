// 建筑档案 Mock（对象总览模块）—— 全部为演示数据
// fetchBuildingProfile() 返回 Promise，模拟延迟 300-800ms，支持 state 演示参数。
import type { BuildingProfile, FetchState } from './types';

export interface BuildingMeta {
  id: string;
  name: string;
  address: string;
  floors: string;
  structure: string;
  lng: number;
  lat: number;
}

export const BUILDING_LIST: BuildingMeta[] = [
  {
    id: 'jm',
    name: '金茂大厦',
    address: '鼓楼区中山北路 2 号',
    floors: '地上 32 层 / 地下 2 层',
    structure: '钢混框架-核心筒',
    lng: 118.7835,
    lat: 32.0671,
  },
  {
    id: 'zysc',
    name: '中央商场',
    address: '秦淮区中山南路 79 号',
    floors: '地上 8 层 / 地下 3 层',
    structure: '钢筋混凝土框架',
    lng: 118.7789,
    lat: 32.0412,
  },
  {
    id: 'bjhld',
    name: '滨江希尔顿酒店',
    address: '建邺区扬子江大道 208 号',
    floors: '地上 26 层 / 地下 1 层',
    structure: '框架-剪力墙',
    lng: 118.7412,
    lat: 32.0088,
  },
];

type IndoorItem = BuildingProfile['indoorFacilities'][number]['items'][number];

/** 按楼层生成室内固定消防设施（确定性伪随机，保证演示数据稳定） */
function genFloorItems(floor: string, seed: number, total: number): IndoorItem[] {
  const types: IndoorItem['type'][] = ['室内消火栓', '烟感', '喷淋', '灭火器箱', '手动报警装置'];
  const prefixes: Record<IndoorItem['type'], string> = {
    室内消火栓: 'XHS',
    烟感: 'YG',
    喷淋: 'PL',
    灭火器箱: 'MHQ',
    手动报警装置: 'SBA',
  };
  const names: Record<IndoorItem['type'], string> = {
    室内消火栓: '室内消火栓',
    烟感: '烟感探测器',
    喷淋: '喷淋头',
    灭火器箱: '灭火器箱',
    手动报警装置: '手动报警按钮',
  };
  const items: IndoorItem[] = [];
  for (let i = 0; i < total; i++) {
    const type = types[(seed + i) % types.length];
    const floorNum = floor.replace(/[^0-9B]/g, '') || floor;
    const id = `${prefixes[type]}-${floorNum}${String(i + 1).padStart(2, '0')}`;
    const r = (seed * 31 + i * 17) % 100;
    const status: IndoorItem['status'] = r < 84 ? '正常' : r < 94 ? '告警' : '离线';
    items.push({ id, name: names[type], type, status });
  }
  return items;
}

const JM_FLOORS = ['B2', 'B1', '1F', '2F', '3F', '4F', '5F', '15F', '28F', '32F'];

const JM_PROFILE: BuildingProfile = {
  overview: {
    name: '金茂大厦',
    address: '鼓楼区中山北路 2 号',
    structure: '钢混框架-核心筒',
    floors: '地上 32 层 / 地下 2 层',
    area: '总建筑面积 86,000 ㎡',
    zones: ['B2-B1 车库', '1-5F 商业', '6-28F 办公', '29-32F 酒店'],
    adjacent: ['东：中山路', '南：绿地广场', '西：居民楼', '北：写字楼'],
  },
  waterSupply: {
    pools: [
      { id: 'SC-01', name: '消防水池 1 号', type: '消防水池', location: '地下 B2 · 600m³', status: '正常' },
      { id: 'SC-02', name: '消防水池 2 号', type: '消防水池', location: '地下 B2 · 600m³', status: '正常' },
    ],
    pumps: [
      { id: 'SB-01', name: '喷淋泵', type: '消防水泵', location: 'B2 水泵房', status: '正常' },
      { id: 'SB-02', name: '消火栓泵', type: '消防水泵', location: 'B2 水泵房', status: '正常' },
      { id: 'SB-03', name: '稳压泵', type: '消防水泵', location: '屋顶水箱间', status: '正常' },
    ],
    adapters: [
      { id: 'JQ-01', name: '水泵接合器 JQ-01', type: '水泵接合器', location: '1F 东侧入口', status: '正常' },
      { id: 'JQ-02', name: '水泵接合器 JQ-02', type: '水泵接合器', location: '1F 南侧广场', status: '正常' },
      { id: 'JQ-03', name: '水泵接合器 JQ-03', type: '水泵接合器', location: 'B1 车库坡道旁', status: '告警' },
      { id: 'JQ-04', name: '水泵接合器 JQ-04', type: '水泵接合器', location: '1F 西侧通道', status: '正常' },
    ],
    outdoorHydrants: Array.from({ length: 6 }, (_, i) => ({
      id: `SWX-${String(i + 1).padStart(2, '0')}`,
      name: `室外消火栓 SWX-${String(i + 1).padStart(2, '0')}`,
      type: '室外消火栓',
      location: ['东门绿化带', '南侧广场', '西侧通道', '北侧停车场', '东南角', '西北角'][i],
      status: '正常' as const,
    })),
  },
  keyParts: {
    exits: Array.from({ length: 4 }, (_, i) => ({
      id: `CK-${i + 1}`,
      name: `首层安全出口 ${i + 1} 号`,
      type: '安全出口',
      location: ['东侧', '南侧', '西侧', '北侧'][i],
      status: '正常' as const,
    })),
    fireElevators: [
      { id: 'DT-01', name: '消防电梯 1 号', type: '消防电梯', location: '核心筒 A 区', status: '正常' },
      { id: 'DT-02', name: '消防电梯 2 号', type: '消防电梯', location: '核心筒 B 区', status: '正常' },
    ],
    fireCompartments: [
      { id: 'FQ-01', name: '防火分区', type: '防火分区', location: '每层 2 个分区 · 甲级防火门分隔', status: '正常' },
    ],
    controlRoom: { id: 'XKS-01', name: '消防控制室', type: '消控室', location: '1F 东北角 · 24h 值守', status: '正常' },
    refugeFloors: [
      { id: 'BNC-15', name: '避难层 15F', type: '避难层', location: '15F · 避难面积 420 ㎡', status: '正常' },
      { id: 'BNC-28', name: '避难层 28F', type: '避难层', location: '28F · 避难面积 420 ㎡', status: '正常' },
    ],
  },
  indoorFacilities: JM_FLOORS.map((floor, i) => ({
    floor,
    // 3F 无登记设施（演示楼层级空态）；5F 24 项与统计示例一致
    items: floor === '3F' ? [] : genFloorItems(floor, i + 3, floor === '5F' ? 24 : 8 + ((i * 5) % 9)),
  })),
  contacts: {
    controlRoomPhone: '025-8471****',
    legalPerson: '李文博',
    fireManager: '赵敏 · 138****6621',
    partTimeManager: '陈强 · 137****8850',
  },
};

const ZYSC_PROFILE: BuildingProfile = {
  ...JM_PROFILE,
  overview: {
    name: '中央商场',
    address: '秦淮区中山南路 79 号',
    structure: '钢筋混凝土框架',
    floors: '地上 8 层 / 地下 3 层',
    area: '总建筑面积 42,000 ㎡',
    zones: ['B3-B2 车库', 'B1-6F 商业', '7-8F 餐饮'],
    adjacent: ['东：中山南路', '南：商业街区', '西：内街', '北：写字楼'],
  },
  keyParts: {
    ...JM_PROFILE.keyParts,
    refugeFloors: [{ id: 'BNC-4', name: '避难层 4F', type: '避难层', location: '4F · 避难面积 260 ㎡', status: '正常' }],
  },
  indoorFacilities: ['B3', 'B2', 'B1', '1F', '2F', '4F', '6F', '8F'].map((floor, i) => ({
    floor,
    items: floor === '8F' ? [] : genFloorItems(floor, i + 11, 10 + ((i * 3) % 8)),
  })),
  contacts: {
    controlRoomPhone: '025-5220****',
    legalPerson: '周明远',
    fireManager: '吴珊 · 139****2233',
    partTimeManager: '郑凯 · 136****7708',
  },
};

const BJHLD_PROFILE: BuildingProfile = {
  ...JM_PROFILE,
  overview: {
    name: '滨江希尔顿酒店',
    address: '建邺区扬子江大道 208 号',
    structure: '框架-剪力墙',
    floors: '地上 26 层 / 地下 1 层',
    area: '总建筑面积 58,000 ㎡',
    zones: ['B1 车库/后勤', '1-4F 餐饮宴会', '5-26F 客房'],
    adjacent: ['东：扬子江大道', '南：江堤绿地', '西：滨江步道', '北：住宅区'],
  },
  keyParts: {
    ...JM_PROFILE.keyParts,
    refugeFloors: [
      { id: 'BNC-12', name: '避难层 12F', type: '避难层', location: '12F · 避难面积 380 ㎡', status: '正常' },
      { id: 'BNC-24', name: '避难层 24F', type: '避难层', location: '24F · 避难面积 380 ㎡', status: '正常' },
    ],
  },
  indoorFacilities: ['B1', '1F', '2F', '6F', '12F', '18F', '24F', '26F'].map((floor, i) => ({
    floor,
    items: floor === '18F' ? [] : genFloorItems(floor, i + 23, 9 + ((i * 7) % 8)),
  })),
  contacts: {
    controlRoomPhone: '025-8688****',
    legalPerson: '沈立群',
    fireManager: '林芳 · 137****5566',
    partTimeManager: '徐斌 · 138****9910',
  },
};

const PROFILES: Record<string, BuildingProfile> = {
  jm: JM_PROFILE,
  zysc: ZYSC_PROFILE,
  bjhld: BJHLD_PROFILE,
};

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export interface FetchOptions {
  state?: FetchState;
}

/**
 * 获取单建筑档案（Promise，延迟 300-800ms）。
 * state='loading' 时永不返回（演示加载中）；'empty' 返回 null；'error' 抛错。
 */
export async function fetchBuildingProfile(
  buildingId = 'jm',
  options: FetchOptions = {},
): Promise<BuildingProfile | null> {
  const state = options.state ?? 'ok';
  if (state === 'loading') {
    return new Promise<never>(() => {});
  }
  await delay(300 + Math.random() * 500);
  if (state === 'error') throw new Error('mock: 建筑档案请求失败（演示）');
  if (state === 'empty') return null;
  return PROFILES[buildingId] ?? PROFILES.jm;
}
