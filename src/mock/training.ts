// 熟悉考核模块 Mock 数据
// fetch 风格同 design.md §4：Promise + 300-800ms 延迟 + state 演示参数，
// 作为后续真实数据替换点。
import type { FetchState } from './types';

// ---------- 接口（training.md §3 Mock 数据契约） ----------

export interface FamiliarNode {
  id: string;
  name: string;
  category: 'byFloor' | 'byFacility' | 'byKeyPart'; // 三条分类路径
  group?: string;            // 子树分组名，如 '地下区域' / '供水类'
  floor?: string;            // 所在楼层，如 '13F'
  position?: string;         // 位置描述，如 '东侧'
  count?: number;            // 数量（设施类）
  familiarity: number;       // 熟悉度 0-100，mock 递增
  lastExamAt?: string;       // 最近考核时间（成绩回写时标注）
  points: string[];          // 熟悉要点
  relatedFacilities: string[]; // 关联设施 chip
  examHints: string[];       // 常见考核点
  lng?: number;
  lat?: number;
}

export type ExamPost = 'commander' | 'fighter' | 'driver' | 'signaler' | 'mixed'; // 指挥员/战斗员/驾驶员/通信员;mixed=综合考核(跨岗位混编)

export interface ExamQuestion {
  id: string;
  post: ExamPost;
  type: 'single' | 'multiple' | 'judge';
  knowledge: string;         // 知识点标签，如 '建筑层数 · 避难层设置'
  stem: string;              // 题干
  options: string[];         // 判断题为 ['正确','错误']
  answer: number[];          // 正确选项下标（judge 为 [0]|[1]）
  analysis: string;          // 解析
  relatedNodeId?: string;    // 关联熟悉点位（错题回顾 chip 用）
}

export interface ExamAnswer {
  questionId: string;
  chosen: number[];
  correct: boolean;
  flagged: boolean;
}

export interface ExamSession {
  id: string;
  post: ExamPost;
  startedAt: string;
  durationSec: number;       // 限时，默认 600
  questions: ExamQuestion[]; // 10 题，按岗位从题库抽
  answers: ExamAnswer[];
  score: number;             // 0-100
  passed: boolean;           // >=60
  usedSec: number;
}

export interface FetchOptions {
  state?: FetchState;
}

// ---------- 熟悉路径节点 ----------

// 乐盈广场21号楼真实坐标(znya key_buildings 实测:115.9475076/29.661235,地上 40F+B1);
// 熟悉点位均为该建筑,坐标用于 GIS 定位兜底(3D 联动按楼层聚焦)
const CENTER = { lng: 115.947508, lat: 29.661235 };

type NodeSeed = [
  id: string, name: string, group: string,
  floor: string | undefined, position: string | undefined, count: number | undefined,
  familiarity: number,
  points: string[], related: string[], hints: string[],
];

function node(category: FamiliarNode['category'], s: NodeSeed): FamiliarNode {
  const [id, name, group, floor, position, count, familiarity, points, relatedFacilities, examHints] = s;
  return {
    id, name, category, group, floor, position, count, familiarity,
    points, relatedFacilities, examHints,
    lng: CENTER.lng, lat: CENTER.lat,
  };
}

