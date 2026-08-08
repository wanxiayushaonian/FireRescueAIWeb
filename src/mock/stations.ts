// 执勤力量资源库 Mock 数据（演示数据）
import type { FetchState, ResourceItem, Station } from './types';

export const STATION_TYPES: Station['type'][] = [
  '救援大队', '救援站', '政府专职站', '企业专职站', '微型消防站',
];

const stationSeed: Array<[string, Station['type'], number, number]> = [
  ['城东救援站', '救援站', 42, 6],
  ['城西救援站', '救援站', 38, 5],
  ['云锦路站', '救援站', 36, 5],
  ['珠江路救援站', '救援站', 40, 6],
  ['滨江救援站', '救援站', 35, 4],
  ['高新救援站', '救援站', 33, 4],
  ['鼓楼救援大队', '救援大队', 58, 8],
  ['玄武救援大队', '救援大队', 62, 9],
  ['龙潭政府专职站', '政府专职站', 24, 3],
  ['板桥政府专职站', '政府专职站', 22, 3],
  ['化工园企业专职站', '企业专职站', 18, 2],
  ['港区企业专职站', '企业专职站', 20, 2],
  ['金茂大厦微型站', '微型消防站', 6, 0],
  ['中央商场微型站', '微型消防站', 5, 0],
];

const streets = ['珠江路', '中山路', '滨江大道', '云锦路', '龙蟠路', '北京东路', '长江路'];
const contacts = ['张海涛', '李卫国', '陈志强', '王建军', '刘晓东', '赵永刚', '孙明辉'];

export const STATIONS: Station[] = stationSeed.map(([name, type, personnel, vehicles], i) => ({
  id: `st-${String(i + 1).padStart(3, '0')}`,
  name,
  type,
  contact: contacts[i % contacts.length],
  dutyPhone: `025-83${String(11 + i)}****`,
  address: `${streets[i % streets.length]} ${100 + i * 7} 号`,
  // 伪随机散布（确定性），避免打点呈对角线扎堆；接入真实数据后由后端经纬度替换
  lng: +(115.96 + (((i * 37 + 13) % 100) / 100) * 0.096).toFixed(4),
  lat: +(29.66 + (((i * 53 + 29) % 100) / 100) * 0.062).toFixed(4),
  personnel,
  vehicles,
}));

const vehicleSubtypes: Array<[string, number]> = [
  ['水罐车', 32], ['举高喷射车', 10], ['抢险救援车', 18], ['登高平台车', 12], ['云梯车', 14],
];
const personnelSubtypes: Array<[string, number]> = [['干部', 96], ['消防员', 820], ['专职队员', 330]];
const equipSubtypes: Array<[string, number]> = [
  ['基本防护', 1860], ['特种防护', 420], ['侦检', 310], ['破拆', 280], ['照明排烟', 240], ['泵类', 310],
];

const equipNames: Record<string, string[]> = {
  基本防护: ['灭火防护服', '消防头盔', '空气呼吸器', '防护靴'],
  特种防护: ['隔热服', '防化服', '避火服'],
  侦检: ['热成像仪', '可燃气体检测仪', '测温仪'],
  破拆: ['液压破拆工具组', '无齿锯', '机动链锯'],
  照明排烟: ['移动照明灯组', '正压排烟机'],
  泵类: ['手抬机动泵', '浮艇泵'],
};

function buildResources(): ResourceItem[] {
  const items: ResourceItem[] = [];
  let n = 0;
  personnelSubtypes.forEach(([sub]) => {
    for (let i = 0; i < 10; i += 1) {
      n += 1;
      items.push({
        id: `p-${n}`, name: `${sub} ${contacts[(n + 2) % contacts.length]}${n}`, category: '人员',
        subtype: sub, stationId: STATIONS[n % STATIONS.length].id,
        status: n % 11 === 0 ? '出警' : '在位',
      });
    }
  });
  vehicleSubtypes.forEach(([sub]) => {
    for (let i = 0; i < 4; i += 1) {
      n += 1;
      items.push({
        id: `v-${n}`, name: `${sub} A-${String(n).padStart(3, '0')}`, category: '车辆',
        subtype: sub, stationId: STATIONS[n % STATIONS.length].id,
        status: n % 7 === 0 ? '维保' : n % 5 === 0 ? '出警' : '在位',
      });
    }
  });
  equipSubtypes.forEach(([sub, ,]) => {
    (equipNames[sub] ?? [sub]).forEach((base) => {
      n += 1;
      items.push({
        id: `e-${n}`, name: `${base} ZJ-${String(n).padStart(3, '0')}`, category: '装备',
        subtype: sub, stationId: STATIONS[n % STATIONS.length].id,
        status: n % 9 === 0 ? '告警' : n % 13 === 0 ? '离线' : '正常',
      });
    });
  });
  return items;
}

export const RESOURCES: ResourceItem[] = buildResources();

export interface ResourceTree {
  category: string;
  children: Array<{ name: string; count: number }>;
}

export const RESOURCE_TREE: ResourceTree[] = [
  { category: '队站', children: [
    { name: '救援大队', count: 2 }, { name: '救援站', count: 12 },
    { name: '政府专职站', count: 6 }, { name: '企业专职站', count: 4 }, { name: '微型消防站', count: 4 },
  ] },
  { category: '人员', children: personnelSubtypes.map(([name, count]) => ({ name, count })) },
  { category: '车辆', children: vehicleSubtypes.map(([name, count]) => ({ name, count })) },
  { category: '装备', children: equipSubtypes.map(([name, count]) => ({ name, count })) },
];

export const FORCE_STATS = {
  stations: { value: 28, delta: '+2' },
  personnel: { value: 1246, delta: '+12' },
  vehicles: { value: 86, delta: '+1' },
  equipment: { value: 3420, delta: '+36' },
};

function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
}

export interface FetchOptions { state?: FetchState }

export async function fetchStations(opts: FetchOptions = {}): Promise<Station[]> {
  await delay();
  if (opts.state === 'error') throw new Error('演示：模拟请求失败');
  if (opts.state === 'empty') return [];
  return STATIONS;
}

export async function fetchResources(opts: FetchOptions = {}): Promise<ResourceItem[]> {
  await delay();
  if (opts.state === 'error') throw new Error('演示：模拟请求失败');
  if (opts.state === 'empty') return [];
  return RESOURCES;
}

export async function fetchForceStats(opts: FetchOptions = {}): Promise<typeof FORCE_STATS> {
  await delay();
  if (opts.state === 'error') throw new Error('演示：模拟请求失败');
  return FORCE_STATS;
}
