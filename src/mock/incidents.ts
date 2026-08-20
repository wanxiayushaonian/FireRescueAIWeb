// 实战指挥模块业务数据（command.md §7 Mock 数据契约）
// 所有数据为前端内置 Mock，显式标注「演示数据」。
import type { FetchState } from './types';

export type IncidentStatus = '接警' | '出动' | '到场' | '控制' | '熄灭';

export interface Incident {
  id: string;               // 'JZ-20250612-007'
  address: string;
  type: '建筑火灾' | '危化品' | '抢险救援';
  caller: string;           // 报警人（脱敏）
  status: IncidentStatus;
  receivedAt: string;
  statusHistory: Array<{ status: IncidentStatus; ts: string }>;
  lng: number; lat: number;
}

export interface DisasterVars {
  incidentId: string;
  temperature: number;      // ℃
  smoke: number;            // 烟气浓度 0-100 %
  trapped: number;          // 被困人数
  fireLevel: 1 | 2 | 3 | 4 | 5; // 火势等级 Ⅰ-Ⅴ
  sampledAt: string;
}

export type RecommendType = 'force' | 'tactic' | 'keypoint'; // 力量调度/战术战法/处置要点

export interface Recommendation {
  id: string;
  incidentId: string;
  type: RecommendType;
  content: string;
  basis: string;            // 推送依据（越阈条件/状态流转）
  ts: string;
  adopted?: boolean;
  ignored?: boolean;
}

export interface PostActionReview {
  incidentId: string;
  totalScore: number;       // 0-100
  conclusion: string;
  dimensions: Array<{ name: string; score: number; comment: string }>;
  improvements: Array<{
    id: string; content: string;
    target: string;         // 回流对象，如 '金茂大厦预案 · 力量编成节'
    flushed: boolean;       // 是否已回流
  }>;
}

export const STATUS_ORDER: IncidentStatus[] = ['接警', '出动', '到场', '控制', '熄灭'];

