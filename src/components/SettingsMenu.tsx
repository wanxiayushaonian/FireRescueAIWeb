'use client';
// 左下角「设置」入口:挂在 SideNav 底部(折叠按钮之上)。
// Popover 向上弹出(side="top"),自带 Portal → 不受 SideNav overflow-hidden 裁切。
// 当前收纳「渲染性能」设置(从 TopBar 迁移);后续新增设置分区加在本组件 PopoverContent 内。
import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from './ui/popover';
import { useScene } from './SceneProvider';
import type { PerfStats } from '@/lib/soonspace-runtime';

export default function SettingsMenu({ collapsed }: { collapsed: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex h-10 items-center gap-3 rounded-md px-3 text-text-3 transition hover:bg-white/5 hover:text-text-1"
          title="设置"
        >
          <Settings className="h-5 w-5 shrink-0" />
          <span
            className={`whitespace-nowrap text-[13px] transition-opacity duration-200 ${
              collapsed ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
            }`}
          >
            设置
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="z-[100] w-72 p-3"
      >
        <div className="mb-2 flex items-center gap-2 border-b border-line pb-2 text-[12px] text-text-3">
          <Settings className="h-3.5 w-3.5" />
          设置
        </div>
        <PerformanceSettings />
        {/* 后续新增设置分区(如界面/数据/告警阈值等)加在这里 */}
      </PopoverContent>
    </Popover>
  );
}

/** 渲染性能设置区:从 TopBar 迁移。轮询只在 Popover 打开(content 挂载)时跑,更省。 */
function PerformanceSettings() {
  const { runtime, view } = useScene();
  const [perfStats, setPerfStats] = useState<PerfStats | null>(null);

  useEffect(() => {
    if (!runtime || view !== 'ready') return;
    setPerfStats(runtime.getPerfStats());
    const timer = window.setInterval(() => {
      setPerfStats(runtime.getPerfStats());
    }, 500);
    return () => window.clearInterval(timer);
  }, [runtime, view]);

  if (!runtime || view !== 'ready') {
    return <div className="py-4 text-center text-[11px] text-text-3">3D 场景未加载</div>;
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-text-3">渲染优化</div>
      {/* 像素比 */}
      <div>
        <div className="mb-1.5 text-[11px] text-text-3">像素比（填充率优化）</div>
        <div className="flex gap-1">
          {[1, 1.5, 2].map((p) => (
            <button
              key={p}
              onClick={() => {
                runtime.setPixelRatio(p);
                setPerfStats(runtime.getPerfStats());
              }}
              className={`flex-1 rounded border px-2 py-1 text-[11px] transition ${
                perfStats?.pixelRatio === p
                  ? 'border-cyan bg-cyan/10 text-cyan'
                  : 'border-line bg-bg-panel text-text-2 hover:border-line-glow'
              }`}
            >
              {p}x
            </button>
          ))}
        </div>
      </div>
      {/* 阴影 */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-3">阴影（关闭省一半重绘）</span>
        <button
          onClick={() => {
            runtime.setShadows(!perfStats?.shadowOn);
            setPerfStats(runtime.getPerfStats());
          }}
          className={`rounded border px-2 py-1 text-[11px] transition ${
            perfStats?.shadowOn
              ? 'border-green bg-green/10 text-green'
              : 'border-line bg-bg-panel text-text-2 hover:border-line-glow'
          }`}
        >
          {perfStats?.shadowOn ? 'ON' : 'OFF'}
        </button>
      </div>
      {/* SMAA */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-3">SMAA 抗锯齿</span>
        <button
          onClick={() => {
            runtime.setSmaa(!perfStats?.smaaOn);
            setPerfStats(runtime.getPerfStats());
          }}
          className={`rounded border px-2 py-1 text-[11px] transition ${
            perfStats?.smaaOn
              ? 'border-green bg-green/10 text-green'
              : 'border-line bg-bg-panel text-text-2 hover:border-line-glow'
          }`}
        >
          {perfStats?.smaaOn ? 'ON' : 'OFF'}
        </button>
      </div>
      {/* BVH */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-3">BVH 加速拾取</span>
        <button
          onClick={() => {
            void runtime.computeBvh();
            setPerfStats(runtime.getPerfStats());
          }}
          disabled={perfStats?.bvhRunning}
          className={`rounded border px-2 py-1 text-[11px] transition ${
            perfStats?.bvhReady
              ? 'border-green bg-green/10 text-green'
              : perfStats?.bvhRunning
                ? 'border-amber bg-amber/10 text-amber'
                : 'border-line bg-bg-panel text-text-2 hover:border-line-glow'
          }`}
        >
          {perfStats?.bvhRunning ? '计算中…' : perfStats?.bvhReady ? '就绪' : '计算'}
        </button>
      </div>
      {/* 当前统计 */}
      <div className="border-t border-line pt-2 text-[10px] text-text-3">
        <div className="flex justify-between">
          <span>Draw Calls</span>
          <span className="font-num">{perfStats?.drawCalls ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span>三角形</span>
          <span className="font-num">{perfStats?.triangles?.toLocaleString() ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span>网格数</span>
          <span className="font-num">{perfStats?.meshes?.toLocaleString() ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}
