import { sceneSdk } from '@/lib/scene-sdk';
import { registerDefaultTools, registerGisTools, type AddSceneActionFn } from './handlers';
import { connectSceneEvents } from './transport';
import type { SceneSdkLike } from './types';
import type { RecipeStore } from '../scene-recipe/store';

const SCENE_EVENT = 'ustudio:scene';

/** 桥接关心的事件最小形状(真实 window 上即 CustomEvent,这里只取 detail)。 */
type BridgeEvent = { detail?: unknown };

type EventTargetLike = {
  addEventListener(type: string, listener: (e: BridgeEvent) => void): void;
  removeEventListener(type: string, listener: (e: BridgeEvent) => void): void;
};

export type BridgeDeps = {
  /** 读取当前场景 SDK;抛错表示尚未就绪。 */
  getSdk: () => SceneSdkLike;
  /** 注册 3D 工具 handler(绑定到当前 sdk)。 */
  register: (sdk: SceneSdkLike) => void;
  /** 仅注册 GIS 工具(3D 未就绪时的降级注册)。 */
  registerGis: () => void;
  /** 建立命令流订阅,返回断开函数;sdk 经 getter 惰性读取。 */
  connect: (eventsUrl: string, getSdk: () => SceneSdkLike) => () => void;
  /** 事件目标(默认 window)。 */
  eventTarget: EventTargetLike;
  /** show_route/gis_fly_to 写场景总线用(透传给注册函数);可选。 */
  addSceneAction?: AddSceneActionFn;
  /** Recipe 真相源(透传给 registerDefaultTools,focus_floors 经此落地);可选。 */
  store?: RecipeStore | null;
};

/**
 * 管理「MCP 命令流 → 场景」桥接的生命周期。
 *
 * 命令流订阅与 3D SDK 就绪**解耦**:mount 即建立 SSE 连接——GIS 类工具
 * (gis_fly_to/show_route)不依赖 SDK,态势总览等无 3D 场景包的模块也要能收到。
 * 3D 工具注册仍由场景生命周期驱动:window.__scene 由 SoonspaceRuntime.init 在
 * 场景就绪后异步赋值(远晚于 mount),未就绪时只注册 GIS 工具,就绪/切换场景时
 * 重新注册全部工具并重连(场景切换后旧 sdk 实例已 dispose,重连换新引用)。
 *
 * @returns 卸载函数:移除监听并断开当前连接。
 */
export function manageSceneBridge(
  eventsUrl: string,
  deps?: Partial<BridgeDeps>,
): () => void {
  const getSdk = deps?.getSdk ?? (() => sceneSdk() as unknown as SceneSdkLike);
  const addSceneAction = deps?.addSceneAction;
  const store = deps?.store ?? undefined;
  const register =
    deps?.register ??
    ((sdk: SceneSdkLike) =>
      registerDefaultTools(sdk, addSceneAction ? { addSceneAction } : undefined, store));
  const registerGis =
    deps?.registerGis ?? (() => registerGisTools(addSceneAction));
  const connect = deps?.connect ?? connectSceneEvents;
  const eventTarget: EventTargetLike | null =
    deps?.eventTarget ??
    (typeof window !== 'undefined' ? (window as unknown as EventTargetLike) : null);
  if (!eventTarget) return () => {};

  let disconnect: (() => void) | null = null;

  const teardown = (): void => {
    disconnect?.();
    disconnect = null;
  };

  // 就绪/切换 → 注册当前可用工具层,并(重建)命令流订阅
  const sync = (): void => {
    let sdk: SceneSdkLike;
    try {
      sdk = getSdk();
    } catch {
      // 3D 未就绪:仅注册 GIS 工具,连接照常(命令流本身不依赖 sdk)
      registerGis();
      teardown();
      disconnect = connect(eventsUrl, getSdk);
      return;
    }
    register(sdk);
    teardown();
    disconnect = connect(eventsUrl, getSdk);
  };

  const onScene = (_e: BridgeEvent): void => {
    // 场景退出(detail.sceneId 空)后 getSdk 会抛错 → sync 自动降级为 GIS-only
    sync();
  };

  sync(); // mount 即建连;3D 就绪与否只影响注册的工具层
  eventTarget.addEventListener(SCENE_EVENT, onScene);

  return () => {
    eventTarget.removeEventListener(SCENE_EVENT, onScene);
    teardown();
  };
}
