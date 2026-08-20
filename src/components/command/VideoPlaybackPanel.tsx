// 现场视频回传面板（command.md：平台能力 FLV/HLS 视频弹窗，演示点）
// mock 播放器：LIVE 红点脉冲 + 16:9 深色画面占位（网格/扫光/噪点/时间码走动）+ 三态演示。
// 生产环境由平台内置播放器接管（FLV/HLS 接入区），本组件仅演示交互与状态。
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Video, Play, ChevronDown } from 'lucide-react';
import DraggablePanel from '@/components/DraggablePanel';
import DemoTag from '@/components/DemoTag';
import type { FetchState } from '@/mock/types';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function VideoPlaybackPanel({
  open,
  onOpenChange,
  sourceName = '未选择警情现场',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceName?: string;
}) {
  const [state, setState] = useState<FetchState>('ok');
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [elapsed, setElapsed] = useState(0);
  const loadTimer = useRef<number | null>(null);

  // 打开时模拟 800ms 加载（骨架）
  useEffect(() => {
    if (!open) return;
    setElapsed(0);
    if (demoState === 'ok') {
      setState('loading');
      loadTimer.current = window.setTimeout(() => setState('ok'), 800);
    } else {
      setState(demoState);
    }
    return () => {
      if (loadTimer.current != null) window.clearTimeout(loadTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 播放时间码走动（1s 步进，演示用）
  useEffect(() => {
    if (!open || state !== 'ok') return;
    const t = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(t);
  }, [open, state]);

  const applyDemo = (s: FetchState) => {
    setDemoState(s);
    if (s === 'ok') {
      setState('loading');
      loadTimer.current = window.setTimeout(() => setState('ok'), 800);
    } else {
      setState(s);
    }
  };

  const retry = () => {
    setState('loading');
    loadTimer.current = window.setTimeout(() => {
      setState('ok');
      setDemoState('ok');
      setElapsed(0);
    }, 800);
  };

  return (
    <DraggablePanel
      panelId="command-video"
      title="现场视频回传"
      icon={Video}
      width={560}
      dock="left"
      defaultPos={{ x: 420, y: 120 }}
      height="auto"
      open={open}
      onOpenChange={onOpenChange}
      headerExtra={
        <span className="flex items-center gap-1.5 rounded-full border border-red/60 bg-red/10 px-2 py-0.5 text-[11px] text-red">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red" />
          LIVE
        </span>
      }
    >
      <div className="flex flex-col">
        {/* 视频源名称行 */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          <span className="truncate text-[13px] font-medium text-text-1" title={sourceName}>
            {sourceName} · 消控室监控 01
          </span>
          <DemoTag className="ml-auto shrink-0" />
          <div className="relative shrink-0">
            <select
              value={demoState}
              onChange={(e) => applyDemo(e.target.value as FetchState)}
              title="状态演示"
              className="h-7 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-6 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
            >
              {STATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>状态演示：{o.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-text-3" />
          </div>
        </div>

        {/* 画面区 16:9 */}
        <div className="relative aspect-video w-full overflow-hidden bg-[#050b14]">
          {state === 'loading' ? (
            /* 加载中：骨架 */
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-bg-panel-2" />
              <div className="h-3 w-40 animate-pulse rounded bg-bg-panel-2" />
              <div className="text-[12px] text-text-3">正在建立视频通道…</div>
            </div>
          ) : state === 'empty' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
              <div className="text-[13px] text-text-2">该现场暂无视频源接入</div>
            </div>
          ) : state === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <img src="/error-radar.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
              <div className="text-[13px] text-text-2">视频流连接失败，请重试</div>
              <button
                onClick={retry}
                className="rounded-md border border-cyan/50 px-4 py-1.5 text-[13px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_8px_rgba(34,211,238,.3)]"
              >
                重试
              </button>
            </div>
          ) : (
            <>
              {/* 网格底纹 */}
              <svg className="absolute inset-0 h-full w-full opacity-40">
                <defs>
                  <pattern id="video-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M40 0 H0 V40" fill="none" stroke="#12283c" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#video-grid)" />
              </svg>
              {/* 缓慢扫光 */}
              <motion.div
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-cyan/10 to-transparent"
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'linear' }}
              />
              {/* 噪点闪动 */}
              <motion.div
                className="absolute inset-0 bg-white/[0.02]"
                animate={{ opacity: [0.2, 0.6, 0.3, 0.7, 0.2] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
              {/* 中央 Play */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan/60 bg-bg-deep/60 shadow-[0_0_16px_rgba(34,211,238,.25)]">
                  <Play className="ml-0.5 h-6 w-6 text-cyan" />
                </div>
              </div>
              {/* 底部 mock 播放条 + 时间码 */}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-bg-deep/90 to-transparent px-3 pb-2 pt-6">
                <div className="h-1 w-full overflow-hidden rounded-full bg-bg-panel-2">
                  <motion.div
                    className="h-full rounded-full bg-cyan shadow-[0_0_6px_rgba(34,211,238,.6)]"
                    animate={{ width: `${((elapsed % 120) / 120) * 100}%` }}
                    transition={{ duration: 0.5, ease: 'linear' }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] text-text-3">
                  <span className="text-cyan">{formatTime(elapsed)}</span>
                  <span>1080P · FLV</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 底部状态行 */}
        <div className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-1.5 text-[11px] text-text-3">
          <Video className="h-3 w-3" />
          平台内置播放器 · FLV/HLS 接入区
        </div>
      </div>
    </DraggablePanel>
  );
}
