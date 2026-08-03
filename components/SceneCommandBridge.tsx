'use client';

import { useEffect } from 'react';
import { sceneSdk } from '@/lib/scene-sdk';
import { registerDefaultTools, connectSceneEvents } from '@/lib/scene-command-bus';

export function SceneCommandBridge() {
  useEffect(() => {
    const eventsUrl = process.env.NEXT_PUBLIC_SCENE_EVENTS_URL;
    if (!eventsUrl) {
      console.warn('[SceneCommandBridge] NEXT_PUBLIC_SCENE_EVENTS_URL 未配置,跳过');
      return;
    }
    let sdk;
    try {
      sdk = sceneSdk();
    } catch {
      console.warn('[SceneCommandBridge] sceneSdk 未就绪,稍后命令将丢失');
      return;
    }
    registerDefaultTools(sdk as never);
    const disconnect = connectSceneEvents(eventsUrl, sdk as never);
    return () => disconnect();
  }, []);

  return null;
}
