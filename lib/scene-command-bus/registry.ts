import type { SceneCommand, SceneSdkLike, SceneToolHandler } from './types';

export type DispatchResult = 'ok' | 'error' | 'no-handler' | 'no-sdk';

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
 */
export async function dispatch(cmd: SceneCommand, sdk: SceneSdkLike): Promise<DispatchResult> {
  const handler = handlers.get(cmd.tool);
  if (!handler) {
    console.warn(`[scene-bus] unknown tool: ${cmd.tool}`);
    return 'no-handler';
  }
  try {
    await handler(cmd.args ?? {}, sdk);
    return 'ok';
  } catch (err) {
    console.error(`[scene-bus] handler error for ${cmd.tool}:`, err);
    return 'error';
  }
}

// 仅供测试复位
export function __resetForTest(): void {
  handlers.clear();
}
