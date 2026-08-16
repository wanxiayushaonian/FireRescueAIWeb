'use client';

/**
 * 视角书签 + 截图(3D 场景底部居中浮条):
 * - 保存当前机位为命名书签(按场景 id 持久化),点击书签一键平滑切回;
 * - 一键截图(SDK screenShot 优先)下载 PNG。
 */
import { useEffect, useRef, useState } from 'react';
import { Bookmark, Camera, Check, Eraser, Plus, X } from 'lucide-react';
import { useScene } from '@/components/SceneProvider';
import {
  loadSceneViewBookmarks,
  saveSceneViewBookmarks,
  type ViewBookmark,
} from '@/lib/scene-view-bookmarks';

export default function SceneViewBar() {
  const { runtime, sceneId, view } = useScene();
  const [marks, setMarks] = useState<ViewBookmark[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMarks(loadSceneViewBookmarks(sceneId));
  }, [sceneId]);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  if (!runtime || view !== 'ready') return null;

  const saveMark = (): void => {
    const vp = runtime.getCameraViewpoint();
    const label = name.trim() || `机位 ${marks.length + 1}`;
    if (vp) {
      const next = [...marks, { name: label, viewpoint: vp }];
      setMarks(next);
      saveSceneViewBookmarks(sceneId, next);
    }
    setName('');
    setNaming(false);
  };

  const removeMark = (idx: number): void => {
    // 二次确认:删除热区紧邻书签名,防止想点书签时误删
    if (!confirm(`删除书签「${marks[idx]?.name}」?`)) return;
    const next = marks.filter((_, i) => i !== idx);
    setMarks(next);
    saveSceneViewBookmarks(sceneId, next);
  };

  const gotoMark = (m: ViewBookmark): void => {
    void runtime.setCameraViewpoint(m.viewpoint, true).catch(() => {});
  };

  const shoot = async (): Promise<void> => {
    const data = await runtime.screenShot();
    if (!data) return;
    const a = document.createElement('a');
    a.href = data;
    a.download = `场景截图-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
    a.click();
  };

  return (
    <div className="pointer-events-auto absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
      <div className="flex items-center gap-1.5 rounded-full border border-line bg-bg-panel/85 px-2.5 py-1.5 shadow-lg shadow-black/30 backdrop-blur-[8px]">
        <Bookmark className="h-3.5 w-3.5 shrink-0 text-text-3" />
        <div className="flex max-w-[420px] items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {marks.length === 0 && !naming && (
            <span className="px-1 text-[11px] text-text-3">暂存机位,保存当前视角一键回切</span>
          )}
          {marks.map((m, i) => (
            <span
              key={`${m.name}-${i}`}
              className="group flex shrink-0 items-center gap-1 rounded-full border border-line bg-bg-panel-2 px-2 py-0.5"
            >
              <button
                onClick={() => gotoMark(m)}
                className="text-[11px] text-text-2 transition hover:text-cyan"
                title={`切到「${m.name}」`}
              >
                {m.name}
              </button>
              <button
                onClick={() => removeMark(i)}
                className="ml-0.5 shrink-0 text-text-3/40 opacity-0 transition group-hover:opacity-100 hover:text-red"
                title="删除书签(需确认)"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
        {naming ? (
          <span className="flex items-center gap-1 rounded-full border border-cyan/50 bg-cyan/5 px-2 py-0.5">
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveMark();
                if (e.key === 'Escape') {
                  setNaming(false);
                  setName('');
                }
              }}
              placeholder="机位名称"
              className="h-5 w-20 bg-transparent text-[11px] text-text-1 placeholder:text-text-3/60 focus:outline-none"
            />
            <button onClick={saveMark} className="text-cyan transition hover:text-cyan/70" title="保存">
              <Check className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <button
            onClick={() => setNaming(true)}
            className="flex shrink-0 items-center gap-0.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-text-2 transition hover:border-line-glow hover:text-cyan"
            title="把当前视角保存为书签"
          >
            <Plus className="h-3 w-3" />
            保存视角
          </button>
        )}
        <span className="mx-0.5 h-3.5 w-px bg-line" />
        <button
          onClick={() => runtime.clearAllHighlight()}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-text-2 transition hover:text-cyan"
          title="清除场景内全部高亮描边"
        >
          <Eraser className="h-3 w-3" />
          清除高亮
        </button>
        <button
          onClick={() => void shoot()}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-text-2 transition hover:text-cyan"
          title="截图并下载 PNG"
        >
          <Camera className="h-3 w-3" />
          截图
        </button>
      </div>
    </div>
  );
}
