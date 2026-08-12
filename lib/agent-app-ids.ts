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

export const AGENT_APP_IDS: Record<ModuleKey, string> = {
  overview: OVERVIEW_APP_ID,
  objects: COMMANDER_APP_ID,
  drill: COMMANDER_APP_ID,
  training: COMMANDER_APP_ID,
  command: COMMANDER_APP_ID,
};
