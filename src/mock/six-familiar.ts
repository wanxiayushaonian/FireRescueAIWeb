// 六熟悉 AI 顺序引导数据(ref.md 模块三一级界面核心设计)。
// 按《消防救援队伍执勤战斗条令》"六熟悉"规范顺序组织六章,每章若干步;
// 步进时由组件驱动 3D 联动(floorSpec 楼层聚焦 / highlightTypes 设备高亮 / whole 恢复整体)
// 与右面板点位联动(relatedNodeId);dynamic 步由组件拉 znya 真实数据拼装段落。
// 引导词当前为本地数据驱动;平台智能体(熟悉引导助手)配好后可经 onRequestAgentHint 接管补充。

export interface GuideStep {
  id: string;
  title: string;
  /** 引导词段落(每段一行) */
  narration: string[];
  /** 楼层段("B1"/"3-5F"/"13F/25F")→ 3D 聚焦该层(多层段炸开) */
  floorSpec?: string;
  /** 恢复整体视角(章节收尾/总体介绍) */
  whole?: boolean;
  /** 聚焦后在本层内高亮的设备类型(演示包 type,如 IndoorFireHydrant) */
  highlightTypes?: string[];
  /** 联动右侧点位详情面板(FAMILIAR_NODES id) */
  relatedNodeId?: string;
  /** 动态数据段落:组件拉 znya 真实数据拼装(市政水源/责任区单位/就近队站) */
  dynamic?: 'water' | 'units' | 'stations';
  /** 进攻路线演示(处置程序步):出入口 → 着火层目标点绘制进攻路线(planAttackRoute) */
  attackRoute?: boolean;
}

export interface GuideChapter {
  id: string;
  /** 章序(一~六) */
  index: string;
  title: string;
  /** 副标题(面板列表摘要) */
  focus: string;
  steps: GuideStep[];
}