// 按建筑层数
const BY_FLOOR: FamiliarNode[] = [
  node('byFloor', ['bf-b2-garage', 'B1 地下车库', '地下区域', 'B1', '地下一层', undefined, 68,
    ['B1 车库建筑面积约 8600㎡，划分 4 个防火分区，车位 212 个',
     '车库出入口位于建筑北侧，坡道宽 7m；新能源车充电区为重点监控部位',
     '柴油发电机房与储油间同设 B1 西南角，为重点防火部位'],
    ['室内消火栓', '喷淋系统', '排烟口', '防火卷帘'],
    ['车库防火分区最大允许建筑面积 2000㎡（设自喷可加倍）', '储油间储油量不应大于 1m³']]),
  node('byFloor', ['bf-b1-equip', 'B1 设备区', '地下区域', 'B1', '地下一层', undefined, 55,
    ['消防泵房设消火栓泵 2 台（一用一备）、喷淋泵 2 台、水炮泵 2 台',
     '变配电间 312㎡，设气体灭火系统，为预案重点部位',
     '消防控制室同设 B1，疏散门直通室外，24h 双人持证值班'],
    ['消防水泵', '变配电间', '消防控制室'],
    ['消防水泵房疏散门应直通安全出口', '变配电间应采用甲级防火门']]),
  node('byFloor', ['bf-1f-lobby', '1F 大堂', '低区', '1F', '首层', undefined, 82,
    ['1F 大堂净高 9m，主入口朝南，设 3 个安全出口直通室外',
     '大堂两侧为防烟楼梯间 A/B 首层入口，消防电梯首层迫降待命',
     '消防控制室设于 B1（疏散门直通室外）——到场侦察经大堂下至 B1'],
    ['安全出口', '手动报警按钮', '消防电梯'],
    ['常考：消控室可设于地下一层（疏散门直通室外）', '首层安全出口数量与宽度核算']]),
  node('byFloor', ['bf-2f-mall', '2F 商业', '低区', '2F', '裙楼', undefined, 47,
    ['2F 商业面积 4200㎡，中庭与 1F 连通，设防火卷帘分隔',
     '中庭回廊设机械排烟，排烟量按中庭体积 6 次/h 换气计算',
     '餐饮商铺燃气管道在本层入户，设紧急切断阀'],
    ['防火卷帘', '排烟口', '燃气切断阀'],
    ['中庭应设排烟设施', '防火卷帘两侧应设手动控制按钮']]),
  node('byFloor', ['bf-3-5f-dining', '3-4F 餐饮', '低区', '3-4F', '裙楼', undefined, 39,
    ['3-4F 为餐饮层，共 14 家商户，后厨集中布置于东侧',
     '3F 后厨区域设燃气表间，为重点部位',
     '厨房排油烟管道每季度清洗，管道井防火封堵完好'],
    ['燃气表间', '厨房灭火装置', '烟感'],
    ['厨房应设厨房设备灭火装置', '燃气表间应设可燃气体探测器']]),
  node('byFloor', ['bf-5-6f-cinema', '影院（5-6F）', '低区', '5-6F', '裙楼', undefined, 45,
    ['影院面积 3260㎡，人员密集、疏散困难，为预案重点部位',
     '铺内设室内消火栓，放映厅独立排烟，散场通道与商场分流',
     '火灾时优先引导观众向 5F 以下疏散，严防烟气涌入影厅'],
    ['室内消火栓', '排烟系统', '应急照明'],
    ['人员密集场所疏散门应向疏散方向开启', '影院放映厅防火分隔要求']]),
  node('byFloor', ['bf-6-15f-office', '7-12F 办公', '中区', '7-12F', '塔楼', undefined, 61,
    ['7-12F 标准办公层，每层面积 1680㎡，2 个防火分区',
     '每层设室内消火栓 4 个、灭火器箱 4 具，位于电梯厅两侧',
     '疏散走道净宽 1.4m，双向疏散'],
    ['室内消火栓', '灭火器箱', '疏散指示'],
    ['办公层疏散走道净宽不应小于 1.3m', '常考：消火栓间距不大于 30m']]),
  node('byFloor', ['bf-13f-refuge', '13F 避难层', '中区', '13F', '塔楼', undefined, 72,
    ['13F 避难层净面积 620㎡，可容纳约 1200 人，设独立机械加压送风',
     '避难层与设备层合用，设备管道区采用耐火极限 3.00h 隔墙分隔',
     '设消火栓、消防专线电话、应急广播与疏散指示标志'],
    ['机械加压送风口', '消防电话', '消火栓'],
    ['常考：避难层间距不应大于 50m', '避难层净面积按 5 人/㎡ 计算']]),
  node('byFloor', ['bf-17-30f-office', '14-24F 办公', '中区', '14-24F', '塔楼', undefined, 34,
    ['14-24F 为中区办公层，由高速电梯组服务，消防电梯可达',
     '本区疏散中转依托 13F 避难层，向上可达 25F 避难层',
     '中区由中间转输水箱接力供水，消火栓系统分区运行'],
    ['消防电梯', '转输水箱', '正压送风口'],
    ['高区消火栓栓口动压不应大于 0.50MPa', '避难层上下层为重点设防部位']]),
  node('byFloor', ['bf-31-32f-obs', '26-40F 高区办公', '高区', '26-40F', '塔楼高区', undefined, 58,
    ['26-40F 为高区办公层，25F 避难层为本区疏散中转',
     '高区供水由转输水箱接力，消火栓栓口动压超限楼层设减压稳压型',
     '40F 顶层设通往屋顶停机坪的疏散通道（宽度不小于 0.9m）'],
    ['消防电梯', '转输水箱', '正压送风口'],
    ['超过 100m 建筑应设屋顶直升机停机坪', '高区消火栓栓口动压不应大于 0.50MPa']]),
  node('byFloor', ['bf-roof-helipad', '屋顶直升机停机坪', '高区', '屋顶', '屋面', undefined, 76,
    ['屋顶停机坪直径 21m，承重满足直-9 级别直升机起降',
     '四周设航空障碍灯、边界灯与风向标，设消火栓与泡沫灭火设施',
     '停机坪疏散通道直通 40F，宽度不小于 0.9m'],
    ['停机坪边界灯', '消火栓', '泡沫栓'],
    ['停机坪应设消火栓且距机位边缘不小于 5m', '通往停机坪的出口不应少于 2 个']]),
];

// 按固定消防设施
const BY_FACILITY: FamiliarNode[] = [
  node('byFacility', ['fc-pool', '消防水池', '供水类', 'B1', '消防泵房旁', 2, 80,
    ['消防水池 2 座，总有效容积 800m³，分格设置可独立检修',
     '设就地水位显示与消防控制室远传水位报警',
     '补水时间不大于 48h，取水口供消防车吸水'],
    ['水位计', '取水口', '检修人孔'],
    ['常考：水池有效容积核算', '消防水池应分格设置（容积＞500m³）']]),
  node('byFacility', ['fc-adapter', '水泵接合器', '供水类', '1F', '建筑南立面', 4, 65,
    ['地上式水泵接合器 4 组，消火栓系统与喷淋系统各 2 组',
     '距室外消火栓距离 15-40m，标识清晰无遮挡',
     '每组设分区标识牌（低区/高区）'],
    ['标识牌', '室外消火栓', '止回阀'],
    ['水泵接合器应设在便于消防车使用地点', '距室外消火栓 15-40m']]),
  node('byFacility', ['fc-outdoor-hydrant', '室外消火栓', '供水类', '室外', '园区环形车道', 6, 71,
    ['室外消火栓 6 个沿环形消防车道布置，间距约 60m',
     '保护半径 150m，距建筑外墙不小于 5m',
     '冬季采取保温防冻措施，每月试水一次'],
    ['消防车道', '水泵接合器'],
    ['室外消火栓间距不应大于 120m', '常考：消火栓距路边不大于 2m']]),
  node('byFacility', ['fc-smoke', '烟感探测器', '报警类', '全楼', undefined, 286, 52,
    ['全楼烟感 286 只，办公层按房间布置，走道间距不大于 15m',
     '接入火灾自动报警系统，报警信号直达消防控制室',
     '厨房区域采用感温探测器避免误报'],
    ['手动报警按钮', '声光警报器'],
    ['走道烟感安装间距不大于 15m', '厨房宜采用感温探测器']]),
  node('byFacility', ['fc-manual-alarm', '手动报警按钮', '报警类', '各层', '疏散通道口', 64, 44,
    ['手动报警按钮 64 只，每个防火分区至少 1 只',
     '设置在疏散通道出入口，距地 1.3-1.5m',
     '附带消防电话插孔，可直连消控室'],
    ['声光警报器', '消防电话插孔'],
    ['任一点到手报步行距离不大于 30m', '手报安装高度 1.3-1.5m']]),
  node('byFacility', ['fc-control-room', '消防控制室', '报警类', 'B1', '设备区（直通室外）', 1, 88,
    ['消防控制室位于 B1，疏散门直通室外，24h 双人持证值班（电话 8890800/8890700）',
     '内设火灾报警控制器、联动控制盘、图形显示装置、应急广播',
     '可直接联动喷淋泵、排烟风机、防火卷帘与电梯迫降'],
    ['报警控制器', '联动控制盘', '应急广播'],
    ['常考：消控室值班制度（双人持证）', '消控室应能直接启泵']]),
  node('byFacility', ['fc-indoor-hydrant', '室内消火栓', '灭火类', '各层', '电梯厅/走道', 128, 69,
    ['室内消火栓 128 套，间距不大于 30m，保证同层两股水柱到达',
     '栓口动压大于 0.50MPa 的楼层设减压稳压型消火栓',
     '箱内配 25m 水带、水枪与消防软管卷盘'],
    ['消防软管卷盘', '水带水枪', '启泵按钮'],
    ['消火栓间距不大于 30m', '栓口动压大于 0.70MPa 必须减压']]),
  node('byFacility', ['fc-sprinkler', '喷淋系统', '灭火类', '全楼', undefined, 1, 63,
    ['湿式自动喷水灭火系统，全楼保护，喷头 3200 余只',
     '车库采用 68℃ 喷头，厨房区域 93℃ 喷头',
     '报警阀组设于 B1 水泵房，水力警铃就地报警'],
    ['报警阀组', '水流指示器', '末端试水装置'],
    ['末端试水装置设于最不利点', '湿式系统环境温度 4-70℃']]),
  node('byFacility', ['fc-extinguisher', '灭火器箱', '灭火类', '各层', '明显位置', 96, 57,
    ['灭火器箱 96 具，A 类场所配 4kg ABC 干粉灭火器',
     '配电室等电气场所配二氧化碳灭火器',
     '每半月检查一次压力与铅封，检查卡随箱悬挂'],
    ['干粉灭火器', '二氧化碳灭火器', '检查卡'],
    ['灭火器设置点距保护对象不大于 20m（A 类）', '配电室宜用二氧化碳灭火器']]),
  node('byFacility', ['fc-stair-ab', '防烟楼梯间 A/B', '疏散类', '全楼', '东西两侧', 2, 74,
    ['防烟楼梯间 A/B 贯通 B1-40F，前室面积不小于 6㎡',
     '楼梯间与前室均设机械加压送风，压差 40-50Pa',
     '防火门为乙级常闭式，闭门器完好'],
    ['加压送风口', '乙级防火门', '疏散指示'],
    ['前室使用面积不小于 6㎡', '常考：加压送风压差要求']]),
  node('byFacility', ['fc-fire-elevator', '消防电梯', '疏散类', '全楼', '核心筒', 2, 66,
    ['消防电梯 2 部，停靠 B1-40F 全部楼层，载重 1000kg',
     '首层设消防员专用操作按钮，井底设排水设施',
     '火灾时迫降首层待命，供电为消防电源双回路'],
    ['迫降按钮', '消防电源', '井底排水'],
    ['消防电梯应能每层停靠', '井底排水井容量不小于 2m³']]),
  node('byFacility', ['fc-refuge-2', '避难层', '疏散类', '13F/25F', '塔楼', 2, 72,
    ['13F、25F 两层避难层，间距小于 50m',
     '净面积合计 1200㎡（620+580），可容纳约 2300 人',
     '设独立防烟、消防专线电话与应急照明'],
    ['机械加压送风口', '消防电话', '应急照明'],
    ['常考：避难层间距不应大于 50m', '避难层净面积按 5 人/㎡ 计算']]),
];

