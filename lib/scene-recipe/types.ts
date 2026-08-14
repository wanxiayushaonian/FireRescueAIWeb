import type { CameraViewpoint } from '../soonspace-runtime';
import type { SceneTreeNode } from '../ustudio';

/** 结构层 — 决定"场景里显示哪些";持久;模块预设 + agent 管控 */
export interface StructuralRecipe {
  visibleStories: string[] | null;    // null = 全集不裁剪;string[] = 仅这些楼层 out_instance_id
  visibleBuildings: string[] | null;  // 同上
  mode: '2D' | '3D';
  yExtend: boolean;
  /** 细节级别:'structure'=主体骨架(3D 下藏门窗);'full'=完整细节。 */
  detailLevel: 'structure' | 'full';
  /** 全局视角是否隐藏建筑内设备/设施(喷淋/烟感/消火栓等非结构叶子),只留主体结构减压。
   *  实现靠 sdk.hide 循环 + 每次 setViewMode 后重放(因 resetAll 会恢复可见)。 */
  hideDevices?: boolean;
  /** 按层级(whole/single/multi)的类别显隐;各层级独立、互不影响。内层 key=类型标识。
   *  engine 按当前层级选对应配置,在 hideDevices 之后应用(true 显/false 藏)。 */
  categoryVisibility?: Partial<Record<string, Record<string, boolean>>>;
  gisVisible: boolean;
  labels: { visible: boolean; ids?: string[] };
  /** 可达性(开/关 + 锚点)。`enabled:false` 关闭;缺省 `enabled=true`(兼容旧 `{nodeId}` 用法)。 */
  reachable?: { nodeId?: string; enabled?: boolean };
  /** 空间连通性(开/关 + 锚点)。`enabled:false` 关闭;缺省 `enabled=true`。与 reachable 独立(可同开)。 */
  connectivity?: { spaceId?: string; enabled?: boolean };
}

/** 观察层 — 决定"看哪里/突出谁/叠加什么";临时;用户 + agent 可随时叠加 */
export interface ObservationalRecipe {
  focus?: { objectId: string; highlightColor?: string };
  viewpoint?: CameraViewpoint;
  routes: { id: string; visible: boolean }[];
  polygons: { id: string; visible: boolean }[];
}

export interface SceneRecipe {
  structural: StructuralRecipe;
  observational: ObservationalRecipe;
}

export interface Changeset {
  structural: Partial<StructuralRecipe> & { __touched: boolean };
  observational: Partial<ObservationalRecipe> & { __touched: boolean };
}

/** engine 依赖的最小 runtime 接口(SoonspaceRuntime 子集),便于 mock */
export interface RecipeRuntime {
  setViewMode(params: unknown, tree: SceneTreeNode, storyIds: string[], buildingIds: string[]): Promise<void>;
  setGisVisible(v: boolean): Promise<void>;
  showLabels(tree: SceneTreeNode, ids?: string[], storyIds?: string[]): void;
  hideLabels(): void;
  setScene(params: unknown): Promise<unknown>;
  flyToObject(id: string): Promise<void>;
  highlightObject(id: string, color?: string): boolean;
  setCameraViewpoint(vp: CameraViewpoint, transition?: boolean): Promise<void>;
  setVirtualRouteVisible(id: string, v: boolean): unknown;
  setVirtualPolygonVisible(id: string, v: boolean): unknown;
  hideObjects(ids: string[]): void;
  showObjects(ids: string[]): void;
}

export interface ApplyResult {
  applied: string[];
  failed: { field: string; error: unknown }[];
}

/** runtime ready 时的初始结构层(不裁剪、引擎默认) */
export function defaultStructural(): StructuralRecipe {
  return {
    visibleStories: null,
    visibleBuildings: null,
    mode: '3D',
    yExtend: false,
    detailLevel: 'full',
    gisVisible: true,
    labels: { visible: false },
  };
}

export function defaultObservational(): ObservationalRecipe {
  return { routes: [], polygons: [] };
}

export function defaultRecipe(): SceneRecipe {
  return { structural: defaultStructural(), observational: defaultObservational() };
}
