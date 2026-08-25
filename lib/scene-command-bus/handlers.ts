import { registerSceneTool } from './registry';
import type { SceneSdkLike } from './types';
import type { RecipeStore } from '../scene-recipe/store';
import { getGlobalRecipeStore } from '../scene-recipe/global-store';
import { countSceneFacilities } from '../scene-facilities';

// 聚焦高亮色:与 FIRE_TYPE_COLORS 告警色一致,agent 不操心配色。
const FOCUS_HIGHLIGHT_COLOR = '#f87171';

/**
 * 场景动作名(与 src/mock/sceneLog.SceneActionName 保持同步;lib 不 import src 故重复声明)。
 * 改动时两端同步。
 */
export type SceneActionName =
  | 'flyTo' | 'highlight' | 'batchHighlight' | 'switchFloor'
  | 'showRoute' | 'hideRoute' | 'addMarker' | 'removeMarker' | 'resetView'
  | 'drawZone' | 'drawRoute' | 'clearTactical'
  | 'updatePlan'
  | 'updateCoord'
  | 'editEntity';

/**
 * 场景动作总线写入函数(由调用方注入,避免 lib 反向依赖 src/mock/sceneLog)。
 * 结构兼容 src/mock/sceneLog.addSceneAction 的入参(Omit<SceneAction,'ts'>)。
 */
export type AddSceneActionFn = (action: {
  action: SceneActionName;
  target: string;
  params?: Record<string, unknown>;
  source: '面板' | '智能体' | '预案引擎';
}) => void;

/** registerDefaultTools 的可选扩展(show_route 写场景总线用)。 */
export interface RegisterToolsAddons {
  /** 写场景动作总线;缺省时 show_route 降级为 console.warn。 */
  addSceneAction?: AddSceneActionFn;
}

export function registerDefaultTools(_sdk: SceneSdkLike, addons?: RegisterToolsAddons, store?: RecipeStore): void {
  // GIS 工具无 sdk 依赖,先注册(桥在 3D 未就绪时也会单独注册这组)
  registerGisTools(addons?.addSceneAction);

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
    // 视角聚焦到首个楼层(缺省 true;显式 fly_to_first=false 或恢复全楼层时不移动视角)
    const flyToFirst = args.fly_to_first !== false && storyIds.length > 0;
    // 经 Recipe 单一真相源(注入 store 优先,缺席时读全局引用堵"场景就绪事件先于 React commit"
    // 的注册窗口);空数组 = null 恢复全楼层。仍拿不到 store 则明确拒绝 —— 绝不直调
    // sdk.setViewMode:其内部 resetAll 会恢复一切被 hide 的对象且 Recipe 不同步(显隐污染)。
    const s = store ?? getGlobalRecipeStore();
    if (!s) {
      console.warn('[scene-bus] focus_floors: RecipeStore 未就绪(场景加载窗口期),已拒绝执行');
      return;
    }
    // 与 floor-focus/objectsOverview 基线保持一致:
    // detailLevel 恒为 full——structure 的 hideWindowAndDoor 会触发 SDK 孤儿隐藏,
    // 把草地/马路/周边底模藏掉(presets 注释明示)。
    // 单层聚焦→显设备;多层/恢复全楼层→藏设备减压(仅配方层,模态显隐是唯一写入方不受影响)。
    const isFocusSingle = storyIds.length === 1;
    s.patchStructural({
      visibleStories: storyIds.length ? storyIds : null,
      detailLevel: 'full',
      hideDevices: !isFocusSingle,
    });
    if (flyToFirst) await sdk.fly(storyIds[0]);
  });

  // 查询类:场景包消防设施统计(数据库无此粒度,数据源=浏览器场景树)。
  // handler 返回值经 dispatch → ack 回传 mcp-server,agent 用 get_scene_command_status 查询。
  registerSceneTool('query_scene_facilities', async (args) => {
    const tree = typeof window !== 'undefined' ? window.__sceneTree : undefined;
    if (!tree) throw new Error('场景树未就绪:浏览器未加载场景包,无法统计内部消防设施');
    const floor = args.floor != null ? String(args.floor) : undefined;
    const type = args.type != null ? String(args.type) : undefined;
    return countSceneFacilities(tree, { floor, type });
  });
}

/**
 * 注册 GIS(2D 态势总览)命令工具:不依赖 3D SDK。
 * 桥在 3D 场景未就绪(如态势总览模块无场景包)时也会单独注册这组,
 * 保证 gis_fly_to/show_route 命令始终可达地图。
 */
export function registerGisTools(add?: AddSceneActionFn): void {
  // 2D 态势总览:AI 派遣多站路线渲染(经注入的 addSceneAction → RealGisMap subscribeSceneLog 的 showRoute 通道)
  registerSceneTool('show_route', async (args) => {
    const routes = (args as { routes?: unknown }).routes;
    if (!Array.isArray(routes) || routes.length === 0) {
      console.warn('[scene-bus] show_route missing routes');
      return;
    }
    const addSceneAction = add;
    if (!addSceneAction) {
      // 未注入(如纯单测环境)→ 降级,不阻塞命令派发
      console.warn('[scene-bus] show_route: 未注入 addSceneAction,跳过 sceneLog 写入');
      return;
    }
    addSceneAction({
      action: 'showRoute',
      target: `AI 派遣路线(${routes.length} 站)`,
      params: { routes },
      source: '智能体',
    });
  });

  // 2D 态势总览:GIS 地图飞向坐标(经注入的 addSceneAction → RealGisMap subscribeSceneLog 的 flyTo 通道)。
  // agent 风险研判定位警情/波及单位/水源用;坐标 GCJ02,与 mcp-server gis_fly_to 工具一致。
  registerSceneTool('gis_fly_to', async (args) => {
    const lat = Number(args.lat);
    const lng = Number(args.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.warn('[scene-bus] gis_fly_to missing/invalid lat,lng');
      return;
    }
    const zoom = Number(args.zoom);
    const label = args.label != null ? String(args.label) : '';
    const layer = args.layer != null ? String(args.layer) : '';
    const addSceneAction = add;
    if (!addSceneAction) {
      console.warn('[scene-bus] gis_fly_to: 未注入 addSceneAction,跳过 sceneLog 写入');
      return;
    }
    addSceneAction({
      action: 'flyTo',
      target: label || `智能体定位(${lng.toFixed(5)}, ${lat.toFixed(5)})`,
      params: { lng, lat, ...(Number.isFinite(zoom) ? { zoom } : {}), ...(layer ? { layer } : {}) },
      source: '智能体',
    });
  });
}