// 按重点部位
const BY_KEY_PART: FamiliarNode[] = [
  node('byKeyPart', ['kp-control-room', '消防控制室', '重点部位', 'B1', '设备区（直通室外）', 1, 88,
    ['24h 双人持证值班，值班记录完整',
     '报警控制器处于自动联动状态，屏蔽点位每月复核',
     '备用电源可维持 3h 以上供电'],
    ['报警控制器', '联动控制盘', '应急广播'],
    ['常考：消控室值班制度', '故障屏蔽点应登记并限期恢复']]),
  node('byKeyPart', ['kp-power', '变配电间', '重点部位', 'B1', '北侧', 1, 49,
    ['变配电间面积 312㎡，为预案重点部位，设 2 台 1600kVA 干式变压器',
     '配置全淹没气体灭火系统与感温电缆',
     '疏散门为甲级防火门，门外设挡鼠板与绝缘垫'],
    ['气体灭火系统', '甲级防火门', '感温电缆'],
    ['变配电室不应设在人员密集场所上下方', '常考：气体灭火系统启动方式']]),
  node('byKeyPart', ['kp-gas', '燃气表间', '重点部位', '3F', '餐饮区后厨', 1, 41,
    ['燃气表间设独立通风，换气次数不小于 3 次/h',
     '设可燃气体探测器，联动紧急切断阀与事故风机',
     '表间内电气设备均为防爆型，管道设静电接地'],
    ['可燃气体探测器', '紧急切断阀', '防爆风机'],
    ['常考：可燃气体探测器报警联动逻辑', '燃气管道应设静电接地']]),
  node('byKeyPart', ['kp-diesel', '柴油发电机房 + 储油间', '重点部位', 'B1', '西南角', 1, 53,
    ['柴油发电机组 1200kW，市电中断 15s 内自动启动',
     '储油间储油量 0.8m³，采用防火隔墙与甲级防火门分隔',
     '机房设水喷雾灭火系统与事故通风'],
    ['水喷雾系统', '储油间', '甲级防火门'],
    ['储油间储油量不应大于 1m³', '发电机应 15s 内自启动']]),
  node('byKeyPart', ['kp-refuge', '避难层（13F / 25F）', '重点部位', '13F/25F', '塔楼', 2, 72,
    ['13F 净面积 620㎡ 可容纳约 1200 人；25F 净面积 580㎡ 可容纳约 1100 人',
     '避难层兼作设备层，设备区与避难区实体分隔',
     '严禁堆放可燃物，每月防火巡查不少于 2 次'],
    ['机械加压送风口', '消防电话', '消火栓'],
    ['常考：避难层间距不应大于 50m', '避难层不得布置可燃物库房']]),
  node('byKeyPart', ['kp-helipad', '屋顶停机坪', '重点部位', '屋顶', '屋面', 1, 76,
    ['停机坪照明、导航、消防泡沫设施每月测试',
     '周边 5m 范围内不得堆放杂物，锁闭管理钥匙存消控室',
     '大风（6 级以上）停止起降作业'],
    ['停机坪边界灯', '泡沫栓', '风向标'],
    ['停机坪应设航空障碍灯', '消火栓距机位边缘不小于 5m']]),
];

export const FAMILIAR_NODES: FamiliarNode[] = [...BY_FLOOR, ...BY_FACILITY, ...BY_KEY_PART];

