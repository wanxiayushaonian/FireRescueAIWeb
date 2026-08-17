import { dispatch } from './registry';
import type { SceneCommand, SceneSdkLike } from './types';

/**
 * 执行回执上报(ack,尽力而为):命令执行后回 POST BFF → mcp-server 记录状态,
 * agent 可经 get_scene_command_status 查询。单向 fire-and-forget 通道的已知短板
 * (蓝图 #273 建议项)由此补齐;网络/离线失败静默,不影响主链路。
 */
function reportAck(cmd: SceneCommand, status: 'ok' | 'error', message?: string): void {
  if (typeof window === 'undefined') return;
  fetch('/api/scene-events/ack', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd_id: cmd.id, tool: cmd.tool, status, message }),
    keepalive: true,
  }).catch(() => {
    /* ack 失败静默:主链路不受影响 */
  });
}

/**
 * 订阅 MCP 命令流(/scene-events SSE)并派发到注册的 handler,执行后回传 ack。
 *
 * sdk 经 getSdk 惰性获取(每条命令时读一次):GIS 类工具(gis_fly_to/show_route)
 * 不依赖 sdk,3D 场景未就绪(如态势总览模块无场景包)时仍可执行;3D 工具在
 * sdk 缺位时由 registry 的 try/catch 兜底报错,不影响其他命令。
 */
export function connectSceneEvents(url: string, getSdk: () => SceneSdkLike): () => void {
  const es = new EventSource(url);

  es.onmessage = (ev) => {
    try {
      const cmd = JSON.parse(ev.data) as SceneCommand;
      let sdk: SceneSdkLike | null = null;
      try {
        sdk = getSdk();
      } catch {
        console.warn(`[scene-bus] 3D 场景未就绪,仅 GIS 类工具可执行: ${cmd.tool}`);
      }
      void dispatch(cmd, (sdk ?? null) as SceneSdkLike).then((r) => {
        if (r === 'ok') reportAck(cmd, 'ok');
        else if (r === 'error') reportAck(cmd, 'error', `handler error: ${cmd.tool}`);
        // no-handler/no-sdk 不报 ack(未知工具/未执行,不算执行失败)
      });
    } catch (err) {
      console.error('[scene-bus] bad scene-event payload', err);
    }
  };
  es.onerror = (e) => {
    // EventSource 会自动重连;这里只记录
    console.warn('[scene-bus] scene-events error, reconnecting...', e);
  };

  return () => es.close();
}
