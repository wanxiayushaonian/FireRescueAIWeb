// 内容显隐偏好持久化:与场景 id 绑定(localStorage)。
// 模态框(SceneDisplayModal)是 categoryVisibility 的唯一写入方;
// 场景加载/模块预设应用时(App.tsx)按当前 sceneId 回放,替代"加载完无条件自动隐藏"。
import type { LayerLevel } from './scene-recipe/level-policy';

/** StructuralRecipe['categoryVisibility']:每层级一张 type→可见 表 */
export type CategoryVisibilityMap = Partial<Record<LayerLevel, Record<string, boolean>>>;

const KEY_PREFIX = 'firerescue:scene-display:';

export function sceneDisplayKey(sceneId: string): string {
  return KEY_PREFIX + sceneId;
}

const LEVELS: readonly LayerLevel[] = ['whole', 'single', 'multi'];

/** 读取某场景的显隐偏好;无存档/损坏/非浏览器环境返回 null(调用方回落默认)。 */
export function loadSceneDisplayPrefs(sceneId: string): CategoryVisibilityMap | null {
  if (!sceneId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(sceneDisplayKey(sceneId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: CategoryVisibilityMap = {};
    for (const level of LEVELS) {
      const v = (parsed as Record<string, unknown>)[level];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const entries = Object.entries(v as Record<string, unknown>).filter(
          ([, x]) => typeof x === 'boolean',
        ) as [string, boolean][];
        if (entries.length) out[level] = Object.fromEntries(entries);
      }
    }
    return out;
  } catch {
    return null;
  }
}

/** 保存某场景的显隐偏好(模态框每次改动后调用);配额/隐私模式失败静默。 */
export function saveSceneDisplayPrefs(sceneId: string, prefs: CategoryVisibilityMap): void {
  if (!sceneId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(sceneDisplayKey(sceneId), JSON.stringify(prefs));
  } catch {
    /* quota / privacy mode */
  }
}