// ---------- 辖区与处置知识卡(2026-08-19 六熟悉前三章右侧点位) ----------
// 前三章(周边交通水源/责任区/处置对策)是辖区域内容,3D 场景包内没有对应"点位",
// 但右侧详情面板需要节点才能展示。这些知识卡不进 FAMILIAR_NODES
// (避免污染按楼层/设施/重点部位的分类导览),仅经 findNode 供引导步联动。
const KNOWLEDGE_NODES: FamiliarNode[] = [
  node('byKeyPart', ['area-roads', '周边交通道路', '辖区与处置', undefined, '建筑周边', undefined, 62,
    ['八里湖东路为出警主通道(双向 6 车道),登高操作场地沿建筑东侧布置',
     '消防车道环建筑东侧与南侧,净宽 ≥4m、净空 ≥4m,转弯半径满足大型车',
     '高峰时段八里湖大道交叉口易拥堵,出警路线需备两条以上'],
    ['消防车道', '登高操作场地', '八里湖东路'],
    ['常考:登高场地尺寸与承载要求', '消防车道净宽/净空标准']]),
  node('byKeyPart', ['area-water', '周边消防水源', '辖区与处置', undefined, '建筑周边 1.3km', undefined, 58,
    ['周边水源以市政消火栓为主(动态真实数据见引导步),八里湖天然水源为 backup',
     '天然水源取水须确认码头硬化与枯水期水位,远程供水车随车备浮艇泵',
     '供水策略:首车抢占最近市政栓,大型火场远程供水车沿八里湖东路布设'],
    ['市政消火栓', '八里湖天然水源', '远程供水消防车'],
    ['常考:市政栓出水压力核查', '天然水源取水注意事项']]),
  node('byKeyPart', ['area-units', '责任区单位构成', '辖区与处置', undefined, '责任区', undefined, 55,
    ['责任区重点单位以商业综合体/高层建筑/人员密集场所为主(构成见引导步实时数据)',
     '单位类型决定首批力量编成:高层必配登高车,化工必配防化编组',
     '本建筑定位:高层商业综合体(40F+B1),责任区最高建筑之一'],
    ['重点单位台账', '首批力量编成'],
    ['常考:分类分布对编成的影响', '高层建筑处置特点']]),
  node('byKeyPart', ['area-building-role', '本建筑属性定位', '辖区与处置', undefined, '乐盈广场', undefined, 66,
    ['乐盈广场 21 号楼:40F+B1 钢混结构,高 150m,为责任区标志性高层建筑',
     '13F/25F 为避难层,B1 设消控室/消防泵房/变配电间,5-6F 为影院(人员密集)',
     '高层建筑火灾定性即按"重点保卫 + 增援预案"双轨响应'],
    ['高层建筑', '避难层', '人员密集场所'],
    ['常考:本建筑避难层位置', '人员密集场所处置要点']]),
  node('byKeyPart', ['hazard-types', '主要灾害类型研判', '辖区与处置', '5F', '电气竖井', undefined, 60,
    ['主导风险:电气火灾(办公设备密集,竖井烟囱效应加速蔓延)',
     '次要风险:3F 餐饮燃气泄漏、B1 地下车库汽车火灾',
     '电气火灾处置铁律:先断电、后灭火;未断电严禁直流水扑救带电设备'],
    ['电气火灾', '燃气泄漏', '汽车火灾'],
    ['常考:断电与灭火顺序', '复燃风险防控']]),
  node('byKeyPart', ['tactics-procedure', '处置基本程序', '辖区与处置', undefined, '全楼', undefined, 64,
    ['接警调度 → 途中部署(预先明确进攻路线与阵地)→ 到场侦察(消控室询情+外部观察)',
     '展开坚持"以固为主、固移结合":优先启用室内消火栓/防排烟/消防电梯',
     '进攻路线演示:首层出入口 → 防烟楼梯间 → 5F 火点(3D 路线已绘制);内攻搜救 → 清理移交,全程安全员监测'],
    ['进攻路线', '消防电梯', '防烟楼梯间'],
    ['常考:固移结合含义', '消防电梯使用规则(着火层下两层停靠)']]),
  node('byKeyPart', ['org-structure', '消防组织与任务分工', '辖区与处置', undefined, '责任区梯队', undefined, 61,
    ['第一响应梯队:单位微型站(自救,3min 到场)→ 就近执勤队站(首批)→ 增援队站(梯次)',
     '岗位分工:指挥员研判决策 / 战斗员内攻搜救 / 驾驶员供水占栓 / 通信员联络记录',
     '就近队站实力(人员/车辆)见引导步实时数据'],
    ['微型消防站', '执勤队站', '增援梯队'],
    ['常考:梯队响应顺序', '各岗位首战职责']]),
];

export function findNode(id: string): FamiliarNode | undefined {
  return FAMILIAR_NODES.find((n) => n.id === id) ?? KNOWLEDGE_NODES.find((n) => n.id === id);
}

export const FAMILIAR_PATHS: Array<{
  category: FamiliarNode['category'];
  name: string;
  desc: string;
}> = [
  { category: 'byFloor', name: '按建筑层数', desc: '地下区域 · 低区 · 中区 · 高区' },
  { category: 'byFacility', name: '按固定消防设施', desc: '供水 · 报警 · 灭火 · 疏散' },
  { category: 'byKeyPart', name: '按重点部位', desc: '消控室 · 燃气表间 · 避难层等' },
];

// ---------- 考核题库（每岗位 12 题，三种题型混合） ----------

const JUDGE_OPTS = ['正确', '错误'];

function q(
  post: ExamPost, seq: number, type: ExamQuestion['type'], knowledge: string,
  stem: string, options: string[], answer: number[], analysis: string, relatedNodeId?: string,
): ExamQuestion {
  return { id: `${post}-${String(seq).padStart(2, '0')}`, post, type, knowledge, stem, options, answer, analysis, relatedNodeId };
}

