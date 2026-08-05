// 智能体演示对话脚本（演示数据）
// 每个脚本：用户话术 + 关键词匹配 + 智能体回复（打字机）+ 场景动作 + 业务面板调起
import type { SceneActionName } from './sceneLog';

/** 可由智能体调起的业务面板 ID（主代理在 App.tsx 接线） */
export type AgentPanelId =
  | 'force-resource'   // 执勤力量资源库面板（态势总览）
  | 'building-profile' // 单建筑档案面板（对象总览）
  | 'drill-scenario'   // 演练情景/预案面板（演练对抗）
  | 'training'         // 熟悉考核模块
  | 'command'          // 实战指挥模块
  | 'confront-mode'    // 演练对抗·对抗模式（自动开始一局）
  | 'close-panels';    // 远程收起当前模块全部业务面板（主代理在 App.tsx 接线关闭逻辑）

/** 业务模块标识（对应 AgentChat 的 module prop） */
export type ModuleKey = 'overview' | 'objects' | 'drill' | 'training' | 'command';

export interface AgentSceneAction {
  action: SceneActionName;
  target: string;
  params?: Record<string, unknown>;
  /** 动作卡中展示的等宽描述，如 `flyTo → 城东救援站` */
  label: string;
}

export interface AgentReply {
  /** 智能体回复文本（打字机输出），末尾统一带「（演示数据）」 */
  text: string;
  /** 该条回复触发的场景动作（写入场景动作日志，source=智能体） */
  actions?: AgentSceneAction[];
  /** 该条回复需要调起的业务面板 */
  openPanel?: AgentPanelId;
}

export interface AgentScript {
  id: string;
  /** 快捷 chip 文案 */
  chip: string;
  /** 用户话术（点击 chip 或输入匹配关键词时作为用户消息） */
  userText: string;
  /** 自由输入匹配关键词 */
  keywords: string[];
  /** 智能体逐条回复（按顺序播放） */
  replies: AgentReply[];
  /** 限定展示的模块（缺省则全模块显示） */
  modules?: ModuleKey[];
}

export const AGENT_WELCOME =
  '您好，我是预案智能辅助智能体。我可以帮您查询执勤力量、调阅建筑档案、生成灭火预案并联动三维场景。点击下方演示脚本开始体验。（演示数据）';

export const AGENT_FALLBACK =
  '当前为前端原型演示模式，仅支持上方演示脚本交互。您可以点击脚本卡片体验完整 Agent 联动流程。（演示数据）';

