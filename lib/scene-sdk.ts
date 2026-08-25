import type { CustomFunctionUStudioSdk, UStudioSdk } from 'ustudio-sdk';
import type { SceneTreeNode } from './ustudio';

export type SceneSdk = CustomFunctionUStudioSdk<UStudioSdk>;

declare global {
  interface Window {
    __scene?: SceneSdk;
    __sceneId?: string;
    /** 当前场景树(SceneProvider 加载后写入;供 lib 层解析场景包统计消防设施) */
    __sceneTree?: SceneTreeNode;
  }
}

export function sceneSdk(): SceneSdk {
  if (typeof window === 'undefined' || !window.__scene) {
    throw new Error('场景 SDK 未就绪');
  }
  return window.__scene;
}
