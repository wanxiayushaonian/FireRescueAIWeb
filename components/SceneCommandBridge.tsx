'use client';

import { useEffect } from 'react';
import { manageSceneBridge } from '@/lib/scene-command-bus';

/**
 * 桥接 MCP 命令流到 3D 场景。
 *
 * 场景 SDK 的就绪是异步的(场景加载完成后才赋值 window.__scene),
 * 故连接生命周期交由 manageSceneBridge 以 ustudio:scene 事件驱动,
 * 本组件只负责挂载/卸载。
 */
export function SceneCommandBridge() {
  useEffect(() => {
    const eventsUrl = process.env.NEXT_PUBLIC_SCENE_EVENTS_URL;
    if (!eventsUrl) {
      console.warn('[SceneCommandBridge] NEXT_PUBLIC_SCENE_EVENTS_URL 未配置,跳过');
      return;
    }
    return manageSceneBridge(eventsUrl);
  }, []);

  return null;
}
