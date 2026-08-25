import type { SceneCommand, SceneSdkLike, SceneToolHandler } from './types';

/** 派发结果:status 兼容旧字符串语义;result 为 handler 返回值(查询类工具经 ack 回传)。 */
export interface DispatchOutcome {
  status: 'ok' | 'error' | 'no-handler' | 'no-sdk';
  result?: unknown;
}

const handlers = new Map<string, SceneToolHandler>();

export function registerSceneTool(name: string, handler: SceneToolHandler): void {
  handlers.set(name, handler);
}

/**
 * 派发命令到 handler,返回执行结果(供 transport 回传 ack)。
 * - ok:handler 正常完成(3D/GIS 命令成功)
 * - error:handler 抛错(如 3D 未就绪时 sdk 方法失败)
 * - no-handler:未知工具
 * - no-sdk:3D 工具但 sdk 缺位(registry 不感知 sdk 来源,由 transport 在传参前判定)
 * 注意:error 仍不抛出(单命令失败不中断命令流)。
 * handler 的返回值(如 query_scene_facilities 的统计结果)随 result 返回,由 transport 经 ack 回传。
 */
export async function dispatch(cmd: SceneCommand, sdk: SceneSdkLike): Promise<DispatchOutcome> {
  const handler = handlers.get(cmd.tool);
  if (!handler) {
    console.warn(`[scene-bus] unknown tool: ${cmd.tool}`);
    return { status: 'no-handler' };
  }
  try {
    const result = await handler(cmd.args ?? {}, sdk);
    return result === undefined ? { status: 'ok' } : { status: 'ok', result };
  } catch (err) {
    console.error(`[scene-bus] handler error for ${cmd.tool}:`, err);
    return { status: 'error' };
  }
}

// 仅供测试复位
export function __resetForTest(): void {
  handlers.clear();
}
