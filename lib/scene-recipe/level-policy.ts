/**
 * 层级(整体/单层/多层)→ 结构层策略推导。
 * 供楼层开关切层级时统一调用,与 FloorDisplayPanel 既有推导对齐。
 * 注意:categoryVisibility(用户按类别覆盖)不在此推导内 —— 它跨层级保留,由模态框驱动。
 */

export type LayerLevel = 'whole' | 'single' | 'multi';

export function levelFromStoryCount(count: number): LayerLevel {
  if (count <= 0) return 'whole';
  if (count === 1) return 'single';
  return 'multi';
}

export interface LayerPolicy {
  detailLevel: 'structure' | 'full';
  hideDevices: boolean;
  yExtend: boolean;
}

/**
 * 按层级推导结构层默认:
 *  - whole(整体): 主体骨架 + 藏设备(清晰度优先,墙藏不掉靠平台精简包)
 *  - single(单层): 完整细节 + 显设备(空间小,帧率好)
 *  - multi(多层): 主体骨架 + 藏设备 + 炸开(堆栈展开看选中层)
 */
export function deriveLayerPolicy(level: LayerLevel): LayerPolicy {
  switch (level) {
    case 'single':
      return { detailLevel: 'full', hideDevices: false, yExtend: false };
    case 'multi':
      return { detailLevel: 'structure', hideDevices: true, yExtend: true };
    case 'whole':
    default:
      // full(不 hideWindowAndDoor):structure 的 hideWindowAndDoor 会触发 SDK「孤儿隐藏」
      // (hide2dOrphanSceneObjects,默认 true),把不在实例树的草地/马路/周边建筑等环境模型藏掉。
      // full 不触发该隐藏 → 保留周边环境;设备仍由 hideDevices 藏,清晰度不受影响。
      return { detailLevel: 'full', hideDevices: true, yExtend: false };
  }
}
