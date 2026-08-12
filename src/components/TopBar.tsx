import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Settings } from 'lucide-react';
import { addSceneAction } from '@/mock/sceneLog';
import { getScriptState, startScript, stopScript, subscribeScript } from '@/mock/demoScript';
import type { ScriptState } from '@/mock/demoScript';
import type { AlertItem } from '@/mock/alerts';
import { ALERTS } from '@/mock/alerts';
import { showToast } from './Toast';
import DemoTag from './DemoTag';
import { useScene } from './SceneProvider';
import type { PerfStats } from '@/lib/soonspace-runtime';

function useClock() {
  // 初始 null:SSR 与客户端首次渲染都为 null(一致),避免时钟 hydration mismatch;
  // mount 后立即设真实时间并启动定时器。
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export default function TopBar(props: {
  scenes?: { scene_id: string; scene_name: string }[];
  selectedSceneId?: string;
  onSelectScene?: (id: string) => void;
}) {
  const now = useClock();
  const [alertOpen, setAlertOpen] = useState(false);
  const [perfOpen, setPerfOpen] = useState(false);
  const [script, setScript] = useState<ScriptState>(() => getScriptState());
  const wrapRef = useRef<HTMLDivElement>(null);
  const perfRef = useRef<HTMLDivElement>(null);
  const { runtime, view } = useScene();
  const [perfStats, setPerfStats] = useState<PerfStats | null>(null);

  useEffect(() => subscribeScript(setScript), []);

  // 轮询性能数据
  useEffect(() => {
    if (!runtime || view !== 'ready') return;
    setPerfStats(runtime.getPerfStats());
    const timer = window.setInterval(() => {
      setPerfStats(runtime.getPerfStats());
    }, 500);
    return () => window.clearInterval(timer);
  }, [runtime, view]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAlertOpen(false);
      if (perfRef.current && !perfRef.current.contains(e.target as Node)) setPerfOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAlertOpen(false);
        setPerfOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const p = (n: number) => String(n).padStart(2, '0');
  // now 为 null 时(SSR/首渲染)用占位,保证服务端与客户端输出一致
  const time = now
    ? `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`
    : '----/--/-- --:--:--';

  const handleAlertClick = (a: AlertItem) => {
    addSceneAction({ action: 'highlight', target: a.facility, source: '面板' });
    // 主代理接线：App 监听后跳转对象总览并定位楼层
    window.dispatchEvent(
      new CustomEvent('topbar:open-alert', { detail: { buildingId: a.buildingId, floor: a.floor } }),
    );
    showToast('已写入场景动作日志 · 演示数据');
    setAlertOpen(false);
  };

  return (
    <motion.header
      initial={{ y: -8, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative z-[60] flex h-14 shrink-0 items-center justify-between border-b border-line bg-bg-panel px-4"
    >
      {/* 左 */}
      <div className="flex items-center gap-3">
        <img src="/logo-flame.svg" alt="平台徽标" className="h-8 w-8" />
        <div>
          <div className="text-[18px] font-bold leading-5 text-text-1">灭火救援预案智能辅助平台</div>
          <div className="font-num text-[10px] uppercase tracking-[0.3em] text-text-3">
            FIRE RESCUE PLAN AI ASSISTANT
          </div>
        </div>
      </div>
      {/* 中 */}
      <div className="absolute left-1/2 flex -translate-x-1/2 items-baseline gap-2 whitespace-nowrap">
        <motion.div key={now ? now.getSeconds() : 0} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
          className="font-mono text-[15px] text-text-1">
          {time}
        </motion.div>
        <div className="text-[11px] text-text-3">{now ? `星期${WEEK[now.getDay()]}` : ''}</div>
      </div>
      {/* 右 */}
      <div className="flex items-center gap-4">
        {props.scenes && props.scenes.length > 0 && (
          <select
            value={props.selectedSceneId ?? ''}
            onChange={(e) => props.onSelectScene?.(e.target.value)}
            className="rounded-md border border-line bg-bg-panel-2 px-2 py-1.5 text-[12px] text-text-1"
            title="切换场景"
          >
            {props.scenes.map((s) => (
              <option key={s.scene_id} value={s.scene_id}>
                {s.scene_name || s.scene_id}
              </option>
            ))}
          </select>
        )}
        {/* 性能优化设置 */}
        <div className="relative" ref={perfRef}>
          <button
            onClick={() => setPerfOpen((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[12px] transition ${
              perfOpen
                ? 'border-cyan/60 bg-cyan/10 text-cyan'
                : 'border-line bg-bg-panel-2 text-text-2 hover:border-line-glow hover:text-text-1'
            }`}
            title="渲染性能设置"
          >
            <Settings className="h-3.5 w-3.5" />
            <span>性能</span>
          </button>
          <AnimatePresence>
            {perfOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="absolute right-0 top-full mt-2 w-72 rounded-lg border border-line bg-bg-panel-2 p-3 shadow-xl"
              >
                <div className="mb-2 flex items-center gap-2 border-b border-line pb-2 text-[12px] text-text-3">
                  <Settings className="h-3.5 w-3.5" />
                  渲染优化设置
                </div>
                {runtime && view === 'ready' ? (
                  <div className="space-y-3">
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
                ) : (
                  <div className="py-4 text-center text-[11px] text-text-3">
                    3D 场景未加载
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <span className="text-[13px] text-text-2">值班长：王建国 · 指挥中心</span>
        {/* 全局演示剧本：一键串联 接警→研判→生成→对抗→评估→归档（演示数据） */}
        <button
          onClick={() => (script.running ? stopScript() : startScript())}
          title="一键串联演示 · 演示数据"
          className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12px] transition ${
            script.running
              ? 'animate-pulse border-red/60 bg-red/10 text-red hover:bg-red/20'
              : 'border-cyan/50 bg-cyan/10 text-cyan hover:bg-cyan/20'
          }`}
        >
          {script.running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {script.running ? '停止演示' : '演示剧本'}
          {script.running && (
            <span className="font-num text-[11px] text-red/80">
              {script.stepIndex}/{script.totalSteps} · {script.stepLabel}
            </span>
          )}
          <DemoTag />
        </button>
        <div className="relative" ref={wrapRef}>
          <div
            className="flex cursor-default items-center gap-3 rounded-md border border-line bg-bg-panel-2 px-3 py-1.5"
            onMouseEnter={() => setAlertOpen(true)}
          >
            <span className="flex items-center gap-1.5 text-[12px] text-green" title="系统正常">
              <span className="h-2 w-2 rounded-full bg-green" />系统正常
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-cyan" title="链路正常">
              <span className="h-2 w-2 rounded-full bg-cyan" />链路正常
            </span>
            <button
              className="flex items-center gap-1.5 text-[12px] text-red"
              onClick={() => setAlertOpen((v) => !v)}
              title={`当前 ${ALERTS.length} 条未处理告警（演示数据）`}
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-red" />{ALERTS.length} 条告警
            </button>
          </div>
          <AnimatePresence>
            {alertOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.2 }}
                className="absolute right-0 top-full mt-2 w-80 rounded-lg border border-line bg-bg-panel-2 p-2 shadow-xl"
              >
                <div className="flex items-center gap-2 px-2 py-1 text-[12px] text-text-3">
                  未处理告警 <DemoTag />
                </div>
                {ALERTS.map((a) => {
                  const critical = a.level === 'critical';
                  return (
                    <button
                      key={a.id}
                      onClick={() => handleAlertClick(a)}
                      className={`flex w-full items-start gap-2 rounded-md border px-2 py-2 text-left transition hover:bg-white/5 ${
                        critical ? 'border-red/40 bg-red/5' : 'border-amber/40 bg-amber/5'
                      } mb-1.5 last:mb-0`}
                    >
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full ${
                          critical ? 'bg-red' : 'bg-amber'
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-text-1">{a.title}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-[11px] text-text-3">
                          <span className="font-num">{a.time}</span>
                          <span
                            className={`rounded border px-1 py-px ${
                              critical ? 'border-red/50 text-red' : 'border-amber/50 text-amber'
                            }`}
                          >
                            {a.levelLabel}
                          </span>
                          <DemoTag />
                        </span>
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      {/* 底部渐变亮线 */}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8 }}
        className="scanline absolute bottom-[-1px] left-0 w-full origin-center"
      />
    </motion.header>
  );
}
