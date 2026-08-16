// lib/agent-app-ids.ts
// agent 应用 app_id 映射:各业务模块对应的 uagent app(agent-chat SSE)。
// 通过网关应用列表接口实测可得(2026-08-13):
// - 「态势总揽多agent」2087571055445204993(published,掌控态势总揽页)→ overview
// - 「总智能体(试一下)」2087535122373074946(published)→ 其余模块兜底
// 拿到新模块专属 app_id 后只改本文件。
import type { ModuleKey } from '@/mock/agentScripts';

/** 态势总览专属主智能体 app_id(网关实测可用)。 */
export const OVERVIEW_APP_ID = '2087571055445204993';

/** 通用主智能体 app_id(其余模块兜底)。 */
export const COMMANDER_APP_ID = '2087535122373074946';

/**
 * 对抗 agent app_id(演练推演特情注入)。在 uagent 平台创建对抗 agent 应用后,
 * 以构建环境变量 NEXT_PUBLIC_ADVERSARY_APP_ID 注入即可启用——剧本侧按此值
 * 自动把 adversaryEveryNTicks 从 0 解禁,无需改代码。
 */
export const ADVERSARY_APP_ID = (process.env.NEXT_PUBLIC_ADVERSARY_APP_ID ?? '').trim();

export const AGENT_APP_IDS: Record<ModuleKey, string> = {
  overview: OVERVIEW_APP_ID,
  objects: COMMANDER_APP_ID,
  drill: COMMANDER_APP_ID,
  training: COMMANDER_APP_ID,
  command: COMMANDER_APP_ID,
};
