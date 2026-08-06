'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Droplet, Search, ChevronDown, MapPin } from 'lucide-react';
import type { FetchState, WaterSource } from '@/mock/types';
import { fetchWaterSources } from '@/api/water';
import { buildWaterDistrictStats, buildWaterTypeStats } from '@/lib/water-mapper';
import { waterIconSvg } from '@/lib/map-icons';
import { addSceneAction } from '@/mock/sceneLog';
import StatCard from '@/components/StatCard';
import PanelStateView from '@/components/PanelStateView';
import { showToast } from '@/components/Toast';

const STATE_OPTIONS: Array<{ value: FetchState; label: string }> = [
  { value: 'ok', label: '正常' },
  { value: 'loading', label: '加载中' },
  { value: 'empty', label: '空态' },
  { value: 'error', label: '失败' },
];

export default function WaterSourcePanel() {
  const [demoState, setDemoState] = useState<FetchState>('ok');
  const [state, setState] = useState<FetchState>('loading');
  const [list, setList] = useState<WaterSource[]>([]);
  const [districtSel, setDistrictSel] = useState<string | null>(null); // districtCode | null(全部)
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(20);
  const [appending, setAppending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (s: FetchState) => {
    if (s === 'loading') { setState('loading'); return; }
    setState('loading');
    try {
      const items = await fetchWaterSources(s);
      setList(items);
      setState(items.length === 0 ? 'empty' : 'ok');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => { load(demoState); }, [demoState, load]);

  const districtStats = useMemo(() => buildWaterDistrictStats(list), [list]);
  const typeStats = useMemo(() => buildWaterTypeStats(list), [list]);

  const rows = useMemo<WaterSource[]>(() => {
    let l = districtSel ? list.filter((w) => w.districtCode === districtSel) : list;
    if (query.trim()) {
      const q = query.trim();
      l = l.filter((w) => w.name.includes(q) || w.address.includes(q));
    }
    return l;
  }, [list, districtSel, query]);

  const shown = rows.slice(0, visible);
  const allLoaded = visible >= rows.length;

  const onScroll = () => {
    const el = listRef.current;
    if (!el || allLoaded || appending) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight * 0.8) {
      setAppending(true);
      window.setTimeout(() => { setVisible((v) => v + 20); setAppending(false); }, 600);
    }
  };

  const writeLinkage = (w: WaterSource) => {
    addSceneAction({ action: 'flyTo', target: `${w.name} (${w.lng}, ${w.lat})`, params: { lng: w.lng, lat: w.lat }, source: '面板' });
    showToast('已定位到水源');
  };

  return (
    <div className="flex h-full flex-col">
      {/* 工具行 */}
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setVisible(20); }}
            placeholder="搜索水源名称 / 地址…"
            className="h-8 w-full rounded-md border border-line bg-bg-panel-2 pl-7 pr-2 text-[13px] text-text-1 placeholder:text-text-3 focus:border-line-glow focus:outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={demoState}
            onChange={(e) => setDemoState(e.target.value as FetchState)}
            className="h-8 appearance-none rounded-md border border-line bg-bg-panel-2 pl-2 pr-7 text-[12px] text-text-2 focus:border-line-glow focus:outline-none"
            title="状态演示"
          >
            {STATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>状态演示：{o.label}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-3" />
        </div>
      </div>

      {state !== 'ok' ? (
        <PanelStateView state={state} onRetry={() => load('ok')} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* 统计:总数 + 类型小计 */}
          <div className="space-y-2 p-3">
            <StatCard icon={Droplet} label="水源总数" value={list.length} />
            <div className="flex flex-wrap gap-2">
              {typeStats.map((t) => (
                <span key={t.type} className="rounded border border-line bg-bg-panel-2 px-2 py-0.5 text-[11px] text-text-2">
                  {t.type} <span className="font-num text-text-1">{t.count}</span>
                </span>
              ))}
            </div>
          </div>
          {/* 区树 + 清单 */}
          <div className="flex min-h-0 flex-1 border-t border-line">
            <div className="w-[110px] shrink-0 overflow-y-auto border-r border-line py-1">
              <button
                onClick={() => { setDistrictSel(null); setVisible(20); }}
                className={`flex w-full items-center justify-between px-2 py-1.5 text-[12px] hover:bg-bg-panel-2 ${districtSel === null ? 'text-cyan' : 'text-text-2'}`}
              >
                全部
                <span className="font-num text-text-3">{list.length.toLocaleString()}</span>
              </button>
              {districtStats.map((d) => {
                const sel = districtSel === d.districtCode;
                return (
                  <button
                    key={d.districtCode}
                    onClick={() => { setDistrictSel(sel ? null : d.districtCode); setVisible(20); }}
                    className={`relative flex w-full items-center justify-between px-2 py-1.5 text-[12px] hover:bg-bg-panel-2 ${sel ? 'text-cyan' : 'text-text-2'}`}
                  >
                    {sel && <span className="absolute left-0 top-0 h-full w-[2px] bg-cyan" />}
                    {d.district}
                    <span className="font-num text-text-3">{d.count.toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
            <div ref={listRef} onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto">
              {shown.length === 0 ? (
                <PanelStateView state="empty" />
              ) : (
                <ul className="p-1.5">
                  <AnimatePresence initial={false}>
                    {shown.map((w, i) => (
                      <motion.li
                        key={w.id}
                        initial={{ x: -6, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ duration: 0.25, delay: Math.min(i % 20, 10) * 0.03 }}
                        onClick={() => writeLinkage(w)}
                        className="group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-bg-panel-2"
                      >
                        <span className="absolute left-0 top-1/2 h-0 w-[2px] -translate-y-1/2 bg-cyan transition-all duration-200 group-hover:h-4/5" />
                        <span className="h-[18px] w-[18px] shrink-0" dangerouslySetInnerHTML={{ __html: waterIconSvg(w.type) }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-text-1">{w.name}</div>
                          <div className="truncate text-[11px] text-text-3">{w.address || `${w.district} · ${w.type}`}</div>
                        </div>
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-text-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                  {appending && Array.from({ length: 3 }).map((_, i) => (
                    <li key={`sk-${i}`} className="mx-2 my-1.5 h-9 animate-pulse rounded-md bg-bg-panel-2" />
                  ))}
                  {allLoaded && (
                    <li className="py-2 text-center text-[11px] text-text-3">已加载全部 {rows.length} 条</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
