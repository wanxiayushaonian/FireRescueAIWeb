// lib/agent-scene-tools.ts
// agent tool-call → 场景动作(SceneAction)映射纯函数。
// 供 AgentSidebar 消费真实 agent-chat SSE 时使用;与 agent-runner(推演专用)职责区分——
// 本模块只做「工具调用 → 可执行场景动作 + 展示卡」翻译,不维护推演事件树。
// args 结构见 plan/drill-agent-chat-sse-format.md(platform 实测):
//   batchInvokeTwinsFunction: { function_identifier, input_params, twins_instance_ids }
import type { ToolCallEvent } from './agent-chat-client';
import type { AgentSceneAction } from '@/mock/agentScripts';
import type { SceneActionName } from '@/mock/sceneLog';

/** 本体功能标识(蛇形)→ SceneActionName 映射(对照主智能体 instructions 文档)。 */
const FUNCTION_ACTION_MAP: Record<string, SceneActionName> = {
  flyto: 'flyTo',
  fly: 'flyTo',
  highlight: 'highlight',
  batchhighlight: 'batchHighlight',
  'batch-highlight': 'batchHighlight',
  show: 'addMarker',
  hide: 'removeMarker',
};

/** 查询/编排类工具名:不执行场景动作,仅展示「查询了 X」动作卡。 */
const QUERY_TOOLS = new Set([
  'query_scene_state', 'query_building_profile', 'query_facilities', 'query_key_parts',
  'gisListTwinsInstances', 'getAllTwinsDefinition', 'getTwinsDefinitionDetailByIdentifier',
  'getTwinsFunctionByIdentifier', 'getTwinsInstanceDetail', 'siteInstance',
  'queryFunctionResult', 'mcp_result_grep', 'mcp_result_view',
]);

/** 从 args 提取展示目标:优先实例 id,其次名称字段,缺省用函数名。 */
function extractTarget(args: Record<string, unknown> | null): string {
  if (!args) return '';
  const ids = Array.isArray(args.twins_instance_ids) ? (args.twins_instance_ids as string[]) : [];
  if (ids.length) return ids[0];
  const name = args.name ?? args.target ?? args.keyword ?? args.address;
  return typeof name === 'string' ? name : '';
}

/**
 * tool-call → 可执行场景动作(返回 null 表示不执行、只展示或不展示)。
 * - batchInvokeTwinsFunction:function_identifier 有映射 → 场景动作;无映射 → null(未知本体功能不猜)
 * - task:子 agent 分发 → null(由 text 流承接子 agent 输出)
 * - 查询/编排类:null(不执行)
 */
export function agentToolToSceneAction(ev: ToolCallEvent): AgentSceneAction | null {
  const args = ev.args && typeof ev.args === 'object' ? (ev.args as Record<string, unknown>) : null;
  switch (ev.toolName) {
    case 'batchInvokeTwinsFunction': {
      const fn = typeof args?.function_identifier === 'string' ? args.function_identifier : '';
      const action = FUNCTION_ACTION_MAP[fn.toLowerCase()];
      if (!action) return null; // 未知本体功能(如 setOpacity/navigateWithinScene)不猜
      const target = extractTarget(args) || fn;
      return { action, target, params: { twins_instance_ids: args?.twins_instance_ids }, label: `${action} → ${target}` };
    }
    default:
      return null;
  }
}

/**
 * tool-call 展示卡文案(供消息流里插动作卡)。
 * - 查询/编排类:「查询了 <toolName>」
 * - task:「子 agent 处理中」
 * - batchInvokeTwinsFunction(无映射):「调用本体功能 <fn>」
 * - 未知:null(不展示)
 */
export function toolCallLabel(ev: ToolCallEvent): string | null {
  const args = ev.args && typeof ev.args === 'object' ? (ev.args as Record<string, unknown>) : null;
  switch (ev.toolName) {
    case 'task': {
      const sub = args?.subagent_type ?? args?.type ?? '';
      return `子 agent 处理中${typeof sub === 'string' && sub ? `(${sub})` : ''}`;
    }
    case 'batchInvokeTwinsFunction': {
      const fn = typeof args?.function_identifier === 'string' ? args.function_identifier : '';
      const action = FUNCTION_ACTION_MAP[fn.toLowerCase()];
      if (action) return null; // 有映射的走 agentToolToSceneAction 的动作卡
      return `调用本体功能 ${fn || ev.toolName}`;
    }
    default:
      if (QUERY_TOOLS.has(ev.toolName)) return `查询了 ${ev.toolName}`;
      return null;
  }
}
