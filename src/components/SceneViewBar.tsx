'use client';

/**
 * 视角书签 + 截图(3D 场景底部居中浮条):
 * - 保存当前机位为命名书签(按场景 id 持久化),点击书签一键平滑切回;
 * - 一键截图(SDK screenShot 优先)下载 PNG。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Camera, Check, Eraser, Navigation, Plus, Route as RouteIcon, Truck, X } from 'lucide-react';
import { useScene } from '@/components/SceneProvider';
import {
  loadSceneViewBookmarks,
  saveSceneViewBookmarks,
  type ViewBookmark,
} from '@/lib/scene-view-bookmarks';
import {
  clearSceneRoutes,
  hasDrawnRoute,
  fetchSceneRoutes,
  drawSceneRoute,
  animateTruckAlongRoute,
  getNavPickMode,
  setNavPickMode,
  subscribeNavPick,
  clearNavPickHighlight,
  setCustomNavStart,
  findFireTruckOutId,
  type SceneRouteSummary,
} from '@/lib/scene-navigation';
import { showToast } from '@/components/Toast';

export default function SceneViewBar() {
  const { runtime, sceneId, view, tree, recipeStore } = useScene();
  const [marks, setMarks] = useState<ViewBookmark[]>([]);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  // 场景包自带路线(平台编辑器规划保存) + 下拉开合
  const [sceneRoutes, setSceneRoutes] = useState<SceneRouteSummary[]>([]);
  const [routesOpen, setRoutesOpen] = useState(false);
  // 两点导航拾取模式(off/start/end;信息卡点击拦截拾取)
  const [navMode, setNavMode] = useState(getNavPickMode());
  useEffect(() => subscribeNavPick(() => setNavMode(getNavPickMode())), []);

  useEffect(() => {
    setMarks(loadSceneViewBookmarks(sceneId));
  }, [sceneId]);

  useEffect(() => {
    if (!sceneId || view !== 'ready') return;
    void fetchSceneRoutes(sceneId).then(setSceneRoutes);
  }, [sceneId, view]);

  useEffect(() => {
    if (naming) inputRef.current?.focus();
  }, [naming]);

  // 场景内消防车(平台补的排烟/远程供水车;轻量首个匹配,不建全量索引)
  const truckOutId = useMemo(() => findFireTruckOutId(tree), [tree]);

  if (!runtime || view !== 'ready') return null;

  const toggleSceneRoute = (r: SceneRouteSummary): void => {
    void drawSceneRoute(runtime, sceneId, r.route_id, r.route_name ?? r.route_id).then((msg) => {
      if (msg === 'cleared') showToast(`已隐藏路线「${r.route_name ?? r.route_id}」`);
      else if (msg) showToast(msg);
      else showToast(`已显示路线「${r.route_name ?? r.route_id}」`);
    });
  };

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
          onClick={() => {
            const had = hasDrawnRoute();
            clearSceneRoutes(runtime);
            setCustomNavStart(null); // 导航状态一并复位(自定义起点)
            showToast(had ? '已清除导航路线与自定义起点' : '已清除自定义起点');
          }}
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-text-2 transition hover:text-cyan"
          title="清除进攻路线等场内导航路线,并取消自定义导航起点"
        >
          <RouteIcon className="h-3 w-3" />
          清除路线
        </button>
        {sceneRoutes.length > 0 && (
          <div className="relative shrink-0">
            <button
              onClick={() => setRoutesOpen((v) => !v)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition ${routesOpen ? 'text-cyan' : 'text-text-2 hover:text-cyan'}`}
              title="场景包自带路线(平台规划保存);点击显示/隐藏"
            >
              <RouteIcon className="h-3 w-3" />
              场景路线 {sceneRoutes.length}
            </button>
            {routesOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-2 w-44 rounded-lg border border-line bg-bg-panel/95 p-1 shadow-xl backdrop-blur-[8px]">
                {sceneRoutes.map((r) => (
                  <button
                    key={r.route_id}
                    onClick={() => toggleSceneRoute(r)}
                    className="block w-full truncate rounded px-2 py-1.5 text-left text-[11px] text-text-2 transition hover:bg-bg-panel-2 hover:text-cyan"
                  >
                    {r.route_name || r.route_id}
                  </button>
                ))}
                <div className="px-2 pb-1 pt-0.5 text-[9px] text-text-3/60">点击显示 / 再点隐藏</div>
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => {
            const next = navMode === 'off' ? 'start' : 'off';
            setNavPickMode(next);
            if (next === 'off') {
              clearNavPickHighlight(runtime);
            } else {
              // 联动:开启两点导航自动切平面图(2D)——打点走 2D 语义点击通道,
              // 与 SDK 连通性/打点交互同体验;退出时不强制切回,用户可自选视图
              recipeStore?.patchStructural({ mode: '2D' });
            }
          }}
          className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition ${
            navMode !== 'off' ? 'bg-orange/15 text-orange' : 'text-text-2 hover:text-cyan'
          }`}
          title="两点导航:开启后自动切平面图,先点起点再点终点,按空间连通生成路径(Esc 退出)"
        >
          <Navigation className="h-3 w-3" />
          {navMode === 'off' ? '两点导航' : navMode === 'start' ? '两点导航 · 点起点' : '两点导航 · 点终点'}
        </button>
        {truckOutId && (
          <button
            onClick={() => {
              const err = animateTruckAlongRoute(runtime, truckOutId);
              showToast(err ?? '消防车开始沿最近显示的路线行进');
            }}
            className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-text-2 transition hover:text-cyan"
            title="消防车沿最近显示的场景路线移动(可重复播放)"
          >
            <Truck className="h-3 w-3" />
            车辆巡线
          </button>
        )}
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