const BANK_COMMANDER: ExamQuestion[] = [
  q('commander', 1, 'multiple', '建筑层数 · 避难层设置', '乐盈广场21号楼避难层设置在下列哪些楼层？（多选）',
    ['12F', '13F', '24F', '25F'], [1, 3],
    '避难层间距不应大于 50m，21号楼(40F+B1)设 13F、25F 两层避难层。', 'bf-13f-refuge'),
  q('commander', 2, 'single', '力量部署 · 首战力量', '乐盈广场21号楼 5F 餐饮厨房发生火灾，首战力量应优先调派哪些车辆？',
    ['水罐车 + 举高喷射车', '抢险救援车 + 照明车', '云梯车 + 泡沫车', '供水车 + 器材车'], [0],
    '厨房火灾以内部强攻为主，水罐车保障供水、举高喷射车兼顾外部控火。', 'bf-3-5f-dining'),
  q('commander', 3, 'judge', '战术决策 · 内攻近战', '高层建筑火灾应坚持"以固为主、固移结合"的战术原则。',
    JUDGE_OPTS, [0],
    '高层建筑火灾首先利用室内固定消防设施控火，移动装备作为补充。'),
  q('commander', 4, 'single', '供水组织 · 水泵接合器', '利用水泵接合器向高区管网补水时，应首先确认什么？',
    ['接合器分区标识（低区/高区）', '消防车油量和胎压', '当天天气情况', '建筑入住率'], [0],
    '误接低区接合器无法向高区供水，必须按分区标识对接。', 'fc-adapter'),
  q('commander', 5, 'multiple', '疏散组织 · 避难层', '组织人员向 13F 避难层疏散时，指挥员应掌握的信息包括（多选）：',
    ['避难层净面积与可容纳人数', '加压送风是否启动', '避难层内商户营业额', '通往避难层的疏散通道数量'], [0, 1, 3],
    '避难层容量、防烟状态、疏散通道是指挥决策关键要素。', 'bf-13f-refuge'),
  q('commander', 6, 'single', '重点部位 · 燃气表间', '3F 燃气表间发生泄漏，现场指挥首要处置措施是？',
    ['切断气源并联动事故通风', '立即用直流水冲洗', '组织人员进入关阀', '开启全部门窗自然通风后撤离等待'], [0],
    '先联动紧急切断阀切断气源、启动事故通风，严禁盲目进入。', 'kp-gas'),
  q('commander', 7, 'judge', '力量部署 · 消防电梯', '灭火救援中可直接使用消防电梯运送进攻力量至着火层。',
    JUDGE_OPTS, [1],
    '消防电梯只能停靠在着火层下两层及以下，换乘楼梯进攻，防止被困。', 'fc-fire-elevator'),
  q('commander', 8, 'single', '战术决策 · 停机坪', '利用屋顶停机坪实施空中救援时，现场应满足的条件是？',
    ['风力不大于 6 级且周边 5m 无障碍物', '夜间一律禁止起降', '仅需清空停机坪即可', '由物业自行引导起降'], [0],
    '6 级以上大风停止起降，机位周边 5m 内不得堆放杂物。', 'kp-helipad'),
  q('commander', 9, 'multiple', '供水组织 · 消防水池', '关于本建筑消防水池，正确的说法有（多选）：',
    ['总有效容积 800m³', '分格设置可独立检修', '设远传水位报警', '仅供生活用水'], [0, 1, 2],
    '消防水池 2 座共 800m³，分格设置，水位远传至消控室。', 'fc-pool'),
  q('commander', 10, 'single', '重点部位 · 柴油发电机房', 'B1 柴油发电机房火灾，应优先选用的灭火系统是？',
    ['水喷雾灭火系统', '高压细水雾', '直接大水流灌注', '泡沫钩管'], [0],
    '发电机房设水喷雾灭火系统，先固定后移动。', 'kp-diesel'),
  q('commander', 11, 'judge', '战术决策 · 防烟楼梯间', '内攻时应保持防烟楼梯间防火门处于开启状态便于通行。',
    JUDGE_OPTS, [1],
    '防火门必须保持常闭，维持楼梯间正压防烟环境。', 'fc-stair-ab'),
  q('commander', 12, 'single', '力量部署 · 增援调度', '火势蔓延至 13F 避难层邻近楼层时，增援力量应重点加强哪个方向？',
    ['避难层上下夹层的堵截设防', '地下车库巡逻', '园区外围警戒', '低区商户疏散演练'], [0],
    '避难层是人员集中区，必须在上下层设防堵截火势蔓延。', 'kp-refuge'),
];

const BANK_FIGHTER: ExamQuestion[] = [
  q('fighter', 1, 'single', '设施操作 · 室内消火栓', '使用室内消火栓出水时，同层应保证几股充实水柱同时到达着火点？',
    ['两股', '一股', '三股', '四股'], [0],
    '室内消火栓布置应保证同层任何部位有两股充实水柱同时到达。', 'fc-indoor-hydrant'),
  q('fighter', 2, 'judge', '灭火进攻 · 高层建筑', '进入着火层内攻前，应在着火层下一层或下两层设立进攻起点层。',
    JUDGE_OPTS, [0],
    '进攻起点层设在着火层下两层，便于集结、供气与撤离。'),
  q('fighter', 3, 'multiple', '设施操作 · 避难层', '13F 避难层内可供灭火救援使用的设施包括（多选）：',
    ['室内消火栓', '消防专线电话', '应急广播', '自动售货机'], [0, 1, 2],
    '避难层设消火栓、消防电话、应急广播与疏散指示。', 'bf-13f-refuge'),
  q('fighter', 4, 'single', '灭火进攻 · 水带铺设', '沿楼梯间垂直铺设水带时，正确做法是？',
    ['在楼梯间外墙固定并留有余量', '直接从窗口悬垂不设固定', '穿越着火层防火门长期敞开', '水带打结后继续使用'], [0],
    '垂直水带应固定牢固、留有余量，防止自重拉脱接口。'),
  q('fighter', 5, 'single', '设施操作 · 消防电梯', '发现消防电梯井底积水时，应首先检查什么？',
    ['井底排水设施', '轿厢照明', '电梯年检标志', '层门装饰'], [0],
    '消防电梯井底应设排水设施，排水井容量不小于 2m³。', 'fc-fire-elevator'),
  q('fighter', 6, 'judge', '灭火进攻 · 排烟', '可利用 2F 中庭机械排烟设施排出裙楼烟气。',
    JUDGE_OPTS, [0],
    '中庭设机械排烟，火场可联动启动辅助排烟散热。', 'bf-2f-mall'),
  q('fighter', 7, 'multiple', '设施操作 · 灭火器', '关于本建筑灭火器配置，正确的有（多选）：',
    ['办公区配 4kg ABC 干粉灭火器', '配电室配二氧化碳灭火器', '灭火器箱每半月检查一次', '灭火器可随意挪动位置'], [0, 1, 2],
    'A 类场所配干粉、电气场所配二氧化碳，半月一检不得挪用。', 'fc-extinguisher'),
  q('fighter', 8, 'single', '重点部位 · 燃气表间', '进入燃气泄漏区域侦察时，个人防护正确做法是？',
    ['着防静电服、使用防爆器材', '穿普通作训服即可', '先开灯查看泄漏点', '使用手机向指挥员报告'], [0],
    '燃气区域严禁非防爆电器，须着防静电服并使用防爆工具。', 'kp-gas'),
  q('fighter', 9, 'judge', '设施操作 · 喷淋系统', '末端试水装置应设置在系统最不利点处。',
    JUDGE_OPTS, [0],
    '末端试水装置设于最不利点，用于检验系统供水能力。', 'fc-sprinkler'),
  q('fighter', 10, 'single', '灭火进攻 · 车库火灾', 'B1 车库汽车火灾，进攻通道应选择？',
    ['北侧坡道或防烟楼梯间', '客运电梯', '自动扶梯', '采光井垂直进入'], [0],
    'B1 车库火灾经北侧坡道或防烟楼梯间进入，内攻走防烟楼梯间。', 'bf-b2-garage'),
  q('fighter', 11, 'multiple', '设施操作 · 消火栓', '室内消火栓箱内标准配置包括（多选）：',
    ['25m 水带', '水枪', '消防软管卷盘', '防毒面具'], [0, 1, 2],
    '栓箱标配水带、水枪与软管卷盘，不含防毒面具。', 'fc-indoor-hydrant'),
  q('fighter', 12, 'single', '灭火进攻 · 避难层搜救', '对 26-40F 高区办公层进行人员搜救时，可利用的疏散途径不包括？',
    ['防烟楼梯间', '消防电梯（消防员控制）', '普通客运电梯', '屋顶停机坪'], [2],
    '火灾时普通客梯停止使用，疏散靠楼梯间、消防电梯与屋顶停机坪（40F 上方）。', 'bf-31-32f-obs'),
];

