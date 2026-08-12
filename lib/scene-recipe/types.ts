import type { CameraViewpoint } from '../soonspace-runtime';
import type { SceneTreeNode } from '../ustudio';

/** 结构层 — 决定"场景里显示哪些";持久;模块预设 + agent 管控 */
export interface StructuralRecipe {
  visibleStories: string[] | null;    // null = 全集不裁剪;string[] = 仅这些楼层 out_instance_id
  visibleBuildings: string[] | null;  // 同上
  mode: '2D' | '3D';
  yExtend: boolean;
  gisVisible: boolean;
  labels: { visible: boolean; ids?: string[] };
  reachable?: { nodeId: string };
  connectivity?: { spaceId: string };
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
