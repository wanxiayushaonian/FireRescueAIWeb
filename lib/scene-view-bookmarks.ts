// 视角书签持久化:与场景 id 绑定(localStorage),供 SceneViewBar 保存/一键切换机位。
import type { CameraViewpoint } from './soonspace-runtime';

export interface ViewBookmark {
  name: string;
  viewpoint: CameraViewpoint;
}

const KEY_PREFIX = 'firerescue:scene-views:';

export function sceneViewsKey(sceneId: string): string {
  return KEY_PREFIX + sceneId;
}

/** 读取某场景的书签;无存档/损坏/非浏览器环境返回 []。 */
export function loadSceneViewBookmarks(sceneId: string): ViewBookmark[] {
  if (!sceneId || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(sceneViewsKey(sceneId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is ViewBookmark =>
        !!x && typeof x === 'object' && typeof (x as ViewBookmark).name === 'string' &&
          !!(x as ViewBookmark).viewpoint && typeof (x as ViewBookmark).viewpoint === 'object',
    );
  } catch {
    return [];
  }
}

export function saveSceneViewBookmarks(sceneId: string, marks: ViewBookmark[]): void {
  if (!sceneId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(sceneViewsKey(sceneId), JSON.stringify(marks));
  } catch {
    /* quota / privacy mode */
  }
}
