import type { ObservationalRecipe, SceneRecipe, StructuralRecipe } from './types';

const baseObservational: ObservationalRecipe = { routes: [], polygons: [] };

const baseStructural3D = (gisVisible: boolean, labels: boolean): StructuralRecipe => ({
  visibleStories: null,
  visibleBuildings: null,
  mode: '3D',
  yExtend: false,
  // full 而非 structure:structure 的 hideWindowAndDoor 会触发 SDK 孤儿隐藏,把草地/马路/周边建筑等
  // 不在实例树的环境模型藏掉。full 保留周边环境;设备由 hideDevices 藏减压。
  detailLevel: 'full',
  hideDevices: true, // 全局视角藏建筑内设备/设施减压,只留主体结构+环境
  gisVisible,
  labels: { visible: labels },
});

/** 对象总览:全楼层 3D + 标注开 + GIS 关(纯 3D 查看建筑) */
const objectsOverview: SceneRecipe = {
  structural: baseStructural3D(false, true),
  observational: { ...baseObservational },
};

/** 演练对抗:全楼层 3D + GIS 开(到场需要底图) + 标注开 */
const drillConfront: SceneRecipe = {
  structural: baseStructural3D(true, true),
  observational: { ...baseObservational },
};

/**
 * 六熟悉六步:每步聚焦不同部位。focus.objectId 暂用占位,
 * Task 9 接模块预设时对齐 znya key_parts 真实 id 后填实。
 */
const familiarize: SceneRecipe[] = Array.from({ length: 6 }, (_, i) => ({
  structural: baseStructural3D(false, true),
  observational: { ...baseObservational, focus: { objectId: `__familiarize_step_${i + 1}__` } },
}));

export const presets = {
  objectsOverview,
  drillConfront,
  familiarize,
};