export function nowTime(offsetMs = 0): string {
  const d = new Date(Date.now() + offsetMs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * 预置 3 起警情：分别处于出动/到场/控制阶段，展示全状态谱系（演示数据）。
 * 点位为九江真实重点建筑快照（znya key_buildings 生产库,GCJ02 与 GIS 底图同源）——
 * 2026-08-20 用户裁定:地图点位必须在九江范围内且为库内重点建筑,弃南京原型坐标。
 */
export const INITIAL_INCIDENTS: Incident[] = [
  {
    id: 'JZ-20250612-007',
    address: '九江市濂溪区德化路666号万达广场',
    type: '建筑火灾',
    caller: '张 ** 138****2211',
    status: '到场',
    receivedAt: nowTime(-3 * 60_000),
    statusHistory: [
      { status: '接警', ts: nowTime(-3 * 60_000) },
      { status: '出动', ts: nowTime(-150_000) },
      { status: '到场', ts: nowTime(-60_000) },
    ],
    lng: 116.00556, lat: 29.67511,
  },
  {
    id: 'JZ-20250612-006',
    address: '九江市八里湖东路5号乐盈广场21号楼',
    type: '建筑火灾',
    caller: '李 ** 139****8830',
    status: '控制',
    receivedAt: nowTime(-12 * 60_000),
    statusHistory: [
      { status: '接警', ts: nowTime(-12 * 60_000) },
      { status: '出动', ts: nowTime(-11 * 60_000) },
      { status: '到场', ts: nowTime(-7 * 60_000) },
      { status: '控制', ts: nowTime(-2 * 60_000) },
    ],
    lng: 115.94751, lat: 29.66124,
  },
  {
    id: 'JZ-20250612-005',
    address: '九江市浔阳区长虹大道60号九江火车站',
    type: '抢险救援',
    caller: '王 ** 137****5562',
    status: '出动',
    receivedAt: nowTime(-1 * 60_000),
    statusHistory: [
      { status: '接警', ts: nowTime(-60_000) },
      { status: '出动', ts: nowTime(-30_000) },
    ],
    lng: 116.00704, lat: 29.70366,
  },
];

/** 新警情池:同为库内九江重点建筑快照(与初始 3 起不重复) */
const NEW_INCIDENT_POOL: Array<Pick<Incident, 'address' | 'type' | 'caller' | 'lng' | 'lat'>> = [
  { address: '九江市浔阳区浔阳路88号九江苏宁广场', type: '建筑火灾', caller: '陈 ** 136****9014', lng: 115.9895, lat: 29.7068 },
  { address: '九江市八里湖新区文博大道168号九江博物馆', type: '建筑火灾', caller: '刘 ** 135****3378', lng: 115.95331, lat: 29.69054 },
  { address: '九江市浔阳区塔岭南路48号九江市第一人民医院', type: '抢险救援', caller: '赵 ** 150****6621', lng: 115.9865, lat: 29.7085 },
  { address: '九江市濂溪区前进东路551号九江职业技术学院', type: '抢险救援', caller: '周 ** 189****0455', lng: 116.0358, lat: 29.6525 },
  { address: '九江市八里湖新区体育路88号九江市体育中心', type: '抢险救援', caller: '吴 ** 187****3326', lng: 115.9658, lat: 29.6725 },
  { address: '九江市浔阳区滨江东路999号九江银行总部大楼', type: '建筑火灾', caller: '郑 ** 159****7708', lng: 116.0058, lat: 29.7185 },
];

let incidentSeq = 8;
let recSeq = 1;

/** 生成一起新警情（模拟 110 联动接入，初始状态「接警」） */
export function makeNewIncident(): Incident {
  const seed = NEW_INCIDENT_POOL[(incidentSeq - 8) % NEW_INCIDENT_POOL.length];
  const id = `JZ-20250612-${String(incidentSeq).padStart(3, '0')}`;
  incidentSeq += 1;
  return {
    id,
    ...seed,
    status: '接警',
    receivedAt: nowTime(),
    statusHistory: [{ status: '接警', ts: nowTime() }],
  };
}

export function nextRecommendationId(): string {
  recSeq += 1;
  return `REC-${String(recSeq).padStart(4, '0')}`;
}

/** 状态流转触发的推荐模板（command.md §4.2） */
export function statusRecommendation(status: IncidentStatus, incident: Incident): { type: RecommendType; content: string; basis: string } | null {
  const short = incident.address.slice(0, 10);
  switch (status) {
    case '接警':
      return {
        type: 'force',
        content: `首调建议：调派辖区主力站 2 车 12 人作为首批力量赶赴${short}，携带高层供水与排烟装备，预计 6 分钟到场`,
        basis: '警情接入 · 首调规则',
      };
    case '出动':
      return {
        type: 'keypoint',
        content: '检测到 3F 餐饮区燃气表间，切断燃气前禁止射水直冲该区域；到场后第一时间核实燃气总阀位置',
        basis: '建筑档案 · 关键部位比对命中',
      };
    case '到场':
      return {
        type: 'tactic',
        content: '烟气浓度偏高且持续上升，建议内攻组改为梯次掩护进攻，排烟机前置 5F 东窗，高倍数泡沫封堵竖井',
        basis: '到场侦察回传 · 烟气上升趋势',
      };
    case '控制':
      return {
        type: 'keypoint',
        content: '明火基本控制：组织逐层搜救复验，热成像仪监测阴燃点，保留一支水枪防止复燃',
        basis: '状态流转 · 控制阶段规程',
      };
    default:
      return null; // 熄灭 → 由推荐流面板推送战后评估入口卡
  }
}

/** 灾情变量越阈触发的推荐模板（command.md §4.2，同类 30s 节流） */
export function thresholdRecommendation(kind: 'temperature' | 'smoke' | 'trapped', vars: DisasterVars): { type: RecommendType; content: string; basis: string } | null {
  if (kind === 'temperature') {
    return {
      type: 'tactic',
      content: `火场温度 ${vars.temperature}℃ 已超 500℃ 阈值，建议内攻组轮换周期缩短至 15 分钟，水枪梯次掩护降温`,
      basis: '温度 >500℃ 持续越阈',
    };
  }
  if (kind === 'smoke') {
    return {
      type: 'keypoint',
      content: `烟气浓度 ${vars.smoke}% 越阈，优先开启机械排烟与正压送风，疏散方向避开烟气蔓延路径`,
      basis: '烟气浓度 >60% 持续 30s',
    };
  }
  return {
    type: 'force',
    content: `现场确认仍有 ${vars.trapped} 名被困人员，建议增派搜救组与登高平台车协同救人`,
    basis: '被困人员未清零 · 救人第一',
  };
}

const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** 获取警情列表（Promise + 模拟延迟，支持 state 演示参数） */
export async function fetchIncidents(opts?: { state?: FetchState }): Promise<Incident[]> {
  const s = opts?.state ?? 'ok';
  if (s === 'loading') return new Promise(() => undefined);
  await delay(300 + Math.random() * 500);
  if (s === 'error') throw new Error('警情通道连接失败（模拟）');
  if (s === 'empty') return [];
  return INITIAL_INCIDENTS;
}

/** 获取战后决策评估（command.md §5 内容，Promise + 模拟延迟） */
export async function fetchPostActionReview(incidentId: string, opts?: { state?: FetchState }): Promise<PostActionReview> {
  const s = opts?.state ?? 'ok';
  if (s === 'loading') return new Promise(() => undefined);
  await delay(300 + Math.random() * 500);
  if (s === 'error') throw new Error('评估生成失败（模拟）');
  return {
    incidentId,
    totalScore: 88,
    conclusion: '处置高效，决策链完整',
    dimensions: [
      { name: '响应时效', score: 92, comment: '首调力量 4 分钟出动，优于标准 1 分钟' },
      { name: '力量调度', score: 85, comment: '增援梯队衔接顺畅，第三梯队未启用' },
      { name: '战术运用', score: 90, comment: '排烟与内攻协同及时' },
      { name: '安全管控', score: 84, comment: '轮换周期达标，建议增设高位观察哨' },
    ],
    improvements: [
      {
        id: 'IMP-01',
        content: '增援梯队响应预案增加「第三梯队预判启用」触发条件，避免大跨度空窗',
        target: '金茂大厦预案 · 力量编成节',
        flushed: false,
      },
      {
        id: 'IMP-02',
        content: '高层建筑火灾排烟条目补充「竖井封堵 + 正压送风协同」战法与器材清单',
        target: '战术战法库 · 高层建筑排烟条目',
        flushed: false,
      },
      {
        id: 'IMP-03',
        content: '安全管控环节增设高位观察哨与轮换倒计时提醒，纳入处置要点清单',
        target: '处置要点库 · 安全管控节',
        flushed: false,
      },
    ],
  };
}