export const AGENT_SCRIPTS: AgentScript[] = [
  {
    id: 'query-force',
    chip: '查询执勤力量',
    userText: '帮我查一下城东救援站的执勤力量情况。',
    keywords: ['执勤力量', '城东', '救援站', '人员', '车辆'],
    replies: [
      {
        text: '已为您调起执勤力量资源库面板，城东救援站现有在位人员 42 人、车辆 6 辆，详情见面板。正在为您在场景中定位该队站…（演示数据）',
        openPanel: 'force-resource',
        actions: [
          {
            action: 'addMarker',
            target: '城东救援站',
            params: { lng: 118.75, lat: 32.04 },
            label: 'addMarker → 城东救援站',
          },
          {
            action: 'flyTo',
            target: '城东救援站',
            params: { lng: 118.75, lat: 32.04 },
            label: 'flyTo → 城东救援站',
          },
        ],
      },
    ],
  },
  {
    id: 'building-profile',
    chip: '查看建筑档案',
    userText: '金茂大厦的消防设施情况怎么样？',
    keywords: ['金茂', '建筑档案', '消防设施', '烟感', '大厦'],
    replies: [
      {
        text: '已打开金茂大厦单建筑档案。该楼 5F 有 2 项烟感告警、1 项手动报警装置离线，建议优先核查。已切换场景至 5F 并高亮异常设施。（演示数据）',
        openPanel: 'building-profile',
        actions: [
          {
            action: 'switchFloor',
            target: '金茂大厦',
            params: { floor: '5F' },
            label: 'switchFloor → 5F',
          },
          {
            action: 'batchHighlight',
            target: '异常设施（YG-0512、SBA-0507）',
            params: { ids: ['YG-0512', 'SBA-0507'] },
            label: 'batchHighlight → 异常设施（YG-0512、SBA-0507）',
          },
        ],
      },
    ],
  },
  {
    id: 'gen-plan',
    chip: '生成灭火预案',
    userText: '假设金茂大厦 5 层电气火灾，3 人被困，帮我生成预案。',
    keywords: ['预案', '火灾', '被困', '演练', '生成'],
    replies: [
      {
        text: '收到，正在为您设置演练情景并生成预案…（演示数据）',
        openPanel: 'drill-scenario',
        actions: [
          {
            action: 'switchFloor',
            target: '金茂大厦',
            params: { floor: '5F' },
            label: 'switchFloor → 5F',
          },
        ],
      },
      {
        text: '预案已生成，共 6 个分组。已在场景中切换至 5F、标绘进攻与疏散路线并高亮关键设备。（演示数据）',
        actions: [
          {
            action: 'showRoute',
            target: '进攻路线（金茂大厦 5F）',
            params: { kind: 'attack' },
            label: 'showRoute → 进攻路线',
          },
          {
            action: 'showRoute',
            target: '疏散路线（金茂大厦 5F）',
            params: { kind: 'evacuate' },
            label: 'showRoute → 疏散路线',
          },
          {
            action: 'batchHighlight',
            target: '关键设备（5F）',
            params: { floor: '5F' },
            label: 'batchHighlight → 关键设备',
          },
        ],
      },
    ],
  },
  {
    id: 'start-training',
    chip: '进入熟悉考核',
    userText: '带我熟悉一下辖区重点建筑，然后开始考核。',
    keywords: ['熟悉', '考核', '导览', '训练'],
    replies: [
      {
        text: '已为您打开熟悉考核模块。您可以从「按建筑层数 / 按固定消防设施 / 按重点部位」三条路径开始引导式熟悉，我在熟悉过程中随时答疑；熟悉完成后可按岗位进入在线考核。（演示数据）',
        openPanel: 'training',
        actions: [
          {
            action: 'flyTo',
            target: '辖区重点单位群',
            params: { lng: 118.79, lat: 32.055 },
            label: 'flyTo → 辖区重点单位群',
          },
        ],
      },
    ],
  },
  {
    id: 'start-command',
    chip: '模拟接警处置',
    userText: '接入一起实时警情，进入实战指挥。',
    keywords: ['警情', '接警', '实战', '指挥', '报警'],
    replies: [
      {
        text: '已切换至实战指挥模块，实时警情通道已接入。左侧为警情列表，右上为灾情变量监测，我将随灾情变化实时推送力量调度 / 战术战法 / 处置要点建议。（演示数据）',
        openPanel: 'command',
        actions: [
          {
            action: 'addMarker',
            target: '警情位置标记',
            params: { lng: 118.78, lat: 32.05 },
            label: 'addMarker → 警情位置',
          },
          {
            action: 'flyTo',
            target: '警情现场',
            params: { lng: 118.78, lat: 32.05 },
            label: 'flyTo → 警情现场',
          },
        ],
      },
    ],
  },
  {
    id: 'start-confront',
    chip: '开启对抗模式',
    userText: '演练对抗进入对抗模式，让对抗智能体给我出难题。',
    keywords: ['对抗'],
    replies: [
      {
        text: '对抗模式已开启。预案输出智能体正在随机生成初步灾情，随后对抗智能体将不按剧本主动制造突发特情，请及时对每条动态调整作出响应，结束后将给出对抗评估。（演示数据）',
        openPanel: 'confront-mode',
        actions: [
          {
            action: 'switchFloor',
            target: '对抗灾情现场',
            params: { floor: '随机' },
            label: 'switchFloor → 对抗灾情楼层',
          },
        ],
      },
    ],
  },
  {
    id: 'close-panels',
    chip: '收起所有面板',
    userText: '把所有业务面板都收起来。',
    keywords: ['收起', '关闭面板', '收起来'],
    replies: [
      {
        text: '好的，已为您收起当前模块的全部业务面板，场景视野已清空。（演示数据）',
        openPanel: 'close-panels',
        actions: [
          { action: 'resetView', target: '恢复园区俯瞰视角', label: 'resetView → 园区俯瞰' },
        ],
      },
    ],
  },
  {
    id: 'reset-scene',
    chip: '场景复位',
    userText: '把场景复位。',
    keywords: ['复位', '重置', '清除', '恢复'],
    replies: [
      {
        text: '好的，已复位场景视角并清除标记与路线。（演示数据）',
        actions: [
          { action: 'hideRoute', target: '全部路线', label: 'hideRoute → 全部路线' },
          { action: 'removeMarker', target: '全部标记', label: 'removeMarker → 全部标记' },
          { action: 'resetView', target: '园区俯瞰', label: 'resetView → 园区俯瞰' },
        ],
      },
    ],
  },
];

/** 自由输入关键词匹配：命中即返回对应脚本 */
export function matchScript(input: string): AgentScript | null {
  const text = input.trim();
  if (!text) return null;
  for (const script of AGENT_SCRIPTS) {
    if (script.keywords.some((kw) => text.includes(kw))) return script;
  }
  return null;
}