const BANK_DRIVER: ExamQuestion[] = [
  q('driver', 1, 'single', '车辆停靠 · 高层建筑', '举高喷射车在乐盈广场21号楼周边作业时，停靠位置应选择？',
    ['建筑南立面消防登高操作场地', '地下车库入口坡道', '绿化带软质地坪', '架空管线下方的车道'], [0],
    '举高车必须停靠在硬化登高操作场地，避开管线与软基。'),
  q('driver', 2, 'judge', '供水保障 · 水泵接合器', '水泵接合器距室外消火栓宜为 15-40m。',
    JUDGE_OPTS, [0],
    '规范要求水泵接合器附近 15-40m 内应有室外消火栓或水池取水口。', 'fc-adapter'),
  q('driver', 3, 'multiple', '供水保障 · 消防车道', '本园区环形消防车道供取水作业时，驾驶员应确认（多选）：',
    ['室外消火栓位置与间距', '车道承载与净宽', '消火栓距路边不大于 2m', '周边商户营业时间'], [0, 1, 2],
    '取水作业关注栓位、车道承载、栓距路边距离等硬性条件。', 'fc-outdoor-hydrant'),
  q('driver', 4, 'single', '供水保障 · 消防水池', '从消防水池取水口吸水时，吸水深度超过多少需改用接力供水？',
    ['约 6m（泵的吸水高度限制）', '20m', '50m', '无限制'], [0],
    '消防车泵吸深有限，超过约 6m 需采用接力或浮艇泵。', 'fc-pool'),
  q('driver', 5, 'judge', '车辆停靠 · 车库', '水罐车可经北侧坡道直接驶入 B1 车库出水灭火。',
    JUDGE_OPTS, [1],
    '坡道仅供小型车辆通行；消防车应在地面停靠，经室外消火栓取水或水泵接合器向管网供水。', 'bf-b2-garage'),
  q('driver', 6, 'single', '供水保障 · 管网压力', '向高区管网供水时，车泵出口压力主要依据什么确定？',
    ['建筑高度 + 管网损失 + 栓口压力要求', '水带颜色', '车内水量一半为限', '凭经验随意加压'], [0],
    '出口压力=静水压力（高度）+水带与管网损失+栓口工作压力。'),
  q('driver', 7, 'multiple', '车辆停靠 · 安全要求', '火场车辆停靠的安全要求包括（多选）：',
    ['车头朝撤离方向', '避开玻璃幕墙坠落区', '与着火建筑保持安全距离', '紧贴建筑便于操作'], [0, 1, 2],
    '车头朝外便于撤离，避开坠落物危险区域，保持安全距离。'),
  q('driver', 8, 'single', '供水保障 · 手抬泵', '手抬机动泵从室外消火栓取水时，连接顺序正确的是？',
    ['消火栓→吸水管→泵→水带', '泵→消火栓→水带→吸水管', '水带直接接消火栓加压', '任意顺序均可'], [0],
    '按水源→吸水管→泵→出水水带顺序连接并检查密封。'),
  q('driver', 9, 'judge', '供水保障 · 防冻', '冬季室外消火栓应采取保温防冻措施，每月试水一次。',
    JUDGE_OPTS, [0],
    '本建筑室外消火栓冬季保温，每月试水保证完好可用。', 'fc-outdoor-hydrant'),
  q('driver', 10, 'single', '车辆停靠 · 停机坪支援', '为屋顶停机坪泡沫设施供水时，车辆应停靠在？',
    ['建筑周边最近消火栓处并盘车水带', '直接开上屋顶', '地下车库内', '任意空位'], [0],
    '屋顶设施经竖管/水带供水，车辆停靠周边栓位加压输送。', 'kp-helipad'),
  q('driver', 11, 'multiple', '供水保障 · 减压', '高区消火栓栓口动压超过 0.50MPa 时应采取的措施有（多选）：',
    ['采用减压稳压型消火栓', '车泵减压供水', '不做任何处理', '关闭该层消火栓'], [0, 1],
    '超压楼层设减压稳压消火栓，移动供水同步控制压力。', 'bf-17-30f-office'),
  q('driver', 12, 'judge', '车辆停靠 · 破拆场地', '抢险救援车可停靠在登高操作场地长期占用。',
    JUDGE_OPTS, [1],
    '登高操作场地优先保障举高车作业，其他车辆不得占用。'),
];

