import type { SceneCommand, SceneSdkLike, SceneToolHandler } from './types';

const handlers = new Map<string, SceneToolHandler>();

export function registerSceneTool(name: string, handler: SceneToolHandler): void {
  handlers.set(name, handler);
}

export async function dispatch(cmd: SceneCommand, sdk: SceneSdkLike): Promise<void> {
  const handler = handlers.get(cmd.tool);
  if (!handler) {
    console.warn(`[scene-bus] unknown tool: ${cmd.tool}`);
    return;
  }
  try {
    await handler(cmd.args ?? {}, sdk);
  } catch (err) {
    console.error(`[scene-bus] handler error for ${cmd.tool}:`, err);
  }
}

// 仅供测试复位
export function __resetForTest(): void {
  handlers.clear();
}
