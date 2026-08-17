// lib/agent-app-ids.ts
// agent 应用 app_id 映射:各业务模块对应的 uagent app(agent-chat SSE)。
// 通过网关应用列表接口实测可得(2026-08-13):
// - 「态势总揽多agent」2087571055445204993(published,掌控态势总揽页)→ overview 业务助手
// - 「总智能体(试一下)」2087535122373074946(published)→ 其余模块兜底
// 拿到新模块专属 app_id 后:优先以 NEXT_PUBLIC_<MODULE>_APP_ID 环境变量注入,无则回退兜底。
import type { ModuleKey } from '@/mock/agentScripts';

/** 态势总览专属主智能体 app_id(网关实测可用)。 */
export const OVERVIEW_APP_ID = '2087571055445204993';

/** 通用主智能体 app_id(其余模块兜底)。 */
export const COMMANDER_APP_ID = '2087535122373074946';

/** 对象总览业务助手(灭火作战参谋;平台建应用后以 NEXT_PUBLIC_OBJECTS_APP_ID 注入,未配回退通用)。 */
export const OBJECTS_APP_ID = (process.env.NEXT_PUBLIC_OBJECTS_APP_ID ?? '').trim() || COMMANDER_APP_ID;

/** 熟悉考核业务助手(教练闭环;平台建应用后以 NEXT_PUBLIC_TRAINING_APP_ID 注入,未配回退通用)。 */
export const TRAINING_APP_ID = (process.env.NEXT_PUBLIC_TRAINING_APP_ID ?? '').trim() || COMMANDER_APP_ID;

/**
 * 全局助手 app_id(五模块共享同一 app:工作流串联 + 通识)。
 * 以构建环境变量 NEXT_PUBLIC_GLOBAL_AGENT_APP_ID 注入;未配置时双 tab 降级为仅业务助手。
 */
export const GLOBAL_ASSISTANT_APP_ID = (process.env.NEXT_PUBLIC_GLOBAL_AGENT_APP_ID ?? '').trim();

/**
 * 演练指挥 agent app_id(演练推演的程序化决策 agent,经 AgentRunner 触发)。
 * 平台建「演练指挥官」应用后以 NEXT_PUBLIC_DRILL_COMMANDER_APP_ID 注入;
 * 未配回退通用 app(无指挥角色配置,3D 联动与决策质量受限——2026-08-17 实测)。
 */
export const DRILL_COMMANDER_APP_ID = (process.env.NEXT_PUBLIC_DRILL_COMMANDER_APP_ID ?? '').trim() || COMMANDER_APP_ID;

/**
 * 对抗 agent app_id(演练推演特情注入)。在 uagent 平台创建对抗 agent 应用后,
 * 以构建环境变量 NEXT_PUBLIC_ADVERSARY_APP_ID 注入即可启用——剧本侧按此值
 * 自动把 adversaryEveryNTicks 从 0 解禁,无需改代码。
 */
export const ADVERSARY_APP_ID = (process.env.NEXT_PUBLIC_ADVERSARY_APP_ID ?? '').trim();

/**
 * 评估智能体 app_id（演练预案评估 / 实战战后评估）。在 uagent 平台创建评估 agent 应用后,
 * 以构建环境变量 NEXT_PUBLIC_EVALUATE_APP_ID 注入即可启用;未配置时评估自动降级 mock。
 */
export const EVALUATE_APP_ID = (process.env.NEXT_PUBLIC_EVALUATE_APP_ID ?? '').trim();

/** 每模块 agent 应用:business=本模块业务助手,global=全局助手(五模块共享,可能未配)。 */
export interface ModuleAgentIds {
  business: string;
  global?: string;
}

function globalEntry(): { global?: string } {
  return GLOBAL_ASSISTANT_APP_ID ? { global: GLOBAL_ASSISTANT_APP_ID } : {};
}

export const AGENT_APP_IDS: Record<ModuleKey, ModuleAgentIds> = {
  overview: { business: OVERVIEW_APP_ID, ...globalEntry() },
  objects: { business: OBJECTS_APP_ID, ...globalEntry() },
  drill: { business: COMMANDER_APP_ID, ...globalEntry() },
  training: { business: TRAINING_APP_ID, ...globalEntry() },
  command: { business: COMMANDER_APP_ID, ...globalEntry() },
};
