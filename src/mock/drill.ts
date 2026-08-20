// 演练对抗模块 mock：灾情参数 / 预案输出（DrillPlan）/ 突发特情 / 预案评估
import type { DrillPlan, FetchState } from './types';

export interface DrillBuilding {
  id: string;
  name: string;
  floors: string[]; // B2…32F 等
}

export interface ScenarioParams {
  buildingId: string;
  buildingName: string;
  floor: string;
  material: string;
  trapped: number;
}

export const FIRE_MATERIALS = ['固体可燃物', '油类', '电气', '危化品', '气体'] as const;

function makeFloors(above: number, below: number): string[] {
  const arr: string[] = [];
  for (let i = below; i >= 1; i--) arr.push(`B${i}`);
  for (let i = 1; i <= above; i++) arr.push(`${i}F`);
  return arr;
}

export const BUILDINGS: DrillBuilding[] = [
  { id: 'jm', name: '金茂大厦', floors: makeFloors(32, 2) },
  { id: 'zy', name: '中央商场', floors: makeFloors(8, 1) },
  { id: 'hj', name: '滨江希尔顿酒店', floors: makeFloors(24, 1) },
];

const wait = (min = 300, max = 800) =>
  new Promise<void>((r) => window.setTimeout(r, min + Math.random() * (max - min)));

export interface EmergencyEvent {
  id: string;
  text: string;
  location: string; // 写入场景日志 highlight 的目标
}

/** 突发特情池 */
export const EMERGENCY_POOL: EmergencyEvent[] = [
  { id: 'e1', text: '{floor} 东侧防火门故障无法关闭，烟气蔓延加速', location: '{building} {floor} 东侧防火门' },
  { id: 'e2', text: '消防电梯迫降故障，改用防烟楼梯间 B', location: '{building} 消防电梯' },
  { id: 'e3', text: '现场风向突变，浓烟倒灌进攻通道', location: '{building} {floor} 进攻通道' },
  { id: 'e4', text: '2 名被困人员位置转移至 6F 窗边', location: '{building} 6F 窗边' },
  { id: 'e5', text: '{floor} 喷淋泵组一台故障，供水压力下降', location: '{building} 水泵房' },
];

export function renderEmergency(e: EmergencyEvent, s: ScenarioParams): EmergencyEvent {
  const fill = (t: string) => t.replaceAll('{building}', s.buildingName).replaceAll('{floor}', s.floor);
  return { id: e.id, text: fill(e.text), location: fill(e.location) };
}

export function pickEmergency(used: string[]): EmergencyEvent {
  const pool = EMERGENCY_POOL.filter((e) => !used.includes(e.id));
  const src = pool.length > 0 ? pool : EMERGENCY_POOL;
  return src[Math.floor(Math.random() * src.length)];
}

/** 依据情景参数生成预案内容 */
export function buildDrillPlan(s: ScenarioParams): DrillPlan {
  const heavy = s.trapped >= 10 || s.material === '危化品' || s.material === '气体';
  const level = heavy ? 'Ⅰ 级响应（重大火灾）' : 'Ⅱ 级响应（较大火灾）';
  const scale = heavy ? '调派 4 个救援站、12 车 58 人' : '调派 3 个救援站、8 车 42 人';
  const materialTactic: Record<string, string> = {
    固体可燃物: '以直流水枪冷却灭火为主，防止阴燃复燃',
    油类: '优先使用泡沫灭火剂覆盖窒息，严禁直流水直接冲击',
    电气: '先行断电，使用二氧化碳/干粉灭火，防止触电',
    危化品: '划定重危区，佩戴空气呼吸器，喷雾水稀释掩护',
    气体: '先关阀断料，冷却保护邻近罐体，防止爆炸',
  };
  return {
    responseLevel: `${level} · ${scale}`,
    forces: [
      `主战编队：城东救援站 2 车 12 人，携热成像仪、破拆工具组，负责 ${s.floor} 内攻`,
      `增援编队：城西救援站 3 车 16 人，负责供水干线与轮换`,
      `保障编队：战勤保障站 3 车 14 人，负责器材、照明与医疗救护`,
    ],
    tactics: [
      '内攻为主、内外结合',
      '先控制、后消灭，固移结合',
      materialTactic[s.material] ?? materialTactic['固体可燃物'],
      '分区划片、逐层搜索，确保被困人员优先疏散',
    ],
    keyPoints: [
      `到场后立即于 ${s.buildingName} 首层设立前沿指挥部，接管消防控制室`,
      `通过消防电梯/防烟楼梯间 B 快速抵近 ${s.floor}，先行侦察火点与被困人员（${s.trapped} 人）`,
      `利用室内消火栓出 2 支水枪堵截火势向${s.floor === '32F' ? '下' : '上'}层蔓延`,
      '启动机械排烟与正压送风，控制烟气扩散路径',
      '组织专人逐户清人，疏散至首层北侧集结点并清点人数',
    ],
    routes: {
      attack: ['首层东门', '消防电梯', `${s.floor} 着火层`],
      evacuate: [s.floor, '防烟楼梯间 B', '首层北侧集结点'],
    },
    safetyControls: [
      '设立安全员，全程监测结构安全与火场温度',
      '内攻人员每 15 分钟轮换，空呼余压低于 5MPa 强制撤出',
      '划定警戒区，管控围观人员与车辆，保持消防通道畅通',
    ],
  };
}

