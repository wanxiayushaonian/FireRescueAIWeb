// 天空背景偏好持久化:与场景 id 绑定(localStorage)。
// 天空是"长期开启"的场景级开关(非层级显隐),模态框(SceneDisplayModal)是唯一写入方;
// 场景(重)加载后由 App 回放(与 scene-display-prefs 同模式)。

const KEY_PREFIX = 'firerescue:scene-sky:';

export function sceneSkyKey(sceneId: string): string {
  return KEY_PREFIX + sceneId;
}

/** 读取某场景天空开关;无存档/非浏览器环境返回 false。 */
export function loadSceneSkyPref(sceneId: string): boolean {
  if (!sceneId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(sceneSkyKey(sceneId)) === '1';
  } catch {
    return false;
  }
}

/** 保存某场景天空开关(关闭即删除存档,默认即关闭)。配额/隐私模式失败静默。 */
export function saveSceneSkyPref(sceneId: string, on: boolean): void {
  if (!sceneId || typeof window === 'undefined') return;
  try {
    if (on) window.localStorage.setItem(sceneSkyKey(sceneId), '1');
    else window.localStorage.removeItem(sceneSkyKey(sceneId));
  } catch {
    /* quota / privacy mode */
  }
}
