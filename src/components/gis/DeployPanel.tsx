'use client';
// 多站派遣路线面板:圆环菜单「派遣」唤出,锚定目标上方。多选消防站 → 规划到场路线。
// dumb 组件:选站触发 onPlan,规划结果 planned 由父填。AI 派遣占位(待 MCP 工具接入)。
import { useEffect, useRef, useState } from 'react';
import { useWheelGuard } from './hooks/use-wheel-guard';
import { X, Truck, Rocket, Bot, Loader2, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import type { Station } from '@/mock/types';

export interface DeployStation extends Station {
  distKm: number; // 到目标直线距离(GCJ02 统一坐标系后算,已排序)
}

export interface PlannedRoute {
  stationId: string;
  stationName: string;
  distance: number; // 米
  duration: number; // 秒
  trafficLights: number;
}

interface Props {
  targetName: string;
  stations: DeployStation[];
  planned: PlannedRoute[] | null;
  planning: boolean;
  anchor: { x: number; y: number; maxX: number };
  emptyHint?: string; // 小眼睛关闭/周边无常规主力站时的空态文案
  onPlan: (stationIds: string[]) => void;
  onClear: () => void;
  onClose: () => void;
}

const fmtDur = (s: number) => (s >= 60 ? `${Math.round(s / 60)} 分钟` : `${s} 秒`);

export default function DeployPanel({ targetName, stations, planned, planning, anchor, emptyHint, onPlan, onClear, onClose }: Props) {
  // 阻止滚轮冒泡到 Leaflet 地图(否则缩放地图而非滚动面板列表)
  const rootRef = useRef<HTMLDivElement>(null);
  useWheelGuard(rootRef);

  // 默认勾选最近 3 个
  const [selected, setSelected] = useState<Set<string>>(() => new Set(stations.slice(0, 3).map((s) => s.id)));

  useEffect(() => {
    setSelected(new Set(stations.slice(0, 3).map((s) => s.id)));
  }, [stations]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const fastestDuration = planned && planned.length ? Math.min(...planned.map((p) => p.duration)) : 0;

  const [collapsed, setCollapsed] = useState(false);
  // 规划完成(有路线)→ 自动折叠成小条,避免遮挡地图;改选站/重规划会再次触发
  useEffect(() => {
    if (planned && planned.length) setCollapsed(true);
  }, [planned]);

  return (
    <div
      ref={rootRef}
      className="absolute z-[600]"
      style={{
        left: Math.min(Math.max(anchor.x, 180), Math.max(anchor.maxX - 180, 180)),
        top: Math.max(anchor.y - 48, 8),
        transform: 'translate(-50%, -100%)',
      }}
    >
      {collapsed ? (
        <div className="flex w-[300px] items-center gap-2 rounded-full border border-cyan/40 bg-bg-panel/95 px-3 py-1.5 shadow-lg backdrop-blur">
          <Rocket className="h-3.5 w-3.5 shrink-0 text-cyan" />
          <span className="truncate text-[12px] font-bold text-text-1">派遣 · {targetName}</span>
          {planning ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan" />
          ) : (
            planned && planned.length > 0 && (
              <span className="shrink-0 text-[11px] text-cyan">
                {planned.length} 条 · 最快 {fmtDur(fastestDuration)}
              </span>
            )
          )}
          <button
            onClick={() => setCollapsed(false)}
            className="ml-auto shrink-0 rounded p-0.5 text-text-3 hover:text-text-1"
            title="展开"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="shrink-0 rounded p-0.5 text-text-3 hover:bg-white/10 hover:text-text-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
      <div className="w-[340px] overflow-hidden rounded-lg border border-cyan/40 bg-bg-panel/95 shadow-xl backdrop-blur">
        {/* 头部 */}
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <Rocket className="h-4 w-4 shrink-0 text-cyan" />
          <span className="truncate text-[13px] font-bold text-text-1">派遣 · {targetName}</span>
          <button
            onClick={() => setCollapsed(true)}
            disabled={!planned || planned.length === 0}
            className="ml-auto shrink-0 rounded p-0.5 text-text-3 transition hover:bg-white/10 hover:text-text-1 disabled:opacity-40"
            title={planned && planned.length ? '折叠' : '规划路线后方可折叠'}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="shrink-0 rounded p-0.5 text-text-3 hover:bg-white/10 hover:text-text-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* 站列表(多选,带直线距离)*/}
        <div className="max-h-[200px] overflow-y-auto">
          {emptyHint || stations.length === 0 ? (
            <div className="px-3 py-4 text-center text-[12px] text-text-3">{emptyHint ?? '周边无可派遣消防站'}</div>
          ) : (
            stations.map((s) => {
              const checked = selected.has(s.id);
              return (
                <label key={s.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-white/5">
                  <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} className="accent-cyan" />
                  <Truck className="h-3 w-3 shrink-0 text-text-3" />
                  <span className="min-w-0 flex-1 truncate text-text-1">{s.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-text-3">{s.distKm.toFixed(1)}km</span>
                </label>
              );
            })
          )}
        </div>
        {/* 操作 */}
        <div className="flex gap-1.5 border-t border-line px-2 py-2">
          <button
            onClick={() => onPlan([...selected])}
            disabled={selected.size === 0 || planning}
            className="flex flex-1 items-center justify-center gap-1 rounded border border-cyan/60 bg-cyan/15 px-2 py-1 text-[12px] text-cyan transition hover:bg-cyan/25 disabled:opacity-50"
          >
            {planning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
            规划到场路线({selected.size})
          </button>
          <button
            disabled
            title="待 MCP 工具接入(agent 智能派遣)"
            className="flex items-center justify-center gap-1 rounded border border-line px-2 py-1 text-[12px] text-text-3 opacity-60"
          >
            <Bot className="h-3.5 w-3.5" /> AI
          </button>
        </div>
        {/* 路线摘要 */}
        {planned && planned.length > 0 && (
          <div className="border-t border-line px-3 py-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wide text-text-3">路线摘要</span>
              <button onClick={onClear} className="text-[11px] text-text-3 hover:text-text-1">清除路线</button>
            </div>
            <ul className="space-y-1">
              {planned.map((p) => {
                const fast = p.duration === fastestDuration;
                return (
                  <li key={p.stationId} className="flex items-center gap-2 text-[12px]">
                    <span className={`min-w-0 flex-1 truncate ${fast ? 'text-cyan' : 'text-text-1'}`}>{p.stationName}</span>
                    <span className="shrink-0 text-text-3">
                      {(p.distance / 1000).toFixed(1)}km · {fmtDur(p.duration)}
                    </span>
                    {fast && <Zap className="h-3 w-3 shrink-0 text-cyan" />}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
