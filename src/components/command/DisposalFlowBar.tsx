'use client';
import { Crosshair, Play, Square } from 'lucide-react';
import { STAGE_ORDER } from '@/lib/command-flow/stages';
import type { FlowStage } from '@/lib/command-flow/types';

export default function DisposalFlowBar(props: {
  demoActive: boolean;
  stage: FlowStage | null;
  following: boolean;
  /** 地图未就绪 / 真实模式时禁用开始。 */
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
}) {
  const idx = props.stage ? STAGE_ORDER.indexOf(props.stage) : -1;
  return (
    <div className="pointer-events-auto flex items-center gap-2">
      {!props.demoActive ? (
        <button
          onClick={props.onStart}
          disabled={props.disabled}
          title={props.disabled ? '地图未就绪或真实模式' : '一键演示：接警→出动→到场→控制→熄灭'}
          className="flex items-center gap-1.5 rounded px-3 py-1 text-[12px] font-medium text-cyan transition hover:bg-cyan/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" />
          一键新警情演示
        </button>
      ) : (
        <>
          <button
            onClick={props.onStop}
            title="中止演示"
            className="rounded p-1 text-text-3 transition hover:bg-red/10 hover:text-red"
          >
            <Square className="h-3 w-3" />
          </button>
          <div className="flex items-center gap-1">
            {STAGE_ORDER.map((s, i) => (
              <span
                key={s}
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  i === idx ? 'bg-cyan/15 font-medium text-cyan' : i < idx ? 'text-text-3' : 'text-text-3/40'
                }`}
              >
                {s}
              </span>
            ))}
          </div>
          {props.following && (
            <span className="flex items-center gap-1 rounded bg-cyan/10 px-2 py-0.5 text-[11px] text-cyan">
              <Crosshair className="h-3 w-3" />
              跟随中 · 空白/Esc 退出
            </span>
          )}
        </>
      )}
    </div>
  );
}
