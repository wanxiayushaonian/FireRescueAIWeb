import { registerSceneTool } from './registry';
import { getSceneTreeForView } from './scene-tree';
import { addSceneAction } from '@/mock/sceneLog';
import type { SceneSdkLike } from './types';

// 聚焦高亮色:与 FIRE_TYPE_COLORS 告警色一致,agent 不操心配色。
const FOCUS_HIGHLIGHT_COLOR = '#f87171';

export function registerDefaultTools(_sdk: SceneSdkLike): void {
  registerSceneTool('fly_to', async (args, sdk) => {
    const target = String(args.target ?? '');
    if (!target) {
      console.warn('[scene-bus] fly_to missing target');
      return;
    }
    await sdk.fly(target);
  });

  // 追踪当前高亮对象:底层 cancelHeighLight 需逐个 id,无法一次清全部。
  const highlightedIds = new Set<string>();
  registerSceneTool('focus_objects', async (args, sdk) => {
    const ids = Array.isArray(args.ids) ? (args.ids as unknown[]).map(String) : [];
    // 调用即替换:先逐个取消上一轮高亮,再高亮新的(空数组=仅清除)
    for (const id of highlightedIds) sdk.cancelHeighLight(id);
    highlightedIds.clear();
    if (ids.length === 0) return;
    // MVP:高亮全部 + 飞向首个。精确框住多对象需底层 ssp(包围盒),留作后续。
    for (const id of ids) {
      sdk.heighLight(id, FOCUS_HIGHLIGHT_COLOR);
      highlightedIds.add(id);
    }
    await sdk.fly(ids[0]);
  });

  registerSceneTool('focus_floors', async (args, sdk) => {
    const storyIds = Array.isArray(args.story_ids) ? (args.story_ids as unknown[]).map(String) : [];
    const sceneId = typeof window !== 'undefined' ? window.__sceneId : undefined;
    if (!sceneId) {
      console.warn('[scene-bus] focus_floors: 场景未就绪(window.__sceneId 空),跳过');
      return;
    }
    const tree = await getSceneTreeForView(sceneId);
    // 隔离显示选中楼层;空数组 = 恢复全楼层。params 按引擎确认(默认 story 模式)。
    await sdk.setViewMode({ mode: 'story' }, tree, storyIds);
  });

  // 2D 态势总览:AI 派遣多站路线渲染(经 addSceneAction → RealGisMap subscribeSceneLog 的 showRoute 通道)
  registerSceneTool('show_route', async (args) => {
    const routes = (args as { routes?: unknown }).routes;
    if (!Array.isArray(routes) || routes.length === 0) {
      console.warn('[scene-bus] show_route missing routes');
      return;
    }
    addSceneAction({
      action: 'showRoute',
      target: `AI 派遣路线(${routes.length} 站)`,
      params: { routes },
      source: '智能体',
    });
  });
}
