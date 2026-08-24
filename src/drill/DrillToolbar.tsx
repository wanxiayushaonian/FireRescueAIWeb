'use client';

/**
 * DrillToolbar — 演练大屏顶部控制条。
 *
 * 按钮 visible 随 status 切换:idle(启动) | running(暂停/变速/停止) | paused(恢复/停止)。
 * clock 显示 T+{clock};speed 高亮当前倍率。
 */
import { Play, Pause, FastForward, Square, Gauge } from 'lucide-react';

/** 引擎状态（原 lib/drill/timeline-engine，2026-08-24 引擎删除后内联——工具条仍在用）。 */
export type EngineStatus = 'idle' | 'running' | 'paused';

/** 倍率：0=idle | 1=1× | 5=5× */
export type Speed = 0 | 1 | 5;

/** 可主动设置的倍率（不含 idle 的 0）。 */
export type ActiveSpeed = 1 | 5;

/** 剧本选项(最小信息,Toolbar 不依赖 domain 类型)。 */
export interface ScenarioOption {
  readonly id: string;
  readonly name: string;
}

export interface DrillToolbarProps {
  readonly status: EngineStatus;
  readonly speed: Speed;
  readonly clock: number;
  /** 可选剧本列表(listScenarios() 驱动)。 */
  readonly scenarios: readonly ScenarioOption[];
  /** 当前选中剧本 id。 */
  readonly selectedScenarioId: string;
  /** 切换剧本(idle 时可调;running/paused 时选择器禁用)。 */
  readonly onSelectScenario: (id: string) => void;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onSetSpeed: (s: ActiveSpeed) => void;
  readonly onStop: () => void;
}

/** 按钮基础样式(复用现有 border-line/bg-bg-panel 类)。 */
const BTN_BASE =
  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
const BTN_CYAN = `${BTN_BASE} border-cyan/40 bg-cyan/10 text-cyan hover:bg-cyan/20`;
const BTN_NEUTRAL = `${BTN_BASE} border-line bg-bg-panel text-text-2 hover:border-line-glow hover:text-text-1`;
const BTN_DANGER = `${BTN_BASE} border-red/40 bg-red/10 text-red hover:bg-red/20`;

export function DrillToolbar({
  status,
  speed,
  clock,
  scenarios,
  selectedScenarioId,
  onSelectScenario,
  onStart,
  onPause,
  onResume,
  onSetSpeed,
  onStop,
}: DrillToolbarProps) {
  const isIdle = status === 'idle';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';

  // 当前剧本展示名(非 idle 时 select 禁用,用 span 显示);找不到时显式标错
  const selectedName =
    scenarios.find((s) => s.id === selectedScenarioId)?.name ?? '(未知剧本)';

  return (
    <div className="flex items-center gap-3 border-b border-line bg-bg-panel/80 px-4 py-2.5 backdrop-blur-sm">
      {/* 标题 + 剧本选择 */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold text-text-1">演练对抗</span>
        <span className="text-text-3">·</span>
        {isIdle ? (
          <select
            value={selectedScenarioId}
            onChange={(e) => onSelectScenario(e.target.value)}
            className="rounded border border-line bg-bg-deep px-2 py-0.5 text-xs text-text-2 outline-none transition hover:border-line-glow focus:border-cyan"
            aria-label="选择演练剧本"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span
            className="cursor-not-allowed rounded border border-line bg-bg-deep px-2 py-0.5 text-xs text-text-2"
            title="演练进行中,不可切换剧本"
          >
            {selectedName}
          </span>
        )}
      </div>

      <div className="h-5 w-px bg-line" />

      {/* 控制按钮 */}
      {isIdle ? (
        <button type="button" className={BTN_CYAN} onClick={onStart}>
          <Play className="h-3.5 w-3.5" />
          启动
        </button>
      ) : null}

      {isRunning ? (
        <button type="button" className={BTN_NEUTRAL} onClick={onPause}>
          <Pause className="h-3.5 w-3.5" />
          暂停
        </button>
      ) : null}

      {isPaused ? (
        <button type="button" className={BTN_CYAN} onClick={onResume}>
          <Play className="h-3.5 w-3.5" />
          恢复
        </button>
      ) : null}

      {/* 变速(仅 running/paused 时可用) */}
      {!isIdle ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={
              speed === 1
                ? `${BTN_CYAN} pointer-events-none`
                : BTN_NEUTRAL
            }
            onClick={() => onSetSpeed(1)}
            title="1× 常速"
          >
            <Gauge className="h-3.5 w-3.5" />
            1×
          </button>
          <button
            type="button"
            className={
              speed === 5
                ? `${BTN_CYAN} pointer-events-none`
                : BTN_NEUTRAL
            }
            onClick={() => onSetSpeed(5)}
            title="5× 加速"
          >
            <FastForward className="h-3.5 w-3.5" />
            5×
          </button>
        </div>
      ) : null}

      {!isIdle ? (
        <button type="button" className={BTN_DANGER} onClick={onStop}>
          <Square className="h-3.5 w-3.5" />
          停止
        </button>
      ) : null}

      {/* clock + status(右侧) */}
      <div className="ml-auto flex items-center gap-3">
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
            isRunning
              ? 'bg-green/10 text-green'
              : isPaused
                ? 'bg-amber/10 text-amber'
                : 'bg-text-3/10 text-text-3'
          }`}
        >
          {isRunning ? '运行中' : isPaused ? '已暂停' : '未开始'}
        </span>
        <span className="font-mono text-base font-bold text-cyan">
          T+{clock}
        </span>
      </div>
    </div>
  );
}

export default DrillToolbar;
