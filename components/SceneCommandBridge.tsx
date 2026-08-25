'use client';

import { useEffect } from 'react';
import { manageSceneBridge } from '@/lib/scene-command-bus';
import { addSceneAction } from '@/mock/sceneLog';
import { registerConfrontSceneTools } from '@/drill/confrontation/scene-tools';
import { useScene } from '@/components/SceneProvider';
import { BUILDING_21_DRILL_ID } from '@/drill/building-21';
import { subscribeConfrontation } from '@/drill/confrontation/confront-store';

/**
 * 桥接 MCP 命令流到 3D 场景。
 *
 * 场景 SDK 的就绪是异步的(场景加载完成后才赋值 window.__scene),
 * 故连接生命周期交由 manageSceneBridge 以 ustudio:scene 事件驱动,
 * 本组件只负责挂载/卸载。
 *
 * 对抗舱推演工具(drill_inject_event/drill_report_decision)不依赖 3D SDK,
 * 挂载即注册一次(registerSceneTool 幂等覆盖)。
 */
export function SceneCommandBridge() {
  const { recipeStore } = useScene();
  useEffect(() => {
    registerConfrontSceneTools(addSceneAction, { drillId: BUILDING_21_DRILL_ID });
    // 默认订阅同源 BFF /api/scene-events(BFF 再带 appKey 连 mcp),浏览器无需持 appKey。
    const eventsUrl = process.env.NEXT_PUBLIC_SCENE_EVENTS_URL || '/api/scene-events';
    return manageSceneBridge(eventsUrl, { addSceneAction, store: recipeStore });
  }, [recipeStore]);

  useEffect(() => {
    // 对抗状态每次演化后主动同步到 MCP。初始 idle 不上报，避免页面刷新覆盖已有快照。
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeConfrontation((snapshot) => {
      if (snapshot.generation === 0 && snapshot.events.length === 0 && !snapshot.lastRound) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void fetch(`/api/drill-sessions/${encodeURIComponent(BUILDING_21_DRILL_ID)}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ snapshot, source: 'browser' }),
          keepalive: true,
        }).catch(() => {
          // 同步是容灾链路；失败不应打断浏览器内正在进行的演练。
        });
      }, 120);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
