import { dispatch } from './registry';
import type { SceneCommand, SceneSdkLike } from './types';

export function connectSceneEvents(url: string, sdk: SceneSdkLike): () => void {
  const es = new EventSource(url);

  es.onmessage = (ev) => {
    try {
      const cmd = JSON.parse(ev.data) as SceneCommand;
      void dispatch(cmd, sdk);
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
