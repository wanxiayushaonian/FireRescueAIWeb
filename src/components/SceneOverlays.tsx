import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import type { SceneAction, SceneState } from '@/mock/sceneLog';
import { subscribeSceneLog, clearSceneLog } from '@/mock/sceneLog';
import DemoTag from './DemoTag';
import { useScene } from './SceneProvider';

const ACTION_COLORS: Record<SceneAction['action'], string> = {
  flyTo: 'text-cyan',
  highlight: 'text-amber',
  batchHighlight: 'text-amber',
  switchFloor: 'text-blue',
  showRoute: 'text-green',
  hideRoute: 'text-text-3',
  addMarker: 'text-cyan',
  removeMarker: 'text-text-3',
  resetView: 'text-violet',
  drawZone: 'text-orange',
  drawRoute: 'text-cyan',
  clearTactical: 'text-text-3',
  updatePlan: 'text-green',
  updateCoord: 'text-amber',
  editEntity: 'text-amber',
};

const SOURCE_STYLES: Record<SceneAction['source'], string> = {
  面板: 'border-cyan/50 text-cyan',
  智能体: 'border-violet/50 text-violet',
  预案引擎: 'border-green/50 text-green',
};

/** FPS 迷你显示 hook */
function useFpsMini(): { fps: number; frameMs: number } {
  const [fps, setFps] = useState(0);
  const [frameMs, setFrameMs] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frameWindow: number[] = [];
    const loop = (now: number): void => {
      const delta = now - last;
      last = now;
      if (delta > 0 && delta < 500) {
        frameWindow.push(delta);
        if (frameWindow.length > 30) frameWindow.shift();
        const avg = frameWindow.reduce((a, b) => a + b, 0) / frameWindow.length;
        setFps(avg > 0 ? 1000 / avg : 0);
        setFrameMs(avg);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return { fps, frameMs };
}

/** 右上：场景信息小卡（自订阅场景状态 + FPS 迷你显示） */
export function SceneInfoCard() {
  const [scene, setScene] = useState<SceneState>({ view: '园区俯瞰', floor: '全部楼层', center: '118.7968, 32.0603' });
  const { view } = useScene();
  const { fps, frameMs } = useFpsMini();

  useEffect(() => subscribeSceneLog((_l, _latest, state) => setScene({ ...state })), []);

  const floorFlashKey = `${scene.floor}-${scene.center}`;
  const fpsColor = fps > 50 ? 'text-green' : fps > 30 ? 'text-amber' : 'text-red';
  const fpsDot = fps > 50 ? 'bg-green' : fps > 30 ? 'bg-amber' : 'bg-red';

  return (
    <div className="absolute left-1/2 top-4 z-20 w-[260px] -translate-x-1/2 rounded-lg border border-line bg-bg-panel/90 p-3 backdrop-blur-[8px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-text-1">场景信息</span>
        <DemoTag />
      </div>
      <div className="mt-2 space-y-1.5 text-[12px]">
        <div className="flex justify-between"><span className="text-text-3">当前视角</span><span className="text-text-1">{scene.view}</span></div>
        <div className="flex justify-between">
          <span className="text-text-3">楼层</span>
          <motion.span key={floorFlashKey} initial={{ color: '#22d3ee' }} animate={{ color: '#e6f1fb' }} transition={{ duration: 0.8 }}>
            {scene.floor}
          </motion.span>
        </div>
        <div className="flex justify-between"><span className="text-text-3">中心坐标</span><span className="font-mono text-cyan">{scene.center}</span></div>
        {/* FPS 迷你显示（仅 3D 场景就绪时显示） */}
        {view === 'ready' && (
          <div className="flex items-center justify-between border-t border-line/50 pt-1.5">
            <span className="text-text-3">性能</span>
            <div className="flex items-center gap-2">
              <span className={`font-num text-[11px] ${fpsColor}`}>{fps.toFixed(0)} FPS</span>
              <span className="font-num text-[10px] text-text-3">{frameMs.toFixed(1)}ms</span>
              <span className={`h-1.5 w-1.5 rounded-full ${fpsDot}`} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 右下：场景动作日志浮层（自订阅日志） */
export function SceneLogPanel() {
  const [entries, setEntries] = useState<SceneAction[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [clearing, setClearing] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeSceneLog((list) => setEntries(list)), []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = 0;
  }, [entries.length]);

  return (
    <div className="absolute bottom-4 right-4 z-20 w-[360px] overflow-hidden rounded-lg border border-line bg-bg-panel/90 backdrop-blur-[8px]">
      <div className="scanline" />
      <div className="flex h-9 items-center gap-2 px-3">
        <span className="text-[13px] font-medium text-text-1">场景动作日志</span>
        <DemoTag />
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => {
              setClearing(true);
              window.setTimeout(() => { clearSceneLog(); setClearing(false); }, 260);
            }}
            className="rounded p-1 text-text-3 transition hover:bg-white/10 hover:text-text-1"
            title="清空日志"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="rounded p-1 text-text-3 transition hover:bg-white/10 hover:text-text-1"
            title={collapsed ? '展开' : '折叠'}
          >
            {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <motion.div
        animate={{ height: collapsed ? 0 : 200 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden border-t border-line"
      >
        <div ref={listRef} className="h-[200px] overflow-y-auto px-3 py-2">
          {entries.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-[12px] leading-5 text-text-3">
              暂无场景动作，操作面板或与智能体对话将在此产生动作流水
            </div>
          ) : (
            <motion.ul layout="position" className="space-y-1">
              <AnimatePresence initial={false}>
                {entries.map((e, i) => (
                  <motion.li
                    key={`${e.ts}-${i}-${e.action}-${e.target}`}
                    initial={{ y: -8, opacity: 0 }}
                    animate={clearing ? { opacity: 0 } : { y: 0, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, delay: clearing ? i * 0.03 : 0 }}
                    className="flex items-center gap-2 font-mono text-[12px] leading-5"
                  >
                    <span className="text-text-3">[{e.ts}]</span>
                    <span className={ACTION_COLORS[e.action]}>{e.action}</span>
                    <span className="truncate text-text-2">→ {e.target}</span>
                    <span className={`ml-auto shrink-0 rounded-full border px-1.5 text-[10px] ${SOURCE_STYLES[e.source]}`}>
                      {e.source}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </div>
      </motion.div>
    </div>
  );
}
