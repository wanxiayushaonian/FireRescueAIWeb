'use client';
// 视频浮窗:点击「播放」后的居中弹窗,16:9 播放区 + 标题/描述。
// 关闭路径三路兜底(×/遮罩/Esc),关闭即卸载 <video> 停止播放与声音(开关双向)。
// 数据源:lib/video-source-config(设置菜单按槽位配置 URL);空源由调用方按钮侧拦截,此处兜底空态。
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Clapperboard, X } from 'lucide-react';
import { VIDEO_SLOTS, getVideoSource, type VideoSlotId } from '@/lib/video-source-config';

export default function VideoPopup({
  slot,
  open,
  onOpenChange,
  srcOverride = '',
}: {
  slot: VideoSlotId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 本地文件方案解析出的 object URL;非空时优先于槽位配置值 */
  srcOverride?: string;
}) {
  const meta = VIDEO_SLOTS.find((s) => s.id === slot);
  // Portal 到 body:外层 DraggablePanel 的 motion transform 会让 fixed 退化为相对面板定位,
  // 浮窗就不在屏幕正中了;挂载门控避免 SSR 阶段触 document。
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="video-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-6"
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            transition={{ duration: 0.25 }}
            className="w-[min(1400px,96vw,calc((100dvh_-_120px)*16/9))] overflow-hidden rounded-lg border border-line bg-bg-panel shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-bg-panel-2/60 px-3">
              <Clapperboard className="h-4 w-4 text-cyan" />
              <span className="text-[15px] font-bold text-text-1">{meta?.title ?? '视频播放'}</span>
              <button
                onClick={() => onOpenChange(false)}
                className="ml-auto rounded p-1 text-text-3 transition hover:bg-white/10 hover:text-text-1"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative aspect-video w-full bg-[#050b14]">
              {meta && <VideoStage slot={meta.id} srcOverride={srcOverride} />}
            </div>
            {meta && (
              <div className="border-t border-line px-3 py-1.5 text-[11px] text-text-3">{meta.description}</div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** 独立播放区:slot 变化或重开时以 key 重挂载,回到初始加载态 */
function VideoStage({ slot, srcOverride }: { slot: VideoSlotId; srcOverride: string }) {
  const src = srcOverride || getVideoSource(slot);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <img src="/empty-box.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
        <div className="text-[13px] text-text-2">未配置该分组视频源</div>
        <div className="text-[12px] text-text-3">请在左下角「设置 → 视频源设置」中配置</div>
      </div>
    );
  }
  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2">
        <img src="/error-radar.svg" alt="" className="h-[90px] w-[120px] opacity-80" />
        <div className="text-[13px] text-text-2">视频加载失败</div>
        <div className="max-w-[85%] text-center text-[12px] leading-5 text-text-3">
          请确认地址可达（http(s) 直链或 /videos/… 站点内路径）；本机磁盘路径浏览器沙箱无法读取。
          本地选择的文件在页面刷新后可能失效，请在设置中重新选择。
        </div>
      </div>
    );
  }
  return (
    <video
      key={src}
      src={src}
      controls
      autoPlay
      playsInline
      onError={() => setFailed(true)}
      className="h-full w-full object-contain"
    />
  );
}
