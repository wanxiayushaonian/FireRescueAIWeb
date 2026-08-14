import type { ApplyResult, Changeset, RecipeRuntime, StructuralRecipe } from './types';
import type { SceneTreeNode } from '../ustudio';
import { collectNonStructuralOutIds, collectByTypes } from '../device-tree';
import { levelFromStoryCount } from './level-policy';

// 项目暂无 lib/logger.ts;engine 用 console 后备(与现有 lib 多数模块一致)
const logger = console;

/** 单次 SDK 调用包装:失败记入 failed 不阻断其余(best-effort) */
async function safe(
  field: string,
  fn: () => unknown,
  applied: string[],
  failed: ApplyResult['failed'],
): Promise<void> {
  try {
    await fn();
    applied.push(field);
  } catch (error) {
    failed.push({ field, error });
    logger.warn(`[scene-recipe] apply ${field} failed`, error);
  }
}

// tree 解析(楼层/楼栋收集已移至 device-tree.collectNonStructuralOutIds;本文件不再自维护遍历)

/**
 * 把 changeset 按顺序应用到 runtime:结构层先(降渲染量)→ 观察层后(依赖结构层已应用)。
 * 幂等:只对 __touched 字段发调用。best-effort:单调用失败不阻断其余。
 */
export async function applyRecipe(
  runtime: RecipeRuntime,
  tree: SceneTreeNode,
  cs: Changeset,
  next?: StructuralRecipe,
): Promise<ApplyResult> {
  const applied: string[] = [];
  const failed: ApplyResult['failed'] = [];

  // 阶段1:结构层
  if (cs.structural.__touched) {
    const s = cs.structural;
    // 完整结构层:SceneProvider 经 next 传入。setViewMode 是"全量重建"(内部 resetAll),
    // 故其入参与 hideDevices 重放都优先取完整态 cur,而非 changeset 片段 —— 否则
    // "只改 mode/楼层等、其余字段未变"时会 fallback 到默认值,覆盖当前实际视图或漏重放。
    const cur = next;
    // setViewMode:楼层/楼栋/mode/yExtend/detailLevel 任一变更即应用。
    // storyIds:显式子集用子集;null/undefined(未选=全部)用空数组 → SDK 不过滤外部模型,保留周边环境。
    const storiesChanged = s.visibleStories !== undefined;
    const buildingsChanged = s.visibleBuildings !== undefined;
    const modeChanged = s.mode !== undefined;
    const yExtendChanged = s.yExtend !== undefined;
    const detailChanged = s.detailLevel !== undefined;
    const hideDevicesChanged = s.hideDevices !== undefined;
    if (storiesChanged || buildingsChanged || modeChanged || yExtendChanged || detailChanged || hideDevicesChanged) {
      // null(未选=全部)= 空数组:SDK 不过滤外部模型 → 保留周边环境;子集才过滤只显选中楼层
      const storyIds = cur?.visibleStories ?? s.visibleStories ?? [];
      const buildingIds = cur?.visibleBuildings ?? s.visibleBuildings ?? [];
      const mode = cur?.mode ?? s.mode ?? '3D';
      const detailLevel = cur?.detailLevel ?? s.detailLevel ?? 'full';
      const main: { type: string; ids: string[]; hideWindowAndDoor?: boolean } = { type: mode, ids: storyIds };
      if (mode === '3D' && detailLevel === 'structure') {
        main.hideWindowAndDoor = true;
      }
      const params = [main];
      if (cur?.yExtend ?? s.yExtend ?? false) params.push({ type: 'YExtend', ids: storyIds });
      await safe('setViewMode', () => runtime.setViewMode(params, tree, storyIds, buildingIds), applied, failed);
      // ⚠️ 时序关键:setViewMode 内部 resetAll 会恢复被 hide 的对象,全面隐藏须在其后重放。
      // 判断用完整态 cur.hideDevices(而非 changeset 的 s.hideDevices):否则"只改 mode/楼层、
      // hideDevices 未变"时 resetAll 恢复设备却漏重放 → 设备泄露、Recipe 状态与实际渲染脱节。
      // 藏所有非主体结构节点(Space/Door/设备/管道/灯具/家具…),只留墙/楼板/楼梯/楼栋 → draw call 大降、流畅。
      const hideDevices = cur?.hideDevices ?? s.hideDevices;
      if (hideDevices) {
        const ids = collectNonStructuralOutIds(tree);
        await safe('hideDevices', () => runtime.hideObjects(ids), applied, failed);
      } else if (hideDevicesChanged) {
        const ids = collectNonStructuralOutIds(tree);
        await safe('showDevices', () => runtime.showObjects(ids), applied, failed);
      }
    }
    // 按类别(type)显隐覆盖:在 setViewMode/hideDevices 之后应用。
    // categoryVisibility[type]=false 额外藏该类;=true 推翻 hideDevices 显出该类。
    // (setViewMode 触发时 diff 已把完整 categoryVisibility 塞入 changeset,故此处能正确重放。)
    if (s.categoryVisibility) {
      // 按当前层级(整体/单层/多层)选对应那套配置 —— 各层级独立、互不影响
      const storyCount = next?.visibleStories?.length ?? (Array.isArray(s.visibleStories) ? s.visibleStories.length : -1);
      const level = levelFromStoryCount(storyCount);
      const vis = next?.categoryVisibility?.[level] ?? {};
      for (const [type, visible] of Object.entries(vis)) {
        const ids = collectByTypes(tree, [type]);
        if (ids.length === 0) continue;
        if (visible) await safe(`show:${type}`, () => runtime.showObjects(ids), applied, failed);
        else await safe(`hide:${type}`, () => runtime.hideObjects(ids), applied, failed);
      }
    }
    if (s.gisVisible !== undefined) await safe('gisVisible', () => runtime.setGisVisible(s.gisVisible!), applied, failed);
    if (s.labels !== undefined) {
      if (s.labels.visible) await safe('labels', () => runtime.showLabels(tree, s.labels!.ids, undefined), applied, failed);
      else await safe('labels', () => runtime.hideLabels(), applied, failed);
    }
    if (s.reachable !== undefined) await safe('reachable', () => runtime.setScene({ reachable: true, nodeId: s.reachable!.nodeId }), applied, failed);
    else if (s.connectivity !== undefined) await safe('connectivity', () => runtime.setScene({ connectivity: true, spaceId: s.connectivity!.spaceId }), applied, failed);
  }

  // 阶段2:观察层(必须在结构层之后:flyToObject 要求目标在可见楼层内)
  if (cs.observational.__touched) {
    const o = cs.observational;
    if (o.focus !== undefined && o.focus) {
      await safe('focus', async () => {
        await runtime.flyToObject(o.focus!.objectId);
        runtime.highlightObject(o.focus!.objectId, o.focus!.highlightColor);
      }, applied, failed);
    } else if (o.viewpoint !== undefined && o.viewpoint) {
      await safe('viewpoint', () => runtime.setCameraViewpoint(o.viewpoint!, true), applied, failed);
    }
    if (o.routes) {
      for (const r of o.routes) await safe(`route:${r.id}`, () => runtime.setVirtualRouteVisible(r.id, r.visible), applied, failed);
    }
    if (o.polygons) {
      for (const p of o.polygons) await safe(`polygon:${p.id}`, () => runtime.setVirtualPolygonVisible(p.id, p.visible), applied, failed);
    }
  }

  return { applied, failed };
}
