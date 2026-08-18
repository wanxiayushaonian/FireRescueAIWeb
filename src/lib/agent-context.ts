// src/lib/agent-context.ts
// 模块对话上下文(B 方案,2026-08-17 拍板):前端状态(当前建筑/考核薄弱画像等)
// 在每次发送消息时以 [系统上下文] 前缀注入 content——不赌平台 forwarded_props 透传,
// 显示层不受影响(前缀只进发送体,不进本地 messages state)。
import type { ModuleKey } from '../mock/agentScripts';
import { getExamResult, getWeakPoints, FAMILIAR_NODES } from '../mock/training';

/** 各模块上下文的依赖(App 层组装注入;均为可选,缺失时跳过对应段)。 */
export interface AgentContextDeps {
  /** objects:当前建筑 id(znya key_buildings UUID,可直接喂 query_building_profile)。 */
  objectsBuildingId?: string;
  /** training:目标建筑名(默认 21号楼演示口径)。 */
  trainingBuildingName?: string;
  /** command:当前选中警情(实战指挥模块选中警情后注入,agent 据此定位事发点/查周边)。 */
  commandIncident?: {
    id: string;
    address: string;
    type: string;
    status: string;
    lng: number;
    lat: number;
    caller?: string;
  } | null;
}

/** 低熟悉度阈值(<60% 视为薄弱),与考核错题画像并列作为兜底信号。 */
const LOW_FAMILIARITY = 60;

/**
 * 组装模块对话上下文;无可注入内容时返回 null(发送体保持原样)。
 * 输出为一行紧凑文本,agent 提示词统一按「界面状态,不要复述」处理。
 */
export function buildAgentContext(module: ModuleKey, deps: AgentContextDeps = {}): string | null {
  const parts: string[] = [];

  if (typeof window !== 'undefined' && window.__sceneId) {
    parts.push(`3D场景=${window.__sceneId}`);
  }

  if (module === 'objects' && deps.objectsBuildingId) {
    parts.push(`当前建筑id=${deps.objectsBuildingId}`);
  }

  if (module === 'training') {
    const result = getExamResult();
    if (result) {
      parts.push(`最近考核=${result.postName}/${result.score}分/总${result.total}题/错${result.wrongQuestions.length}题`);
      const weak = getWeakPoints(result).slice(0, 5);
      if (weak.length) {
        parts.push(`薄弱点位=${weak.map((w) => `${w.pointName}[${w.floor ?? '?'}]错${w.errors}`).join('、')}`);
      }
    } else {
      parts.push('考核记录=无(用户尚未考核,可引导先做一轮)');
    }
    const low = [...FAMILIAR_NODES]
      .filter((n) => n.familiarity < LOW_FAMILIARITY)
      .sort((a, b) => a.familiarity - b.familiarity)
      .slice(0, 3);
    if (low.length) {
      parts.push(`低熟悉度=${low.map((n) => `${n.name}[${n.floor ?? '?'}]${n.familiarity}%`).join('、')}`);
    }
  }

  if (module === 'command' && deps.commandIncident) {
    const inc = deps.commandIncident;
    parts.push(`当前警情=${inc.id}/${inc.type}/${inc.status}`);
    parts.push(`地址=${inc.address}`);
    parts.push(`坐标=${inc.lng.toFixed(4)},${inc.lat.toFixed(4)}`);
    if (inc.caller) parts.push(`报警人=${inc.caller}`);
  }

  if (!parts.length) return null;
  return `[系统上下文|界面状态,非用户输入,不要复述] ${parts.join('; ')} [/系统上下文]`;
}
