// 场景链接(scene://)解析:智能体输出中嵌入的可点击场景锚点。
// 语法(提示词文档 web/plan/2026-08-24-agent-scene-links.md 约定):
//   scene://floor/<楼层段>        e.g. scene://floor/13F   scene://floor/3-4F
//   scene://device/<outId>        e.g. scene://device/story_5f_hydrant_3
//   scene://type/<类型>?floor=<F> e.g. scene://type/室内消火栓  scene://type/IndoorFireHydrant?floor=5F
// 点击行为见 src/components/assistant-ui/scene-link.tsx(楼层聚焦/设备飞向/类型高亮)。

export type SceneLink =
  | { kind: 'floor'; spec: string }
  | { kind: 'device'; id: string }
  | { kind: 'type'; type: string; floor?: string };

const SCENE_PREFIX = 'scene://';

/** 解析 scene:// href → SceneLink;非 scene:// 或格式不合法返回 null。 */
export function parseSceneLink(href: string): SceneLink | null {
  if (!href.startsWith(SCENE_PREFIX)) return null;
  const rest = href.slice(SCENE_PREFIX.length);
  const qIdx = rest.indexOf('?');
  const path = (qIdx >= 0 ? rest.slice(0, qIdx) : rest).split('/').filter(Boolean);
  const query = new URLSearchParams(qIdx >= 0 ? rest.slice(qIdx + 1) : '');
  const kind = path[0];
  const value = path[1] != null ? decodeURIComponent(path[1]) : '';
  if (!value) return null;
  if (kind === 'floor') return { kind: 'floor', spec: value };
  if (kind === 'device') return { kind: 'device', id: value };
  if (kind === 'type') {
    const floor = query.get('floor')?.trim();
    return { kind: 'type', type: value, floor: floor || undefined };
  }
  return null;
}

/** 构建 scene:// 链接(供提示词文档/调试用)。 */
export function buildSceneLink(link: SceneLink): string {
  if (link.kind === 'floor') return `${SCENE_PREFIX}floor/${encodeURIComponent(link.spec)}`;
  if (link.kind === 'device') return `${SCENE_PREFIX}device/${encodeURIComponent(link.id)}`;
  const q = link.floor ? `?floor=${encodeURIComponent(link.floor)}` : '';
  return `${SCENE_PREFIX}type/${encodeURIComponent(link.type)}${q}`;
}
