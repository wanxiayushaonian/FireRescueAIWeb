// 智能体-场景联动类型契约
// 历史上的关键词匹配演示脚本（AGENT_SCRIPTS/matchScript/AGENT_FALLBACK）已删除——
// 聊天链路已全面切换为真实 agent-chat SSE（AgentChatThread → lib/agent-chat-client），
// 本文件只保留仍被消费的类型定义。
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
