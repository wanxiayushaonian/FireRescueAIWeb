import { dispatch } from './registry';
import type { SceneCommand, SceneSdkLike } from './types';

/**
 * 订阅 MCP 命令流(/scene-events SSE)并派发到注册的 handler。
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
      void dispatch(cmd, (sdk ?? null) as SceneSdkLike);
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
