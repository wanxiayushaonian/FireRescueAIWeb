import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { subscribeSceneLog } from '@/mock/sceneLog';
import DemoTag from './DemoTag';
import { SceneInfoCard, SceneLogPanel } from './SceneOverlays';

interface RouteLine { id: number; kind: 'attack' | 'evacuate'; points: string }
let routeSeq = 0;

export default function ScenePlaceholder() {
  const [glow, setGlow] = useState(false);
  const [bubble, setBubble] = useState(false);
  const [pulses, setPulses] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [routes, setRoutes] = useState<RouteLine[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const unsub = subscribeSceneLog((_list, latest, _state) => {
      if (!latest) return;
      if (latest.action === 'flyTo') {
        setGlow(true);
        setBubble(true);
        timers.current.push(window.setTimeout(() => setGlow(false), 1000));
        timers.current.push(window.setTimeout(() => setBubble(false), 2000));
      }
      if (latest.action === 'highlight' || latest.action === 'batchHighlight') {
        const n = latest.action === 'batchHighlight' ? 3 : 1 + Math.floor(Math.random() * 3);
        const news = Array.from({ length: n }).map(() => ({
          id: Math.random(),
          x: 15 + Math.random() * 70,
          y: 15 + Math.random() * 70,
        }));
        setPulses((p) => [...p, ...news]);
        timers.current.push(window.setTimeout(() => {
          setPulses((p) => p.filter((x) => !news.some((m) => m.id === x.id)));
        }, 1500));
      }
      if (latest.action === 'showRoute') {
        routeSeq += 1;
        const kind = latest.params?.kind === 'evacuate' ? 'evacuate' : 'attack';
        const line: RouteLine = {
          id: routeSeq, kind,
          points: kind === 'attack' ? '20,180 120,130 220,140 330,80' : '330,90 240,150 140,160 40,120',
        };
        setRoutes((r) => [...r, line]);
        timers.current.push(window.setTimeout(() => {
          setRoutes((r) => r.filter((x) => x.id !== line.id));
        }, 6000));
      }
      if (latest.action === 'hideRoute') setRoutes([]);
      if (latest.action === 'resetView') { setRoutes([]); setPulses([]); }
    });
    return () => { unsub(); timers.current.forEach(clearTimeout); };
  }, []);

  return (
    <div className="scene-grid relative h-full w-full overflow-hidden bg-bg-grid">
      {/* 雷达扫描扇形 */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[140vmin] w-[140vmin] -translate-x-1/2 -translate-y-1/2">
        <div
          className="h-full w-full animate-radar-spin rounded-full opacity-[0.06]"
          style={{ background: 'conic-gradient(from 0deg, rgba(34,211,238,.9), transparent 60deg)' }}
        />
      </div>
      {/* 透视地面 */}
      <div
        className="animate-ground-scroll pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{
          transform: 'perspective(600px) rotateX(60deg)',
          transformOrigin: 'bottom',
          backgroundImage:
            'linear-gradient(rgba(46,107,143,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(46,107,143,.18) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
        }}
      />
      {/* 路线 */}
      <svg className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 w-full" viewBox="0 0 400 200" preserveAspectRatio="none">
        {routes.map((r) => (
          <motion.polyline
            key={r.id}
            points={r.points}
            fill="none"
            stroke={r.kind === 'attack' ? '#22d3ee' : '#34d399'}
            strokeWidth="2"
            strokeDasharray="400"
            initial={{ strokeDashoffset: 400, opacity: 1 }}
            animate={{ strokeDashoffset: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            style={{ filter: `drop-shadow(0 0 4px ${r.kind === 'attack' ? '#22d3ee' : '#34d399'})` }}
          />
        ))}
      </svg>
      {/* 高亮脉冲点 */}
      {pulses.map((p) => (
        <motion.span
          key={p.id}
          initial={{ opacity: 0.9, scale: 0.4 }}
          animate={{ opacity: 0, scale: 2.4 }}
          transition={{ duration: 1.5 }}
          className="pointer-events-none absolute h-6 w-6 rounded-full border-2 border-cyan"
          style={{ left: `${p.x}%`, top: `${p.y}%` }}
        />
      ))}

      {/* 中心提示块 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          animate={glow ? { boxShadow: '0 0 0 1px rgba(34,211,238,.7), 0 0 32px rgba(34,211,238,.35)' } : { boxShadow: '0 0 0 0px rgba(34,211,238,0)' }}
          transition={{ duration: 0.4 }}
          className="relative flex flex-col items-center rounded-xl border border-dashed border-line-glow bg-bg-panel/40 px-8 py-8 text-center backdrop-blur-sm"
        >
          <AnimatePresence>
            {bubble && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute -top-9 rounded-full border border-cyan/40 bg-bg-panel-2 px-3 py-1 text-[12px] text-cyan"
              >
                目标已定位
              </motion.div>
            )}
          </AnimatePresence>
          <div className="animate-float [perspective:600px]">
            <img src="/cube-wireframe.svg" alt="" className="animate-cube-spin h-[180px] w-[180px] [transform-style:preserve-3d]" />
          </div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 text-[18px] font-bold text-text-1">
            3D 数字孪生场景占位
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mt-1 text-[13px] text-text-2">
            平台 SDK 接入区 · 待接入三维渲染引擎
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <DemoTag className="mt-3" />
          </motion.div>
        </motion.div>
      </div>

      {/* 右上：场景信息小卡 / 右下：场景动作日志（共享浮层） */}
      <SceneInfoCard />
      <SceneLogPanel />
    </div>
  );
}