export const SIX_FAMILIAR_CHAPTERS: GuideChapter[] = [
  {
    id: 'ch1',
    index: '一',
    title: '熟悉周边交通道路和水源情况',
    focus: '周边道路 · 市政水源 · 单位内部水源',
    steps: [
      {
        id: 'ch1-s1',
        title: '建筑区位与周边交通',
        narration: [
          '乐盈广场21号楼为责任区演练示范建筑，位于九江市中心城区，建筑周边市政道路连通形成环形消防车道。',
          '消防车可沿环形车道抵达建筑任一立面展开作业；举高车作业需选择硬化登高操作场地，避开架空管线与软质地坪。',
          '请观察当前整体场景中的周边道路与相邻建筑环境，建立方位感。',
        ],
        whole: true,
        highlightTypes: ['SceneInOut'],
        relatedNodeId: 'area-roads',
      },
      {
        id: 'ch1-s2',
        title: '周边消防水源分布',
        narration: [
          '以下为 znya 水源库中本建筑周边的真实水源数据，熟悉时重点记忆：最近市政消火栓的位置与取水方式。',
        ],
        dynamic: 'water',
        whole: true,
        highlightTypes: ['OutdoorFireHydrant'],
        relatedNodeId: 'area-water',
      },
      {
        id: 'ch1-s3',
        title: '单位内部水源与供水设施',
        narration: [
          '建筑自备消防水源：消防水池 2 座总有效容积 800m³，分格设置可独立检修，补水时间不大于 48h。',
          '水泵接合器 4 组设于建筑南立面（消火栓系统与喷淋系统各 2 组），距室外消火栓 15-40m，并有分区标识。',
          '火场供水时优先利用固定设施：内部消火栓出水、水泵接合器补压、消防车抢占室外栓取水。',
        ],
        floorSpec: 'B1',
        relatedNodeId: 'fc-pool',
      },
    ],
  },
  {
    id: 'ch2',
    index: '二',
    title: '熟悉责任区重点单位的分类、数量及分布',
    focus: '责任区单位构成 · 本建筑属性定位',
    steps: [
      {
        id: 'ch2-s1',
        title: '责任区重点单位构成',
        narration: ['以下为本责任区重点单位的真实分类统计（znya key_units），按类型与分布掌握总体格局。'],
        dynamic: 'units',
        whole: true,
        relatedNodeId: 'area-units',
      },
      {
        id: 'ch2-s2',
        title: '本建筑的属性定位',
        narration: [
          '乐盈广场21号楼属于超高层公共建筑、人员密集场所，是本责任区灭火救援预案的重点对象。',
          '其火灾特点是：垂直蔓延快、疏散路径长、供水压力大——熟悉与处置均须围绕这三个特点展开。',
        ],
        whole: true,
        relatedNodeId: 'area-building-role',
      },
    ],
  },
  {
    id: 'ch3',
    index: '三',
    title: '熟悉主要灾害事故处置的对策及基本程序',
    focus: '灾害类型研判 · 处置基本程序',
    steps: [
      {
        id: 'ch3-s1',
        title: '主要灾害类型研判',
        narration: [
          '本建筑主要灾害类型：电气火灾（主导风险，商务办公设备密集）、餐饮燃气泄漏、地下车库汽车火灾。',
          '电气火灾处置要点：先断电、后灭火，防止触电与复燃；燃气泄漏要点：切断气源、禁绝火源、自然通风扩散。',
          '已聚焦 5F（电气火灾主战场）——结合竖井位置理解烟囱效应蔓延路径。',
        ],
        floorSpec: '5F',
        relatedNodeId: 'hazard-types',
      },
      {
        id: 'ch3-s2',
        title: '处置基本程序',
        narration: [
          '基本程序：接警调度 → 途中部署（预先明确进攻路线与阵地）→ 到场侦察（消防控制室询情+外部观察）。',
          '展开阶段坚持"以固为主、固移结合"：优先启用室内消火栓、防排烟与消防电梯等固定设施。',
          '最后是内攻搜救与清理移交——本系统演练对抗模块即按此程序推演，可在熟悉完成后进入演练验证。',
          '已绘制进攻路线：首层出入口 → 防烟楼梯间 → 5F 火点目标——体会"以固为主"的展开路径。',
        ],
        floorSpec: '1-5F',
        attackRoute: true,
        relatedNodeId: 'tactics-procedure',
      },
    ],
  },
  {
    id: 'ch4',
    index: '四',
    title: '熟悉建筑物使用及重点部位情况',
    focus: '建筑总体 · 地下设备层 · 首层 · 避难层 · 高区',
    steps: [
      {
        id: 'ch4-s1',
        title: '建筑总体概况',
        narration: [
          '乐盈广场21号楼：地上 40 层、地下 1 层的综合体建筑，集商业、办公、观光于一体。',
          '按竖向分区掌握：地下设备区 → 首层大堂 → 低区商业 → 中高区办公 → 避难层 → 屋顶。',
        ],
        whole: true,
      },
      {
        id: 'ch4-s2',
        title: '地下设备层（B1）',
        narration: [
          'B1 集中布置消防水泵房、变配电室等核心设备用房，是全楼消防系统的"心脏"。',
          '消防水泵房设消火栓泵与喷淋泵（均一用一备）；变配电室为重点防火部位，内部采用甲级防火门分隔。',
          '已聚焦 B1 层——请注意观察设备用房的布置关系。',
        ],
        floorSpec: 'B1',
        relatedNodeId: 'bf-b1-equip',
      },
      {
        id: 'ch4-s3',
        title: '首层大堂与消防控制室（1F）',
        narration: [
          '首层大堂净空高、人流密集，设多个直通室外的安全出口。',
          '消防控制室位于 1F 东侧，疏散门直通室外，实行 24h 双人持证值班——到场侦察的第一站通常就是消控室。',
        ],
        floorSpec: '1F',
        relatedNodeId: 'kp-control-room',
      },
      {
        id: 'ch4-s4',
        title: '避难层（13F）',
        narration: [
          '避难层是超高层疏散的中转与庇护空间：设独立机械加压送风、消防专线电话与应急广播。',
          '战术意义：内攻时的进攻起点层通常设在着火层下一层，避难层可作为轮换休整与器材集结点。',
          '已聚焦 13F——注意避难区的划分与设备区的分隔。',
        ],
        floorSpec: '13F',
        relatedNodeId: 'bf-13f-refuge',
      },
      {
        id: 'ch4-s5',
        title: '高区与屋顶',
        narration: [
          '高区办公由高速电梯组服务，消防电梯全楼可达；屋顶设直升机停机坪与航空障碍灯。',
          '向上疏散至屋顶是超高层火灾的辅助逃生路径，但以向下疏散为主、屋顶避难为辅。',
        ],
        floorSpec: '38-40F',
        relatedNodeId: 'bf-31-32f-obs',
      },
    ],
  },
  {
    id: 'ch5',
    index: '五',
    title: '熟悉内部消防设施情况',
    focus: '消火栓 · 喷淋 · 报警 · 防排烟 · 疏散',
    steps: [
      {
        id: 'ch5-s1',
        title: '室内外消火栓系统',
        narration: [
          '室内消火栓全楼布置，间距不大于 30m，保证同层两股充实水柱同时到达任何部位。',
          '栓口动压超限楼层采用减压稳压型消火栓；箱内配置水带、水枪与消防软管卷盘。',
          '已聚焦 6F 并高亮本层室内消火栓点位——灭火时按"就近取栓、双栓出水"组织。',
        ],
        floorSpec: '6F',
        highlightTypes: ['IndoorFireHydrant'],
        relatedNodeId: 'fc-indoor-hydrant',
      },
      {
        id: 'ch5-s2',
        title: '自动喷水灭火系统',
        narration: [
          '湿式系统全楼保护，喷头按场所温级选型（车库 68℃、厨房 93℃）。',
          '报警阀组设于地下泵房，末端试水装置位于最不利点——联动调试与火场供水核查都要用到。',
        ],
        floorSpec: '3F',
        highlightTypes: ['OpenSprinklerHead'],
        relatedNodeId: 'fc-sprinkler',
      },
      {
        id: 'ch5-s3',
        title: '火灾自动报警系统',
        narration: [
          '点型感烟探测器按房间与走道布设，走道间距不大于 15m；厨房等宜误报场所采用感温探测。',
          '手动报警按钮设于疏散通道口，任一点到手报的步行距离不大于 30m。',
          '已聚焦 6F 并高亮感烟探测器分布——观察点位密度与保护半径。',
        ],
        floorSpec: '6F',
        highlightTypes: ['PointSmokeDetector'],
        relatedNodeId: 'fc-smoke',
      },
      {
        id: 'ch5-s4',
        title: '防排烟系统',
        narration: [
          '机械排烟风机与正压送风机联动火灾报警启动：楼梯间与前室保持正压（40-50Pa），着火区排烟。',
          '内攻前必须确认防排烟已启动——烟气控制是内攻安全的前提。',
        ],
        floorSpec: '5F',
        highlightTypes: ['SmokeExhaustFan', 'PositivePressureFan'],
        relatedNodeId: 'fc-stair-ab',
      },
      {
        id: 'ch5-s5',
        title: '疏散通道与消防电梯',
        narration: [
          '防烟楼梯间贯通全楼，防火门须保持常闭；消防电梯停靠全部楼层，载重 1000kg。',
          '火灾时消防电梯迫降首层待命，只运送进攻力量至着火层下两层。',
          '已聚焦 10F 并高亮楼梯/门/电梯——核对疏散与进攻双通道。',
        ],
        floorSpec: '10F',
        highlightTypes: ['Stairs', 'Door', 'Elevator'],
        relatedNodeId: 'fc-fire-elevator',
      },
    ],
  },
  {
    id: 'ch6',
    index: '六',
    title: '熟悉消防组织及灭火抢险任务分工',
    focus: '微型站 · 就近队站 · 任务分工',
    steps: [
      {
        id: 'ch6-s1',
        title: '消防组织架构',
        narration: ['以下为本建筑就近的真实执勤队站（znya fire_stations），与单位微型消防站构成第一响应梯队。'],
        dynamic: 'stations',
        whole: true,
        relatedNodeId: 'org-structure',
      },
      {
        id: 'ch6-s2',
        title: '任务分工与应急疏散预案',
        narration: [
          '单位微型站分工：报警与确认（消控室）、初期扑救（就近灭火器/消火栓）、疏散引导（各层安全出口）。',
          '辖区队站到场后接管指挥：侦察小组、灭火小组、搜救小组、供水小组按预案展开。',
          '六熟悉全部完成——建议进入"岗位考核"检验熟悉成效。',
        ],
        whole: true,
        relatedNodeId: 'fc-control-room',
      },
    ],
  },
];

/** 全部步数(进度统计用) */
export const SIX_FAMILIAR_TOTAL_STEPS = SIX_FAMILIAR_CHAPTERS.reduce(
  (n, c) => n + c.steps.length,
  0,
);

/** 引导进度(按建筑持久化):已完成章 id + 当前位置 */
export interface GuideProgress {
  doneChapters: string[];
  chapterIdx: number;
  stepIdx: number;
}

export const GUIDE_PROGRESS_KEY = 'firerescue:six-familiar:building-21';

export function loadGuideProgress(): GuideProgress {
  const empty: GuideProgress = { doneChapters: [], chapterIdx: 0, stepIdx: 0 };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(GUIDE_PROGRESS_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<GuideProgress>;
    return {
      doneChapters: Array.isArray(parsed.doneChapters)
        ? parsed.doneChapters.filter((x): x is string => typeof x === 'string')
        : [],
      chapterIdx: typeof parsed.chapterIdx === 'number' ? parsed.chapterIdx : 0,
      stepIdx: typeof parsed.stepIdx === 'number' ? parsed.stepIdx : 0,
    };
  } catch {
    return empty;
  }
}

export function saveGuideProgress(p: GuideProgress): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GUIDE_PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* 存储不可用时忽略 */
  }
}
