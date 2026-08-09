'use client';

/**
 * useTimeline — TimelineEngine 的 React hook 包装。
 *
 * 封装 new TimelineEngine + 状态同步(status/clock/speed)+ unmount 自动 stop。
 * 组件通过此 hook 驱动推演时间轴,无需直接管理引擎生命周期。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TimelineEngine,
  type ActiveSpeed,
  type EngineStatus,
  type Speed,
} from '@/lib/drill/timeline-engine';

export interface UseTimelineResult {
  /** 底层引擎实例(高级用法可直接操作)。 */
  engine: TimelineEngine;
  /** 当前状态:idle | running | paused。 */
  status: EngineStatus;
  /** 已经过的 tick 数(演练时钟)。 */
  clock: number;
  /** 当前倍率:0 | 1 | 5。 */
  speed: Speed;
  /** 启动(idle/paused → running,1× 起步)。 */
  start: () => void;
  /** 暂停(running → paused)。 */
  pause: () => void;
  /** 恢复(paused → running,沿用暂停前 speed)。 */
  resume: () => void;
  /** 变速(运行中改变 tick 间隔)。 */
  setSpeed: (speed: ActiveSpeed) => void;
  /** 停止(任意 → idle,clock 清零)。 */
  stop: () => void;
}

export function useTimeline(): UseTimelineResult {
  // 引擎实例贯穿组件生命周期,懒初始化
  const engineRef = useRef<TimelineEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new TimelineEngine();
  }
  const engine = engineRef.current;

  const [status, setStatus] = useState<EngineStatus>('idle');
  const [clock, setClock] = useState<number>(0);
  const [speed, setSpeedState] = useState<Speed>(0);

  // 从引擎同步全量状态到 React(控制方法调用后兜底)
  const syncState = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    setStatus(e.getStatus());
    setClock(e.getClock());
    setSpeedState(e.getSpeed());
  }, []);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    // tick → 更新 clock(实时)
    e.onTick((c) => setClock(c));
    // status/speed 变化 → 同步全量
    e.onStatusChange(() => syncState());
    return () => {
      // unmount:stop 清 interval 防泄漏
      e.stop();
    };
  }, [syncState]);

  const start = useCallback(() => {
    engine.start();
    syncState();
  }, [engine, syncState]);

  const pause = useCallback(() => {
    engine.pause();
    syncState();
  }, [engine, syncState]);

  const resume = useCallback(() => {
    engine.resume();
    syncState();
  }, [engine, syncState]);

  const setSpeed = useCallback(
    (s: ActiveSpeed) => {
      engine.setSpeed(s);
      syncState();
    },
    [engine, syncState],
  );

  const stop = useCallback(() => {
    engine.stop();
    syncState();
  }, [engine, syncState]);

  return {
    engine,
    status,
    clock,
    speed,
    start,
    pause,
    resume,
    setSpeed,
    stop,
  };
}
