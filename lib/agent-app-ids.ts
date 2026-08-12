// lib/agent-app-ids.ts
// agent 应用 app_id 映射:各业务模块对应的 uagent app(agent-chat SSE)。
// 通过网关应用列表接口实测可得(2026-08-12):「总智能体(试一下)」是当前可用的主智能体;
// 「态势总揽agent」为 draft(未发布)。拿到分模块 app_id 后只改本文件。
import type { ModuleKey } from '@/mock/agentScripts';

/** 主智能体 app_id(网关实测可用)。 */
export const COMMANDER_APP_ID = '2087535122373074946';

export const AGENT_APP_IDS: Record<ModuleKey, string> = {
  overview: COMMANDER_APP_ID,
  objects: COMMANDER_APP_ID,
  drill: COMMANDER_APP_ID,
  training: COMMANDER_APP_ID,
  command: COMMANDER_APP_ID,
};
