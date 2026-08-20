// 对抗舱 driver hook:订阅 store 并在 running + seedReady 时启动注入/调整调度。
// 特情节奏为串行链:上一条特情落定(成功/失败)后 15-25s 再注入下一条 ——
// 一次性并行调度会让 plannedTotal 条特情挤在同一时间窗内爆发(一波流)。
import { useEffect, useRef } from 'react';
import { ConfrontDriver, type ConfrontAppIds } from './confront-driver';
import { ConfrontAdapter } from './confront-adapter';
import {
  appendAdjust,
  appendInject,
  getConfrontationState,
  setDeployLines,
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
  /** 特情注入时的 3D 联动(Panel 提供:location 楼层聚焦 + 飞向;缺省无联动)。 */
  readonly onInjectScene?: (evt: { emergency: string; location?: string }) => void;
}

/** 上一条特情到下一条的间隔(ms,与原型节奏一致)。 */
const INJECT_CHAIN_GAP_MS = () => 15000 + Math.random() * 10000;

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

    const elapsedNow = (): number => {
      const startedAt = confRef.current.startedAt;
      return startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
    };

    const startPlanAndSchedule = () => {
      driver.startInitialPlan({
        onPlan: (lines) => {
          // 真实部署进卡流(初步部署卡优先显示;agent 未回时 UI 回落静态摘要)
          setDeployLines(lines);
          addSceneAction({
            action: 'showRoute',
            target: `初步部署:${lines[0] ?? '到场处置'}`,
            params: { kind: 'plan', lines },
            source: '预案引擎',
          });
        },
        onFail: () => {
          showToast('初步部署生成失败，使用默认部署');
        },
      });

      // 串行注入链:round N 落定(注入成功/失败)后 15-25s 排 round N+1
      const runInjectRound = (round: number): void => {
        if (round >= s.plannedTotal) return;
        const scheduleNext = (): void => driver.after(INJECT_CHAIN_GAP_MS(), () => runInjectRound(round + 1));
        driver.scheduleInject(round, {
          onThinking: (v) => setThinking(v),
          onInject: (evt) => {
            appendInject({ emergency: evt.emergency, tSec: elapsedNow() });
            // 3D 联动:特情楼层聚焦 + 飞向(场景日志同步记录;此前中文 target 的
            // highlight 动作会被执行器按"非 id"跳过,属空转)
            addSceneAction({
              action: 'highlight',
              target: `特情位置:${evt.location ?? confRef.current.seedScenario?.floor ?? '未知'}`,
              source: '智能体',
            });
            opts.onInjectScene?.(evt);
            driver.scheduleAdjustment(evt.emergency, {
              onAdjust: (lines) => {
                appendAdjust({
                  seq: confRef.current.events.filter((e) => e.kind === 'inject').length,
                  adjustments: lines,
                  tSec: elapsedNow(),
                });
              },
            });
            scheduleNext();
          },
          onInjectFail: () => {
            showToast('特情注入失败，继续对抗');
            scheduleNext();
          },
        });
      };
      runInjectRound(0);
    };

    startPlanAndSchedule();

    return () => {
      driver.clearAll();
      driverRef.current = null;
    };
  }, [opts.adapter, opts.appIds.adversary, opts.appIds.planner, opts.buildingId, opts.sceneId, opts.drillId, opts.onInjectScene]);

  // status 从 running 转走时清理未完成的 timers
  useEffect(() => {
    if (confRef.current.status !== 'running' && driverRef.current) {
      driverRef.current.clearAll();
      driverRef.current = null;
    }
  }, [confRef.current.status]);
}
