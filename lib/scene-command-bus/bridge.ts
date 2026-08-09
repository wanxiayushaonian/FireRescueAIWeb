import { sceneSdk } from '@/lib/scene-sdk';
import { registerDefaultTools, type AddSceneActionFn } from './handlers';
import { connectSceneEvents } from './transport';
import type { SceneSdkLike } from './types';

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
  /** 注册工具 handler(绑定到当前 sdk)。 */
  register: (sdk: SceneSdkLike) => void;
  /** 建立命令流订阅,返回断开函数。 */
  connect: (eventsUrl: string, sdk: SceneSdkLike) => () => void;
  /** 事件目标(默认 window)。 */
  eventTarget: EventTargetLike;
  /** show_route 写场景总线用(透传给 registerDefaultTools);可选。 */
  addSceneAction?: AddSceneActionFn;
};

/**
 * 管理「MCP 命令流 → 场景」桥接的生命周期。
 *
 * 背景:window.__scene 由 SoonspaceRuntime.init 在场景就绪后异步赋值,远晚于
 * 桥接组件 mount。故不能在 mount 时同步读取——需由 ustudio:scene 事件驱动
 * 建连/断开,并在安装时主动探测一次,覆盖「组件晚于场景就绪挂载」的边界
 * (如 HMR 重载)。
 *
 * 场景切换时 sdk 实例会变化(旧实例被 dispose),故每次就绪事件都重新
 * register + 重连,避免命令派发到已失效的旧 sdk。
 *
 * @returns 卸载函数:移除监听并断开当前连接。
 */
export function manageSceneBridge(
  eventsUrl: string,
  deps?: Partial<BridgeDeps>,
): () => void {
  const getSdk = deps?.getSdk ?? (() => sceneSdk() as unknown as SceneSdkLike);
  const addSceneAction = deps?.addSceneAction;
  const register =
    deps?.register ??
    ((sdk: SceneSdkLike) =>
      registerDefaultTools(sdk, addSceneAction ? { addSceneAction } : undefined));
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

  // 就绪/切换 → 注册当前 sdk 并(重建)命令流订阅
  const sync = (): void => {
    let sdk: SceneSdkLike;
    try {
      sdk = getSdk();
    } catch {
      return; // 未就绪,等待下次事件
    }
    register(sdk);
    teardown();
    disconnect = connect(eventsUrl, sdk);
  };

  const onScene = (e: BridgeEvent): void => {
    const detail = e.detail as { sceneId?: string } | undefined;
    if (detail?.sceneId) sync();
    else teardown();
  };

  sync(); // 覆盖组件晚于场景就绪挂载的边界
  eventTarget.addEventListener(SCENE_EVENT, onScene);

  return () => {
    eventTarget.removeEventListener(SCENE_EVENT, onScene);
    teardown();
  };
}