export interface EvaluationResult {
  verdict: '合格' | '需修订';
  score: number;
  opinions: string[];
  archived: boolean;
}

/** 预案评估 mock：首次必合格；注入特情 ≥2 条后可能「需修订」 */
export function evaluatePlan(emergencyCount: number, evaluatedCount: number): EvaluationResult {
  const risky = emergencyCount >= 2 && evaluatedCount > 0;
  const pass = risky ? Math.random() < 0.5 : true;
  const score = pass ? 82 + Math.floor(Math.random() * 12) : 58 + Math.floor(Math.random() * 10);
  return {
    verdict: pass ? '合格' : '需修订',
    score,
    opinions: pass
      ? [
          '力量编成满足首调需求，增援梯队衔接合理',
          '疏散路线与进攻路线无交叉冲突',
          '安全管控措施覆盖内攻轮换与结构监测要点',
        ]
      : [
          '未针对已注入突发特情调整进攻通道安排',
          '排烟与供水预案冗余不足，建议补充备用方案',
          '请修订后重新提交评估',
        ],
    archived: pass,
  };
}

// ============================================================
// 方案 B — znya 真实建筑接线（覆写 fetchDrillBuildings / fetchBuildingFloors）
// 通过 @/api/key-buildings 的 fetchKeyBuildings 获取列表，
// 用 fetchKeyBuildingDetail(id) 的 ground_floors/underground_floors 生成楼层。
// ============================================================
import { fetchKeyBuildings, fetchKeyBuildingDetail } from '@/api/key-buildings';

let znyaCache: DrillBuilding[] | null = null;
let znyaLoading = false;

/** 从 znya detail 数据生成楼层列表 (B2…32F) */
function floorsFromDetail(ground: number, underground: number): string[] {
  return makeFloors(ground, underground);
}

/** 确保缓存已就绪（返回 Promise，可重复调用） */
async function ensureZnyaCache(): Promise<DrillBuilding[]> {
  if (znyaCache) return znyaCache;
  if (znyaLoading) {
    // 等待已有加载完成
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!znyaLoading || znyaCache) { clearInterval(check); resolve(); }
      }, 50);
    });
    return znyaCache ?? [];
  }
  znyaLoading = true;

  try {
    const list = await fetchKeyBuildings();
    // 先拿列表快速入列，detail 后续追加楼层
    const result: DrillBuilding[] = list.map((b) => ({
      id: String(b.id),
      name: b.name,
      floors: [], // 占位，detail 回来后再更新
    }));

    // 异步拉取详情补全楼层（fire-and-forget）
    void Promise.allSettled(
      list.map(async (b) => {
        try {
          const detail = await fetchKeyBuildingDetail(String(b.id));
          return { id: String(b.id), floors: floorsFromDetail(detail.ground_floors ?? 10, detail.underground_floors ?? 1) };
        } catch {
          // fallback：默认 10 地上 1 地下
          return { id: String(b.id), floors: makeFloors(10, 1) };
        }
      }),
    ).then((results) => {
      for (const res of results) {
        if (res.status === 'fulfilled') {
          const cached = znyaCache;
          if (cached) {
            const item = cached.find((x) => x.id === res.value.id);
            if (item) item.floors = res.value.floors;
          }
        }
      }
      znyaCache = znyaCache ?? list.map((b) => ({ id: String(b.id), name: b.name, floors: [] }));
      znyaLoading = false;
    });

    znyaCache = result;
    znyaLoading = false;
    return znyaCache;
  } catch {
    znyaCache = [];
    znyaLoading = false;
    return [];
  }
}

/** 拉取可选建筑列表（方案 B：znya 真实建筑） */
export async function fetchDrillBuildings(opts?: { state?: FetchState }): Promise<DrillBuilding[]> {
  if (opts?.state === 'error') throw new Error('mock error');
  if (opts?.state === 'empty') return [];
  if (opts?.state === 'loading') return []; // caller 显示 skeleton
  return ensureZnyaCache();
}

/** 拉取指定建筑的楼层列表（znya 实时/detail 已缓存） */
export async function fetchBuildingFloors(
  buildingId: string,
  opts?: { state?: FetchState },
): Promise<string[]> {
  if (opts?.state === 'error') throw new Error('mock error');
  if (opts?.state === 'empty') return [];
  await ensureZnyaCache();
  return znyaCache?.find((b) => b.id === buildingId)?.floors ?? [];
}
