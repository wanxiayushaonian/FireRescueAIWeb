import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square } from 'lucide-react';
import { addSceneAction } from '@/mock/sceneLog';
import { getScriptState, startScript, stopScript, subscribeScript } from '@/mock/demoScript';
import type { ScriptState } from '@/mock/demoScript';
import type { AlertItem } from '@/mock/alerts';
import { ALERTS } from '@/mock/alerts';
import { showToast } from './Toast';
import DemoTag from './DemoTag';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

export default function TopBar() {
  const now = useClock();
  const [alertOpen, setAlertOpen] = useState(false);
  const [script, setScript] = useState<ScriptState>(() => getScriptState());
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeScript(setScript), []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAlertOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAlertOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const p = (n: number) => String(n).padStart(2, '0');
  const time = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;

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
        <motion.div key={now.getSeconds()} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
          className="font-mono text-[15px] text-text-1">
          {time}
        </motion.div>
        <div className="text-[11px] text-text-3">星期{WEEK[now.getDay()]}</div>
      </div>
      {/* 右 */}
      <div className="flex items-center gap-4">
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
