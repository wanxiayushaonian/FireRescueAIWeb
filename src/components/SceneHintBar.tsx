'use client';

/**
 * 首次使用提示条(3D 场景顶部居中,搜索面板下方):
 * 提示双击聚焦/搜索定位/机位书签/快捷键的可发现性;关闭后持久化,换场景不再出现。
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useScene } from '@/components/SceneProvider';

const DISMISS_KEY = 'firerescue:hint-bar-dismissed';

export default function SceneHintBar() {
  const { view } = useScene();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (view !== 'ready' || dismissed) return null;

  const close = (): void => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* 隐私模式:仅本次会话关闭 */
    }
  };

  return (
    <div className="pointer-events-auto absolute left-1/2 top-14 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-bg-panel/85 px-3 py-1.5 text-[11px] text-text-2 shadow-lg shadow-black/30 backdrop-blur-[8px]">
      <span>
        <b className="text-cyan">双击</b>楼层聚焦 · 顶部<span className="text-cyan">搜索</span>定位设备 · 底部保存<span className="text-cyan">机位</span> · 快捷键 <b className="text-cyan">1/2/3</b> 切层级
      </span>
      <button
        onClick={close}
        className="rounded p-0.5 text-text-3 transition hover:bg-white/10 hover:text-text-1"
        title="不再提示"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
