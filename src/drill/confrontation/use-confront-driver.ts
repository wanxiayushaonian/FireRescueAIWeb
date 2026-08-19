// 对抗舱 driver hook:订阅 store 并在 running + seedReady 时启动注入/调整调度。
import { useEffect, useRef } from 'react';
import { ConfrontDriver, type ConfrontAppIds } from './confront-driver';
import { ConfrontAdapter } from './confront-adapter';
import {
  appendAdjust,
  appendInject,
  getConfrontationState,
  setThinking,
  subscribeConfrontation,
  type ConfrontationState,
} from './confront-store';
import { addSceneAction } from '@/mock/sceneLog';
import { showToast } from '@/components/Toast';

export interface UseConfrontDriverOpts {
  readonly adapter: ConfrontAdapter;
  readonly appIds: ConfrontAppIds;
  readonly buildingId: string;
  readonly sceneId: string;
  readonly drillId: string;
}

export function useConfrontationDriver(opts: UseConfrontDriverOpts): void {
  const driverRef = useRef<ConfrontDriver | null>(null);
  const confRef = useRef<ConfrontationState>(getConfrontationState());

  useEffect(() => {
    const unsub = subscribeConfrontation((s) => {
      confRef.current = s;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const s = confRef.current;
    if (!s.active || s.status !== 'running' || s.seedLoading || !s.seedScenario || driverRef.current) return;

    const driver = new ConfrontDriver({
      adapter: opts.adapter,
      appIds: opts.appIds,
      buildingId: opts.buildingId,
      sceneId: opts.sceneId,
      drillId: opts.drillId,
      seed: s.seedScenario,
      events: s.events,
    });
    driverRef.current = driver;

    const startPlanAndSchedule = () => {
      driver.startInitialPlan({
        onPlan: (lines) => {
          addSceneAction({
            action: 'showRoute',
            target: `初步部署:${lines[0] ?? '到场处置'}`,
            params: { kind: 'plan', lines },
            source: '预案引擎',
          });
        },
        onFail: () => {
          showToast('初步部署生成失败，使用默认部署 · 演示数据');
        },
      });

      for (let i = 0; i < s.plannedTotal; i++) {
        driver.scheduleInject(i, {
          onThinking: (v) => setThinking(v),
          onInject: (evt) => {
            const startedAt = confRef.current.startedAt;
            const elapsedSec = startedAt
              ? Math.max(0, Math.round((Date.now() - startedAt) / 1000))
              : 0;
            appendInject({ emergency: evt.emergency, tSec: elapsedSec });
            addSceneAction({
              action: 'highlight',
              target: `特情位置:${evt.location ?? confRef.current.seedScenario?.floor ?? '未知'}`,
              source: '智能体',
            });
            driver.scheduleAdjustment(evt.emergency, {
              onAdjust: (lines) => {
                const nowStart = confRef.current.startedAt;
                const now = nowStart
                  ? Math.max(0, Math.round((Date.now() - nowStart) / 1000))
                  : 0;
                appendAdjust({
                  seq: confRef.current.events.filter((e) => e.kind === 'inject').length,
                  adjustments: lines,
                  tSec: now,
                });
              },
            });
          },
          onInjectFail: () => {
            showToast('特情注入失败，继续对抗 · 演示数据');
          },
        });
      }
    };

    startPlanAndSchedule();

    return () => {
      driver.clearAll();
      driverRef.current = null;
    };
  }, [opts.adapter, opts.appIds.adversary, opts.appIds.planner, opts.buildingId, opts.sceneId, opts.drillId]);

  // status 从 running 转走时清理未完成的 timers
  useEffect(() => {
    if (confRef.current.status !== 'running' && driverRef.current) {
      driverRef.current.clearAll();
      driverRef.current = null;
    }
  }, [confRef.current.status]);
}
