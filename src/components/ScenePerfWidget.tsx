'use client';

import { useEffect, useState } from 'react';
import { useScene } from '@/components/SceneProvider';

const HISTORY = 48; // 火花线样本数
const WIN = 60; // 帧耗时滑动窗口(约 1s @60fps)

/**
 * 3D 场景帧率监控浮窗(左下角)。
 * fps/帧耗时/最差帧:由 rAF 间隔测(rAF 每帧触发,单层流畅能正确显示高 fps)。
 * 空闲判断:读 runtime.getPerfStats().idle(soonspacejs postRender 信号,>1s 无回调=没在渲染),
 *           避免 rAF 在不渲染时空转显示虚高 60fps。
 * 最差帧用窗口最大值(不做 EMA 平滑),卡顿尖峰不被掩盖。
 */
export default function ScenePerfWidget() {
  const { runtime, view } = useScene();
  const [fps, setFps] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  const [worstMs, setWorstMs] = useState(0);
  const [idle, setIdle] = useState(true);
  const [history, setHistory] = useState<number[]>([]);
  const [stats, setStats] = useState<{ drawCalls: number; meshes: number; pixelRatio: number } | null>(null);

  // rAF 测帧率/帧耗时/最差帧(每帧采,250ms 提交一次)
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastCommit = 0;
    const win: number[] = [];
    const loop = (now: number): void => {
      const dt = now - last;
      last = now;
      if (dt > 0 && dt < 500) {
        win.push(dt);
        if (win.length > WIN) win.shift();
      }
      if (now - lastCommit >= 250) {
        lastCommit = now;
        const mean = win.length > 0 ? win.reduce((a, b) => a + b, 0) / win.length : 0;
        const f = mean > 0 ? 1000 / mean : 0;
        setFps(Math.round(f));
        setFrameMs(win.length > 0 ? win[win.length - 1] : 0);
        setWorstMs(win.length > 0 ? Math.max(...win) : 0);
        setHistory((h) => [...h.slice(-(HISTORY - 1)), Math.round(f)]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 空闲信号 + 渲染统计:读 runtime(postRender 判断是否在渲染)
  useEffect(() => {
    if (!runtime) return;
    const timer = window.setInterval(() => {
      try {
        const s = runtime.getPerfStats();
        setIdle(s.idle);
        setStats({ drawCalls: s.drawCalls, meshes: s.meshes, pixelRatio: s.pixelRatio });
      } catch {
        /* runtime 未就绪时忽略 */
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [runtime]);

  if (view !== 'ready') return null;

  const tone = idle
    ? { text: 'text-text-3', dot: 'bg-text-3', label: '空闲', bar: 'rgba(148,163,184,0.3)' }
    : fps > 50 ? { text: 'text-green', dot: 'bg-green', label: '流畅', bar: 'rgba(74,222,128,0.55)' }
    : fps > 30 ? { text: 'text-amber', dot: 'bg-amber', label: '一般', bar: 'rgba(251,191,36,0.6)' }
    : { text: 'text-red', dot: 'bg-red', label: '卡顿', bar: 'rgba(248,113,113,0.6)' };
  const worstBad = worstMs > 100;
  const padded = [...Array(HISTORY - history.length).fill(0), ...history];

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-20 w-[176px] select-none rounded-lg border border-line bg-bg-panel/85 p-2.5 shadow-lg shadow-black/30 backdrop-blur-[8px]">
      {/* 顶行:状态点 + 标题 + 分档 */}
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${idle ? '' : 'animate-pulse'}`} />
        <span className="text-[10px] tracking-[0.15em] text-text-3">帧率</span>
        <span className="ml-auto rounded border border-line/60 bg-white/5 px-1.5 py-px text-[10px] leading-4 text-text-2">
          {tone.label}
        </span>
      </div>

      {/* 大数字:idle 显示"空闲" */}
      <div className="mt-0.5 flex items-baseline gap-1">
        {idle ? (
          <span className="font-num text-[24px] font-semibold leading-none text-text-3">空闲</span>
        ) : (
          <>
            <span className={`font-num text-[28px] font-semibold leading-none tabular-nums ${tone.text}`}>{fps}</span>
            <span className="font-num text-[11px] text-text-3">FPS</span>
          </>
        )}
      </div>

      {/* 帧耗时 + 最差帧 */}
      <div className="mt-0.5 flex items-center gap-3 text-[10px] text-text-3">
        <span>帧 <span className="font-num text-text-2">{idle ? '—' : `${frameMs.toFixed(0)}ms`}</span></span>
        <span>最差 <span className={`font-num ${worstBad ? 'text-red' : 'text-text-2'}`}>{worstMs > 0 ? `${worstMs.toFixed(0)}ms` : '—'}</span></span>
      </div>

      {/* 火花线 */}
      <div className="mt-2 flex h-6 items-end gap-[2px]">
        {padded.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-[1px] transition-[height] duration-300"
            style={{
              height: v > 0 ? `${Math.max(10, Math.min(100, (v / 60) * 100))}%` : '8%',
              backgroundColor: v > 0 ? (v > 50 ? 'rgba(74,222,128,0.55)' : v > 30 ? 'rgba(251,191,36,0.6)' : 'rgba(248,113,113,0.6)') : 'rgba(148,163,184,0.18)',
            }}
          />
        ))}
      </div>

      {/* 渲染统计三格 */}
      <div className="mt-2 grid grid-cols-3 gap-1 border-t border-line/50 pt-1.5 text-center">
        <div>
          <div className="font-num text-[11px] leading-4 text-text-1">{stats ? formatK(stats.drawCalls) : '--'}</div>
          <div className="text-[9px] leading-3 text-text-3">绘制调用</div>
        </div>
        <div>
          <div className="font-num text-[11px] leading-4 text-text-1">{stats ? formatW(stats.meshes) : '--'}</div>
          <div className="text-[9px] leading-3 text-text-3">网格</div>
        </div>
        <div>
          <div className="font-num text-[11px] leading-4 text-text-1">{stats ? stats.pixelRatio.toFixed(2) : '--'}</div>
          <div className="text-[9px] leading-3 text-text-3">像素比</div>
        </div>
      </div>
    </div>
  );
}

function formatK(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
function formatW(n: number): string {
  return n >= 10000 ? `${(n / 10000).toFixed(1)}w` : String(n);
}
