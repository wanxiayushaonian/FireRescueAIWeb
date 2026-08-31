'use client';
// 视频源设置模态:按槽位(预案三分组 + 现场回传)单独配置视频地址,localStorage 持久化。
// 草稿态编辑、显式保存生效;逐槽位清除;保存后经 subscribeVideoSources 通知播放侧即时切换。
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Clapperboard, FolderOpen, RotateCcw, Save } from 'lucide-react';
import {
  VIDEO_SLOTS,
  getVideoSources,
  isLocalFileSource,
  LOCALFILE_PREFIX,
  saveVideoSources,
  type VideoSlotId,
} from '@/lib/video-source-config';
import { pickLocalVideo } from '@/lib/video-local-file';
import { showToast } from './Toast';

export default function VideoSourceSettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<Record<VideoSlotId, string>>(
    () => getVideoSources(),
  );

  // 每次打开时从存储重灌草稿(丢弃上次未保存的编辑)
  useEffect(() => {
    if (open) setDraft(getVideoSources());
  }, [open]);

  const handleSave = () => {
    saveVideoSources(draft);
    showToast('视频源设置已保存');
    onOpenChange(false);
  };

  /** 选择本地文件:写入草稿(localfile:方案),保存后生效 */
  const handlePickLocal = async (slot: VideoSlotId) => {
    const picked = await pickLocalVideo(slot);
    if (!picked) return;
    setDraft((d) => ({ ...d, [slot]: picked.value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,92vw)] border-line bg-bg-panel sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px] text-text-1">
            <Clapperboard className="h-4 w-4 text-cyan" />
            视频源设置
          </DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed text-text-3">
            每个点位可「选择本地文件」直接播放（推荐，刷新后点播放会自动重连授权），或填视频地址：http(s) 直链，或站点内路径（文件放 web/public/videos/ 后填 /videos/xxx.mp4）。留空表示未配置。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {VIDEO_SLOTS.map((slot) => {
            const local = isLocalFileSource(draft[slot.id]);
            return (
              <div key={slot.id} className="rounded-lg border border-line bg-bg-panel-2/40 p-2.5">
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="text-[13px] font-bold text-text-1">{slot.title}</span>
                  <span className="truncate text-[11px] text-text-3" title={slot.description}>{slot.description}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    value={local ? `本地文件：${draft[slot.id].slice(LOCALFILE_PREFIX.length)}` : draft[slot.id]}
                    readOnly={local}
                    onChange={(e) => setDraft((d) => ({ ...d, [slot.id]: e.target.value }))}
                    placeholder="未配置（选本地文件或填 /videos/…、https://…）"
                    title={local ? '本地文件方案；点「清除」可改填地址' : undefined}
                    className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg-panel-2 px-2 text-[12px] text-text-1 placeholder:text-text-3/60 focus:border-line-glow focus:outline-none read-only:text-cyan read-only:opacity-90"
                  />
                  <button
                    onClick={() => void handlePickLocal(slot.id)}
                    title="选择本地视频文件（推荐）"
                    className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-cyan/50 bg-cyan/5 px-2 text-[11px] text-cyan transition hover:bg-cyan/15"
                  >
                    <FolderOpen className="h-3 w-3" />本地文件
                  </button>
                  <button
                    onClick={() => setDraft((d) => ({ ...d, [slot.id]: '' }))}
                    disabled={!draft[slot.id]}
                    title="清空该项"
                    className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-line px-2 text-[11px] text-text-3 transition hover:border-line-glow hover:text-text-1 disabled:opacity-40"
                  >
                    <RotateCcw className="h-3 w-3" />清除
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
          <button
            onClick={() => onOpenChange(false)}
            className="h-8 rounded-md border border-line px-3 text-[12px] text-text-3 transition hover:border-line-glow hover:text-text-1"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="flex h-8 items-center gap-1.5 rounded-md border border-cyan/60 px-3 text-[12px] text-cyan transition hover:bg-cyan/10 hover:shadow-[0_0_10px_rgba(34,211,238,.35)]"
          >
            <Save className="h-3.5 w-3.5" />保存
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
