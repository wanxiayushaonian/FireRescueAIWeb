import type { StructuralRecipe } from './types';

/**
 * SDK 图层状态形状(lib 内最小子集,取自 ustudio-sdk LayerCommandState.layer)。
 * 字段语义:stories/mode 等与 SDK 对齐(out_instance_id 数组;空数组=全部楼层)。
 */
export interface SdkLayerState {
  stories?: string[];
  mode?: '2D' | '3D' | 'YExtend' | string;
  yExtend?: boolean;
  gis?: { visible?: boolean };
  [k: string]: unknown;
}

/** 归一化比较:Recipe 的 null(全集)与 SDK 的空数组(全部楼层)视为等价。 */
function normStories(stories: string[] | null | undefined): string[] {
  if (stories == null || stories.length === 0) return [];
  return [...stories].sort();
}

/**
 * 检测 SDK 场景状态与 Recipe 结构层是否脱节。
 *
 * 背景(AGENTS.md 约定「以 SDK 场景状态为准」):RecipeStore 是唯一写入方(用户/模块预设/agent 都经它),
 * 但平台 WebSocket(function_msg/脚本)也能从外部改场景状态。本函数用于在
 * sdk.subscribeSceneState 回调里判断「外部改动导致 Recipe 与 SDK 不一致」→ 标记 desynced。
 *
 * 只检测不回写(避免 subscribe→patch→apply→setViewMode→subscribe 循环)。
 * 比较字段:楼层(stories)、模式(mode)、炸开(yExtend)、GIS(gis.visible)。
 * 注意:stories 的「选中具体楼层」是真实差异;mode/yExtend/gis 是布尔/枚举差异。
 * 其余字段(如 labels/reachable/connectivity)SDK 状态形状未纳入,后续按需扩展。
 */
export function detectDesync(
  sdkLayer: SdkLayerState | null | undefined,
  recipe: StructuralRecipe | null | undefined,
): { desynced: boolean; fields: string[] } {
  if (!sdkLayer || !recipe) return { desynced: false, fields: [] };
  const fields: string[] = [];

  const sdkStories = normStories(sdkLayer.stories);
  const recipeStories = normStories(recipe.visibleStories);
  if (sdkStories.length !== recipeStories.length || sdkStories.some((v, i) => v !== recipeStories[i])) {
    fields.push('stories');
  }

  const sdkMode = sdkLayer.mode;
  const recipeMode = recipe.mode;
  if (sdkMode && recipeMode && sdkMode !== recipeMode) {
    fields.push('mode');
  }

  if (typeof sdkLayer.yExtend === 'boolean' && sdkLayer.yExtend !== recipe.yExtend) {
    fields.push('yExtend');
  }

  const sdkGis = sdkLayer.gis?.visible;
  if (typeof sdkGis === 'boolean' && sdkGis !== recipe.gisVisible) {
    fields.push('gis');
  }

  return { desynced: fields.length > 0, fields };
}
