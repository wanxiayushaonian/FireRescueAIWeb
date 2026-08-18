// 天空背景偏好持久化:与场景 id 绑定(localStorage)。
// 天空是"长期开启"的场景级开关(非层级显隐),模态框(SceneDisplayModal)是唯一写入方;
// 场景(重)加载后由 App 回放(与 scene-display-prefs 同模式)。
// 2026-08-17 用户定:全场景加载默认开启天空——无存档=开;关闭才写 '0' 存档。

const KEY_PREFIX = 'firerescue:scene-sky:';

export function sceneSkyKey(sceneId: string): string {
  return KEY_PREFIX + sceneId;
}

/** 读取某场景天空开关;无存档(默认态)=开启,存档 '0'=关闭。 */
export function loadSceneSkyPref(sceneId: string): boolean {
  if (!sceneId || typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(sceneSkyKey(sceneId)) !== '0';
  } catch {
    return true;
  }
}

/** 保存某场景天空开关(开=删除存档回默认态;关=写 '0')。配额/隐私模式失败静默。 */
export function saveSceneSkyPref(sceneId: string, on: boolean): void {
  if (!sceneId || typeof window === 'undefined') return;
  try {
    if (on) window.localStorage.removeItem(sceneSkyKey(sceneId));
    else window.localStorage.setItem(sceneSkyKey(sceneId), '0');
  } catch {
    /* quota / privacy mode */
  }
}