const BANK_SIGNALER: ExamQuestion[] = [
  q('signaler', 1, 'single', '通信联络 · 消防电话', '避难层与消防控制室之间应通过什么保持通信？',
    ['消防专线电话', '个人手机', '对讲机民用频道', '广播喊话'], [0],
    '避难层设消防专线电话，直通消控室保证可靠通信。', 'fc-refuge-2'),
  q('signaler', 2, 'judge', '信息报送 · 首报', '接到火灾报警后，首报应包含时间、地点、燃烧物、被困人员等要素。',
    JUDGE_OPTS, [0],
    '首报要素：时间地点、建筑情况、燃烧物质、被困人员、力量调派。'),
  q('signaler', 3, 'multiple', '通信联络 · 消控室', '消防控制室在火场通信中的职责包括（多选）：',
    ['接收并确认报警信号', '联动启动应急广播', '记录联动设备动作反馈', '指挥外部交通'], [0, 1, 2],
    '消控室负责接警确认、广播联动与设备反馈记录。', 'fc-control-room'),
  q('signaler', 4, 'single', '信息报送 · 手动报警', '手动报警按钮触发后，信号应首先到达哪里？',
    ['消防控制室报警控制器', '119 指挥中心', '物业办公室', '本层声光警报器'], [0],
    '手报信号首先接入消控室报警控制器，经确认后联动警报。', 'fc-manual-alarm'),
  q('signaler', 5, 'judge', '通信联络 · 应急广播', '火灾时应急广播应按着火层及其上下层分区播报疏散指令。',
    JUDGE_OPTS, [0],
    '应急广播分区联动，优先着火层及相邻层，避免全楼恐慌。'),
  q('signaler', 6, 'multiple', '信息报送 · 点位信息', '向指挥中心报送本建筑关键信息时，应包括（多选）：',
    ['避难层位置与容量', '消防电梯停靠楼层', '水泵接合器位置', '商户打折信息'], [0, 1, 2],
    '报送内容聚焦消防设施与重点部位等救援相关信息。', 'fc-fire-elevator'),
  q('signaler', 7, 'single', '通信联络 · 图传', '现场单兵图传设备主要用于？',
    ['将火场视频实时回传指挥中心', '播放宣传视频', '替代消防电话', '给设备充电'], [0],
    '单兵图传实时回传火场画面，辅助后方决策。'),
  q('signaler', 8, 'judge', '信息报送 · 续报', '火势变化、力量增减、人员伤亡等情况应随时续报。',
    JUDGE_OPTS, [0],
    '续报制度要求重要情况变化第一时间上报。'),
  q('signaler', 9, 'single', '通信联络 · 燃气泄漏', '燃气表间可燃气体探测器报警后，通信员应同步联动通知的对象是？',
    ['燃气公司抢修与物业工程部', '新闻媒体', '周边学校', '外卖平台'], [0],
    '燃气泄漏需同步通知燃气抢修与物业工程力量协同处置。', 'kp-gas'),
  q('signaler', 10, 'multiple', '通信联络 · 设备保障', '火场通信保障应携带的装备包括（多选）：',
    ['对讲机及备用电池', '单兵图传', '防爆通信设备（燃气区域）', '游戏掌机'], [0, 1, 2],
    '通信保障含电台、图传、备用电源与防爆设备。'),
  q('signaler', 11, 'judge', '信息报送 · 值班制度', '消防控制室实行 24h 双人持证值班制度。',
    JUDGE_OPTS, [0],
    '消控室 24h 双人值班，值班人员须持消防设施操作员证。', 'fc-control-room'),
  q('signaler', 12, 'single', '通信联络 · 停机坪', '引导直升机降落停机坪时，通信员应通报的关键信息是？',
    ['风向风速与周边障碍物', '停机坪建成年份', '当日客流量', '楼顶广告牌内容'], [0],
    '起降引导必须通报实时风向风速与障碍物情况。', 'kp-helipad'),
];

export const EXAM_BANK: Record<ExamPost, ExamQuestion[]> = {
  commander: BANK_COMMANDER,
  fighter: BANK_FIGHTER,
  driver: BANK_DRIVER,
  signaler: BANK_SIGNALER,
  mixed: [], // 占位:fetchExamPaper 对 mixed 走四库混编,不读本键
};

export const EXAM_POSTS: Array<{
  post: ExamPost;
  name: string;
  focus: string;
  questionCount: number;
  durationMin: number;
}> = [
  { post: 'commander', name: '指挥员', focus: '力量部署 · 战术决策', questionCount: 10, durationMin: 10 },
  { post: 'fighter', name: '战斗员', focus: '灭火进攻 · 设施操作', questionCount: 10, durationMin: 10 },
  { post: 'driver', name: '驾驶员', focus: '车辆停靠 · 供水保障', questionCount: 10, durationMin: 10 },
  { post: 'signaler', name: '通信员', focus: '通信联络 · 信息报送', questionCount: 10, durationMin: 10 },
  { post: 'mixed', name: '综合考核', focus: '六熟悉全范围(跨岗位混编)', questionCount: 10, durationMin: 10 },
];

export function postNameOf(post: ExamPost): string {
  return EXAM_POSTS.find((p) => p.post === post)?.name ?? post;
}

// ---------- fetch 风格 API ----------

function delay(): Promise<void> {
  return new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
}

function checkState(opts: FetchOptions) {
  if (opts.state === 'error') throw new Error('演示：模拟请求失败');
}

export async function fetchFamiliarNodes(opts: FetchOptions = {}): Promise<FamiliarNode[]> {
  await delay();
  checkState(opts);
  if (opts.state === 'empty') return [];
  return FAMILIAR_NODES;
}

/** 按岗位从题库随机抽 10 题组卷;mixed=四个岗位题库合并混编(不带岗位的综合考核) */
export async function fetchExamPaper(post: ExamPost, opts: FetchOptions = {}): Promise<ExamQuestion[]> {
  await delay();
  checkState(opts);
  if (opts.state === 'empty') return [];
  const bank = post === 'mixed'
    ? [...EXAM_BANK.commander, ...EXAM_BANK.fighter, ...EXAM_BANK.driver, ...EXAM_BANK.signaler]
    : [...EXAM_BANK[post]];
  // 洗牌抽 10 题
  for (let i = bank.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [bank[i], bank[j]] = [bank[j], bank[i]];
  }
  return bank.slice(0, 10);
}

export interface SubmitExamInput {
  post: ExamPost;
  startedAt: string;
  durationSec: number;
  questions: ExamQuestion[];
  choices: Array<{ questionId: string; chosen: number[]; flagged: boolean }>;
  usedSec: number;
}

let sessionSeq = 0;

/** 提交考核，服务端（mock）判分 */
export async function submitExam(input: SubmitExamInput, opts: FetchOptions = {}): Promise<ExamSession> {
  await delay();
  checkState(opts);
  const per = input.questions.length > 0 ? 100 / input.questions.length : 0;
  const answers: ExamAnswer[] = input.questions.map((qu) => {
    const c = input.choices.find((x) => x.questionId === qu.id);
    const chosen = c?.chosen ?? [];
    const correct =
      chosen.length === qu.answer.length && chosen.every((i) => qu.answer.includes(i));
    return { questionId: qu.id, chosen, correct, flagged: c?.flagged ?? false };
  });
  const score = Math.round(answers.filter((a) => a.correct).length * per);
  sessionSeq += 1;
  return {
    id: `exam-${Date.now()}-${sessionSeq}`,
    post: input.post,
    startedAt: input.startedAt,
    durationSec: input.durationSec,
    questions: input.questions,
    answers,
    score,
    passed: score >= 60,
    usedSec: input.usedSec,
  };
}

// ---------- 考核成绩发布（pub-sub，成绩闭环回写熟悉度 / 战备状态角标数据源） ----------

export interface ExamWrongQuestion {
  questionId: string;
  stem: string;
  pointId?: string;
  pointName?: string;
}

export interface ExamResult {
  postId: ExamPost;
  postName: string;
  score: number;             // 0-100
  total: number;             // 总题数
  wrongQuestions: ExamWrongQuestion[];
  finishedAt: string;        // 交卷时间（展示用）
  buildingName: string;      // 考核对象建筑（战备角标按建筑取最近成绩）
}

let examResults: ExamResult[] = [];

type ExamListener = (latest: ExamResult | null) => void;
const examListeners = new Set<ExamListener>();

export function getExamResult(): ExamResult | null {
  return examResults[0] ?? null;
}

export function subscribeExamResult(fn: ExamListener): () => void {
  examListeners.add(fn);
  fn(getExamResult());
  return () => examListeners.delete(fn);
}

const clampFam = (v: number) => Math.max(0, Math.min(100, v));

/**
 * 成绩写入：涉及考点位的熟悉度回写（答对 +4 / 答错 -6，限幅 0-100），
 * 并标注「最近考核」时间；随后通知订阅者。
 * correctPointIds：答对题目涉及的点位（用于 +4 回写，由调用方从判分结果推导）。
 */
export function submitExamResult(result: ExamResult, opts?: { correctPointIds?: string[] }): ExamResult {
  examResults = [result, ...examResults];
  const delta = new Map<string, number>();
  (opts?.correctPointIds ?? []).forEach((id) => delta.set(id, (delta.get(id) ?? 0) + 4));
  result.wrongQuestions.forEach((w) => {
    if (w.pointId) delta.set(w.pointId, (delta.get(w.pointId) ?? 0) - 6);
  });
  delta.forEach((d, id) => {
    const n = findNode(id);
    if (n) {
      n.familiarity = clampFam(n.familiarity + d);
      n.lastExamAt = result.finishedAt;
    }
  });
  examListeners.forEach((fn) => fn(result));
  return result;
}

// ---------- 错题 → 薄弱点位 / 强化导览建议 ----------

export interface WeakPoint {
  pointId: string;
  pointName: string;
  /** 所属分类路径，如「按建筑层数 · 地下区域」 */
  categoryPath: string;
  category: FamiliarNode['category'];
  floor?: string;
  errors: number;            // 该点位关联错题数
}

/** 楼层排序权重：地下 < 室外 < 低层 → 高层 < 屋顶，跨层/全楼取首层或兜底 */
function floorRank(f?: string): number {
  if (!f) return 500;
  if (f.startsWith('B')) return -(parseInt(f.slice(1), 10) || 1);
  if (f === '室外') return 0;
  if (f === '屋顶') return 999;
  const m = f.match(/(\d+)\s*F/);
  if (m) return parseInt(m[1], 10);
  return 500;
}

/** 由错题推导薄弱点位列表（按错误数降序，含所属分类路径） */
export function getWeakPoints(result: ExamResult | null): WeakPoint[] {
  if (!result) return [];
  const map = new Map<string, WeakPoint>();
  result.wrongQuestions.forEach((w) => {
    if (!w.pointId) return;
    const n = findNode(w.pointId);
    if (!n) return;
    const found = map.get(n.id);
    if (found) {
      found.errors += 1;
    } else {
      const path = FAMILIAR_PATHS.find((p) => p.category === n.category);
      map.set(n.id, {
        pointId: n.id,
        pointName: n.name,
        categoryPath: `${path?.name ?? n.category}${n.group ? ` · ${n.group}` : ''}`,
        category: n.category,
        floor: n.floor,
        errors: 1,
      });
    }
  });
  return [...map.values()].sort((a, b) => b.errors - a.errors);
}

/** 强化导览建议：错题点位去重，按楼层从低到高排序（点位序列） */
export function getTourSuggestion(result: ExamResult | null): WeakPoint[] {
  return getWeakPoints(result).sort((a, b) => floorRank(a.floor) - floorRank(b.floor));
}

// ---------- 建筑战备状态角标 ----------

export interface BuildingReadiness {
  label: '优秀' | '良好' | '合格' | '待加强';
  color: string;             // cyan/green/amber/orange
  score: number;
}

/** 基于该建筑最近考核成绩的战备状态（无成绩 → null） */
export function getBuildingReadiness(buildingName: string): BuildingReadiness | null {
  const r = examResults.find((x) => x.buildingName === buildingName);
  if (!r) return null;
  const s = r.score;
  const label: BuildingReadiness['label'] = s >= 90 ? '优秀' : s >= 75 ? '良好' : s >= 60 ? '合格' : '待加强';
  const color = s >= 90 ? '#22d3ee' : s >= 75 ? '#34d399' : s >= 60 ? '#fbbf24' : '#f97316';
  return { label, color, score: s };
}
